import { describe, expect, it } from "vitest";
import { citePlain, renderCitedMarkdown } from "@/lib/ai/cite-marks";
import type { WikiSource } from "@/lib/ai/sources";

const word: WikiSource = {
  docId: "page-1",
  title: "项目相关",
  sourceType: "docx",
  sourceName: "项目相关.docx",
  content: "费用 300 元",
};

describe("cite marks", () => {
  it("把标记画成标题和类型标签", () => {
    const html = renderCitedMarkdown("费用见{{cite:0}}。", [word], () => "Word");
    expect(html).toContain("data-cite=\"0\"");
    expect(html).toContain("《项目相关》");
    expect(html).toContain("Word");
    expect(html).not.toContain("{{cite:0}}");
  });

  it("复制时还原成书名", () => {
    expect(citePlain("费用见{{cite:0}}。", [word])).toBe("费用见《项目相关》。");
  });
});
