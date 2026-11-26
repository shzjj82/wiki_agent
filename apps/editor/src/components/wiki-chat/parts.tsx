import { useMemo, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { Copy, Paperclip, RefreshCw, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ChatMarkdown } from "@/components/editor-spotlight/ChatMarkdown";
import { PendingAttachments } from "@/components/editor-spotlight/ChatAttachments";
import { SoftScrollbar } from "@/components/soft-scrollbar";
import { AI_FILE_ACCEPT, type ChatBubble, type LocalAttachment } from "@/lib/ai/chat";
import { renderCitedMarkdown, withCiteMarks } from "@/lib/ai/cite-marks";
import { sourceTypeKey, type WikiSource } from "@/lib/ai/sources";
import { locateFromSource, parseLocate, type LocateTarget } from "@/lib/locate/target";
import { skillPreview, skillScope, type SkillCall, type SkillGrants, type SkillScope } from "@/lib/ai/skills";
import type { ResizeCorner } from "./frame";

export const skillLabel: Record<SkillScope, "wikiAsk.skillFiles" | "wikiAsk.skillOpen" | "wikiAsk.skillShell"> = {
  files: "wikiAsk.skillFiles",
  open: "wikiAsk.skillOpen",
  shell: "wikiAsk.skillShell",
};

const skillHint: Record<SkillScope, "wikiAsk.skillHintFiles" | "wikiAsk.skillHintOpen" | "wikiAsk.skillHintShell"> = {
  files: "wikiAsk.skillHintFiles",
  open: "wikiAsk.skillHintOpen",
  shell: "wikiAsk.skillHintShell",
};

const RESIZE_POS: Record<ResizeCorner, string> = {
  nw: "top-0 left-0 cursor-nwse-resize",
  ne: "top-0 right-0 cursor-nesw-resize",
  sw: "bottom-0 left-0 cursor-nesw-resize",
  se: "bottom-0 right-0 cursor-nwse-resize",
};

export function ResizeHandle({
  corner,
  label,
  onPointerDown,
}: {
  corner: ResizeCorner;
  label: string;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`absolute z-20 size-4 bg-transparent ${RESIZE_POS[corner]}`}
      onPointerDown={onPointerDown}
    />
  );
}

function AssistantText({
  content,
  sources,
  onLocate,
}: {
  content: string;
  sources?: WikiSource[];
  onLocate: (target: LocateTarget | null) => void;
}) {
  const { t: tr } = useTranslation();
  const marked = Boolean(sources?.length);
  const html = useMemo(
    () =>
      marked && sources
        ? renderCitedMarkdown(withCiteMarks(content, sources, tr("wikiAsk.citeFrom")), sources, (source) => tr(sourceTypeKey(source.sourceType)))
        : undefined,
    [content, marked, sources, tr],
  );
  return (
    <ChatMarkdown
      content={content}
      html={html}
      onCite={
        marked && sources
          ? (index) => {
              const source = sources[index];
              if (!source) {
                return;
              }
              void onLocate(parseLocate(source.locate) ?? locateFromSource(source));
            }
          : undefined
      }
    />
  );
}

function AssistantBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-start">
      <div className="bg-muted/70 max-w-[85%] rounded-2xl rounded-bl-md px-3 py-2 text-sm select-text">{children}</div>
    </div>
  );
}

export function SkillPermissions({ grants, onChange }: { grants: SkillGrants; onChange: (next: SkillGrants) => void }) {
  const { t: tr } = useTranslation();
  return (
    <div className="shrink-0 space-y-3 border-b border-border/40 px-4 py-3 text-sm">
      <p className="text-muted-foreground text-xs">{tr("wikiAsk.permHint")}</p>
      {(["files", "open", "shell"] as SkillScope[]).map((scope) => (
        <label key={scope} className="flex items-start justify-between gap-3">
          <span>
            <span className="block font-medium">{tr(skillLabel[scope])}</span>
            <span className="text-muted-foreground mt-0.5 block text-xs">{tr(skillHint[scope])}</span>
          </span>
          <Switch checked={grants[scope]} onCheckedChange={(checked) => onChange({ ...grants, [scope]: checked })} />
        </label>
      ))}
    </div>
  );
}

export function ChatMessages({
  bubbles,
  sending,
  replyingId,
  copiedId,
  onCopy,
  onRegenerate,
  onLocate,
}: {
  bubbles: ChatBubble[];
  sending: boolean;
  replyingId: string | null;
  copiedId: string | null;
  onCopy: (item: ChatBubble) => void;
  onRegenerate: (id: string) => void;
  onLocate: (target: LocateTarget | null) => void;
}) {
  const { t: tr } = useTranslation();
  return (
    <SoftScrollbar className="min-h-0 flex-1" contentClassName="space-y-3 px-3 py-4" stickToBottom jumpToBottomLabel={tr("common.scrollToBottom")}>
      {bubbles.length === 0 ? (
        <AssistantBubble>
          <p className="leading-5">{tr("wikiAsk.emptyHint")}</p>
        </AssistantBubble>
      ) : (
        bubbles.map((item) =>
          item.notice ? (
            <p key={item.id} className="text-muted-foreground mx-auto max-w-[90%] rounded-xl bg-muted/70 px-3 py-2 text-center font-mono text-[11px] whitespace-pre-wrap">
              {item.content}
            </p>
          ) : item.role === "assistant" ? (
            <AssistantBubble key={item.id}>
              <AssistantText
                content={item.content || (sending && item.id === replyingId ? tr("spotlight.thinking") : "")}
                sources={item.sources}
                onLocate={onLocate}
              />
              {item.content.trim() && item.id !== replyingId ? (
                <div className="-ml-1 mt-1 flex items-center gap-0.5">
                  <Button type="button" variant="ghost" size="icon-xs" aria-label={copiedId === item.id ? tr("wikiAsk.copied") : tr("wikiAsk.copy")} onClick={() => onCopy(item)}>
                    <Copy size={14} />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-xs" disabled={sending} aria-label={tr("wikiAsk.regenerate")} onClick={() => onRegenerate(item.id)}>
                    <RefreshCw size={14} />
                  </Button>
                </div>
              ) : null}
            </AssistantBubble>
          ) : (
            <div key={item.id} className="flex justify-end">
              <div className="bg-foreground/14 text-foreground max-w-[85%] rounded-2xl rounded-br-md px-3 py-2 text-sm">
                {item.content ? <p className="leading-5 whitespace-pre-wrap">{item.content}</p> : null}
                {item.attachments?.length ? (
                  <div className={item.content ? "mt-2" : undefined}>
                    <PendingAttachments items={item.attachments} />
                  </div>
                ) : null}
              </div>
            </div>
          ),
        )
      )}
    </SoftScrollbar>
  );
}

export function PendingSkills({
  calls,
  onDeny,
  onAllow,
}: {
  calls: SkillCall[];
  onDeny: (call: SkillCall) => void;
  onAllow: (call: SkillCall, remember: boolean) => void;
}) {
  const { t: tr } = useTranslation();
  return (
    <div className="shrink-0 space-y-2 border-t border-border/40 px-4 py-3">
      {calls.map((call, index) => (
        <div key={`${call.name}-${index}`} className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
          <p className="font-medium">{tr("wikiAsk.skillAsk", { skill: tr(skillLabel[skillScope(call.name)]) })}</p>
          <p className="text-muted-foreground mt-1 font-mono text-xs break-all">{skillPreview(call)}</p>
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onDeny(call)}>
              {tr("wikiAsk.skillDeny")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => onAllow(call, false)}>
              {tr("wikiAsk.skillOnce")}
            </Button>
            <Button type="button" size="sm" onClick={() => onAllow(call, true)}>
              {tr("wikiAsk.skillAllow")}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChatComposer({
  inputRef,
  fileRef,
  prompt,
  attachments,
  error,
  loggedIn,
  sending,
  uploading,
  canSend,
  showHint,
  onPromptChange,
  onRemoveAttachment,
  onFiles,
  onSend,
  onLogin,
}: {
  inputRef: RefObject<HTMLTextAreaElement>;
  fileRef: RefObject<HTMLInputElement>;
  prompt: string;
  attachments: LocalAttachment[];
  error: string;
  loggedIn: boolean;
  sending: boolean;
  uploading: boolean;
  canSend: boolean;
  showHint: boolean;
  onPromptChange: (value: string) => void;
  onRemoveAttachment: (id: string) => void;
  onFiles: (files: File[]) => void;
  onSend: () => void;
  onLogin: () => void;
}) {
  const { t: tr } = useTranslation();
  return (
    <form
      className="shrink-0 border-t border-border/30 p-3 pt-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      {error ? <p className="text-destructive mb-2 text-xs">{error}</p> : null}
      {!loggedIn ? (
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs">{tr("wikiAsk.login")}</p>
          <Button type="button" size="sm" onClick={onLogin}>
            {tr("app.logIn")}
          </Button>
        </div>
      ) : null}
      <div className="rounded-2xl border border-border/40 bg-muted/20 px-2.5 pt-2.5 pb-2 focus-within:border-border/70">
        {attachments.length ? <PendingAttachments items={attachments} onRemove={onRemoveAttachment} className="pb-2" /> : null}
        <textarea
          ref={inputRef}
          rows={2}
          value={prompt}
          disabled={!loggedIn || sending}
          enterKeyHint="send"
          placeholder={tr("wikiAsk.placeholder")}
          aria-label={tr("wikiAsk.placeholder")}
          className="max-h-36 w-full resize-none bg-transparent px-2 py-1.5 text-base outline-none ring-0 focus:outline-none focus-visible:ring-0 sm:text-sm"
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              onSend();
            }
          }}
        />
        <div className="flex items-center justify-between gap-2 px-1">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={`${AI_FILE_ACCEPT},.docx,.xlsx,.xls,.csv`}
            className="hidden"
            onChange={(event) => onFiles(Array.from(event.target.files ?? []))}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground focus-visible:border-transparent focus-visible:ring-0"
            disabled={!loggedIn || uploading}
            aria-label={tr("wikiAsk.attach")}
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip size={16} />
          </Button>
          <Button type="submit" size="icon-sm" className="rounded-full focus-visible:ring-0" disabled={!canSend} aria-label={tr("wikiAsk.send")}>
            <Send size={15} />
          </Button>
        </div>
      </div>
      {showHint ? <p className="text-muted-foreground mt-1.5 px-1 text-[11px]">{tr("wikiAsk.hint")}</p> : null}
    </form>
  );
}
