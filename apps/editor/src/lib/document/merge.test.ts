import { describe, expect, it } from "vitest";
import type { EditorJsBlock, EditorJsDocument } from "@myblog/shared";
import { mergeDocuments } from "./merge";
import { diffText } from "./textDiff";
import { blockHtml, blockText, highlightHtml } from "./blockView";

const p = (id: string, text: string): EditorJsBlock => ({ id, type: "paragraph", data: { text } });
const doc = (...blocks: EditorJsBlock[]): EditorJsDocument => ({ blocks });
const texts = (value: EditorJsDocument) => value.blocks.map((block) => block.data.text);

describe("mergeDocuments", () => {
  const base = doc(p("a", "A"), p("b", "B"), p("c", "C"));

  it("双方改不同的块时自动合并", () => {
    const result = mergeDocuments(base, doc(p("a", "A1"), p("b", "B"), p("c", "C")), doc(p("a", "A"), p("b", "B"), p("c", "C2")));
    expect(result.conflicts).toHaveLength(0);
    expect(texts(result.build())).toEqual(["A1", "B", "C2"]);
  });

  it("双方新增的块都保留，我的跟在原来的位置后面", () => {
    const result = mergeDocuments(base, doc(p("a", "A"), p("m", "M"), p("b", "B"), p("c", "C")), doc(p("a", "A"), p("b", "B"), p("c", "C"), p("t", "T")));
    expect(result.conflicts).toHaveLength(0);
    expect(texts(result.build())).toEqual(["A", "M", "B", "C", "T"]);
  });

  it("一方删除、另一方没动时删除生效", () => {
    const result = mergeDocuments(base, doc(p("a", "A"), p("c", "C")), doc(p("a", "A"), p("b", "B"), p("c", "C3")));
    expect(result.conflicts).toHaveLength(0);
    expect(texts(result.build())).toEqual(["A", "C3"]);
  });

  it("双方改同一块不同内容算冲突，三种取法各不相同", () => {
    const result = mergeDocuments(base, doc(p("a", "mine"), p("b", "B"), p("c", "C")), doc(p("a", "theirs"), p("b", "B"), p("c", "C")));
    expect(result.conflicts).toHaveLength(1);
    expect(texts(result.build({}, "ours"))).toEqual(["mine", "B", "C"]);
    expect(texts(result.build({}, "theirs"))).toEqual(["theirs", "B", "C"]);
    expect(texts(result.build({}, "both"))).toEqual(["mine", "theirs", "B", "C"]);
  });

  it("每处冲突可以分别选", () => {
    const result = mergeDocuments(
      base,
      doc(p("a", "A-mine"), p("b", "B"), p("c", "C-mine")),
      doc(p("a", "A-theirs"), p("b", "B"), p("c", "C-theirs")),
    );
    expect(result.conflicts.map((item) => item.id)).toEqual(["a", "c"]);
    expect(texts(result.build({ a: "theirs", c: "ours" }))).toEqual(["A-theirs", "B", "C-mine"]);
  });

  it("选 AI 版本时用传入的块", () => {
    const result = mergeDocuments(base, doc(p("a", "mine"), p("b", "B"), p("c", "C")), doc(p("a", "theirs"), p("b", "B"), p("c", "C")));
    const ai = p("a", "AI 综合");
    expect(texts(result.build({ a: "ai" }, "ours", { a: ai }))).toEqual(["AI 综合", "B", "C"]);
  });

  it("我改了、对方删了算冲突", () => {
    const result = mergeDocuments(base, doc(p("a", "A"), p("b", "B9"), p("c", "C")), doc(p("a", "A"), p("c", "C")));
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.theirs).toBeUndefined();
    expect(texts(result.build({}, "ours"))).toEqual(["A", "B9", "C"]);
    expect(texts(result.build({}, "theirs"))).toEqual(["A", "C"]);
  });

  it("块没有 id 时退回整篇比较", () => {
    const plain = (text: string): EditorJsDocument => ({ blocks: [{ type: "paragraph", data: { text } }] });
    expect(mergeDocuments(plain("x"), plain("x"), plain("y")).conflicts).toHaveLength(0);
    expect(mergeDocuments(plain("x"), plain("m"), plain("y")).conflicts).toHaveLength(1);
  });
});

describe("blockView", () => {
  it("标题和列表按正文渲染，纯文字不含 Markdown 记号", () => {
    const html = blockHtml({ id: "h", type: "header", data: { text: "本周<b>目标</b>", level: 2 } });
    expect(html).toContain("<b>目标</b>");
    expect(html).not.toContain("#");
    expect(blockText({ id: "h", type: "header", data: { text: "本周<b>目标</b>", level: 2 } })).toBe("本周目标");
    expect(blockHtml({ id: "l", type: "list", data: { style: "unordered", items: ["第一项", "第二项"] } })).toContain("<li>第一项</li>");
  });

  it("高亮嵌回 HTML 时不拆开标签", () => {
    const parts = diffText("今天天气很好", "今天天气不错");
    const mine = highlightHtml(blockHtml(p("a", "今天天气不错")), parts, "add", "mark");
    const theirs = highlightHtml(blockHtml(p("a", "今天<b>天气</b>很好")), parts, "del", "mark");
    expect(mine).toContain('<mark class="mark">不错</mark>');
    expect(theirs).toContain("<b>天气</b>");
    expect(theirs).toContain('<mark class="mark">很好</mark>');
  });
});

describe("diffText", () => {
  it("标出中间改动的字", () => {
    expect(diffText("今天天气很好", "今天天气不错")).toEqual([
      { kind: "same", text: "今天天气" },
      { kind: "del", text: "很好" },
      { kind: "add", text: "不错" },
    ]);
  });

  it("纯新增和相同", () => {
    expect(diffText("abc", "abXc")).toEqual([
      { kind: "same", text: "ab" },
      { kind: "add", text: "X" },
      { kind: "same", text: "c" },
    ]);
    expect(diffText("same", "same")).toEqual([{ kind: "same", text: "same" }]);
  });
});
