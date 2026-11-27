import { describe, expect, it } from "vitest";
import { renderChatMarkdown } from "@/lib/ai/markdown";

describe("chat markdown links", () => {
  it("keeps underscores inside a web address", () => {
    const html = renderChatMarkdown(
      "[企业主体要准备什么](https://www.sohu.com/a/1103960845_122704291)",
    );
    expect(html).toContain('href="https://www.sohu.com/a/1103960845_122704291"');
    expect(html).not.toContain("<em>122704291");
  });

  it("hides an unfinished address while the reply is still arriving", () => {
    const partial = "详见[企业主体要准备什么](https://www.sohu.com/a/1103960845_12270";
    const html = renderChatMarkdown(partial, true);
    expect(html).toContain("企业主体要准备什么");
    expect(html).not.toContain("sohu.com");
    expect(html).not.toContain("<em>");
  });

  it("keeps a finished link and hides only a bare address that is still growing", () => {
    const linked = renderChatMarkdown("看 [说明](https://example.com/docs) 后续", true);
    expect(linked).toContain('href="https://example.com/docs"');
    expect(renderChatMarkdown("看 https://example.com/docs/a", true)).not.toContain("example.com");
    expect(renderChatMarkdown("看 https://example.com/docs/a。", true)).toContain("example.com");
    expect(renderChatMarkdown("看 https://example.com/docs/a")).toContain("example.com");
  });
});
