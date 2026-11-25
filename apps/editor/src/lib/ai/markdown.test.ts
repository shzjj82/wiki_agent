import { describe, expect, it } from "vitest";
import { renderChatMarkdown } from "./markdown";

describe("chat markdown links", () => {
  it("keeps underscores inside a web address", () => {
    const html = renderChatMarkdown(
      "[企业主体要准备什么](https://www.sohu.com/a/1103960845_122704291)",
    );
    expect(html).toContain('href="https://www.sohu.com/a/1103960845_122704291"');
    expect(html).not.toContain("<em>122704291");
  });
});
