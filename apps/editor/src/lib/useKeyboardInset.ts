import { useEffect, useRef, useState } from "react";

/**
 * 可视视口（visual viewport）在布局视口里的位置和高度。
 *
 * - height：键盘上方的可视高度（键盘弹出时 = 屏幕顶到键盘上沿）
 * - top：可视视口相对布局视口的偏移。文档不可滚动时，iOS 露出光标靠的是
 *   平移可视视口（offsetTop > 0），此时 fixed 元素必须跟着 top 走，
 *   否则外壳整体上移、底部露出一条空白（表现为“键盘不占高度”）。
 *
 * 外壳定位 = top + height，永远精确覆盖用户看到的那块区域。
 */
export interface ViewportBox {
  top: number;
  height: number;
  /** 键盘是否在屏幕上。用「当前可视高度 vs 见过的最大可视高度」判定，
      不受 iOS 平移可视视口（offsetTop）影响 */
  keyboardOpen: boolean;
}

function readViewportBox(): { top: number; height: number } {
  const vp = window.visualViewport;
  if (!vp) {
    return { top: 0, height: Math.round(window.innerHeight) };
  }
  return { top: Math.round(vp.offsetTop), height: Math.round(vp.height) };
}

export function useVisualViewport(): ViewportBox {
  const first = readViewportBox();
  const [box, setBox] = useState<ViewportBox>({ top: 0, height: first.height, keyboardOpen: false });
  /** 键盘收起时的可视高度（见过的最大值）；横竖屏切换时重设 */
  const fullRef = useRef(first.height);
  const widthRef = useRef(window.innerWidth);
  const frameRef = useRef(0);

  useEffect(() => {
    const measure = () => {
      frameRef.current = 0;
      const next = readViewportBox();
      if (window.innerWidth !== widthRef.current) {
        widthRef.current = window.innerWidth;
        fullRef.current = next.height;
      }
      fullRef.current = Math.max(fullRef.current, next.height);
      const keyboardOpen = next.height < fullRef.current - 60;
      /**
       * 只有键盘在屏幕上时才跟着 offsetTop 走。
       * 键盘收着时可视视口不该有偏移，iOS 的橡皮筋/回弹会把 offsetTop 抖个几像素出来，
       * 外壳跟着抖就是整屏上下不停晃（用户看到的就是“滚动时一直抖”）。
       */
      const top = keyboardOpen ? next.top : 0;
      setBox((prev) => {
        // 1px 的来回跳直接吃掉，只认真实位移（键盘平移 / 收起都是 ≥ 10px 的连续变化）
        const settled = keyboardOpen ? (Math.abs(top - prev.top) >= 2 ? top : prev.top) : 0;
        const height = Math.abs(next.height - prev.height) >= 2 ? next.height : prev.height;
        if (prev.top === settled && prev.height === height && prev.keyboardOpen === keyboardOpen) {
          return prev;
        }
        return { top: settled, height, keyboardOpen };
      });
    };
    /** 合并到一帧里算一次：visualViewport 的 scroll 在惯性滚动时是逐帧连发的 */
    const update = () => {
      if (frameRef.current) {
        return;
      }
      frameRef.current = window.requestAnimationFrame(measure);
    };
    measure();
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return box;
}

const CARET_GAP = 20;
const SKIP_INPUT = new Set(["button", "checkbox", "radio", "file", "range", "submit", "reset", "image", "hidden"]);

function editingNode(): Node | null {
  const active = document.activeElement;
  if (active instanceof HTMLInputElement) {
    return SKIP_INPUT.has(active.type) ? null : active;
  }
  if (active instanceof HTMLTextAreaElement) {
    return active;
  }
  if (active instanceof HTMLElement && active.isContentEditable) {
    return active;
  }
  const node = document.getSelection()?.focusNode ?? null;
  const el = node instanceof Element ? node : node?.parentElement;
  return el?.closest("[contenteditable='true']") ? node : null;
}

/** 折叠光标在空块里经常没有矩形，退回到所在元素的行框 */
function caretRect(node: Node): DOMRect | null {
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
    const box = node.getBoundingClientRect();
    return box.height > 0 || box.width > 0 ? box : null;
  }
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0).cloneRange();
  range.collapse(false);
  const rects = range.getClientRects();
  const rect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
  if (rect && (rect.height > 0 || rect.width > 0)) {
    return rect;
  }
  const host = node instanceof Element ? node : node.parentElement;
  const box = host?.getBoundingClientRect();
  if (!box || (box.height <= 0 && box.width <= 0)) {
    return null;
  }
  return new DOMRect(box.left, box.top, Math.max(box.width, 1), box.height || 24);
}

function scrollParent(start: Node): HTMLElement | null {
  let el: HTMLElement | null =
    start instanceof HTMLInputElement || start instanceof HTMLTextAreaElement
      ? start.parentElement
      : start instanceof HTMLElement
        ? start
        : start.parentElement instanceof HTMLElement
          ? start.parentElement
          : null;
  while (el && el !== document.body && el !== document.documentElement) {
    const overflow = getComputedStyle(el).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && el.scrollHeight > el.clientHeight + 2) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

function clearLifts(except?: HTMLElement) {
  document.querySelectorAll<HTMLElement>("[data-keyboard-lift]").forEach((el) => {
    if (el === except) {
      return;
    }
    el.style.marginTop = "";
    el.removeAttribute("data-keyboard-lift");
  });
}

/** 弹层挂在 body 上，不在滚动区里。光标被键盘挡住时，把弹层往上抬。 */
function liftOverlay(node: Node, rect: DOMRect, visibleBottom: number) {
  const host = (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>(
    "[data-slot='dialog-content'], [data-slot='sheet-content']",
  );
  if (!host) {
    clearLifts();
    return;
  }
  const overflow = rect.bottom - visibleBottom;
  if (overflow > 0) {
    host.style.marginTop = `${-(overflow + CARET_GAP)}px`;
    host.setAttribute("data-keyboard-lift", "");
    clearLifts(host);
    return;
  }
  if (rect.top >= 8) {
    host.style.marginTop = "";
    host.removeAttribute("data-keyboard-lift");
  }
  clearLifts(host);
}

/**
 * 页面本身不能滚，键盘只会缩小可视视口。光标若还停在滚动区下沿之外，
 * 就会被键盘挡住。把所在滚动区挪一下，让光标落在键盘上方。
 */
/** 代码块自己管换行和光标，不走页面级的「把光标抬到键盘上方」 */
function inCodeBlock(node: Node): boolean {
  const el = node instanceof Element ? node : node.parentElement;
  return Boolean(el?.closest(".cdx-code"));
}

export function revealCaret(): void {
  const node = editingNode();
  if (!node) {
    clearLifts();
    return;
  }
  if (inCodeBlock(node)) {
    clearLifts();
    return;
  }
  const rect = caretRect(node);
  if (!rect) {
    return;
  }
  const visibleBottom = (window.visualViewport?.height ?? window.innerHeight) - CARET_GAP;
  const scroller = scrollParent(node);
  if (!scroller) {
    liftOverlay(node, rect, visibleBottom);
    return;
  }
  const bounds = scroller.getBoundingClientRect();
  const topLimit = Math.max(8, bounds.top + 8);
  const bottomLimit = Math.min(visibleBottom, bounds.bottom - 8);
  if (bottomLimit <= topLimit) {
    liftOverlay(node, rect, visibleBottom);
    return;
  }
  if (rect.bottom > bottomLimit) {
    scroller.scrollTop += rect.bottom - bottomLimit;
  } else if (rect.top < topLimit) {
    scroller.scrollTop -= topLimit - rect.top;
  }
}

/** 只在移动端、并且焦点在输入区时，跟着键盘和光标把输入位置露出来 */
export function useRevealCaret(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let frame = 0;
    let delayed = 0;
    const run = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => revealCaret());
    };
    const runLater = () => {
      run();
      window.clearTimeout(delayed);
      delayed = window.setTimeout(run, 280);
    };
    runLater();
    document.addEventListener("selectionchange", run);
    document.addEventListener("focusin", runLater);
    document.addEventListener("input", run);
    window.visualViewport?.addEventListener("resize", runLater);
    window.visualViewport?.addEventListener("scroll", run);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(delayed);
      document.removeEventListener("selectionchange", run);
      document.removeEventListener("focusin", runLater);
      document.removeEventListener("input", run);
      window.visualViewport?.removeEventListener("resize", runLater);
      window.visualViewport?.removeEventListener("scroll", run);
    };
  }, [enabled]);
}
