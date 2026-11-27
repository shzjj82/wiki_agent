import type { Dispatch, RefObject, SetStateAction } from "react";
import { useEffect, useState } from "react";
import { Check, Paperclip, Send, X } from "lucide-react";
import { HistoryPanel } from "@/components/wiki-chat/HistoryPanel";
import type { WritingThread } from "@/lib/ai/writingThread";
import { BubbleAttachments, PendingAttachments } from "./ChatAttachments";
import type { DraftInsert } from "./useSpotlightChat";
import { Button } from "@/components/ui/button";
import { SoftScrollbar } from "@/components/soft-scrollbar";
import { ChatMarkdown } from "./ChatMarkdown";
import { AI_FILE_ACCEPT, type ChatBubble, type LocalAttachment } from "@/lib/ai/chat";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

type Props = {
  listRef: RefObject<HTMLDivElement | null>;
  fileRef: RefObject<HTMLInputElement>;
  inputRef: RefObject<HTMLTextAreaElement>;
  prompt: string;
  onPromptChange: (value: string) => void;
  bubbles: ChatBubble[];
  threads: WritingThread[];
  threadId: string;
  historyOpen: boolean;
  onOpenThread: (id: string) => void;
  onNewThread: () => void;
  onDeleteThread: (id: string) => void;
  quote: string;
  setQuote: (value: string) => void;
  attachments: LocalAttachment[];
  setAttachments: Dispatch<SetStateAction<LocalAttachment[]>>;
  draft: DraftInsert | null;
  setDraft: (value: DraftInsert | null) => void;
  sending: boolean;
  insertingId: string | null;
  uploading: boolean;
  enabled: boolean;
  error: string;
  canSend: boolean;
  onAddFiles: (files: File[]) => void;
  onSend: () => void;
  onTidyInsert: (message: ChatBubble) => void;
  onSummarize: (messages: ChatBubble[]) => void;
  onConfirmDraft: () => void;
  onPickingChange?: (picking: boolean) => void;
};

export function SpotlightChatPane({
  listRef,
  fileRef,
  inputRef,
  prompt,
  onPromptChange,
  bubbles,
  threads,
  threadId,
  historyOpen,
  onOpenThread,
  onNewThread,
  onDeleteThread,
  quote,
  setQuote,
  attachments,
  setAttachments,
  draft,
  setDraft,
  sending,
  insertingId,
  uploading,
  enabled,
  error,
  canSend,
  onAddFiles,
  onSend,
  onTidyInsert,
  onSummarize,
  onConfirmDraft,
  onPickingChange,
}: Props) {
  const { t } = useTranslation();
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    onPickingChange?.(picking);
  }, [picking, onPickingChange]);
  useEffect(() => {
    setPicked((prev) => prev.filter((id) => bubbles.some((item) => item.id === id)));
  }, [bubbles]);
  useEffect(() => {
    if (draft) {
      setPicking(false);
      setPicked([]);
    }
  }, [draft]);
  const stopPicking = () => {
    setPicking(false);
    setPicked([]);
  };
  const streamingId = sending ? [...bubbles].reverse().find((item) => item.role === "assistant")?.id : undefined;
  useEffect(() => {
    if (!picking) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      stopPicking();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [picking]);
  const pickedBubbles = bubbles.filter((item) => picked.includes(item.id));
  const toggle = (id: string) => {
    setPicked((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  return (
    <div className="editor-spotlight-chat-body">
      <div className="flex min-h-0 flex-1">
      {historyOpen ? (
        <HistoryPanel
          threads={threads}
          activeId={threadId || null}
          onNew={onNewThread}
          onOpen={onOpenThread}
          onDelete={onDeleteThread}
          width={220}
        />
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <SoftScrollbar ref={listRef as RefObject<HTMLDivElement>} className="editor-spotlight-chat" contentClassName="editor-spotlight-chat-inner" stickToBottom jumpToBottomLabel={t("common.scrollToBottom")}>
          {bubbles.length === 0 ? (
            <div className="editor-spotlight-chat-empty">
              <p>{t("spotlight.chatHint")}</p>
              {quote ? <p className="editor-spotlight-chat-quote-hint">{t("spotlight.selectionAttached")}</p> : null}
            </div>
          ) : (
            bubbles.map((item) => {
              const on = picked.includes(item.id);
              return (
              <div
                key={item.id}
                className={cn(
                  "editor-spotlight-bubble",
                  item.role === "user" ? "is-user" : "is-assistant",
                  picking && on && "is-selected",
                )}
              >
                {picking ? (
                  <button
                    type="button"
                    className={cn("editor-spotlight-pick", on && "is-on")}
                    aria-pressed={on}
                    aria-label={on ? t("spotlight.deselect") : t("spotlight.select")}
                    onClick={() => toggle(item.id)}
                  >
                    {on ? <Check size={12} /> : null}
                  </button>
                ) : null}
                <div className="editor-spotlight-bubble-main">
                {item.quote ? <blockquote className="editor-spotlight-quote">{item.quote}</blockquote> : null}
                <ChatMarkdown
                  content={item.content}
                  className="editor-spotlight-bubble-text"
                  compact={item.role === "user"}
                  streaming={item.id === streamingId}
                />
                {item.attachments?.length ? <BubbleAttachments items={item.attachments} /> : null}
                {item.role === "assistant" ? (
                  <div className="editor-spotlight-bubble-actions">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={Boolean(insertingId) || sending}
                      onClick={() => void onTidyInsert(item)}
                    >
                      {insertingId === item.id ? t("spotlight.combining") : t("spotlight.addToPage")}
                    </Button>
                  </div>
                ) : null}
                </div>
              </div>
              );
            })
          )}
          {sending ? (
            <div className="editor-spotlight-typing" aria-label={t("spotlight.replying")}>
              <span className="ai-dot size-1.5 rounded-full bg-muted-foreground/70" />
              <span className="ai-dot ai-dot-delay-1 size-1.5 rounded-full bg-muted-foreground/70" />
              <span className="ai-dot ai-dot-delay-2 size-1.5 rounded-full bg-muted-foreground/70" />
              <span className="text-xs text-muted-foreground">{t("spotlight.thinking")}</span>
            </div>
          ) : null}
      </SoftScrollbar>

      {draft ? (
        <div className="editor-spotlight-draft">
          <div className="editor-spotlight-draft-head">
            <div>
              <p className="editor-spotlight-draft-label">{t("spotlight.combinedPreviewConfirmToInsert")}</p>
              {draft.note ? <p className="editor-spotlight-draft-note">{draft.note}</p> : null}
            </div>
            <div className="editor-spotlight-draft-actions">
              <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={Boolean(insertingId)}
                onClick={() => void onConfirmDraft()}
              >
                {insertingId === draft.messageId ? t("spotlight.inserting") : t("spotlight.insert")}
              </Button>
            </div>
          </div>
          <div className="editor-spotlight-draft-body">
            <ChatMarkdown content={draft.markdown} className="editor-spotlight-draft-md" />
          </div>
        </div>
      ) : null}
      </div>
      </div>

      {quote ? (
        <div className="editor-spotlight-selection">
          <span className="editor-spotlight-selection-label">{t("spotlight.selection")}</span>
          <p className="editor-spotlight-selection-text">{quote}</p>
          <button
            type="button"
            className="editor-spotlight-selection-clear"
            aria-label={t("spotlight.clearSelection")}
            onClick={() => setQuote("")}
          >
            <X size={12} />
          </button>
        </div>
      ) : null}

      <form
        className="shrink-0 border-t border-border/30 p-3 pt-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!picking) {
            void onSend();
          }
        }}
      >
        {error ? <p className="text-destructive mb-2 text-xs">{error}</p> : null}
        <div className="rounded-2xl border border-border/40 bg-muted/20 px-2.5 pt-2.5 pb-2 focus-within:border-border/70">
          {attachments.length ? (
            <PendingAttachments
              items={attachments}
              onRemove={(id) => setAttachments((prev) => prev.filter((item) => item.id !== id))}
              className="pb-2"
            />
          ) : null}
          <textarea
            ref={inputRef}
            rows={2}
            value={prompt}
            disabled={!enabled || sending || picking}
            enterKeyHint="send"
            placeholder={quote ? t("spotlight.askAboutTheSelection") : t("spotlight.messagePlaceholder")}
            aria-label={t("spotlight.messageLabel")}
            className="max-h-36 w-full resize-none bg-transparent px-2 py-1.5 text-base outline-none ring-0 focus:outline-none focus-visible:ring-0 sm:text-sm"
            onChange={(event) => onPromptChange(event.target.value)}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData?.files ?? []);
              if (!files.length) {
                return;
              }
              event.preventDefault();
              void onAddFiles(files);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.key === "Process") {
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!picking) {
                  void onSend();
                }
              }
            }}
          />
          <div className="flex items-center justify-between gap-2 px-1">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={AI_FILE_ACCEPT}
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length) {
                  void onAddFiles(files);
                }
                event.currentTarget.value = "";
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground focus-visible:border-transparent focus-visible:ring-0"
              disabled={!enabled || uploading || picking}
              aria-label={t("spotlight.addImageOrText")}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip size={16} />
            </Button>
            {picking ? (
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={stopPicking}>
                  {t("common.cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={pickedBubbles.length < 2 || Boolean(insertingId) || sending || !enabled}
                  onClick={() => void onSummarize(pickedBubbles)}
                >
                  {insertingId === "summary" && !draft ? t("spotlight.combining") : t("spotlight.combineCount", { count: pickedBubbles.length })}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                {bubbles.length >= 2 ? (
                  <Button type="button" variant="ghost" size="sm" disabled={sending} onClick={() => setPicking(true)}>
                    {t("spotlight.combine")}
                  </Button>
                ) : null}
                <Button type="submit" size="icon-sm" className="rounded-full focus-visible:ring-0" disabled={!canSend} aria-label={t("spotlight.send")}>
                  <Send size={15} />
                </Button>
              </div>
            )}
          </div>
        </div>
        <p className="text-muted-foreground mt-1.5 px-1 text-[11px]">
          {picking ? t("spotlight.pickRepliesToCombine") : t("spotlight.sendHint")}
        </p>
      </form>
    </div>
  );
}
