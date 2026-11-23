import type { ChatBubble, LocalAttachment } from "@/lib/ai/chat";

const STORAGE_KEY = "editor:writing-threads";
const MAX_PAGES = 40;
const MAX_THREADS = 30;
const MAX_BUBBLES = 80;

export type WritingThread = {
  id: string;
  title: string;
  updatedAt: number;
  bubbles: ChatBubble[];
};

export type WritingPage = {
  activeId: string;
  threads: WritingThread[];
};

const EMPTY_PAGE: WritingPage = { activeId: "", threads: [] };

function readAll(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function keepAttachment(item: LocalAttachment): LocalAttachment | null {
  if (item.kind === "text") {
    return { ...item, text: item.text.slice(0, 8000) };
  }
  if (/^https?:\/\//i.test(item.url)) {
    return item;
  }
  return null;
}

function keepBubbles(bubbles: ChatBubble[]): ChatBubble[] {
  return bubbles.slice(-MAX_BUBBLES).map((item) => {
    const attachments = item.attachments
      ?.map(keepAttachment)
      .filter((entry): entry is LocalAttachment => Boolean(entry));
    return {
      id: item.id,
      role: item.role,
      content: item.content.slice(0, 8000),
      quote: item.quote?.slice(0, 2000),
      attachments: attachments?.length ? attachments : undefined,
      notice: item.notice,
    };
  });
}

export function writingTitle(bubbles: ChatBubble[], fallback: string): string {
  const first = bubbles.find((item) => item.role === "user" && item.content.trim());
  const text = (first?.content ?? "").replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, 40);
}

function asThread(raw: unknown): WritingThread | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const item = raw as Partial<WritingThread>;
  if (!item.id || !Array.isArray(item.bubbles)) {
    return null;
  }
  return {
    id: String(item.id),
    title: typeof item.title === "string" ? item.title.slice(0, 40) : "",
    updatedAt: Number(item.updatedAt) || 0,
    bubbles: keepBubbles(item.bubbles),
  };
}

/** 旧格式是一篇文章只存一段气泡。能认出来就收成一条历史，认不出就当没有。 */
function normalizePage(raw: unknown): WritingPage {
  if (!raw || typeof raw !== "object") {
    return EMPTY_PAGE;
  }
  const record = raw as { activeId?: unknown; threads?: unknown; bubbles?: unknown; updatedAt?: unknown };
  if (Array.isArray(record.threads)) {
    const threads = record.threads.map(asThread).filter((item): item is WritingThread => Boolean(item));
    threads.sort((a, b) => b.updatedAt - a.updatedAt);
    const activeId = threads.some((item) => item.id === record.activeId) ? String(record.activeId) : (threads[0]?.id ?? "");
    return { activeId, threads: threads.slice(0, MAX_THREADS) };
  }
  if (Array.isArray(record.bubbles) && record.bubbles.length) {
    const bubbles = keepBubbles(record.bubbles as ChatBubble[]);
    const id = "legacy";
    return {
      activeId: id,
      threads: [{ id, title: writingTitle(bubbles, ""), updatedAt: Number(record.updatedAt) || Date.now(), bubbles }],
    };
  }
  return EMPTY_PAGE;
}

export function loadWritingPage(pageId: string): WritingPage {
  if (!pageId) {
    return EMPTY_PAGE;
  }
  return normalizePage(readAll()[pageId]);
}

export function saveWritingPage(pageId: string, page: WritingPage) {
  if (!pageId) {
    return;
  }
  const threads = page.threads
    .filter((item) => item.bubbles.length)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_THREADS)
    .map((item) => ({ ...item, bubbles: keepBubbles(item.bubbles), title: item.title.slice(0, 40) }));
  const activeId = threads.some((item) => item.id === page.activeId) ? page.activeId : (threads[0]?.id ?? "");
  const all = readAll();
  all[pageId] = { activeId, threads };
  const ids = Object.entries(all)
    .map(([id, value]) => {
      const normalized = normalizePage(value);
      const updatedAt = normalized.threads[0]?.updatedAt ?? 0;
      return [id, { activeId: normalized.activeId, threads: normalized.threads }, updatedAt] as const;
    })
    .sort((a, b) => b[2] - a[2])
    .slice(0, MAX_PAGES);
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.fromEntries(ids.map(([id, value]) => [id, value]))),
    );
  } catch {
    // 本地空间不够时，这一篇的记录只留在当前会话里
  }
}
