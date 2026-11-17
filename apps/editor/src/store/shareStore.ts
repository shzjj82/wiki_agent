/**
 * 分享的客户端。
 *
 * 边界：编辑器（桌面端和部署出去的网页）只提交请求。token 由编辑器生成，创建时交给 NestJS。有效期和快照由 /wiki/shares 完成。链接发出后不能撤回。
 * 桌面端把 /wiki 代理到网关；网页上的 /s/:token 只负责把 NestJS 返回的快照画出来。
 * A 在客户端里分享，B 用浏览器打开已部署网页上的链接。桌面端本机地址不能当作分享链接。
 */
import type { EditorJsDocument } from "@myblog/shared";
import { gatewayUrl, prepareSession, refreshSession, WIKI_APP_CODE, type RemoteSession } from "@/store/remoteStore";

export class ShareRequestError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export type ShareLink = {
  token: string;
  pageId: string;
  title: string;
  createdAt: string;
  expiresAt: string | null;
  sharedBy?: string | null;
  parentToken: string | null;
};

export type SharedPageNode = {
  /** 与正文 pageLink 的 pageId 相同，只用来在这份分享里打开对应页面。 */
  id?: string;
  title: string;
  body: EditorJsDocument;
  children?: SharedPageNode[];
};

export type SharedPageView = {
  title: string;
  body: EditorJsDocument;
  expiresAt: string | null;
  sharedAt: string;
  sharedBy: string | null;
  /** 子孙页面各自的快照。公开页一次只画当前页，不把这些正文接进父页面。 */
  children?: SharedPageNode[];
  id?: string;
};

export type ShareDraft = {
  pageId: string;
  /** 编辑器生成的 token。公开地址里的就是这一段。 */
  token: string;
  /** 秒。编辑器只传 1 天、7 天或 30 天。 */
  expiresIn: number;
};

type CreatedShare = {
  token: string;
  urlPath: string;
  expiresAt: string | null;
  title: string;
  pageId?: string;
  sharedBy?: string | null;
};

/** 已部署的编辑器网页。桌面端分享出去的链接指向这里。 */
const DEPLOYED_EDITOR_ORIGIN = "https://wiki.championsea.online";

/** 下载页。页面会按 /version.json 换成当前最新安装包，不写死某一个版本。 */
export function latestDownloadPageUrl(origin = typeof window === "undefined" ? "" : window.location.origin): string {
  const current = shareSiteOrigin(origin).replace(/\/$/, "");
  const base = isLocalShareOrigin(current) ? DEPLOYED_EDITOR_ORIGIN : current;
  return `${base}/#download`;
}

/**
 * vite 本地调试用当前地址，这样 /s/:token 能在 5174 打开。
 * 桌面端跑在本机，发出去的链接必须是已部署网页。已经打开生产网页时用当前域名。
 */
export function shareSiteOrigin(origin = typeof window === "undefined" ? "" : window.location.origin): string {
  const current = origin.replace(/\/$/, "");
  if (import.meta.env.DEV && current) return current;
  if (current && !isLocalShareOrigin(current)) return current;
  const configured = ((import.meta.env.VITE_EDITOR_PUBLIC_ORIGIN as string | undefined) || "").replace(/\/$/, "");
  return configured || DEPLOYED_EDITOR_ORIGIN;
}

/** 32 字节随机数，base64url，不含填充。公开路由只接受字母、数字、下划线和连字符。 */
export function createShareToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function sharePageUrl(token: string): string {
  const origin = shareSiteOrigin();
  return origin ? `${origin}/s/${token}` : "";
}

export function isLocalShareOrigin(origin = window.location.origin): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
  } catch {
    return false;
  }
}

async function publicShare<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const response = await fetch(gatewayUrl(path), {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-App-Code": WIKI_APP_CODE,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await response.json().catch(() => null)) as { success?: boolean; code?: string; message?: string; data?: T } | null;
  if (!json?.success) {
    throw new ShareRequestError(json?.code || "SHARE_FAILED", json?.message || "分享失败");
  }
  return json.data as T;
}

async function authedShare<T>(session: RemoteSession, method: string, path: string, body?: unknown, retried = false): Promise<T> {
  const ready = await prepareSession(session);
  if (!ready?.token) {
    throw new ShareRequestError("UNAUTHORIZED", "请先登录");
  }
  try {
    return await publicShare<T>(method, path, body, ready.token);
  } catch (error) {
    if (!retried && error instanceof ShareRequestError && error.code === "UNAUTHORIZED" && ready.refreshToken) {
      ready.expiresAt = 0;
      const next = await refreshSession();
      if (next) {
        session.token = next.token;
        session.refreshToken = next.refreshToken;
        session.expiresAt = next.expiresAt;
        return authedShare(session, method, path, body, true);
      }
    }
    throw error;
  }
}

export async function createShare(session: RemoteSession, draft: ShareDraft): Promise<CreatedShare> {
  const created = await authedShare<CreatedShare>(session, "POST", "/wiki/shares", {
    pageId: draft.pageId,
    expiresIn: draft.expiresIn,
    token: draft.token,
  });
  return { ...created, token: draft.token };
}

function displayName(value: unknown): string | null {
  if (typeof value === "string") {
    const name = value.trim();
    return name || null;
  }
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  for (const key of ["nickname", "username", "name", "displayName"]) {
    const name = row[key];
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return null;
}

function asDocument(value: unknown): EditorJsDocument {
  if (!value || typeof value !== "object") return { blocks: [] };
  const body = value as EditorJsDocument;
  return { ...body, blocks: Array.isArray(body.blocks) ? body.blocks : [] };
}

function nodeId(row: Record<string, unknown>): string | undefined {
  for (const key of ["id", "pageId", "key"]) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function asNode(value: unknown): SharedPageNode | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const rawChildren = Array.isArray(row.children) ? row.children : Array.isArray(row.pages) ? row.pages : [];
  const children = rawChildren.map(asNode).filter((item): item is SharedPageNode => item !== null);
  if (!title && children.length === 0) return null;
  return { id: nodeId(row), title, body: asDocument(row.body), children };
}

export async function listShares(session: RemoteSession, pageId: string): Promise<ShareLink[]> {
  const data = await authedShare<{ shares?: ShareLink[] }>(session, "GET", `/wiki/shares?pageId=${encodeURIComponent(pageId)}`);
  return (data.shares ?? []).map((share) => ({ ...share, sharedBy: displayName(share.sharedBy) }));
}

export type ShareFavorite = {
  favorited: boolean;
  /** 当前登录账号是这篇文档的作者。作者不能收藏自己的文章。 */
  owned: boolean;
};

function asFavorite(value: unknown, fallbackSaved: boolean): ShareFavorite {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const owned = row.owned === true;
  const flagged = row.favorited === true || row.saved === true;
  const explicit = typeof row.favorited === "boolean" || typeof row.saved === "boolean";
  return { owned, favorited: owned ? false : explicit ? flagged : fallbackSaved };
}

/**
 * 登录后读取这篇分享能不能收藏、以及当前人是不是作者。
 * GET /wiki/shares/view/:token/favorite → { favorited, owned }
 * owned 为 true 时作者本人，客户端不提供收藏。
 */
export async function readShareFavorite(session: RemoteSession, token: string): Promise<ShareFavorite> {
  const data = await authedShare<unknown>(session, "GET", `/wiki/shares/view/${encodeURIComponent(token)}/favorite`);
  return asFavorite(data, false);
}

/**
 * 收藏或取消。作者本人时服务端应返回 403 SHARE_OWN_PAGE，且不要写入。
 * POST 收藏，DELETE 取消。成功体与 GET 相同。
 */
export async function writeShareFavorite(session: RemoteSession, token: string, saved: boolean): Promise<ShareFavorite> {
  const path = `/wiki/shares/view/${encodeURIComponent(token)}/favorite`;
  const data = await authedShare<unknown>(session, saved ? "POST" : "DELETE", path);
  return asFavorite(data, saved);
}

export async function viewShare(token: string): Promise<SharedPageView> {
  const data = await publicShare<Record<string, unknown>>("GET", `/wiki/shares/view/${encodeURIComponent(token)}`);
  const rawChildren = Array.isArray(data.children) ? data.children : Array.isArray(data.pages) ? data.pages : [];
  return {
    title: typeof data.title === "string" ? data.title : "",
    body: asDocument(data.body),
    expiresAt: typeof data.expiresAt === "string" ? data.expiresAt : null,
    sharedAt: typeof data.sharedAt === "string" ? data.sharedAt : typeof data.createdAt === "string" ? data.createdAt : "",
    sharedBy: displayName(data.sharedBy ?? data.sharer ?? data.owner),
    children: rawChildren.map(asNode).filter((item): item is SharedPageNode => item !== null),
    id: nodeId(data),
  };
}
