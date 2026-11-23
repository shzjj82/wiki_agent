import { describe, expect, it } from "vitest";
import { activeHeadingIndex, headingLabel, headingLevel, outlineFrame } from "./outline";

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
  it("grows to the right of the nav when the gutter can hold the full list", () => {
    expect(outlineFrame(800, 100, 1100, true)).toEqual({ left: 812, width: 220, side: "right" });
    expect(outlineFrame(800, 100, 1100, false)).toEqual({ left: 812, width: 16, side: "right" });
  });

  it("opens to the left of the nav when the right gutter is too small", () => {
    expect(outlineFrame(800, 100, 960, true)).toEqual({ left: 608, width: 220, side: "left" });
    expect(outlineFrame(800, 200, 900, true)).toEqual({ left: 608, width: 220, side: "left" });
  });
});

describe("activeHeadingIndex", () => {
  it("keeps the last heading that has crossed the reading line", () => {
    expect(activeHeadingIndex([200, 400, 600], 80)).toBe(0);
    expect(activeHeadingIndex([20, 100, 300], 80)).toBe(1);
    expect(activeHeadingIndex([10, 40, 70], 80)).toBe(2);
  });
});
