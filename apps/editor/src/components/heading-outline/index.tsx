import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { SoftScrollbar } from "@/components/soft-scrollbar";
import { useIsMobile } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";
import { activeHeadingIndex, headingLabel, headingLevel, outlineFrame, tickGap, type OutlineLevel } from "./outline";

type OutlineItem = {
  id: string;
  level: OutlineLevel;
  text: string;
  el: HTMLElement;
};

type Metrics = {
  top: number;
  height: number;
  scrollerLeft: number;
  scrollerRight: number;
};

const TOP_INSET = 16;

function sameOutline(current: OutlineItem[], next: OutlineItem[]): boolean {
  if (current.length !== next.length) {
    return false;
  }
  return current.every((item, index) => {
    const other = next[index];
    return other !== undefined && item.id === other.id && item.level === other.level && item.text === other.text && item.el === other.el;
  });
}

const TICK_WIDTH: Record<OutlineLevel, string> = {
  1: "w-6",
  2: "w-4",
  3: "w-3",
};

function collectHeadings(root: HTMLElement): OutlineItem[] {
  const nodes = root.querySelectorAll("h1.ce-header, h2.ce-header, h3.ce-header");
  const items: OutlineItem[] = [];
  nodes.forEach((node, index) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }
    const level = headingLevel(node.tagName);
    const text = headingLabel(node.textContent ?? "");
    if (!level || !text) {
      return;
    }
    const block = node.closest(".ce-block");
    const id = block instanceof HTMLElement ? block.dataset.id || String(index) : String(index);
    items.push({ id, level, text, el: node });
  });
  return items;
}

function nodeTouchesHeading(node: Node): boolean {
  if (!(node instanceof Element)) {
    return false;
  }
  return node.matches("h1.ce-header, h2.ce-header, h3.ce-header") || Boolean(node.querySelector("h1.ce-header, h2.ce-header, h3.ce-header"));
}

function scrollParent(root: HTMLElement): HTMLElement | null {
  const scroller = root.closest(".ws-scrollbar");
  return scroller instanceof HTMLElement ? scroller : null;
}

/** 桌面端贴在页面最右侧的标题目录。收起时是一列短线，悬停向左展开标题，点击跳到对应位置。 */
export function HeadingOutline({ root }: { root: HTMLElement | null }) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [items, setItems] = useState<OutlineItem[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    if (isMobile || !root) {
      return;
    }
    let frame = 0;
    let textTimer = 0;
    const read = () => {
      const next = collectHeadings(root);
      setItems((current) => (sameOutline(current, next) ? current : next));
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(read);
    };
    schedule();
    // 正文打字不扫标题。只有标题节点增删才立刻重读，改标题文字走下面的 input。
    const observer = new MutationObserver((records) => {
      const touched = records.some((record) => {
        if (record.target instanceof Element && record.target.closest("h1.ce-header, h2.ce-header, h3.ce-header")) {
          return true;
        }
        return [...record.addedNodes, ...record.removedNodes].some(nodeTouchesHeading);
      });
      if (touched) {
        schedule();
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    const onInput = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest("h1.ce-header, h2.ce-header, h3.ce-header")) {
        return;
      }
      window.clearTimeout(textTimer);
      textTimer = window.setTimeout(schedule, 150);
    };
    root.addEventListener("input", onInput);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(textTimer);
      observer.disconnect();
      root.removeEventListener("input", onInput);
    };
  }, [isMobile, root]);

  useEffect(() => {
    if (isMobile || !root) {
      return;
    }
    const scroller = scrollParent(root);
    if (!scroller) {
      return;
    }
    const place = () => {
      const scrollerRect = scroller.getBoundingClientRect();
      const next = {
        top: Math.round(scrollerRect.top),
        height: Math.round(scrollerRect.height),
        scrollerLeft: Math.round(scrollerRect.left),
        scrollerRight: Math.round(scrollerRect.right),
      };
      setMetrics((current) =>
        current &&
        current.top === next.top &&
        current.height === next.height &&
        current.scrollerLeft === next.scrollerLeft &&
        current.scrollerRight === next.scrollerRight
          ? current
          : next,
      );
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(scroller);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [isMobile, root]);

  useEffect(() => {
    if (isMobile || !root || items.length === 0) {
      return;
    }
    const scroller = scrollParent(root);
    if (!scroller) {
      return;
    }
    let offsets: number[] = [];
    let frame = 0;
    let measureTimer = 0;
    const apply = (scrollTop: number) => {
      const maxScroll = scroller.scrollHeight - scroller.clientHeight;
      const next = activeHeadingIndex(offsets, scrollTop, 28, maxScroll, scroller.clientHeight);
      setActive((current) => (current === next ? current : next));
    };
    // 位置只在标题变化或布局稳定后量一次。滚动时用这份缓存，不再逐个读布局。
    const measure = () => {
      const base = scroller.getBoundingClientRect().top - scroller.scrollTop;
      offsets = items.map((item) => item.el.getBoundingClientRect().top - base);
      apply(scroller.scrollTop);
    };
    const scheduleMeasure = () => {
      window.clearTimeout(measureTimer);
      measureTimer = window.setTimeout(measure, 200);
    };
    measure();
    const onScroll = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => apply(scroller.scrollTop));
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(root);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(measureTimer);
      scroller.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [isMobile, root, items]);

  const frame = metrics ? outlineFrame(metrics.scrollerLeft, metrics.scrollerRight, open) : null;
  const expanded = open;

  if (isMobile || !root || !metrics || !frame || items.length === 0) {
    return null;
  }

  const maxHeight = Math.max(96, metrics.height - TOP_INSET * 2);

  const jump = (item: OutlineItem) => {
    const scroller = scrollParent(root);
    if (!scroller) {
      item.el.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    const next = scroller.scrollTop + (item.el.getBoundingClientRect().top - scroller.getBoundingClientRect().top) - 16;
    scroller.scrollTo({ top: Math.max(0, next), behavior: "smooth" });
  };

  return createPortal(
    <nav
      aria-label={t("blockEditor.outlineLabel")}
      className={cn(
        "fixed z-30 flex flex-col",
        expanded && "overflow-hidden rounded-lg border border-border bg-background py-1.5 shadow-[0_8px_28px_rgb(0_0_0/0.08)]",
      )}
      style={{
        top: metrics.top + TOP_INSET,
        left: frame.left,
        width: frame.width,
        maxHeight,
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      {expanded ? <p className="shrink-0 px-2.5 pt-0.5 pb-1 text-xs text-muted-foreground">{t("blockEditor.outline")}</p> : null}
      <SoftScrollbar className="w-full" style={{ maxHeight: expanded ? maxHeight - 28 : maxHeight }}>
        <div
          className={cn(expanded ? "px-1" : "flex flex-col items-end py-1")}
          style={expanded ? undefined : { gap: tickGap(items.length, maxHeight) }}
        >
          {items.map((item, index) => {
            const current = index === active;
            return (
              <button
                key={item.id}
                type="button"
                title={item.text}
                aria-current={current ? "location" : undefined}
                className={cn(
                  expanded
                    ? "flex w-full rounded-md py-1 pr-2 text-left text-[13px] leading-5 hover:bg-muted"
                    : "block h-0.5 shrink-0 rounded-full",
                  expanded && item.level === 1 && "pl-2",
                  expanded && item.level === 2 && "pl-5",
                  expanded && item.level === 3 && "pl-8",
                  expanded && (current ? "bg-muted font-medium text-foreground" : "text-muted-foreground"),
                  !expanded && TICK_WIDTH[item.level],
                  !expanded && (current ? "bg-foreground" : "bg-foreground/25"),
                )}
                onClick={() => jump(item)}
              >
                {expanded ? <span className="truncate">{item.text}</span> : <span className="sr-only">{item.text}</span>}
              </button>
            );
          })}
        </div>
      </SoftScrollbar>
    </nav>,
    document.body,
  );
}
