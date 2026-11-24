use std::process::Command;
use std::sync::OnceLock;
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD, Engine};
use tauri::Manager;
use tauri_plugin_updater::UpdaterExt;

use crate::{append_log, stop_desktop_server};

/// 安装包启动时调用。大版本更新先用系统对话框确认，确认后窗口换成带进度条的更新页。
/// 开发调试不拦截。返回 true 时调用方不要再显示主窗口。
pub fn block_if_major(app: &tauri::AppHandle, window: &tauri::WebviewWindow) -> bool {
    #[cfg(any(debug_assertions, not(any(target_os = "macos", target_os = "windows"))))]
    {
        let _ = (app, window);
        false
    }
    #[cfg(all(not(debug_assertions), any(target_os = "macos", target_os = "windows")))]
    {
        match tauri::async_runtime::block_on(find_major_update(app)) {
            Ok(Some(update)) => {
                append_log(&format!(
                    "major update {} -> {}, blocking in the shell",
                    update.current_version, update.version
                ));
                begin_required_update(app.clone(), window.clone(), update);
                true
            }
            Ok(None) => false,
            Err(err) => {
                append_log(&format!("skip major update check: {err}"));
                false
            }
        }
    }
}

/// 页面里点「检查更新」时，如果已经是大版本，把拦住和安装交回原生壳。
/// 壳会先弹出系统对话框，确认后在窗口里显示进度条。
/// 返回 true 表示壳已经接手（用户退出或即将重启）。
#[tauri::command]
pub async fn enforce_required_update(app: tauri::AppHandle) -> Result<bool, String> {
    if !cfg!(any(target_os = "macos", target_os = "windows")) {
        return Ok(false);
    }
    let Some(update) = find_major_update(&app).await? else {
        return Ok(false);
    };
    let (tx, mut rx) = tauri::async_runtime::channel::<bool>(1);
    let handle = app.clone();
    handle.clone().run_on_main_thread(move || {
        let handled = if let Some(window) = handle.get_webview_window("main") {
            begin_required_update(handle.clone(), window, update);
            true
        } else {
            false
        };
        let _ = tx.blocking_send(handled);
    })
    .map_err(|err| err.to_string())?;
    Ok(rx.recv().await.unwrap_or(false))
}

fn version_major(version: &str) -> Option<u64> {
    let trimmed = version.trim();
    let trimmed = trimmed
        .strip_prefix('v')
        .or_else(|| trimmed.strip_prefix('V'))
        .unwrap_or(trimmed);
    let (head, _) = trimmed.split_once('.')?;
    if head.is_empty() || !head.chars().all(|ch| ch.is_ascii_digit()) {
        return None;
    }
    head.parse().ok()
}

fn is_major_upgrade(current: &str, next: &str) -> bool {
    match (version_major(current), version_major(next)) {
        (Some(from), Some(to)) => to > from,
        _ => false,
    }
}

async fn find_major_update(app: &tauri::AppHandle) -> Result<Option<tauri_plugin_updater::Update>, String> {
    let updater = app
        .updater_builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|err| err.to_string())?;
    let update = updater.check().await.map_err(|err| err.to_string())?;
    Ok(update.filter(|update| is_major_upgrade(&update.current_version, &update.version)))
}

/// 系统对话框确认后才下载。下载放在后台，进度画在窗口里的进度条上。
fn begin_required_update(app: tauri::AppHandle, window: tauri::WebviewWindow, update: tauri_plugin_updater::Update) {
    let copy = Copy::from_system();
    if !ask(&copy.title, &copy.prompt(&update.version), &copy.update_now, &copy.quit) {
        leave(&app);
        return;
    }
    reveal_progress(&window, &update.version, copy);
    let update_for_retry = update.clone();
    let app_for_download = app.clone();
    let window_for_download = window.clone();
    tauri::async_runtime::spawn(async move {
        let result = download_required(window_for_download.clone(), update, copy).await;
        let _ = app_for_download.clone().run_on_main_thread(move || match result {
            Ok(()) => {
                set_progress(&window_for_download, copy.installing, "", Some(100));
                crate::relaunch_installed(&app_for_download);
            }
            Err(err) => {
                append_log(&format!("required update failed: {err}"));
                if !ask(&copy.failed_title, &copy.failed(&err), &copy.retry, &copy.quit) {
                    leave(&app_for_download);
                    return;
                }
                begin_required_update(app_for_download, window_for_download, update_for_retry);
            }
        });
    });
}

fn leave(app: &tauri::AppHandle) {
    stop_desktop_server(app);
    app.exit(0);
}

async fn download_required(
    window: tauri::WebviewWindow,
    update: tauri_plugin_updater::Update,
    copy: Copy,
) -> Result<(), String> {
    let mut got: u64 = 0;
    let mut painted_percent: Option<u64> = None;
    let mut painted_got: u64 = 0;
    let progress_window = window.clone();
    let chunk_copy = copy;
    let done_window = window;
    let done_copy = copy;
    update
        .download_and_install(
            move |chunk, total| {
                got += chunk as u64;
                let percent = download_percent(got, total);
                if !should_repaint(percent, got, &mut painted_percent, &mut painted_got) {
                    return;
                }
                let (status, detail) = match (percent, total) {
                    (Some(percent), Some(total)) if total > 0 => {
                        (chunk_copy.downloading(percent), format_bytes_pair(got, total))
                    }
                    _ => (chunk_copy.downloading_unknown.to_string(), format_bytes(got)),
                };
                set_progress(&progress_window, &status, &detail, percent);
            },
            move || set_progress(&done_window, done_copy.installing, "", Some(100)),
        )
        .await
        .map_err(|err| err.to_string())
}

/// 有总大小时按百分比刷新；没有总大小时大约每 256 KB 刷新一次，避免每个分片都改界面。
fn should_repaint(percent: Option<u64>, got: u64, painted_percent: &mut Option<u64>, painted_got: &mut u64) -> bool {
    if percent != *painted_percent {
        *painted_percent = percent;
        *painted_got = got;
        return true;
    }
    if percent.is_none() && got.saturating_sub(*painted_got) >= 256 * 1024 {
        *painted_got = got;
        return true;
    }
    false
}

/// 下载完成前最多显示 99%，装完再由安装步骤拉到 100%。
fn download_percent(got: u64, total: Option<u64>) -> Option<u64> {
    let total = total.filter(|total| *total > 0)?;
    Some((got.saturating_mul(100) / total).min(99))
}

fn format_bytes(bytes: u64) -> String {
    const UNITS: [&str; 4] = ["B", "KB", "MB", "GB"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 || value >= 10.0 {
        format!("{value:.0} {}", UNITS[unit])
    } else {
        format!("{value:.1} {}", UNITS[unit])
    }
}

fn format_bytes_pair(got: u64, total: u64) -> String {
    format!("{} / {}", format_bytes(got), format_bytes(total))
}

fn reveal_progress(window: &tauri::WebviewWindow, version: &str, copy: Copy) {
    match progress_page_url(version, copy) {
        Ok(url) => {
            if let Err(err) = window.navigate(url) {
                append_log(&format!("progress page navigate failed: {err}"));
            }
        }
        Err(err) => append_log(&format!("progress page url failed: {err}")),
    }
    let _ = window.set_closable(false);
    let _ = window.set_title(&copy.updating_to(version));
    let _ = window.show();
    let _ = window.set_focus();
}

fn set_progress(window: &tauri::WebviewWindow, status: &str, detail: &str, percent: Option<u64>) {
    let status = json_string(status);
    let detail = json_string(detail);
    let percent = match percent {
        Some(value) => value.min(100).to_string(),
        None => "null".to_string(),
    };
    let _ = window.eval(format!(
        r#"(function(){{
          var status=document.getElementById("status");
          var detail=document.getElementById("detail");
          var track=document.getElementById("track");
          var bar=document.getElementById("bar");
          if(status) status.textContent={status};
          if(detail) detail.textContent={detail};
          if(!track||!bar) return;
          if({percent}===null){{
            track.className="indeterminate";
            track.removeAttribute("aria-valuenow");
            bar.style.width="";
          }} else {{
            track.className="";
            track.setAttribute("aria-valuenow", String({percent}));
            bar.style.width={percent}+"%";
          }}
        }})();"#
    ));
}

fn json_string(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string())
}

fn progress_page_url(version: &str, copy: Copy) -> Result<tauri::Url, String> {
    let icon = STANDARD.encode(include_bytes!("../icons/128x128.png"));
    let heading = json_string(&copy.updating_to(version));
    let status = json_string(copy.downloading_unknown);
    let html = format!(
        r#"<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;height:100%;background:#fff;color:#191919;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}}
body{{display:flex;align-items:center;justify-content:center}}
main{{width:min(360px,calc(100% - 48px));text-align:center}}
img{{width:64px;height:64px;border-radius:16px}}
h1{{margin:20px 0 0;font-size:20px;font-weight:600;letter-spacing:-0.02em}}
#track{{margin:28px auto 0;height:6px;width:100%;background:#ececec;border-radius:999px;overflow:hidden}}
#bar{{height:100%;width:0;background:#191919;border-radius:999px;transition:width 180ms ease}}
#track.indeterminate #bar{{width:34%;animation:slide 1.15s ease-in-out infinite}}
@keyframes slide{{0%{{transform:translateX(-130%)}}100%{{transform:translateX(340%)}}}}
#status{{margin:16px 0 0;font-size:14px}}
#detail{{margin:4px 0 0;min-height:1.5em;color:#6b6b6b;font-size:13px;font-variant-numeric:tabular-nums}}
</style></head><body><main>
<img alt="" src="data:image/png;base64,{icon}" width="64" height="64">
<h1 id="heading"></h1>
<div id="track" class="indeterminate" role="progressbar" aria-valuemin="0" aria-valuemax="100"><div id="bar"></div></div>
<p id="status"></p>
<p id="detail"></p>
</main><script>
document.getElementById("heading").textContent={heading};
document.getElementById("status").textContent={status};
</script></body></html>"#
    );
    let url = format!("data:text/html;base64,{}", STANDARD.encode(html.as_bytes()));
    url.parse::<tauri::Url>().map_err(|err| err.to_string())
}

/// 系统对话框。macOS 用自定义按钮；Windows 没有自定义按钮时退回「确定 / 取消」，正文里写明含义。
fn ask(title: &str, message: &str, ok_label: &str, cancel_label: &str) -> bool {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        let result = rfd::MessageDialog::new()
            .set_level(rfd::MessageLevel::Warning)
            .set_title(title)
            .set_description(message)
            .set_buttons(rfd::MessageButtons::OkCancelCustom(ok_label.to_string(), cancel_label.to_string()))
            .show();
        return match result {
            rfd::MessageDialogResult::Ok | rfd::MessageDialogResult::Yes => true,
            rfd::MessageDialogResult::Custom(label) => label == ok_label,
            _ => false,
        };
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (title, message, ok_label, cancel_label);
        false
    }
}

#[derive(Clone, Copy)]
struct Copy {
    title: &'static str,
    update_now: &'static str,
    quit: &'static str,
    retry: &'static str,
    failed_title: &'static str,
    downloading_unknown: &'static str,
    installing: &'static str,
    prompt_body: &'static str,
    prompt_hint: &'static str,
    failed_hint: &'static str,
    downloading_prefix: &'static str,
    updating_to: &'static str,
}

impl Copy {
    fn from_system() -> Self {
        if ui_is_zh() { Self::zh() } else { Self::en() }
    }

    fn zh() -> Self {
        Self {
            title: "当前版本已停止支持",
            update_now: "立即更新",
            quit: "退出",
            retry: "重试",
            failed_title: "更新失败",
            downloading_unknown: "正在下载更新…",
            installing: "正在安装，即将重启",
            prompt_body: "旧版本已不能继续使用，请更新到 {version} 后再使用。",
            prompt_hint: "确定后开始下载并安装，取消将退出应用。",
            failed_hint: "确定后重试，取消将退出应用。",
            downloading_prefix: "正在下载",
            updating_to: "正在更新到 {version}",
        }
    }

    fn en() -> Self {
        Self {
            title: "This version is no longer supported",
            update_now: "Update now",
            quit: "Quit",
            retry: "Try again",
            failed_title: "Update failed",
            downloading_unknown: "Downloading the update…",
            installing: "Installing, then restarting",
            prompt_body: "The installed version can no longer be used. Update to {version} to continue.",
            prompt_hint: "OK downloads and installs the update. Cancel quits the app.",
            failed_hint: "OK tries again. Cancel quits the app.",
            downloading_prefix: "Downloading",
            updating_to: "Updating to {version}",
        }
    }

    fn updating_to(&self, version: &str) -> String {
        self.updating_to.replace("{version}", version)
    }

    fn prompt(&self, version: &str) -> String {
        let body = self.prompt_body.replace("{version}", version);
        if cfg!(target_os = "macos") {
            body
        } else {
            format!("{body}\n\n{}", self.prompt_hint)
        }
    }

    fn failed(&self, err: &str) -> String {
        if cfg!(target_os = "macos") {
            err.to_string()
        } else {
            format!("{err}\n\n{}", self.failed_hint)
        }
    }

    fn downloading(&self, percent: u64) -> String {
        format!("{} {percent}%", self.downloading_prefix)
    }
}

fn ui_is_zh() -> bool {
    static CACHE: OnceLock<bool> = OnceLock::new();
    *CACHE.get_or_init(detect_ui_zh)
}

fn detect_ui_zh() -> bool {
    #[cfg(target_os = "macos")]
    if let Some(lang) = apple_language() {
        return lang.to_lowercase().starts_with("zh");
    }
    #[cfg(target_os = "windows")]
    if let Some(lang) = windows_locale_name() {
        return lang.to_lowercase().starts_with("zh");
    }
    std::env::var("LANG")
        .or_else(|_| std::env::var("LC_ALL"))
        .unwrap_or_default()
        .to_lowercase()
        .starts_with("zh")
}

#[cfg(target_os = "macos")]
fn apple_language() -> Option<String> {
    let output = Command::new("defaults").args(["read", "-g", "AppleLanguages"]).output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let start = text.find('"')? + 1;
    let end = start + text[start..].find('"')?;
    Some(text[start..end].to_string())
}

#[cfg(target_os = "windows")]
fn windows_locale_name() -> Option<String> {
    let output = Command::new("reg")
        .args(["query", r"HKCU\Control Panel\International", "/v", "LocaleName"])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    text.split_whitespace()
        .rev()
        .find(|token| token.contains('-') || token.contains('_'))
        .map(|token| token.to_string())
}

#[cfg(test)]
mod tests {
    use super::{download_percent, format_bytes, is_major_upgrade, should_repaint};

    #[test]
    fn major_only_when_the_first_component_grows() {
        assert!(is_major_upgrade("0.0.27", "1.0.0"));
        assert!(is_major_upgrade("v0.0.27", "1.0.0"));
        assert!(!is_major_upgrade("0.0.27", "0.0.28"));
        assert!(!is_major_upgrade("0.0.27", "0.1.0"));
        assert!(!is_major_upgrade("1.2.3", "1.9.0"));
        assert!(!is_major_upgrade("1.0.0", "1.0.0"));
        assert!(!is_major_upgrade("nope", "1.0.0"));
    }

    #[test]
    fn download_percent_stays_under_one_hundred_until_install() {
        assert_eq!(download_percent(0, Some(200)), Some(0));
        assert_eq!(download_percent(50, Some(200)), Some(25));
        assert_eq!(download_percent(200, Some(200)), Some(99));
        assert_eq!(download_percent(10, None), None);
        assert_eq!(download_percent(10, Some(0)), None);
    }

    #[test]
    fn format_bytes_steps_up_units() {
        assert_eq!(format_bytes(0), "0 B");
        assert_eq!(format_bytes(1536), "1.5 KB");
        assert_eq!(format_bytes(12 * 1024 * 1024), "12 MB");
    }

    #[test]
    fn progress_repaints_when_the_percent_changes() {
        let mut painted_percent = None;
        let mut painted_got = 0;
        assert!(should_repaint(Some(1), 100, &mut painted_percent, &mut painted_got));
        assert!(!should_repaint(Some(1), 200, &mut painted_percent, &mut painted_got));
        assert!(should_repaint(Some(2), 300, &mut painted_percent, &mut painted_got));
        assert!(should_repaint(None, 300, &mut painted_percent, &mut painted_got));
        assert!(!should_repaint(None, 300 + 1000, &mut painted_percent, &mut painted_got));
        assert!(should_repaint(None, 300 + 256 * 1024, &mut painted_percent, &mut painted_got));
    }
}
