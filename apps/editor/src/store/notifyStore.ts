import { request, type RemoteSession } from "@/store/remoteStore";
import { isActiveTodoStatus, isTodoListRecord, taskListId, toWireTodoStatus } from "./notify/helpers";
import type { NotifyNotice, NotifySnapshot, NotifyTodo, Page, TodoRecordStatus, UpsertTodoInput } from "./notify/types";

export * from "./notify/types";
export * from "./notify/helpers";

/**
 * 待办正文只活在这里，按服务端 id 索引。
 * 页面文档只留 id；打开页面时用 pageId 把这一页的任务灌进来。
 * 铃铛和块里的写入都会 publish，订阅方再重绘。
 */
const todosById = new Map<string, NotifyTodo>();
const idsByList = new Map<string, string[]>();
const listListeners = new Set<(listId: string) => void>();
const taskListeners = new Set<() => void>();

function emitListTasks(listId: string) {
  for (const listener of listListeners) {
    listener(listId);
  }
}

function emitTodoTasks() {
  for (const listener of taskListeners) {
    listener();
  }
}

function rememberTodo(todo: NotifyTodo, extra?: Record<string, unknown> | null): NotifyTodo {
  const prev = todosById.get(todo.id);
  const data = {
    ...(prev?.data ?? {}),
    ...(todo.data ?? {}),
    ...(extra ?? {}),
  };
  const next: NotifyTodo = {
    ...prev,
    ...todo,
    ...(Object.keys(data).length ? { data } : {}),
  };
  todosById.set(todo.id, next);
  return next;
}

export function cachedListTasks(listId: string): NotifyTodo[] {
  const ids = idsByList.get(listId) ?? [];
  const out: NotifyTodo[] = [];
  for (const id of ids) {
    const todo = todosById.get(id);
    if (todo && !isTodoListRecord(todo)) out.push(todo);
  }
  return out;
}

export function subscribeListTasks(listId: string, listener: () => void): () => void {
  const wrapped = (changed: string) => {
    if (changed === listId) listener();
  };
  listListeners.add(wrapped);
  return () => listListeners.delete(wrapped);
}

/** 铃铛待办栏：全部任务，不含待办列表本身 */
export function cachedTodoTasks(): NotifyTodo[] {
  return [...todosById.values()].filter((todo) => !isTodoListRecord(todo) && isActiveTodoStatus(todo.status));
}

export function subscribeTodoTasks(listener: () => void): () => void {
  taskListeners.add(listener);
  return () => taskListeners.delete(listener);
}

/** 写入一条任务或列表。列表本身不进任务清单，任务按 listId 通知对应页面块 */
export function publishTodo(todo: NotifyTodo, extra?: Record<string, unknown> | null) {
  if (!todo?.id) return;
  const next = rememberTodo(todo, extra);
  if (isTodoListRecord(next)) return;
  const listId = taskListId(next);
  if (listId) {
    const ids = idsByList.get(listId) ?? [];
    if (!ids.includes(next.id)) {
      idsByList.set(listId, [...ids, next.id]);
    }
    emitListTasks(listId);
  }
  emitTodoTasks();
}

/** 从页面块和铃铛里拿掉一条任务 */
export function forgetTodo(id: string) {
  const todoId = id.trim();
  if (!todoId) return;
  const todo = todosById.get(todoId);
  todosById.delete(todoId);
  const lists = new Set<string>();
  const known = taskListId(todo);
  if (known) lists.add(known);
  for (const [listId, ids] of idsByList) {
    if (ids.includes(todoId)) lists.add(listId);
  }
  for (const listId of lists) {
    idsByList.set(
      listId,
      (idsByList.get(listId) ?? []).filter((itemId) => itemId !== todoId),
    );
    emitListTasks(listId);
  }
  emitTodoTasks();
}

/** 删除任务记录。终止仍走 /cancel，不在这里改状态 */
export async function deleteTodo(session: RemoteSession, id: string): Promise<void> {
  const prev = todosById.get(id);
  forgetTodo(id);
  try {
    await request<unknown>(session, "DELETE", `/wiki/todos/${encodeURIComponent(id)}`);
  } catch (err) {
    if (prev) publishTodo(prev);
    throw err;
  }
}

/** 打开页面上的待办块时，一次取回这份列表的四态任务 */
export async function loadListTasks(session: RemoteSession, pageId: string, listId: string): Promise<NotifyTodo[]> {
  const page = pageId.trim();
  const list = listId.trim();
  if (!page || !list) return [];
  const result = await request<Page<NotifyTodo>>(
    session,
    "GET",
    `/wiki/todos?pageId=${encodeURIComponent(page)}&status=pending,in_progress,done,cancelled&page=1&pageSize=100`,
  );
  const seen = new Set<string>();
  const items = (result.items ?? []).filter((todo) => {
    if (!todo?.id || seen.has(todo.id) || taskListId(todo) !== list || isTodoListRecord(todo)) return false;
    seen.add(todo.id);
    return true;
  });
  for (const todo of items) rememberTodo(todo);
  idsByList.set(list, items.map((todo) => todo.id));
  emitListTasks(list);
  emitTodoTasks();
  return items;
}

/** 文档里记下的任务 id。没有 listId 的历史任务不会出现在列表查询里，按 id 取回真实状态 */
export async function attachSavedTasks(
  session: RemoteSession,
  pageId: string,
  listId: string,
  ids: string[],
  persist = true,
): Promise<void> {
  const list = listId.trim();
  const page = pageId.trim();
  if (!list) return;
  const known = new Set(cachedListTasks(list).map((todo) => todo.id));
  const missing = [...new Set(ids.map((id) => id.trim()).filter(Boolean))].filter((id) => !known.has(id));
  await Promise.all(
    missing.map(async (id) => {
      try {
        const todo = await getTodo(session, id);
        if (!todo?.id || isTodoListRecord(todo)) return;
        publishTodo(todo, { kind: "task", listId: list });
        if (!persist || taskListId(todo) === list) return;
        await updateTodoMergingData(session, todo.id, {
          title: todo.title?.trim() || "待办",
          pageId: page || undefined,
          startsAt: todo.startsAt ?? null,
          dueAt: todo.dueAt,
          data: { kind: "task", listId: list },
        });
      } catch (err) {
        console.warn("[todo-attach]", err);
      }
    }),
  );
}

/** 创建待办块时向服务端申请一份列表，id 与 pageId 绑定 */
export async function ensureTodoList(session: RemoteSession, pageId: string, listId?: string): Promise<NotifyTodo> {
  const page = pageId.trim();
  const existing = listId?.trim() ?? "";
  if (existing) {
    try {
      const current = await getTodo(session, existing);
      publishTodo(current);
      return current;
    } catch {
      // 列表已被删掉时重新申请
    }
  }
  return createTodo(session, {
    title: "待办",
    pageId: page,
    category: "page",
    status: "pending",
    data: { kind: "list", pageId: page },
  });
}

async function fetchNoticePage(session: RemoteSession, unread: boolean): Promise<Page<NotifyNotice>> {
  return request<Page<NotifyNotice>>(
    session,
    "GET",
    `/wiki/notifications?unread=${unread ? 1 : 0}&page=1&pageSize=20`,
  );
}

/** 铃铛收着时只刷新红点，不拉通知列表。 */
export async function refreshUnreadNoticeCount(session: RemoteSession): Promise<number> {
  const data = await request<{ count: number }>(session, "GET", "/wiki/notifications/unread-count");
  const count = data.count ?? 0;
  const prev = liveSnapshot;
  liveSnapshot = {
    openTodoCount: prev?.openTodoCount ?? 0,
    unreadNoticeCount: count,
    todos: prev?.todos ?? [],
    notices: prev?.notices ?? [],
    readNotices: prev?.readNotices ?? [],
  };
  emitNotifySnapshot();
  return count;
}

export async function fetchNotifySnapshot(session: RemoteSession): Promise<NotifySnapshot> {
  const [todos, unreadNotice, unreadPage, readPage] = await Promise.all([
    request<Page<NotifyTodo>>(session, "GET", "/wiki/todos?status=pending,in_progress&page=1&pageSize=100"),
    request<{ count: number }>(session, "GET", "/wiki/notifications/unread-count"),
    fetchNoticePage(session, true),
    fetchNoticePage(session, false).catch(async () => {
      // 旧网关若不支持 unread=0：拉全量再按 readAt 拆
      const all = await request<Page<NotifyNotice>>(session, "GET", "/wiki/notifications?page=1&pageSize=40");
      const items = (all.items ?? []).filter((notice) => Boolean(notice.readAt));
      return { ...all, items, total: items.length };
    }),
  ]);
  const raw = todos.items ?? [];
  const items = raw.filter((todo) => todo?.id && isActiveTodoStatus(todo.status) && !isTodoListRecord(todo));
  for (const todo of items) publishTodo(todo);
  const listCount = raw.filter(isTodoListRecord).length;
  const unreadItems = unreadPage.items ?? [];
  return {
    openTodoCount: Math.max(0, (todos.total ?? items.length) - listCount),
    unreadNoticeCount: unreadNotice.count ?? unreadPage.total ?? unreadItems.length,
    todos: items,
    notices: unreadItems,
    // unread=0 成功时直接用；全量回退里已按 readAt 过滤
    readNotices: readPage.items ?? [],
  };
}

let liveSnapshot: NotifySnapshot | null = null;
const snapshotListeners = new Set<() => void>();
let snapshotInflight: Promise<NotifySnapshot> | null = null;

export function peekNotifySnapshot(): NotifySnapshot | null {
  return liveSnapshot;
}

export function subscribeNotifySnapshot(listener: () => void): () => void {
  snapshotListeners.add(listener);
  return () => snapshotListeners.delete(listener);
}

function emitNotifySnapshot() {
  for (const listener of snapshotListeners) listener();
}

/** 多个铃铛同时刷新时共用这一次请求 */
export function loadNotifySnapshot(session: RemoteSession): Promise<NotifySnapshot> {
  if (snapshotInflight) return snapshotInflight;
  snapshotInflight = fetchNotifySnapshot(session)
    .then((next) => {
      liveSnapshot = next;
      emitNotifySnapshot();
      return next;
    })
    .finally(() => {
      snapshotInflight = null;
    });
  return snapshotInflight;
}

function wireUpsertBody(input: UpsertTodoInput, pageId?: string) {
  const patch: Record<string, unknown> = {
    title: input.title,
    category: input.category ?? "page",
    source: input.source ?? "wiki",
    dueAt: input.dueAt ?? null,
  };
  if (input.startsAt !== undefined) {
    patch.startsAt = input.startsAt;
  }
  if (input.content !== undefined) {
    patch.content = input.content;
  }
  if (input.status !== undefined) {
    patch.status = toWireTodoStatus(input.status);
  }
  if (input.data !== undefined) {
    const data = { ...(input.data ?? {}) };
    delete data.localStatus;
    patch.data = data;
  }
  if (pageId) {
    patch.pageId = pageId;
  }
  return patch;
}

export function createTodo(session: RemoteSession, input: UpsertTodoInput): Promise<NotifyTodo> {
  const pageId = input.pageId?.trim() ?? "";
  if (!pageId) {
    return Promise.reject(new Error("pageId 必填且须为有效文档 id"));
  }
  const body = wireUpsertBody({ ...input, status: input.status ?? "pending", startsAt: input.startsAt ?? null }, pageId);
  const sent = body.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : undefined;
  return request<NotifyTodo>(session, "POST", "/wiki/todos", body).then((todo) => {
    publishTodo(todo, sent);
    return todosById.get(todo.id) ?? todo;
  });
}

export function getTodo(session: RemoteSession, id: string): Promise<NotifyTodo> {
  return request<NotifyTodo>(session, "GET", `/wiki/todos/${id}`);
}

export function updateTodo(session: RemoteSession, id: string, input: UpsertTodoInput): Promise<NotifyTodo> {
  const pageId = input.pageId?.trim() ?? "";
  const body = wireUpsertBody(input, pageId || undefined);
  // PATCH 时 source 可省略
  const { source: _source, ...rest } = body;
  return request<NotifyTodo>(session, "PATCH", `/wiki/todos/${id}`, rest).then((todo) => {
    publishTodo(todo);
    return todo;
  });
}

/** 块同步更新时合并 data，避免冲掉详情里的 attachments / content 附属字段 */
export async function updateTodoMergingData(
  session: RemoteSession,
  id: string,
  input: UpsertTodoInput,
): Promise<NotifyTodo> {
  let merged = input.data;
  if (input.data !== undefined) {
    try {
      const current = await getTodo(session, id);
      const prev =
        current.data && typeof current.data === "object" ? (current.data as Record<string, unknown>) : {};
      merged = { ...prev, ...input.data };
    } catch {
      // 读失败则按调用方 data 写入
    }
  }
  return updateTodo(session, id, { ...input, data: merged });
}

/** 给还没有页面的历史待办补绑或改绑文档 */
function publishResult(todo: NotifyTodo): NotifyTodo {
  publishTodo(todo);
  return todo;
}

export function bindTodoPage(session: RemoteSession, id: string, pageId: string): Promise<NotifyTodo> {
  return request<NotifyTodo>(session, "POST", `/wiki/todos/${id}/page`, { pageId }).then(publishResult);
}

export function markTodoDone(session: RemoteSession, id: string): Promise<NotifyTodo> {
  return request<NotifyTodo>(session, "POST", `/wiki/todos/${id}/done`).then(publishResult);
}

export function markTodoStart(session: RemoteSession, id: string): Promise<NotifyTodo> {
  return request<NotifyTodo>(session, "POST", `/wiki/todos/${id}/start`).then(publishResult);
}

export function markTodoCancel(session: RemoteSession, id: string): Promise<NotifyTodo> {
  return request<NotifyTodo>(session, "POST", `/wiki/todos/${id}/cancel`).then(publishResult);
}

export function reopenTodo(session: RemoteSession, id: string): Promise<NotifyTodo> {
  return request<NotifyTodo>(session, "POST", `/wiki/todos/${id}/reopen`).then(publishResult);
}

/**
 * 按目标状态同步远程。优先 /start /done /cancel /reopen，失败时用 PATCH 写回四态 status。
 */
export async function syncTodoStatus(
  session: RemoteSession,
  id: string,
  status: TodoRecordStatus,
  fallback?: UpsertTodoInput,
): Promise<NotifyTodo> {
  try {
    if (status === "done") {
      return await markTodoDone(session, id);
    }
    if (status === "in_progress") {
      return await markTodoStart(session, id);
    }
    if (status === "cancelled") {
      return await markTodoCancel(session, id);
    }
    return await reopenTodo(session, id);
  } catch {
    // 专用接口未上线时直接改 status
  }
  if (!fallback?.title) {
    return Promise.reject(new Error("todo status sync failed"));
  }
  return updateTodo(session, id, {
    title: fallback.title,
    ...(fallback.content !== undefined ? { content: fallback.content } : {}),
    pageId: fallback.pageId,
    status,
    startsAt: fallback.startsAt,
    dueAt: fallback.dueAt,
    data: fallback.data,
  });
}

export function markNoticeRead(session: RemoteSession, id: string): Promise<NotifyNotice> {
  return request<NotifyNotice>(session, "POST", `/wiki/notifications/${id}/read`);
}

export function markAllNoticesRead(session: RemoteSession): Promise<{ updated: number }> {
  return request<{ updated: number }>(session, "POST", "/wiki/notifications/read-all");
}
