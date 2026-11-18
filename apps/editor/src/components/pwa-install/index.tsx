import { isDesktopApp } from "@/lib/ai/skills";

/** 安全上下文里注册空的 Service Worker，浏览器才允许安装到桌面。桌面客户端不注册。页面上不放安装按钮。 */
export function registerPwa(): void {
  if (!window.isSecureContext || !("serviceWorker" in navigator) || isDesktopApp()) {
    return;
  }
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
