import type { EditorJsBlock } from "@myblog/shared";
import type EditorJS from "@editorjs/editorjs";
import { useEffect, useRef, useState } from "react";
import { aiChat, aiStatus } from "@/lib/ai/client";
import { insertEditorBlocksAt, saveEditor } from "@/lib/document/insertBlocks";
import {
  aiErrorMessage,
  buildUserChatContent,
  currentBlockIndex,
  parseLocalFiles,
  toApiAttachments,
  toApiMessages,
  uid,
  type ChatBubble,
  type LocalAttachment,
} from "@/lib/ai/chat";
import { blocksToPreviewMarkdown, markdownToEditorBlocks } from "@/lib/ai/markdown";
import { pageTodos, type SearchDoc } from "@/lib/document/search";
import { loadWritingPage, saveWritingPage, writingTitle, type WritingThread } from "@/lib/ai/writingThread";
import { t } from "@/i18n";
import { loadSession } from "@/store/remoteStore";

export type DraftInsert = {
  messageId: string;
  blocks: EditorJsBlock[];
  note?: string;
  markdown: string;
};

type Options = {
  open: boolean;
  /** 写作记录按这篇文章分开存，和知识库对话不是同一份 */
  pageId?: string;
  editor: EditorJS | null;
  insertIndex: number;
  loadPages?: () => Promise<SearchDoc[]>;
  onInserted?: () => void;
};

function upsertThread(threads: WritingThread[], thread: WritingThread): WritingThread[] {
  return [thread, ...threads.filter((item) => item.id !== thread.id)].sort((a, b) => b.updatedAt - a.updatedAt);
}

function asksAboutTodos(query: string): boolean {
  return /待办|未完成|未开始|进行中|已完成|已终止|todo/i.test(query);
}

export function useSpotlightChat({ open, pageId = "", editor, insertIndex, loadPages, onInserted }: Options) {
  const [enabled, setEnabled] = useState(true);
  const [statusError, setStatusError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [insertingId, setInsertingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [quote, setQuote] = useState("");
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const [threads, setThreads] = useState<WritingThread[]>([]);
  const [threadId, setThreadId] = useState("");
  const [draft, setDraft] = useState<DraftInsert | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const bubblesRef = useRef(bubbles);
  bubblesRef.current = bubbles;
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;
  const pageIdRef = useRef(pageId);
  const skipSaveRef = useRef(true);

  const persistPage = (id: string, nextThreads: WritingThread[], activeId: string) => {
    threadsRef.current = nextThreads;
    setThreads(nextThreads);
    saveWritingPage(id, { activeId, threads: nextThreads });
  };

  useEffect(() => {
    const prev = pageIdRef.current;
    if (prev && prev !== pageId) {
      const currentId = threadIdRef.current;
      const currentBubbles = bubblesRef.current;
      if (currentId && currentBubbles.length) {
        const title = writingTitle(currentBubbles, t("wikiAsk.untitledChat"));
        const next = upsertThread(threadsRef.current, {
          id: currentId,
          title,
          updatedAt: Date.now(),
          bubbles: currentBubbles,
        });
        saveWritingPage(prev, { activeId: currentId, threads: next });
      }
    }
    pageIdRef.current = pageId;
    skipSaveRef.current = true;
    abortInFlight();
    const stored = loadWritingPage(pageId);
    const active = stored.threads.find((item) => item.id === stored.activeId) ?? stored.threads[0];
    setThreads(stored.threads);
    setThreadId(active?.id ?? "");
    setBubbles(active?.bubbles ?? []);
    setPrompt("");
    setError("");
    setAttachments([]);
    setQuote("");
    setDraft(null);
  }, [pageId]);

  useEffect(() => {
    if (!pageId) {
      return;
    }
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    if (!bubbles.length) {
      return;
    }
    const id = threadIdRef.current || uid();
    if (threadIdRef.current !== id) {
      threadIdRef.current = id;
      setThreadId(id);
    }
    const next = upsertThread(threadsRef.current, {
      id,
      title: writingTitle(bubbles, t("wikiAsk.untitledChat")),
      updatedAt: Date.now(),
      bubbles,
    });
    persistPage(pageId, next, id);
  }, [pageId, bubbles]);

  const abortInFlight = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  const nextSignal = () => {
    abortInFlight();
    const controller = new AbortController();
    abortRef.current = controller;
    return controller.signal;
  };

  useEffect(() => {
    if (!open) {
      abortInFlight();
      return;
    }
    // 先看本地登录；未登录直接关 AI，不再假装查本地写作代理
    if (!loadSession()?.token) {
      setEnabled(false);
      const msg = aiErrorMessage("UNAUTHORIZED");
      setStatusError(msg);
      setError(msg);
      return () => abortInFlight();
    }
    void aiStatus().then((data) => {
      setEnabled(data.enabled);
      const msg = data.enabled ? "" : aiErrorMessage(data.reason || "AI_NOT_CONFIGURED");
      setStatusError(msg);
      setError(msg);
    });
    return () => abortInFlight();
  }, [open]);


  const openThread = (id: string) => {
    const found = threadsRef.current.find((item) => item.id === id);
    if (!found) {
      return;
    }
    skipSaveRef.current = true;
    threadIdRef.current = id;
    setThreadId(id);
    setBubbles(found.bubbles);
    setDraft(null);
    setPrompt("");
    if (pageId) {
      saveWritingPage(pageId, { activeId: id, threads: threadsRef.current });
    }
  };

  const newThread = () => {
    skipSaveRef.current = true;
    const id = uid();
    threadIdRef.current = id;
    setThreadId(id);
    setBubbles([]);
    setDraft(null);
    setPrompt("");
    setQuote("");
  };

  const deleteThread = (id: string) => {
    const rest = threadsRef.current.filter((item) => item.id !== id);
    if (threadIdRef.current !== id) {
      persistPage(pageId, rest, threadIdRef.current);
      return;
    }
    const next = rest[0];
    skipSaveRef.current = true;
    threadIdRef.current = next?.id ?? "";
    setThreadId(next?.id ?? "");
    setBubbles(next?.bubbles ?? []);
    setDraft(null);
    persistPage(pageId, rest, next?.id ?? "");
  };

  const resetChat = () => {
    abortInFlight();
    setPrompt("");
    setError("");
    setSending(false);
    setInsertingId(null);
    setUploading(false);
    setAttachments([]);
    setQuote("");
    setDraft(null);
  };

  const addFiles = async (files: File[]) => {
    if (!files.length) {
      return;
    }
    setError("");
    setUploading(true);
    try {
      const next = await parseLocalFiles(files);
      setAttachments((prev) => [...prev, ...next]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spotlight.attachmentFailed"));
    } finally {
      setUploading(false);
      if (fileRef.current) {
        fileRef.current.value = "";
      }
    }
  };

  const isAbort = (err: unknown) =>
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError");

  const send = async () => {
    const text = prompt.trim();
    const attach = [...attachmentsRef.current];
    if ((!text && !attach.length && !quote) || sending) {
      return;
    }
    if (!enabled) {
      setError(statusError || aiErrorMessage("AI_NOT_CONFIGURED"));
      return;
    }

    const userBubble: ChatBubble = {
      id: uid(),
      role: "user",
      content: buildUserChatContent({
        text,
        quote,
        hasAttachments: attach.length > 0,
      }),
      quote: quote || undefined,
      attachments: attach.length ? attach : undefined,
    };
    const assistantId = uid();
    const nextBubbles = [...bubblesRef.current, userBubble];
    setBubbles([...nextBubbles, { id: assistantId, role: "assistant", content: "" }]);
    setPrompt("");
    setQuote("");
    setAttachments([]);
    setError("");
    setSending(true);

    const signal = nextSignal();
    try {
      const editorDocument = editor ? await saveEditor(editor) : undefined;
      if (signal.aborted) {
        return;
      }
      const messages = toApiMessages(nextBubbles);
      if (loadPages && asksAboutTodos(text)) {
        try {
          const wantDone = /已完成/.test(text);
          const wantCancel = /已终止|取消|终止/.test(text);
          const wantActive = /未完成|未开始|进行中|待办|todo/i.test(text);
          const lines = [t("wikiAsk.todoRule")];
          for (const page of pageTodos(await loadPages())) {
            const items = page.items.filter((item) => {
              if (wantDone && !wantActive && !wantCancel) {
                return item.done || item.status === "已完成";
              }
              if (wantCancel && !wantActive && !wantDone) {
                return item.status === "已终止";
              }
              if (wantActive && !wantDone && !wantCancel) {
                return item.status === "未开始" || item.status === "进行中";
              }
              return true;
            });
            if (!items.length) {
              continue;
            }
            lines.push(`《${page.title}》`);
            for (const item of items) {
              const range = item.start || item.end ? `（${item.start || "?"}至${item.end || "?"}）` : "";
              lines.push(`- ${item.status}：${item.text}${range}`);
            }
          }
          const retrieved = lines.length > 1 ? lines.join("\n") : t("wikiAsk.todoEmpty");
          const last = messages[messages.length - 1];
          if (last?.role === "user") {
            last.content = `${retrieved}\n\n${last.content}`.slice(0, 8000);
          }
        } catch {
          // 页面索引失败时仍按当前正文回答
        }
      }
      const result = await aiChat(
        {
          messages,
          attachments: toApiAttachments(attach),
          document: editorDocument,
        },
        signal,
        {
          onDelta: (delta) => {
            setBubbles((prev) =>
              prev.map((item) =>
                item.id === assistantId ? { ...item, content: item.content + delta } : item,
              ),
            );
          },
        },
      );
      const finalText = result.reply.trim() || t("spotlight.emptyReply");
      setBubbles((prev) =>
        prev.map((item) => (item.id === assistantId ? { ...item, content: finalText } : item)),
      );
    } catch (err) {
      if (isAbort(err) || signal.aborted) {
        return;
      }
      setError(aiErrorMessage(err instanceof Error ? err.message : t("spotlight.failedToSend")));
      setBubbles((prev) => prev.filter((item) => item.id !== userBubble.id && item.id !== assistantId));
      setPrompt(text);
      if (userBubble.quote) {
        setQuote(userBubble.quote);
      }
      if (attach.length) {
        setAttachments(attach);
      }
    } finally {
      if (!signal.aborted) {
        setSending(false);
      }
    }
  };

  const tidyAndInsert = async (message: ChatBubble) => {
    if (!editor || insertingId) {
      return;
    }
    if (!enabled) {
      setError(statusError || aiErrorMessage("AI_NOT_CONFIGURED"));
      return;
    }
    const source = message.content.trim();
    if (!source) {
      setError(t("spotlight.nothingToInsert"));
      return;
    }

    setInsertingId(message.id);
    setError("");
    const signal = nextSignal();
    try {
      const editorDocument = await saveEditor(editor);
      if (signal.aborted) {
        return;
      }
      const result = await aiChat(
        {
          messages: [
            ...toApiMessages([message]),
            { role: "user", content: t("spotlight.tidyPrompt") },
          ],
          document: editorDocument,
        },
        signal,
      );
      const blocks = markdownToEditorBlocks(result.reply.trim());
      if (!blocks.length) {
        throw new Error(t("spotlight.nothingToInsert"));
      }
      const at = currentBlockIndex(editor, insertIndex);
      const inserted = await insertEditorBlocksAt(editor, blocks, at);
      onInserted?.();
      const firstId = inserted.blockIds[0];
      if (firstId) {
        requestAnimationFrame(() => {
          window.document
            .querySelector(`.ce-block[data-id="${firstId}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      }
    } catch (err) {
      if (isAbort(err) || signal.aborted) {
        return;
      }
      setError(aiErrorMessage(err instanceof Error ? err.message : t("spotlight.failedToCombine")));
    } finally {
      if (!signal.aborted) {
        setInsertingId(null);
      }
    }
  };

  const summarize = async (messages: ChatBubble[]) => {
    if (!editor || messages.length < 2 || insertingId) {
      return;
    }
    if (!enabled) {
      setError(statusError || aiErrorMessage("AI_NOT_CONFIGURED"));
      return;
    }

    setInsertingId("summary");
    setError("");
    const signal = nextSignal();
    try {
      const editorDocument = await saveEditor(editor);
      if (signal.aborted) {
        return;
      }
      const result = await aiChat(
        {
          messages: [
            ...toApiMessages(messages),
            {
              role: "user",
              content: t("spotlight.combinePrompt"),
            },
          ],
          document: editorDocument,
        },
        signal,
      );
      const blocks = markdownToEditorBlocks(result.reply) as EditorJsBlock[];
      if (!blocks.length) {
        throw new Error("AI_EMPTY_BLOCKS");
      }
      setDraft({
        messageId: "summary",
        blocks,
        markdown: blocksToPreviewMarkdown(blocks),
      });
    } catch (err) {
      if (isAbort(err) || signal.aborted) {
        return;
      }
      setError(aiErrorMessage(err instanceof Error ? err.message : t("spotlight.failedToCombine")));
    } finally {
      if (!signal.aborted) {
        setInsertingId(null);
      }
    }
  };

  const confirmDraft = async () => {
    if (!editor || !draft || insertingId) {
      return;
    }
    setInsertingId(draft.messageId);
    setError("");
    try {
      const at = currentBlockIndex(editor, insertIndex);
      const inserted = await insertEditorBlocksAt(editor, draft.blocks, at);
      setDraft(null);
      onInserted?.();
      const firstId = inserted.blockIds[0];
      if (firstId) {
        requestAnimationFrame(() => {
          window.document
            .querySelector(`.ce-block[data-id="${firstId}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      }
    } catch (err) {
      setError(aiErrorMessage(err instanceof Error ? err.message : t("spotlight.failedToInsert")));
    } finally {
      setInsertingId(null);
    }
  };

  const canSend =
    enabled && !uploading && !sending && Boolean(prompt.trim() || attachments.length || quote);

  return {
    enabled,
    prompt,
    setPrompt,
    error,
    sending,
    insertingId,
    uploading,
    attachments,
    setAttachments,
    quote,
    setQuote,
    bubbles,
    threads,
    threadId,
    openThread,
    newThread,
    deleteThread,
    draft,
    setDraft,
    listRef,
    fileRef,
    resetChat,
    addFiles,
    send,
    tidyAndInsert,
    summarize,
    confirmDraft,
    canSend,
  };
}
