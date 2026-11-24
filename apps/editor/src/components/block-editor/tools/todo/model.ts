import { t } from "@/i18n";
import { fineTodoStatus, type NotifyTodo, type UpsertTodoInput } from "@/store/notifyStore";
import { todayIso } from "./dates";

/** pending 未开始 · in_progress 进行中 · done 已完成 · cancelled 已终止 */
export type TodoStatus = "pending" | "in_progress" | "done" | "cancelled";

export type TodoItem = {
  id: string;
  text: string;
  status: TodoStatus;
  /** YYYY-MM-DD，空字符串表示未选 */
  start: string;
  end: string;
  /** 详情正文：Editor.js JSON；非必填 */
  content?: string;
  /** 已同步到 notify 服务的远程待办 id */
  remoteId?: string;
};

/** 块内「添加 / 编辑」走 React 详情对话框 */
export type TodoBlockDetailRequest = {
  creating: boolean;
  pageId: string;
  draft: { title: string; content?: string; status?: TodoStatus };
  onSubmit: (data: { title: string; content: string }) => void | Promise<void>;
  /** 详情里改状态。主操作是下一状态，也可以直接改成任意状态 */
  onStatus?: (status: TodoStatus) => void | Promise<void>;
};

export type TodoData = {
  /** 服务端待办列表 id，与 pageId 绑定。页面只留这个 id */
  listId?: string;
  /** 运行时从 store 填上。写回文档时不再带正文，只留任务 id */
  items?: TodoItem[];
  /** 属于这份列表的任务 id */
  ids?: string[];
  /** 整块待办共用，不跟某一条绑定 */
  notify: boolean;
};

export type Tab = "pending" | "in_progress" | "ended";

export function isEnded(status: TodoStatus): boolean {
  return status === "done" || status === "cancelled";
}

export function migrateStatus(raw: { status?: unknown; done?: unknown }): TodoStatus {
  const status = String(raw.status ?? "").trim();
  if (status === "pending" || status === "in_progress" || status === "done" || status === "cancelled") {
    return status;
  }
  return raw.done ? "done" : "pending";
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function blankItem(): TodoItem {
  const today = todayIso();
  return { id: uid(), text: "", status: "pending", start: today, end: today };
}

export function asDate(value: unknown): string {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

/** 取消完成 / 恢复终止时回到未开始，状态只由用户确认 */
export function reopenStatus(_item: Pick<TodoItem, "start">): TodoStatus {
  return "pending";
}

/** 展示态就是用户确认过的状态。开始日只用于通知，不把任务改成进行中 */
export function displayStatus(item: TodoItem, _notifyOn?: boolean): TodoStatus {
  return item.status;
}

export function statusLabel(status: TodoStatus): string {
  if (status === "in_progress") {
    return t("todo.inProgress");
  }
  if (status === "done") {
    return t("todo.done");
  }
  if (status === "cancelled") {
    return t("todo.cancelled");
  }
  return t("todo.pending");
}

export function normalizeItem(raw: unknown): TodoItem | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const item = raw as Partial<TodoItem> & { done?: boolean };
  const remoteId = typeof item.remoteId === "string" && item.remoteId.trim() ? item.remoteId.trim() : undefined;
  const content = typeof item.content === "string" && item.content.trim() ? item.content : undefined;
  return {
    id: typeof item.id === "string" && item.id ? item.id : uid(),
    text: String(item.text ?? ""),
    status: migrateStatus(item),
    start: asDate(item.start),
    end: asDate(item.end),
    ...(content ? { content } : {}),
    ...(remoteId ? { remoteId } : {}),
  };
}

export function dueAtFromItem(item: TodoItem): string | null {
  if (!item.end) return null;
  const date = new Date(`${item.end}T23:59:59.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function upsertPayload(item: TodoItem, pageId: string, listId: string, notify: boolean): UpsertTodoInput | null {
  const title = item.text.trim().slice(0, 120);
  if (!title || !pageId || !listId) return null;
  return {
    title,
    ...(item.content?.trim() ? { content: item.content.trim() } : {}),
    pageId,
    category: "page",
    source: "wiki",
    status: item.status,
    startsAt: item.start || null,
    dueAt: dueAtFromItem(item),
    data: {
      kind: "task",
      listId,
      ...(item.remoteId ? {} : { localItemId: item.id }),
      start: item.start || null,
      end: item.end || null,
      notify,
    },
  };
}

export function dayOf(value: unknown): string {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
}

export function todoToItem(todo: NotifyTodo): TodoItem {
  const content = typeof todo.content === "string" && todo.content.trim() ? todo.content : undefined;
  return {
    id: todo.id,
    remoteId: todo.id,
    text: todo.title ?? "",
    status: fineTodoStatus(todo),
    start: dayOf(todo.data?.start) || dayOf(todo.startsAt),
    end: dayOf(todo.data?.end) || dayOf(todo.dueAt),
    ...(content ? { content } : {}),
  };
}

export function normalize(data: Partial<TodoData> | undefined): TodoData & { items: TodoItem[] } {
  const rawItems = Array.isArray(data?.items) ? data.items : [];
  const items = rawItems.map(normalizeItem).filter((item): item is TodoItem => item !== null);
  const ids = Array.isArray(data?.ids) ? data.ids.filter((id): id is string => typeof id === "string" && Boolean(id.trim())) : [];
  const legacyNotify = rawItems.some(
    (raw) => Boolean(raw && typeof raw === "object" && (raw as { notify?: unknown }).notify),
  );
  const listId = typeof data?.listId === "string" && data.listId.trim() ? data.listId.trim() : undefined;
  return {
    items: items.length ? items : [blankItem()],
    notify: Boolean(data?.notify) || legacyNotify,
    ...(ids.length ? { ids } : {}),
    ...(listId ? { listId } : {}),
  };
}
