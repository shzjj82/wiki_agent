/**
 * 和 wiki 服务端的 WikiLocate 同一套字段。
 * 现在能执行的是打开文档、在当前页定位文字、用浏览器打开网页。
 * 下一步放在 next 里，按顺序执行；更复杂的组合以后也靠这层嵌套。
 */
export const LOCATE_TYPES = ["page", "text", "url"] as const;
export const JUMP_MODES = ["push", "replace", "here", "browser"] as const;

export type LocateType = (typeof LOCATE_TYPES)[number];
export type JumpMode = (typeof JUMP_MODES)[number];

export type LocateTarget = {
  type: LocateType;
  /** 文档 id。page 必填；text 带上时会先打开这篇文档。 */
  pageId?: string;
  /** 页内要定位的文字。 */
  text?: string;
  /** 网页地址。只接受 http(s)。 */
  url?: string;
  /** 缺省时：网页用 browser，带文档的文字用 push，当前页文字用 here。 */
  mode?: JumpMode;
  next?: LocateTarget;
};

const MAX_DEPTH = 8;

function textOf(value: unknown, limit: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text.slice(0, limit);
}

function modeOf(value: unknown): JumpMode | undefined {
  return JUMP_MODES.includes(value as JumpMode) ? (value as JumpMode) : undefined;
}

/** 把服务端或调用方给的对象收成定位目标。字段不合法就丢掉这一层。 */
export function parseLocate(value: unknown, depth = 0): LocateTarget | null {
  if (depth >= MAX_DEPTH || !value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  const next = parseLocate(row.next, depth + 1) ?? undefined;
  const mode = modeOf(row.mode);
  if (row.type === "page") {
    const pageId = textOf(row.pageId, 80);
    if (!pageId) {
      return null;
    }
    return { type: "page", pageId, mode: mode ?? "push", ...(next ? { next } : {}) };
  }
  if (row.type === "text") {
    const text = textOf(row.text, 500);
    if (!text) {
      return null;
    }
    const pageId = textOf(row.pageId, 80);
    return {
      type: "text",
      text,
      ...(pageId ? { pageId } : {}),
      mode: mode ?? (pageId ? "push" : "here"),
      ...(next ? { next } : {}),
    };
  }
  if (row.type === "url") {
    const url = webpageUrl(textOf(row.url, 2000));
    if (!url) {
      return null;
    }
    return { type: "url", url, mode: "browser", ...(next ? { next } : {}) };
  }
  return null;
}

export function webpageUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw || raw.length > 2000) {
    return null;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    if (url.username || url.password) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function pageTarget(pageId: string, mode: JumpMode = "push"): LocateTarget {
  return { type: "page", pageId, mode };
}

/** 先打开文档，再在当前页定位文字。 */
export function textInPage(pageId: string, text: string, mode: JumpMode = "push"): LocateTarget {
  return { type: "page", pageId, mode, next: { type: "text", text, mode: "here" } };
}

export function urlTarget(url: string): LocateTarget | null {
  const href = webpageUrl(url);
  return href ? { type: "url", url: href, mode: "browser" } : null;
}

/** 会改编辑器里正在看的文档。纯网页跳转不算。 */
export function locateInPage(target: LocateTarget | null, depth = 0): boolean {
  if (!target || depth >= MAX_DEPTH) {
    return false;
  }
  if (target.type === "page" || target.type === "text") {
    return true;
  }
  return locateInPage(target.next ?? null, depth + 1);
}

/** 知识库命中：打开文档，有摘录再定位摘录。和 wiki 的 locateForRagSource 一致。 */
export function locateFromSource(source: { docId?: string; content?: string }): LocateTarget | null {
  const pageId = (source.docId ?? "").trim();
  if (!pageId) {
    return null;
  }
  const text = (source.content ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  return text ? textInPage(pageId, text) : pageTarget(pageId);
}
