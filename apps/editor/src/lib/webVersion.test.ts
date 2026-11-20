import { describe, expect, it } from "vitest";
import { needsWebReload, normalizeAppVersion } from "./webVersion";

describe("normalizeAppVersion", () => {
  it("strips a leading v", () => {
    expect(normalizeAppVersion("v1.2.9")).toBe("1.2.9");
    expect(normalizeAppVersion(" 1.2.9 ")).toBe("1.2.9");
  });
});

describe("needsWebReload", () => {
  it("reloads when the published version is newer", () => {
    expect(needsWebReload("1.2.8", "1.2.9", null)).toBe(true);
    expect(needsWebReload("v1.2.8", "1.2.9", null)).toBe(true);
  });

  it("does nothing when versions match or the check failed", () => {
    expect(needsWebReload("1.2.9", "1.2.9", null)).toBe(false);
    expect(needsWebReload("1.2.9", "", null)).toBe(false);
    expect(needsWebReload("", "1.2.9", null)).toBe(false);
  });

  it("only forces a refresh once for the same published version", () => {
    expect(needsWebReload("1.2.8", "1.2.9", "1.2.9")).toBe(false);
    expect(needsWebReload("1.2.8", "1.3.0", "1.2.9")).toBe(true);
  });
});
