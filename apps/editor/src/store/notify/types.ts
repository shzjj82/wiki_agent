/**
 * 网关 `/wiki/todos` 契约
 *
 * 状态只有四态：pending | in_progress | done | cancelled。
 * 不再使用 open，也不再把细态写进 data.localStatus。
 * 开始日、截止日只驱动通知，不改变状态。
 *
 * - POST /wiki/todos（pageId、title 必填；可带 status / startsAt / dueAt）
 * - PATCH /wiki/todos/:id
 * - POST …/start | …/done | …/cancel | …/reopen 直接改 status
 * - DELETE /wiki/todos/:id 删除任务，不是改成 cancelled
 * - GET ?status=pending,in_progress 可逗号分隔多个状态
 *
 * 待办块在服务端对应一条列表记录：data.kind = "list"，与 pageId 绑定。
 * 任务是另一条记录：data.kind = "task"、data.listId = 列表 id。
 * 铃铛待办栏只取 pending 与 in_progress 的任务，不含列表记录。
 */

/** 四态。open 只可能出现在尚未刷完的旧数据里，读到后按 pending 处理，不再写出 */
export type WikiTodoStatus = "pending" | "in_progress" | "done" | "cancelled" | "open";

export type TodoRecordStatus = Exclude<WikiTodoStatus, "open">;

export type WikiTodoPage = {
  id: string;
  slug?: string;
  title?: string;
  appCode?: string;
  kind?: string;
};

export type NotifyNoticeKind = "todo.started" | "todo.progress" | "todo.overdue" | string;

export type NotifyNotice = {
  id: string;
  title: string;
  content: string;
  category: string;
  source: string;
  readAt: string | null;
  createdAt: string;
  data?: {
    todoId?: string;
    pageId?: string;
    page?: WikiTodoPage;
    kind?: NotifyNoticeKind;
    localItemId?: string;
    [key: string]: unknown;
  } | null;
};

export type NotifyTodo = {
  id: string;
  title: string;
  /** 可选；详情块文档 JSON 或旧纯文本 */
  content?: string | null;
  category: string;
  source: string;
  /** 新契约四态；旧服务可能仍回 open，前端当 pending */
  status: WikiTodoStatus;
  dueAt: string | null;
  startsAt?: string | null;
  startedAt?: string | null;
  finishedAt: string | null;
  cancelledAt?: string | null;
  lastProgressNoticeOn?: string | null;
  lastOverdueNoticeOn?: string | null;
  startedNoticeAt?: string | null;
  createdAt: string;
  updatedAt: string;
  /** 服务端从 data.page 提升上来，跳转优先用它 */
  page?: WikiTodoPage | null;
  data?: {
    pageId?: string;
    page?: WikiTodoPage;
    legacyWithoutPage?: boolean;
    localItemId?: string;
    start?: string | null;
    end?: string | null;
    notify?: boolean;
    [key: string]: unknown;
  } | null;
};

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type NotifySnapshot = {
  openTodoCount: number;
  unreadNoticeCount: number;
  todos: NotifyTodo[];
  /** 未读通知 */
  notices: NotifyNotice[];
  /** 已读通知 */
  readNotices: NotifyNotice[];
};

/** 挂在 todo.data.attachments；与文档附件块同结构 */
export type TodoAttachment = {
  fileId: string;
  name: string;
  size: number;
  mime: string;
  source: "local" | "remote";
  url?: string;
};

export type UpsertTodoInput = {
  title: string;
  /** 非必填。省略则不改；块同步创建/更新都不带，正文只在详情里写 */
  content?: string;
  /** 新建必填。更新时带上表示改绑页面 */
  pageId?: string;
  category?: string;
  source?: string;
  status?: TodoRecordStatus;
  startsAt?: string | null;
  dueAt?: string | null;
  data?: Record<string, unknown> | null;
};
