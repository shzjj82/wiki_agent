import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { emptyEditorDocument, type EditorJsDocument } from "@myblog/shared";
import { ChevronDown, FileText } from "lucide-react";
import { BlockEditor } from "@/components/block-editor";
import { Locate } from "@/components/locate";
import { pageTarget } from "@/lib/locate/target";
import { imageBlockData } from "@/components/block-editor/tools/ImageBlockTool";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SoftScrollbar } from "@/components/soft-scrollbar";
import { isImageFile } from "@/lib/document/fileKinds";
import { cn } from "@/lib/utils";
import {
  contentDocumentFromTodo,
  encodeTodoContent,
  fineTodoStatus,
  getTodo,
  pageIdFromTodo,
  syncTodoStatus,
  todoAttachments,
  updateTodo,
  type NotifyTodo,
  type TodoAttachment,
} from "@/store/notifyStore";
import { saveAttachment, type AttachmentData } from "@/store/fileStore";
import type { RemoteSession } from "@/store/remoteStore";
import type { TodoBlockDetailRequest, TodoStatus } from "@/components/block-editor/tools/TodoBlockTool";

export type TodoDetailTarget =
  | { mode: "edit"; todo: NotifyTodo }
  | { mode: "block"; request: TodoBlockDetailRequest };

const STATUS_ORDER: TodoStatus[] = ["pending", "in_progress", "done", "cancelled"];

function nextTodoStatus(status: TodoStatus): TodoStatus {
  if (status === "pending") return "in_progress";
  if (status === "in_progress") return "done";
  return "pending";
}

function nextStatusKey(status: TodoStatus) {
  if (status === "pending") return "todo.startTask" as const;
  if (status === "in_progress") return "todo.finishTask" as const;
  if (status === "cancelled") return "todo.restore" as const;
  return "todo.reopen" as const;
}

function statusNameKey(status: TodoStatus) {
  if (status === "in_progress") return "todo.inProgress" as const;
  if (status === "done") return "todo.done" as const;
  if (status === "cancelled") return "todo.cancelled" as const;
  return "todo.pending" as const;
}

type Props = {
  session: RemoteSession | null;
  target: TodoDetailTarget | null;
  dueLabel: string;
  onClose: () => void;
  onSaved?: (todo: NotifyTodo) => void;
  onDone?: (todo: NotifyTodo) => void;
  onOpenPage?: (todo: NotifyTodo) => void | Promise<void>;
};

function plainBlockText(value: unknown): string {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function withLegacyAttachments(doc: EditorJsDocument, files: TodoAttachment[]): EditorJsDocument {
  if (!files.length) return doc;
  const used = new Set(
    (doc.blocks ?? [])
      .map((block) => (typeof block.data?.fileId === "string" ? block.data.fileId : ""))
      .filter(Boolean),
  );
  const extra = files
    .filter((file) => file.fileId && !used.has(file.fileId))
    .map((file) =>
      isImageFile({ name: file.name, type: file.mime })
        ? { type: "image" as const, data: imageBlockData(file) as unknown as Record<string, unknown> }
        : { type: "attachment" as const, data: { ...file } as Record<string, unknown> },
    );
  if (!extra.length) return doc;
  return { ...doc, blocks: [...(doc.blocks ?? []), ...extra] };
}

function withoutDuplicateTitle(doc: EditorJsDocument, title: string): EditorJsDocument {
  const needle = title.trim();
  if (!needle || !doc.blocks?.length) return doc;
  const [first, ...rest] = doc.blocks;
  if (
    (first.type === "paragraph" || first.type === "header") &&
    plainBlockText(first.data?.text) === needle
  ) {
    return { ...doc, blocks: rest };
  }
  return doc;
}

export function TodoDetailDialog({ session, target, dueLabel, onClose, onSaved, onDone, onOpenPage }: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const isBlock = target?.mode === "block";
  const creating = isBlock && target.request.creating;
  const editing = target?.mode === "edit" ? target.todo : null;
  const [title, setTitle] = useState("");
  const [body, setBody] = useState<EditorJsDocument>(() => emptyEditorDocument());
  const [editorReady, setEditorReady] = useState(false);
  const [busy, setBusy] = useState<"save" | "page" | "status" | null>(null);
  const [flowStatus, setFlowStatus] = useState<TodoStatus>("pending");
  const statusTouched = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef(body);
  bodyRef.current = body;

  useEffect(() => {
    if (!target) {
      setEditorReady(false);
      return;
    }
    let cancelled = false;
    setError(null);
    setBusy(null);
    statusTouched.current = false;

    if (target.mode === "block") {
      setTitle(target.request.draft.title ?? "");
      setFlowStatus(target.request.draft.status ?? "pending");
      setBody(contentDocumentFromTodo({ content: target.request.draft.content ?? "" }));
      setEditorReady(true);
      return;
    }

    setEditorReady(false);
    setTitle(target.todo.title ?? "");
    setFlowStatus(fineTodoStatus(target.todo));

    const apply = (row: NotifyTodo) => {
      if (cancelled) return;
      const nextTitle = row.title ?? "";
      setTitle(nextTitle);
      if (!statusTouched.current) setFlowStatus(fineTodoStatus(row));
      setBody(
        withoutDuplicateTitle(
          withLegacyAttachments(contentDocumentFromTodo(row), todoAttachments(row)),
          nextTitle,
        ),
      );
      setEditorReady(true);
    };

    void getTodo(session!, target.todo.id)
      .then((fresh) => apply(fresh))
      .catch(() => apply(target.todo));

    return () => {
      cancelled = true;
    };
  }, [session, target]);

  const open = Boolean(target);
  const status =
    flowStatus === "in_progress"
      ? t("notify.statusInProgress")
      : flowStatus === "done"
        ? t("todo.done")
        : flowStatus === "cancelled"
          ? t("todo.cancelled")
          : t("notify.statusPending");
  const blockRequest = target?.mode === "block" ? target.request : null;
  const canChangeStatus = !creating && (Boolean(editing) || Boolean(blockRequest?.onStatus));
  const nextStatus = nextTodoStatus(flowStatus);

  async function uploadFile(file: File): Promise<AttachmentData> {
    const { data } = await saveAttachment(session, file);
    return data;
  }

  async function onSave() {
    if (!target) return;
    if (!title.trim()) {
      setError(t("notify.titleRequired"));
      return;
    }
    setBusy("save");
    setError(null);
    try {
      const content = encodeTodoContent(bodyRef.current);
      if (target.mode === "block") {
        await target.request.onSubmit({ title: title.trim(), content });
        onClose();
        return;
      }
      if (!session) {
        throw new Error(t("notify.actionFailed"));
      }
      const prev = target.todo.data && typeof target.todo.data === "object" ? { ...target.todo.data } : {};
      const { attachments: _drop, ...rest } = prev as Record<string, unknown> & { attachments?: unknown };
      const saved = await updateTodo(session, target.todo.id, {
        title: title.trim() || t("notify.untitled"),
        ...(content ? { content } : {}),
        startsAt: target.todo.startsAt ?? (typeof rest.start === "string" ? rest.start : null),
        dueAt: target.todo.dueAt,
        data: rest,
      });
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("notify.actionFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(status: TodoStatus) {
    if (!target || creating || status === flowStatus) return;
    setBusy("status");
    setError(null);
    try {
      if (target.mode === "block") {
        statusTouched.current = true;
        await target.request.onStatus?.(status);
        setFlowStatus(status);
        return;
      }
      if (!session || !editing) throw new Error(t("notify.actionFailed"));
      const content = encodeTodoContent(bodyRef.current);
      const prev = editing.data && typeof editing.data === "object" ? { ...editing.data } : {};
      const { attachments: _drop, ...rest } = prev as Record<string, unknown> & { attachments?: unknown };
      const saved = await updateTodo(session, editing.id, {
        title: title.trim() || t("notify.untitled"),
        ...(content ? { content } : {}),
        startsAt: editing.startsAt ?? (typeof rest.start === "string" ? rest.start : null),
        dueAt: editing.dueAt,
        status,
        data: rest,
      });
      const synced = await syncTodoStatus(session, editing.id, status).catch(() => saved);
      statusTouched.current = true;
      setFlowStatus(status);
      if (status === "done") {
        onDone?.(synced);
        onClose();
        return;
      }
      onSaved?.(synced);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("notify.actionFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function openPage() {
    if (!editing || !onOpenPage || !session) return;
    setBusy("page");
    setError(null);
    try {
      const content = encodeTodoContent(bodyRef.current);
      const prev = editing.data && typeof editing.data === "object" ? { ...editing.data } : {};
      const { attachments: _drop, ...rest } = prev as Record<string, unknown> & { attachments?: unknown };
      const saved = await updateTodo(session, editing.id, {
        title: title.trim() || t("notify.untitled"),
        ...(content ? { content } : {}),
        startsAt: editing.startsAt ?? (typeof rest.start === "string" ? rest.start : null),
        dueAt: editing.dueAt,
        data: rest,
      });
      onSaved?.(saved);
      await onOpenPage(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("notify.actionFailed"));
    } finally {
      setBusy(null);
    }
  }

  const textInset = "pl-[3.5rem]";
  const editorKey =
    target?.mode === "edit" ? target.todo.id : target?.mode === "block" ? `block:${target.request.creating}` : "closed";

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent
        className="flex max-h-[min(44rem,88vh)] flex-col gap-0 overflow-hidden border-border/40 p-0 shadow-xl sm:max-w-2xl md:max-w-3xl"
        onInteractOutside={(event) => {
          const node = event.target;
          if (node instanceof Element && node.closest("[data-todo-status-menu]")) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          const node = event.target;
          if (node instanceof Element && node.closest("[data-todo-status-menu]")) event.preventDefault();
        }}
      >
        <DialogHeader className="shrink-0 gap-0 px-4 pt-4 pb-3 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <DialogDescription className={cn(textInset, "flex min-w-0 flex-wrap items-center gap-2 text-xs")}>
              <DialogTitle className="sr-only">{creating ? t("notify.createTitle") : t("notify.detailTitle")}</DialogTitle>
              <span className="rounded-full bg-muted/70 px-2 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
                {status}
              </span>
              {dueLabel ? <span className="tabular-nums text-muted-foreground/90">{dueLabel}</span> : null}
            </DialogDescription>
            {canChangeStatus || (editing && onOpenPage) ? (
              <div className="flex shrink-0 items-center gap-1">
                {canChangeStatus ? (
                  <div className="inline-flex h-8 items-stretch overflow-hidden rounded-full bg-foreground text-background">
                    <button
                      type="button"
                      className="px-3 text-xs disabled:opacity-50"
                      disabled={Boolean(busy)}
                      onClick={() => void setStatus(nextStatus)}
                    >
                      {busy === "status" ? t("notify.saving") : t(nextStatusKey(flowStatus))}
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="inline-flex w-7 items-center justify-center border-l border-background/25 outline-none disabled:opacity-50"
                        disabled={Boolean(busy)}
                        aria-label={t("todo.otherStatus")}
                      >
                        <ChevronDown size={14} />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent data-todo-status-menu="" align="end" className="z-[80] min-w-28">
                        {STATUS_ORDER.map((status) => (
                          <DropdownMenuItem
                            key={status}
                            disabled={status === flowStatus || Boolean(busy)}
                            className={status === nextStatus ? "font-semibold" : undefined}
                            onSelect={() => void setStatus(status)}
                          >
                            {t(statusNameKey(status))}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ) : null}
                {editing && onOpenPage ? (
                  <Locate
                    target={pageIdFromTodo(editing) ? pageTarget(pageIdFromTodo(editing)!) : null}
                    onLocate={() => openPage()}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                      disabled={Boolean(busy)}
                    >
                      <FileText size={14} />
                      {t("notify.openPage")}
                    </Button>
                  </Locate>
                ) : null}
              </div>
            ) : null}
          </div>
        </DialogHeader>

        <SoftScrollbar className="min-h-0 flex-1" contentClassName="px-4 pb-8 pt-2 sm:px-5">
          <label htmlFor={titleId} className={cn("block", textInset)}>
            <span className="sr-only">{t("notify.fieldTitle")}</span>
            <input
              id={titleId}
              value={title}
              placeholder={t("notify.untitled")}
              disabled={Boolean(busy)}
              autoFocus={creating}
              onChange={(event) => setTitle(event.target.value)}
              className={cn(
                "w-full bg-transparent pt-2 pb-2 text-[1.35rem] font-semibold leading-snug tracking-tight text-foreground outline-none",
                "placeholder:font-medium placeholder:text-muted-foreground/40",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            />
          </label>
          <p className={cn(textInset, "mb-5 mt-1 text-[10px] leading-4 text-muted-foreground/70")}>
            {t("notify.contentEditorHint")}
          </p>

          {target && editorReady ? (
            <BlockEditor
              key={editorKey}
              variant="embed"
              doc={body}
              onChange={setBody}
              onUploadFile={uploadFile}
              onUploadError={(message) => setError(message)}
              onConfirmDeleteFile={async (name) => window.confirm(t("attachment.deleteConfirm", { name }))}
            />
          ) : (
            <div className="flex min-h-72 items-center justify-center text-xs text-muted-foreground">
              {t("notify.loadingContent")}
            </div>
          )}
          {error ? <p className={cn(textInset, "mt-4 text-xs text-destructive")}>{error}</p> : null}
        </SoftScrollbar>

        <DialogFooter className="shrink-0 justify-end gap-2 border-t border-border/40 bg-muted/20 px-4 py-3.5 sm:px-5">
          <Button type="button" variant="ghost" size="sm" disabled={Boolean(busy)} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" size="sm" disabled={Boolean(busy)} onClick={() => void onSave()}>
            {busy === "save" ? t("notify.saving") : creating ? t("notify.create") : t("notify.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
