/**
 * 分享的客户端。
 *
 * 边界：编辑器（桌面端和部署出去的网页）只提交请求。创建、有效期、再分享、撤销、快照都由 NestJS 的 /wiki/shares 完成。
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
  /** 分享父页面时，NestJS 把当时的全部子页面快照放在这里。 */
  children?: SharedPageNode[];
};

export type ShareDraft = {
  pageId: string;
  /** 秒。null 表示不过期。 */
  expiresIn: number | null;
};

type CreatedShare = {
  token: string;
  urlPath: string;
  expiresAt: string | null;
  title: string;
  pageId?: string;
  sharedBy?: string | null;
};

/** 已部署的编辑器网页。桌面端和本地 5174 分享出去的链接指向这里。 */
const DEPLOYED_EDITOR_ORIGIN = "https://wiki.championsea.online";

/** 当前就是这个网页时用当前域名；桌面端用已部署的地址。VITE_EDITOR_PUBLIC_ORIGIN 只在换域名时覆盖。 */
export function shareSiteOrigin(origin = typeof window === "undefined" ? "" : window.location.origin): string {
  if (origin && !isLocalShareOrigin(origin)) return origin.replace(/\/$/, "");
  const configured = ((import.meta.env.VITE_EDITOR_PUBLIC_ORIGIN as string | undefined) || "").replace(/\/$/, "");
  return configured || DEPLOYED_EDITOR_ORIGIN;
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

export function createShare(session: RemoteSession, draft: ShareDraft): Promise<CreatedShare> {
  return authedShare<CreatedShare>(session, "POST", "/wiki/shares", {
    pageId: draft.pageId,
    expiresIn: draft.expiresIn,
  });
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

function asNode(value: unknown): SharedPageNode | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const rawChildren = Array.isArray(row.children) ? row.children : Array.isArray(row.pages) ? row.pages : [];
  const children = rawChildren.map(asNode).filter((item): item is SharedPageNode => item !== null);
  if (!title && children.length === 0) return null;
  return { title, body: asDocument(row.body), children };
}

export async function listShares(session: RemoteSession, pageId: string): Promise<ShareLink[]> {
  const data = await authedShare<{ shares?: ShareLink[] }>(session, "GET", `/wiki/shares?pageId=${encodeURIComponent(pageId)}`);
  return (data.shares ?? []).map((share) => ({ ...share, sharedBy: displayName(share.sharedBy) }));
}

export function revokeShare(session: RemoteSession, token: string): Promise<{ revoked: boolean }> {
  return authedShare(session, "DELETE", `/wiki/shares/${encodeURIComponent(token)}`);
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
  };
}
