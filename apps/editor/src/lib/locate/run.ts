import { isDesktopApp, openDesktopUrl } from "@/lib/ai/skills";
import { type JumpMode, type LocateTarget, webpageUrl } from "./target";

export type LocateHandlers = {
  /** push / replace 写入历史，here 只停留在当前文档。 */
  openPage: (pageId: string, history: "push" | "replace" | "none") => void | Promise<void>;
  revealText: (text: string) => void;
  openUrl?: (url: string) => void | Promise<void>;
};

const MAX_DEPTH = 8;

function historyOf(mode: JumpMode | undefined): "push" | "replace" | "none" {
  if (mode === "replace") {
    return "replace";
  }
  if (mode === "here") {
    return "none";
  }
  return "push";
}

/** 打开一个 http(s) 网页。桌面端交给系统浏览器，网页端新开标签。 */
export async function openLocateUrl(url: string): Promise<void> {
  const href = webpageUrl(url);
  if (!href) {
    return;
  }
  if (isDesktopApp()) {
    await openDesktopUrl(href);
    return;
  }
  window.open(href, "_blank", "noopener,noreferrer");
}

/** 按定位目标跳转。next 在当前这一步完成后再执行。 */
export async function runLocate(target: LocateTarget, handlers: LocateHandlers, depth = 0): Promise<void> {
  if (depth >= MAX_DEPTH) {
    return;
  }
  const mode = target.mode;
  if (target.type === "page" && target.pageId) {
    await handlers.openPage(target.pageId, historyOf(mode));
  } else if (target.type === "text" && target.text) {
    if (target.pageId && mode !== "here") {
      await handlers.openPage(target.pageId, historyOf(mode));
    }
    handlers.revealText(target.text);
  } else if (target.type === "url" && target.url) {
    await (handlers.openUrl ?? openLocateUrl)(target.url);
  }
  if (target.next) {
    await runLocate(target.next, handlers, depth + 1);
  }
}
