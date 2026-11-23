import { useEffect, useRef, useState } from "react";
import { History, Settings, X } from "lucide-react";
import type { AiChatMessage } from "@myblog/shared";
import { Button } from "@/components/ui/button";
import {
  aiChat,
  deleteAgentConversation,
  getAgentConversation,
  listAgentConversations,
} from "@/lib/ai/client";
import { aiErrorMessage, toApiAttachments, uid, type ChatBubble, type LocalAttachment } from "@/lib/ai/chat";
import {
  SKILL_SYSTEM,
  extractSkills,
  isDesktopApp,
  loadSkillGrants,
  runSkill,
  saveSkillGrants,
  skillScope,
  type SkillCall,
  type SkillGrants,
} from "@/lib/ai/skills";
import type { SearchDoc } from "@/lib/document/search";
import { copyText } from "@/lib/clipboard";
import {
  detailToThread,
  loadActiveThreadId,
  saveActiveThreadId,
  summaryToThread,
  type WikiThread,
} from "@/lib/ai/wikiChatHistory";
import { t } from "@/i18n";
import { useTranslation } from "react-i18next";
import { useVisualViewport } from "@/lib/useKeyboardInset";
import { useIsMobile } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";
import { HistoryPanel } from "./HistoryPanel";
import { useFloatingFrame, windowBox } from "./frame";
import { asksAboutTodos, capImages, formatTodos, MESSAGE_LIMIT, readUpload, skillErrorMessage, userContent } from "./prompt";
import { ChatComposer, ChatMessages, PendingSkills, ResizeHandle, SkillPermissions, skillLabel } from "./parts";

type Props = {
  open: boolean;
  focusToken: number;
  loggedIn: boolean;
  loadPages?: () => Promise<SearchDoc[]>;
  onClose: () => void;
  onLogin: () => void;
};

export function WikiChat({ open, focusToken, loggedIn, loadPages, onClose, onLogin }: Props) {
  const { t: tr } = useTranslation();
  const desktop = isDesktopApp();
  const isMobile = useIsMobile();
  const viewport = useVisualViewport();
  const { frame, beginDrag, onDragMove, endDrag } = useFloatingFrame(open, focusToken);
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<WikiThread[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [grants, setGrants] = useState<SkillGrants>(() => loadSkillGrants());
  const [permOpen, setPermOpen] = useState(false);
  const [pendingSkills, setPendingSkills] = useState<SkillCall[]>([]);
  const [sheetPresent, setSheetPresent] = useState(open);
  const [sheetEntered, setSheetEntered] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const copiedTimer = useRef(0);
  const sendingRef = useRef(false);
  sendingRef.current = sending;

  useEffect(() => {
    if (open) {
      setSheetPresent(true);
      const enter = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setSheetEntered(true));
      });
      return () => window.cancelAnimationFrame(enter);
    }
    setSheetEntered(false);
    if (!isMobile) {
      setSheetPresent(false);
      return;
    }
    const leave = window.setTimeout(() => setSheetPresent(false), 320);
    return () => window.clearTimeout(leave);
  }, [open, isMobile]);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 30);
    return () => window.clearTimeout(timer);
  }, [open, focusToken]);


  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (permOpen) {
          setPermOpen(false);
          return;
        }
        if (historyOpen) {
          setHistoryOpen(false);
          return;
        }
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose, permOpen, historyOpen]);

  useEffect(() => {
    if (!open || !loggedIn) {
      if (!loggedIn) {
        setThreads([]);
        setThreadId(null);
        setBubbles([]);
      }
      return;
    }
    const untitled = tr("wikiAsk.untitledChat");
    let cancelled = false;
    void (async () => {
      try {
        const list = await listAgentConversations(untitled);
        if (cancelled) {
          return;
        }
        setThreads(list.map(summaryToThread));
        const active = loadActiveThreadId();
        if (!active || sendingRef.current) {
          return;
        }
        if (!list.some((item) => item.id === active)) {
          return;
        }
        const detail = await getAgentConversation(active, untitled);
        if (cancelled || sendingRef.current) {
          return;
        }
        const thread = detailToThread(detail);
        setThreadId(thread.id);
        setBubbles(thread.bubbles);
      } catch {
        if (!cancelled) {
          setError((prev) => prev || tr("wikiAsk.historyLoadFailed"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, loggedIn, tr]);

  useEffect(() => {
    if (!open || !loggedIn || !historyOpen) {
      return;
    }
    const untitled = tr("wikiAsk.untitledChat");
    let cancelled = false;
    void listAgentConversations(untitled)
      .then((list) => {
        if (!cancelled) {
          setThreads(list.map(summaryToThread));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, loggedIn, historyOpen, tr]);

  if (!sheetPresent) {
    return null;
  }

  const persistGrants = (next: SkillGrants) => {
    setGrants(next);
    saveSkillGrants(next);
  };

  const rememberConversation = (id: string | null | undefined) => {
    if (!id) {
      return;
    }
    setThreadId(id);
    saveActiveThreadId(id);
  };

  const refreshThreads = async () => {
    const list = await listAgentConversations(tr("wikiAsk.untitledChat"));
    setThreads(list.map(summaryToThread));
  };

  const startNewChat = () => {
    abortRef.current?.abort();
    setSending(false);
    setPendingSkills([]);
    setError("");
    setPrompt("");
    setAttachments([]);
    setBubbles([]);
    setThreadId(null);
    saveActiveThreadId(null);
    setPermOpen(false);
    if (isMobile) {
      setHistoryOpen(false);
    }
  };

  const openThread = (id: string) => {
    abortRef.current?.abort();
    setSending(false);
    setPendingSkills([]);
    setError("");
    setPrompt("");
    setAttachments([]);
    if (isMobile) {
      setHistoryOpen(false);
    }
    rememberConversation(id);
    void (async () => {
      try {
        const detail = await getAgentConversation(id, tr("wikiAsk.untitledChat"));
        const thread = detailToThread(detail);
        setBubbles(thread.bubbles);
        setThreads((prev) => {
          const rest = prev.filter((item) => item.id !== thread.id);
          return [thread, ...rest];
        });
      } catch {
        setError(tr("wikiAsk.historyLoadFailed"));
      }
    })();
  };

  const removeThread = (id: string) => {
    void (async () => {
      try {
        await deleteAgentConversation(id);
        setThreads((prev) => prev.filter((item) => item.id !== id));
        if (threadId !== id) {
          return;
        }
        abortRef.current?.abort();
        setSending(false);
        setPendingSkills([]);
        setError("");
        setPrompt("");
        setAttachments([]);
        setBubbles([]);
        setThreadId(null);
        saveActiveThreadId(null);
      } catch {
        setError(tr("wikiAsk.historyLoadFailed"));
      }
    })();
  };

  const addFiles = async (files: File[]) => {
    if (!files.length) {
      return;
    }
    setUploading(true);
    setError("");
    try {
      const next = await readUpload(files);
      setAttachments((prev) => [...prev, ...next]);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("spotlight.attachmentFailed"));
    } finally {
      setUploading(false);
      if (fileRef.current) {
        fileRef.current.value = "";
      }
      inputRef.current?.focus();
    }
  };

  const answer = async (history: ChatBubble[], assistantId: string, onFail: () => void) => {
    const user = [...history].reverse().find((item) => item.role === "user" && !item.notice);
    const text = user?.content.trim() ?? "";
    const attach = user?.attachments ?? [];
    setError("");
    setSending(true);
    setReplyingId(assistantId);
    setPendingSkills([]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const uploadedFiles = toApiAttachments(attach).filter((item) =>
        item.kind === "image" ? Boolean(item.url) : Boolean(item.text.trim()),
      );
      let retrieved = "";
      let aboutTodos = false;
      if (loadPages && text) {
        aboutTodos = asksAboutTodos(text);
        try {
          const docs = await loadPages();
          retrieved = aboutTodos
            ? formatTodos(docs, text, tr("wikiAsk.todoRule"), tr("wikiAsk.todoEmpty"))
            : "";
        } catch {
          retrieved = "";
        }
      }
      const messages: AiChatMessage[] = history
        .map((item) => ({
          role: item.role,
          content:
            item.role === "user"
              ? item.notice
                ? item.content
                : userContent(item.content, item.attachments, tr("wikiAsk.uploaded"), tr("wikiAsk.question"), tr("ai.attachmentsPrompt"))
              : item.content,
        }))
        .filter((item) => item.content.trim());
      if (!messages.length || messages[messages.length - 1]?.role !== "user") {
        messages.push({
          role: "user",
          content: userContent(text, attach, tr("wikiAsk.uploaded"), tr("wikiAsk.question"), tr("ai.attachmentsPrompt")) || tr("ai.attachmentsPrompt"),
        });
      }
      if (retrieved) {
        const last = messages[messages.length - 1];
        if (last?.role === "user") {
          const room = MESSAGE_LIMIT - last.content.length - 2;
          const block = `${tr("wikiAsk.retrieved")}\n${retrieved}`.slice(0, Math.max(0, room));
          if (block.trim()) {
            last.content = `${block}\n\n${last.content}`;
          }
        }
      }
      const lastUser = [...messages].reverse().find((item) => item.role === "user");
      const result = await aiChat(
        {
          messages: lastUser ? [lastUser] : messages.slice(-1),
          attachments: capImages(uploadedFiles),
          system: desktop ? `${t("wikiAsk.system")}\n${SKILL_SYSTEM}` : t("wikiAsk.system"),
          conversationId: threadId,
          rag: !aboutTodos,
        },
        controller.signal,
        {
          onDelta: (delta) => {
            setBubbles((prev) =>
              prev.map((item) => (item.id === assistantId ? { ...item, content: item.content + delta } : item)),
            );
          },
        },
      );
      const parsed = extractSkills(result.reply.trim() || tr("spotlight.emptyReply"));
      setBubbles((prev) => prev.map((item) => (item.id === assistantId ? { ...item, content: parsed.text || item.content } : item)));
      if (desktop && parsed.skills.length) {
        setPendingSkills(parsed.skills);
      }
      rememberConversation(result.conversationId);
      void refreshThreads().catch(() => undefined);
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      setError(aiErrorMessage(err instanceof Error ? err.message : tr("spotlight.failedToSend")));
      onFail();
    } finally {
      if (!controller.signal.aborted) {
        setSending(false);
        setReplyingId(null);
      }
    }
  };

  const send = async () => {
    const text = prompt.trim();
    if ((!text && !attachments.length) || sending) {
      return;
    }
    if (!loggedIn) {
      setError(tr("wikiAsk.login"));
      return;
    }
    const attach = attachments;
    const user: ChatBubble = { id: uid(), role: "user", content: text, attachments: attach.length ? attach : undefined };
    const history = [...bubbles, user];
    const assistantId = uid();
    setBubbles([...history, { id: assistantId, role: "assistant", content: "" }]);
    setPrompt("");
    setAttachments([]);
    void answer(history, assistantId, () => {
      setBubbles((prev) => prev.filter((item) => item.id !== user.id && item.id !== assistantId));
      setPrompt(text);
      setAttachments(attach);
    });
  };

  const regenerate = (assistantId: string) => {
    if (sending) {
      return;
    }
    const index = bubbles.findIndex((item) => item.id === assistantId);
    if (index < 0) {
      return;
    }
    let userIndex = -1;
    for (let i = index - 1; i >= 0; i -= 1) {
      if (bubbles[i]?.role === "user" && !bubbles[i]?.notice) {
        userIndex = i;
        break;
      }
    }
    if (userIndex < 0) {
      return;
    }
    const previous = bubbles[index]?.content ?? "";
    const history = bubbles.slice(0, userIndex + 1);
    setBubbles([...history, { id: assistantId, role: "assistant", content: "" }]);
    void answer(history, assistantId, () => {
      setBubbles((prev) => prev.map((item) => (item.id === assistantId ? { ...item, content: previous } : item)));
    });
  };

  const copyReply = async (item: ChatBubble) => {
    const ok = await copyText(item.content);
    if (!ok) {
      setError(tr("wikiAsk.copyFailed"));
      return;
    }
    setCopiedId(item.id);
    window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => {
      setCopiedId((current) => (current === item.id ? null : current));
    }, 1600);
  };

  const allowSkill = async (call: SkillCall, remember: boolean) => {
    const scope = skillScope(call.name);
    if (remember) {
      persistGrants({ ...grants, [scope]: true });
    }
    try {
      const output = await runSkill(call);
      const notice: ChatBubble = {
        id: uid(),
        role: "user",
        notice: true,
        content: tr("wikiAsk.skillResult", { skill: tr(skillLabel[scope]), result: output }),
      };
      const rest = pendingSkills.filter((item) => item !== call);
      setPendingSkills(rest);
      const assistantId = uid();
      const history = [...bubbles, notice];
      setBubbles([...history, { id: assistantId, role: "assistant", content: "" }]);
      void answer(history, assistantId, () => {
        setBubbles((prev) => prev.filter((item) => item.id !== notice.id && item.id !== assistantId));
      });
    } catch (err) {
      setError(err instanceof Error ? skillErrorMessage(err.message) : tr("wikiAsk.skillFailed"));
    }
  };

  const canSend = loggedIn && !sending && !uploading && Boolean(prompt.trim() || attachments.length);
  const box = windowBox(frame, historyOpen && !isMobile);

  return (
    <aside
      className={cn(
        "fixed z-50 flex flex-col overflow-hidden bg-background",
        isMobile
          ? "inset-x-0 w-full rounded-none border-0 shadow-none transition-transform duration-300 ease-out will-change-transform motion-reduce:transition-none"
          : "rounded-2xl border border-border/50 shadow-[0_18px_50px_rgb(0_0_0/0.14)]",
        isMobile && (sheetEntered ? "translate-y-0" : "translate-y-full"),
      )}
      style={
        isMobile
          ? { top: viewport.top, height: viewport.height }
          : { left: box.left, top: frame.y, width: box.width, height: frame.h }
      }
      onPointerMove={isMobile ? undefined : onDragMove}
      onPointerUp={isMobile ? undefined : endDrag}
      onPointerCancel={isMobile ? undefined : endDrag}
    >
      <header
        className={cn(
          "flex shrink-0 items-center gap-1 border-b border-border/40 px-3 py-2",
          !isMobile && "cursor-grab active:cursor-grabbing",
        )}
        onPointerDown={(event) => {
          if (isMobile || (event.target as HTMLElement).closest("button")) {
            return;
          }
          beginDrag(event, "move");
        }}
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{tr("wikiAsk.title")}</span>
        <Button type="button" variant={historyOpen ? "secondary" : "ghost"} size="icon" aria-label={tr("wikiAsk.history")} onClick={() => setHistoryOpen((open) => !open)}>
          <History size={16} />
        </Button>
        {desktop ? (
          <Button type="button" variant={permOpen ? "secondary" : "ghost"} size="icon" aria-label={tr("wikiAsk.permissions")} onClick={() => setPermOpen((open) => !open)}>
            <Settings size={16} />
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="icon" aria-label={tr("wikiAsk.close")} onClick={onClose}>
          <X size={16} />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
      {historyOpen && !isMobile ? (
        <HistoryPanel
          threads={threads}
          activeId={threadId}
          onNew={startNewChat}
          onOpen={openThread}
          onDelete={removeThread}
        />
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {desktop && permOpen ? <SkillPermissions grants={grants} onChange={persistGrants} /> : null}

      <ChatMessages
        bubbles={bubbles}
        sending={sending}
        replyingId={replyingId}
        copiedId={copiedId}
        onCopy={(item) => void copyReply(item)}
        onRegenerate={regenerate}
      />

      {desktop && pendingSkills.length ? (
        <PendingSkills
          calls={pendingSkills}
          onDeny={(call) => setPendingSkills((prev) => prev.filter((item) => item !== call))}
          onAllow={(call, remember) => void allowSkill(call, remember)}
        />
      ) : null}

      <ChatComposer
        inputRef={inputRef}
        fileRef={fileRef}
        prompt={prompt}
        attachments={attachments}
        error={error}
        loggedIn={loggedIn}
        sending={sending}
        uploading={uploading}
        canSend={canSend}
        showHint={!isMobile}
        onPromptChange={setPrompt}
        onRemoveAttachment={(id) => setAttachments((prev) => prev.filter((item) => item.id !== id))}
        onFiles={(files) => void addFiles(files)}
        onSend={() => void send()}
        onLogin={onLogin}
      />
      </div>
      </div>
      {!isMobile ? (
        <>
          <ResizeHandle corner="nw" label={tr("wikiAsk.resize")} onPointerDown={(event) => beginDrag(event, "nw")} />
          <ResizeHandle corner="ne" label={tr("wikiAsk.resize")} onPointerDown={(event) => beginDrag(event, "ne")} />
          <ResizeHandle corner="sw" label={tr("wikiAsk.resize")} onPointerDown={(event) => beginDrag(event, "sw")} />
          <ResizeHandle corner="se" label={tr("wikiAsk.resize")} onPointerDown={(event) => beginDrag(event, "se")} />
        </>
      ) : null}
      {isMobile ? (
        <>
          <button
            type="button"
            className={cn(
              "absolute inset-0 z-40 bg-foreground/25 backdrop-blur-[1px] transition-opacity duration-200 ease-out motion-reduce:transition-none",
              historyOpen ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            aria-label={tr("wikiAsk.close")}
            aria-hidden={!historyOpen}
            tabIndex={historyOpen ? 0 : -1}
            onClick={() => setHistoryOpen(false)}
          />
          <div
            className={cn(
              "absolute inset-y-0 left-0 z-50 w-[min(84vw,320px)]",
              "transition-transform duration-200 ease-out will-change-transform motion-reduce:transition-none",
              historyOpen ? "translate-x-0 shadow-[12px_0_32px_rgb(0_0_0/0.14)]" : "pointer-events-none -translate-x-full shadow-none",
            )}
            aria-hidden={!historyOpen}
          >
            <HistoryPanel
              threads={threads}
              activeId={threadId}
              onNew={startNewChat}
              onOpen={openThread}
              onDelete={removeThread}
              width="100%"
              className="bg-background"
            />
          </div>
        </>
      ) : null}
    </aside>
  );
}
