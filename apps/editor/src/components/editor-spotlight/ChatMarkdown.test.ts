import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ChatMarkdown } from "./ChatMarkdown";

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

function installDesktop(invoke: Invoke) {
  (window as Window & { __TAURI_INTERNALS__?: { invoke: Invoke } }).__TAURI_INTERNALS__ = { invoke };
}

function clearDesktop() {
  delete (window as Window & { __TAURI_INTERNALS__?: { invoke: Invoke } }).__TAURI_INTERNALS__;
}

describe("chat markdown links", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
    clearDesktop();
  });

  async function render(content: string) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(createElement(ChatMarkdown, { content }));
    });
    const link = host.querySelector("a");
    if (!link) {
      throw new Error("missing link");
    }
    return link;
  }

  it("opens an outside link with the desktop browser on the client", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    installDesktop(async (cmd, args) => {
      calls.push({ cmd, args });
    });
    const link = await render("看 [说明](https://example.com/docs)");
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(calls).toEqual([{ cmd: "open_ai_target", args: { target: "https://example.com/docs" } }]);
    expect(window.location.href.startsWith("https://example.com")).toBe(false);
  });

  it("leaves the same link to the browser on the web", async () => {
    clearDesktop();
    const link = await render("看 [说明](https://example.com/docs)");
    expect(link.getAttribute("target")).toBe("_blank");
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
