import { describe, expect, it, vi } from "vitest";
import { runLocate } from "./run";
import { locateFromSource, parseLocate, textInPage, urlTarget } from "./target";

describe("locate target", () => {
  it("keeps a page jump and the following text jump", () => {
    const target = parseLocate({
      type: "page",
      pageId: "page-1",
      mode: "push",
      next: { type: "text", text: "第二段", mode: "here" },
    });
    expect(target).toEqual(textInPage("page-1", "第二段"));
  });

  it("drops scripts and keeps a webpage", () => {
    expect(parseLocate({ type: "url", url: "javascript:alert(1)" })).toBeNull();
    expect(urlTarget("https://example.com/a")).toEqual({
      type: "url",
      url: "https://example.com/a",
      mode: "browser",
    });
  });

  it("turns a knowledge hit into open-page then locate-text", () => {
    expect(locateFromSource({ docId: "doc-1", content: "Fiber 把渲染拆开" })).toEqual(
      textInPage("doc-1", "Fiber 把渲染拆开"),
    );
  });
});

describe("locate run", () => {
  it("opens the page before locating text, and opens a webpage on its own", async () => {
    const openPage = vi.fn(async () => undefined);
    const revealText = vi.fn();
    const openUrl = vi.fn(async () => undefined);
    await runLocate(textInPage("page-1", "标题"), { openPage, revealText, openUrl });
    expect(openPage).toHaveBeenCalledWith("page-1", "push");
    expect(revealText).toHaveBeenCalledWith("标题");
    openPage.mockClear();
    await runLocate(
      { type: "url", url: "https://example.com/docs", mode: "browser" },
      { openPage, revealText, openUrl },
    );
    expect(openUrl).toHaveBeenCalledWith("https://example.com/docs");
    expect(openPage).not.toHaveBeenCalled();
  });

  it("stays on the current page when the mode is here", async () => {
    const openPage = vi.fn();
    const revealText = vi.fn();
    await runLocate(
      { type: "text", text: "当前段落", mode: "here" },
      { openPage, revealText },
    );
    expect(openPage).not.toHaveBeenCalled();
    expect(revealText).toHaveBeenCalledWith("当前段落");
  });
});
