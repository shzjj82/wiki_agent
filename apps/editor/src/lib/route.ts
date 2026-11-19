export function appHomePath(): string {
  return "/app";
}

/** 去登录页，并记住登录后要回到的地址。 */
export function loginPath(redirect = `${window.location.pathname}${window.location.search}`): string {
  return `/login?redirect=${encodeURIComponent(safeRedirect(redirect))}`;
}

/** 只接受站内路径，避免 `?redirect=//evil.com` 之类把人带到别的站。 */
export function safeRedirect(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/login")) {
    return appHomePath();
  }
  return value;
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
    if (rest && rest !== "join" && !rest.startsWith("join/")) {
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

/**
 * 把当前文档写进地址，刷新后仍打开这一页。
 * 直接写 history 而不走路由：切文档仍是同一个编辑器视图，后续逻辑要同步读到新地址。
 */
export function writeAppLocation(pageId: string | null, mode: "push" | "replace" = "replace"): void {
  const next = appPagePath(pageId);
  const current = `${window.location.pathname.replace(/\/+$/, "") || "/"}${window.location.search}`;
  if (current === next) {
    return;
  }
  const update = mode === "push" ? window.history.pushState : window.history.replaceState;
  update.call(window.history, null, "", next);
}
