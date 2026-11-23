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
  /** 相对标题导航栏：右侧空白够就往右展开，不够就从导航栏往左展开。 */
  side: "left" | "right";
};

const TICK_WIDTH = 16;
const TEXT_GAP = 12;
const EDGE = 12;
const EXPANDED_MAX = 220;

/**
 * 导航栏一直在正文右侧。
 * 右侧空白放得下整条目录时往右展开，不挡正文。
 * 放不下时，右缘仍对齐导航栏，向导航栏左侧展开，可以盖住正文。
 */
export function outlineFrame(textRight: number, scrollerLeft: number, scrollerRight: number, open: boolean): OutlineFrame {
  const rightLimit = scrollerRight - EDGE;
  const tickLeft = Math.min(Math.max(scrollerLeft + EDGE, textRight + TEXT_GAP), rightLimit - TICK_WIDTH);
  const tickRight = tickLeft + TICK_WIDTH;
  const rightAvailable = rightLimit - tickLeft;
  if (!open || rightAvailable >= EXPANDED_MAX) {
    return {
      left: tickLeft,
      width: open ? EXPANDED_MAX : TICK_WIDTH,
      side: "right",
    };
  }
  const minLeft = scrollerLeft + EDGE;
  const width = Math.min(EXPANDED_MAX, tickRight - minLeft);
  return { left: tickRight - width, width, side: "left" };
}

/**
 * 视口里最后一条越过阅读线的标题算当前标题。
 * 都还在阅读线下面时，停在第一条。
 */
export function activeHeadingIndex(tops: number[], viewportTop: number, offset = 28): number {
  if (tops.length === 0) {
    return 0;
  }
  const line = viewportTop + offset;
  let active = 0;
  for (let index = 0; index < tops.length; index += 1) {
    if (tops[index]! <= line) {
      active = index;
    }
  }
  return active;
}
