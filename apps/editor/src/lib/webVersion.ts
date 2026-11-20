import { isDesktopApp } from "@/lib/ai/skills";

const RELOAD_KEY = "editor:web-version-reload";

/** 去掉可能带上的 v 前缀，方便和 /version.json 比较。 */
export function normalizeAppVersion(version: string | null | undefined): string {
  return (version ?? "").trim().replace(/^v/i, "");
}

/**
 * 当前包比线上旧，并且这次打开还没为这个新版本强制刷新过，才需要刷新。
 * 刷新一次之后即使缓存还是旧包，也不再刷，避免来回重载。
 */
export function needsWebReload(current: string, latest: string, alreadyTried: string | null): boolean {
  const now = normalizeAppVersion(current);
  const next = normalizeAppVersion(latest);
  if (!now || !next || now === next) {
    return false;
  }
  return alreadyTried !== next;
}

/** 桌面客户端和窄屏不做。开发时版本接口对不上，也不做。 */
export function shouldCheckWebVersion(): boolean {
  if (import.meta.env.DEV || typeof window === "undefined" || isDesktopApp()) {
    return false;
  }
  return window.matchMedia("(min-width: 768px)").matches;
}

async function readLatestVersion(): Promise<string> {
  const timeout = new Promise<null>((resolve) => {
    window.setTimeout(() => resolve(null), 1200);
  });
  const request = fetch("/version.json", { cache: "no-store" })
    .then((res) => (res.ok ? (res.json() as Promise<{ version?: string }>) : null))
    .then((body) => normalizeAppVersion(body?.version))
    .catch(() => "");
  const version = await Promise.race([request, timeout]);
  return version ?? "";
}

/** 网页版 PC 打开时核对版本。需要刷新时返回 true，调用方不要再往下渲染。 */
export async function ensureLatestWebVersion(): Promise<boolean> {
  if (!shouldCheckWebVersion()) {
    return false;
  }
  const current = import.meta.env.VITE_APP_VERSION;
  const latest = await readLatestVersion();
  const tried = sessionStorage.getItem(RELOAD_KEY);
  if (!needsWebReload(current, latest, tried)) {
    return false;
  }
  sessionStorage.setItem(RELOAD_KEY, normalizeAppVersion(latest));
  window.location.reload();
  return true;
}
