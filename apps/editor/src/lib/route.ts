/** 生产与本地统一回到 /app（Vite / 桌面服务都对 /app 做 SPA 回落） */
export function appHomePath(): string {
  return "/app";
}

/** `/markdown` 或 `/app/markdown`（含尾斜杠） */
export function isMarkdownRoute(pathname = window.location.pathname): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === "/markdown" || path === "/app/markdown";
}

export function markdownPath(): string {
  return "/markdown";
}

const PENDING_PAGE_KEY = "editor:pending-page-id";

export function setPendingPageId(id: string): void {
  sessionStorage.setItem(PENDING_PAGE_KEY, id);
}

export function takePendingPageId(): string | null {
  const id = sessionStorage.getItem(PENDING_PAGE_KEY);
  if (id) {
    sessionStorage.removeItem(PENDING_PAGE_KEY);
  }
  return id;
}

/** 当前文档在地址里：`/app/:pageId`。刷新后按这个地址打开对应页面。 */
export function readAppLocation(href = typeof window === "undefined" ? "http://localhost/app" : window.location.href): {
  pageId: string | null;
} {
  const url = new URL(href, "http://localhost");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  let pageId: string | null = null;
  if (path.startsWith("/app/")) {
    const rest = decodeURIComponent(path.slice("/app/".length));
    if (rest && rest !== "markdown" && rest !== "join" && !rest.startsWith("join/")) {
      pageId = rest;
    }
  }
  return { pageId };
}

/** `/app/join/:code`：邀请链接。打开后用团队码加入，不另签凭证。 */
export function joinCodeFromPath(pathname = window.location.pathname): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  const match = path.match(/^\/app\/join\/([^/]+)$/i);
  if (!match) {
    return null;
  }
  const code = decodeURIComponent(match[1]).trim();
  return code || null;
}

export function appPagePath(pageId: string | null): string {
  const id = pageId?.trim();
  return id ? `/app/${encodeURIComponent(id)}` : "/app";
}

/** 把当前文档写进地址，刷新后仍打开这一页。 */
export function writeAppLocation(pageId: string | null, mode: "push" | "replace" = "replace"): void {
  const next = appPagePath(pageId);
  const current = `${window.location.pathname.replace(/\/+$/, "") || "/"}${window.location.search}`;
  if (current === next) {
    return;
  }
  const update = mode === "push" ? window.history.pushState : window.history.replaceState;
  update.call(window.history, null, "", next);
}

export function goAppHome(): void {
  const home = appHomePath();
  if (window.location.pathname === home) {
    window.dispatchEvent(new PopStateEvent("popstate"));
    return;
  }
  window.history.pushState({}, "", home);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
