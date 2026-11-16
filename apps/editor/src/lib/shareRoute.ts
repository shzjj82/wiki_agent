const TOKEN = /^\/s\/([A-Za-z0-9_-]+)$/;

export function isShareRoute(pathname = window.location.pathname): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === "/s" || path.startsWith("/s/");
}

export function shareTokenFromPath(pathname = window.location.pathname): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path.match(TOKEN)?.[1] ?? null;
}
