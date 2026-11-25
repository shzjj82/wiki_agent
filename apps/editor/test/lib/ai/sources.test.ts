import { describe, expect, it } from "vitest";
import { locateFromSource } from "@/lib/locate/target";
import { readSources, sourceDirection, sourceTagTone } from "@/lib/ai/sources";

describe("readSources", () => {
  it("keeps one hit per page or file and keeps the server locate target", () => {
    const sources = readSources([
      {
        docId: "page-1",
        title: "准备条件",
        sourceType: "editorjs",
        content: "企业资质需要认证",
        locate: { type: "page", pageId: "page-1", mode: "push" },
      },
      { docId: "page-1", title: "准备条件", sourceType: "editorjs", content: "另一段" },
      {
        docId: "page-1",
        title: "准备条件",
        sourceType: "docx",
        sourceKey: "https://cdn.example/a.docx",
        content: "【附件：资质.docx】\n费用 300 元",
      },
      { docId: "", title: "丢掉", sourceType: "editorjs" },
    ]);
    expect(sources).toHaveLength(2);
    expect(sources[0]?.locate).toEqual({ type: "page", pageId: "page-1", mode: "push" });
    expect(locateFromSource(sources[1]!)).toEqual({
      type: "page",
      pageId: "page-1",
      mode: "push",
      next: { type: "text", text: "【附件：资质.docx】 费用 300 元", mode: "here" },
    });
    expect(sourceDirection(sources[1]!)).toBe("资质.docx");
  });

  it("Word 标签用蓝色，其它类型用灰底", () => {
    expect(sourceTagTone("docx")).toContain("text-[#2b579a]");
    expect(sourceTagTone("editorjs")).toBe("bg-background");
  });
});
