import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type UIEventHandler,
} from "react";
import { Down } from "@icon-park/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { iconParkOutline } from "@/lib/iconPark";
import { useVisualViewport } from "@/lib/useKeyboardInset";
import { useIsMobile } from "@/lib/useMediaQuery";

type Props = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  style?: CSSProperties;
  onScroll?: UIEventHandler<HTMLDivElement>;
  /** 在底部时内容增高会跟着滚；离开底部后显示回到底部按钮 */
  stickToBottom?: boolean;
  jumpToBottomLabel?: string;
};

const NEAR_BOTTOM = 56;
const SKIP_INPUT = new Set(["button", "checkbox", "radio", "file", "range", "submit", "reset", "image", "hidden"]);

/** 光标在正文、代码或输入框里时，手机键盘是弹起的 */
function textFieldFocused(node: Element | null): boolean {
  if (node instanceof HTMLTextAreaElement) {
    return true;
  }
  if (node instanceof HTMLInputElement) {
    return !SKIP_INPUT.has(node.type);
  }
  return node instanceof HTMLElement && node.isContentEditable;
}

function nearBottom(el: HTMLElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM;
}

/** 类似 Element Plus el-scrollbar：容器内滚动，悬停 / 滚动时显示细滚动条 */
export const SoftScrollbar = forwardRef<HTMLDivElement, Props>(function SoftScrollbar(
  { children, className, contentClassName, style, onScroll, stickToBottom, jumpToBottomLabel },
  ref,
) {
  const localRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const atBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [fieldFocused, setFieldFocused] = useState(false);
  const isMobile = useIsMobile();
  const { keyboardOpen } = useVisualViewport();

  useImperativeHandle(ref, () => localRef.current as HTMLDivElement);

  const syncJump = useCallback(() => {
    const el = localRef.current;
    if (!el) {
      return;
    }
    const near = nearBottom(el);
    atBottom.current = near;
    setShowJump(Boolean(jumpToBottomLabel) && !near && el.scrollHeight > el.clientHeight + 8);
  }, [jumpToBottomLabel]);

  const follow = useCallback(() => {
    const el = localRef.current;
    if (!el) {
      return;
    }
    if (stickToBottom && atBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
    syncJump();
  }, [stickToBottom, syncJump]);

  useEffect(() => {
    return () => {
      if (timer.current != null) {
        window.clearTimeout(timer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setFieldFocused(false);
      return;
    }
    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setFieldFocused(textFieldFocused(document.activeElement)));
    };
    sync();
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", sync);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", sync);
    };
  }, [isMobile]);

  useEffect(() => {
    const el = localRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      return;
    }
    const ro = new ResizeObserver(() => follow());
    ro.observe(el);
    const view = el.firstElementChild;
    if (view) {
      ro.observe(view);
    }
    follow();
    return () => ro.disconnect();
  }, [follow]);

  const handleScroll: UIEventHandler<HTMLDivElement> = (event) => {
    const el = localRef.current;
    if (el) {
      el.classList.add("is-scrolling");
      if (timer.current != null) {
        window.clearTimeout(timer.current);
      }
      timer.current = window.setTimeout(() => {
        el.classList.remove("is-scrolling");
      }, 800);
    }
    syncJump();
    onScroll?.(event);
  };

  const scrollToBottom = () => {
    const el = localRef.current;
    if (!el) {
      return;
    }
    atBottom.current = true;
    setShowJump(false);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  return (
    <div className={cn("relative min-h-0", className)}>
      <div ref={localRef} className="ws-scrollbar h-full" style={style} onScroll={handleScroll}>
        <div className={cn("ws-scrollbar__view", contentClassName)}>{children}</div>
      </div>
      {jumpToBottomLabel && showJump && !keyboardOpen && !(isMobile && fieldFocused) ? (
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="absolute bottom-3 left-1/2 z-10 size-8 -translate-x-1/2 rounded-full border border-border/50 shadow-md"
          aria-label={jumpToBottomLabel}
          onClick={scrollToBottom}
        >
          <Down {...iconParkOutline} size={16} />
        </Button>
      ) : null}
    </div>
  );
});
