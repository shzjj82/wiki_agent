import { describe, expect, it } from "vitest";
import { activeHeadingIndex, headingLabel, headingLevel, outlineFrame, tickGap } from "./outline";

describe("headingLevel", () => {
  it("reads h1 to h3", () => {
    expect(headingLevel("H1")).toBe(1);
    expect(headingLevel("H2")).toBe(2);
    expect(headingLevel("H3")).toBe(3);
    expect(headingLevel("H4")).toBeNull();
    expect(headingLevel("P")).toBeNull();
  });
});

describe("headingLabel", () => {
  it("drops empty and collapsed whitespace", () => {
    expect(headingLabel("  产品概述  ")).toBe("产品概述");
    expect(headingLabel("\u00a0")).toBe("");
    expect(headingLabel("一\n  二")).toBe("一 二");
  });
});

describe("outlineFrame", () => {
  it("sits at the page's right edge and clears the scrollbar", () => {
    expect(outlineFrame(100, 1100, false)).toEqual({ left: 1066, width: 24, side: "right" });
  });

  it("opens left from that edge so the scrollbar stays clear", () => {
    expect(outlineFrame(100, 1100, true)).toEqual({ left: 870, width: 220, side: "left" });
    expect(outlineFrame(100, 280, true)).toEqual({ left: 112, width: 158, side: "left" });
  });
});

describe("tickGap", () => {
  it("keeps the preferred gap when the ticks fit", () => {
    expect(tickGap(1, 200)).toBe(10);
    expect(tickGap(10, 475)).toBe(10);
  });

  it("shrinks the gap when the preferred spacing would overflow", () => {
    expect(tickGap(96, 475)).toBe(2.9);
    expect(tickGap(400, 200)).toBe(2);
  });
});

describe("activeHeadingIndex", () => {
  it("keeps the last heading that has crossed the reading line", () => {
    expect(activeHeadingIndex([200, 400, 600], 80)).toBe(0);
    expect(activeHeadingIndex([20, 100, 300], 80)).toBe(1);
    expect(activeHeadingIndex([10, 40, 70], 80)).toBe(2);
  });

  it("activates the last heading when the page cannot scroll it up to the reading line", () => {
    expect(activeHeadingIndex([35000, 35757], 35676, 28, 35676, 507)).toBe(1);
    expect(activeHeadingIndex([100, 400, 900], 100, 28, 820, 500)).toBe(0);
  });
});
