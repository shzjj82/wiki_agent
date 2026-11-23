export type OutlineLevel = 1 | 2 | 3;

export function headingLevel(tagName: string): OutlineLevel | null {
  if (tagName === "H1") return 1;
  if (tagName === "H2") return 2;
  if (tagName === "H3") return 3;
  return null;
}

/** 标题文字：去掉空白后为空的不进目录。 */
export function headingLabel(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export type OutlineFrame = {
  left: number;
  width: number;
  /** 收起时贴在页面右缘；展开时从这条导航栏往左长。 */
  side: "left" | "right";
};

const TICK_WIDTH = 24;
const EDGE = 12;
const EXPANDED_MAX = 220;
/** 页面滚动条宽 6px，再留一点缝，避免短线压在滚动条上。 */
const SCROLLBAR_INSET = 10;

/**
 * 导航栏贴在页面最右侧，而不是正文栏的右侧，并让开滚动条。
 * 展开时右缘不动，向导航栏左侧展开。
 */
export function outlineFrame(scrollerLeft: number, scrollerRight: number, open: boolean): OutlineFrame {
  const tickRight = scrollerRight - SCROLLBAR_INSET;
  const collapsedLeft = tickRight - TICK_WIDTH;
  if (!open) {
    return { left: collapsedLeft, width: TICK_WIDTH, side: "right" };
  }
  const minLeft = scrollerLeft + EDGE;
  const width = Math.min(EXPANDED_MAX, Math.max(TICK_WIDTH, tickRight - minLeft));
  return { left: tickRight - width, width, side: "left" };
}

const TICK_HEIGHT = 2;
const TICK_PADDING = 8;
const PREFERRED_TICK_GAP = 10;
const MIN_TICK_GAP = 2;

/**
 * 短线间距默认 10px。一列放得下就保持这个间距；放不下时缩小，最小 2px。
 * available 是导航栏可用高度，含上下 8px 内边距。
 */
export function tickGap(count: number, available: number): number {
  if (count <= 1) {
    return PREFERRED_TICK_GAP;
  }
  const room = available - TICK_PADDING - count * TICK_HEIGHT;
  const fitted = room / (count - 1);
  const gap = Math.min(PREFERRED_TICK_GAP, fitted);
  return Math.max(MIN_TICK_GAP, Math.round(gap * 10) / 10);
}

/**
 * 视口里最后一条越过阅读线的标题算当前标题。
 * 都还在阅读线下面时，停在第一条。
 * 靠近文末时，剩余滚动距离不够把最后几条标题抬到阅读线上，阅读线就跟着下移，避免最后一条永远亮不了。
 */
export function activeHeadingIndex(
  tops: number[],
  scrollTop: number,
  offset = 28,
  maxScroll = Number.POSITIVE_INFINITY,
  viewportHeight = Number.POSITIVE_INFINITY,
): number {
  if (tops.length === 0) {
    return 0;
  }
  const slack = Math.max(0, maxScroll - scrollTop);
  const drop = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight - offset - slack) : 0;
  const line = scrollTop + offset + drop;
  let active = 0;
  for (let index = 0; index < tops.length; index += 1) {
    if (tops[index]! <= line) {
      active = index;
    }
  }
  return active;
}
