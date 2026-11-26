import { describe, expect, it } from "vitest";
import { citePlain, renderCitedMarkdown, withCiteMarks } from "@/lib/ai/cite-marks";
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
    expect(html).toContain("underline underline-offset-2");
    expect(html).not.toContain("decoration-dotted");
    expect(html).toContain("text-[#2b579a]");
    expect(html).toContain("Word");
    expect(html).not.toContain("{{cite:0}}");
  });

  it("复制时还原成书名", () => {
    expect(citePlain("费用见{{cite:0}}。", [word])).toBe("费用见《项目相关》。");
  });

  it("正文里出现标题时把出处嵌进去，而不是堆在最后", () => {
    expect(withCiteMarks("费用见《项目相关》。", [word])).toBe("费用见（来源：{{cite:0}}）。");
  });

  it("正文没写到的出处跟在第一段后面", () => {
    expect(withCiteMarks("结论如下。\n\n第二段。", [word])).toBe("结论如下。 （来源：{{cite:0}}）\n\n第二段。");
  });

  it("英文句子用半角括号和冒号", () => {
    const project: WikiSource = { ...word, title: "Project", sourceName: "Project.docx" };
    expect(withCiteMarks("See 《Project》.", [project])).toBe("See (来源: {{cite:0}}).");
  });
});
