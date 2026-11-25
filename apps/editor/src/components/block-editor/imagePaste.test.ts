import { describe, expect, it } from "vitest";
import { ocrPlainText, paragraphBlocks } from "./imagePaste";

describe("pasted image text", () => {
  it("keeps line breaks and escapes markup", () => {
    const blocks = paragraphBlocks("第一行\n<script>\n\n第二段");
    expect(blocks).toEqual([
      { type: "paragraph", data: { text: "第一行<br>&lt;script&gt;" } },
      { type: "paragraph", data: { text: "第二段" } },
    ]);
  });

  it("joins recognized text and reports an empty result", () => {
    expect(ocrPlainText([{ text: " 标题 " }, { text: "" }, { text: "正文" }])).toBe("标题\n\n正文");
    expect(() => ocrPlainText([{ text: " ", error: "OCR_TIMEOUT" }])).toThrow("OCR_TIMEOUT");
    expect(() => ocrPlainText([{ text: "" }])).toThrow("OCR_EMPTY");
  });
});
