import { useMemo, type MouseEvent } from "react";
import { renderChatMarkdown } from "@/lib/ai/markdown";
import { desktopExternalUrl, isDesktopApp } from "@/lib/ai/skills";
import { openLocateUrl } from "@/lib/locate/run";
import { cn } from "@/lib/utils";

type Props = {
  content: string;
  /** 已经拼好的 HTML。知识库回答用它塞进出处按钮。 */
  html?: string;
  className?: string;
  /** 用户消息可关掉复杂样式，仍识别基础 markdown */
  compact?: boolean;
  onCite?: (index: number) => void;
};

export function ChatMarkdown({ content, html: htmlOverride, className, compact, onCite }: Props) {
  const html = useMemo(() => htmlOverride ?? renderChatMarkdown(content), [content, htmlOverride]);
  function onClickCapture(event: MouseEvent<HTMLDivElement>) {
    const node = event.target;
    if (!(node instanceof Element)) {
      return;
    }
    const cite = node.closest("[data-cite]");
    if (cite && event.currentTarget.contains(cite) && onCite) {
      const index = Number(cite.getAttribute("data-cite"));
      if (Number.isInteger(index)) {
        event.preventDefault();
        event.stopPropagation();
        onCite(index);
      }
      return;
    }
    if (!isDesktopApp()) {
      return;
    }
    const anchor = node.closest("a");
    if (!anchor || !event.currentTarget.contains(anchor)) {
      return;
    }
    const url = desktopExternalUrl(anchor.getAttribute("href") ?? "", window.location.href);
    if (!url) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    void openLocateUrl(url);
  }
  return (
    <div
      className={cn("chat-md", compact && "chat-md--compact", className)}
      dangerouslySetInnerHTML={{ __html: html }}
      onClickCapture={onClickCapture}
    />
  );
}
