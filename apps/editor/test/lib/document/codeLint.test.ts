import { describe, expect, it } from "vitest";
import { lintCode, normalizeCodeLanguage } from "@/lib/document/codeLint";

describe("normalizeCodeLanguage", () => {
  it("maps fence aliases to dropdown ids", () => {
    expect(normalizeCodeLanguage("TSX")).toBe("typescript");
    expect(normalizeCodeLanguage("yml")).toBe("yaml");
    expect(normalizeCodeLanguage("c++")).toBe("cpp");
  });

  it("treats empty or unknown languages as plain text", () => {
    expect(normalizeCodeLanguage(undefined)).toBe("plain");
    expect(normalizeCodeLanguage("brainfuck")).toBe("plain");
    expect(normalizeCodeLanguage("md")).toBe("plain");
  });
});

describe("lintCode", () => {
  it("accepts empty code and plain text", () => {
    expect(lintCode("   ", "json")).toEqual({ ok: true });
    expect(lintCode("{ not json", "plain")).toEqual({ ok: true });
  });

  it("checks JSON", () => {
    expect(lintCode('{"a": 1}', "json")).toEqual({ ok: true });
    expect(lintCode('{"a": }', "json").ok).toBe(false);
  });

  it("checks JavaScript", () => {
    expect(lintCode("const a = 1;\nconsole.log(a);", "javascript")).toEqual({ ok: true });
    expect(lintCode("const = ;", "javascript").ok).toBe(false);
  });

  it("checks CSS braces", () => {
    expect(lintCode("a { color: red; }", "css")).toEqual({ ok: true });
    expect(lintCode("a { color: red;", "css").ok).toBe(false);
  });

  it("lets other languages pass before highlight.js has loaded", () => {
    expect(lintCode("def f(:\n  pass", "python")).toEqual({ ok: true });
  });
});
