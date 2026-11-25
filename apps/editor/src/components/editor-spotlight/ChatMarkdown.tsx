import { useMemo, type MouseEvent } from "react";
import { renderChatMarkdown } from "@/lib/ai/markdown";
import { desktopExternalUrl, isDesktopApp, openDesktopUrl } from "@/lib/ai/skills";
import { cn } from "@/lib/utils";

type Props = {
  content: string;
  className?: string;
  /** 用户消息可关掉复杂样式，仍识别基础 markdown */
  compact?: boolean;
};

export function ChatMarkdown({ content, className, compact }: Props) {
  const html = useMemo(() => renderChatMarkdown(content), [content]);
  function onClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!isDesktopApp()) {
      return;
    }
    const node = event.target;
    if (!(node instanceof Element)) {
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
    void openDesktopUrl(url);
  }
  return (
    <div
      className={cn("chat-md", compact && "chat-md--compact", className)}
      dangerouslySetInnerHTML={{ __html: html }}
      onClickCapture={onClickCapture}
    />
  );
}
