import { describe, expect, it } from "vitest";
import { parseMergeReply } from "@/lib/document/mergeReply";

describe("parseMergeReply", () => {
  it("取出和冲突等长的文本", () => {
    expect(parseMergeReply('好的\n["登录和注册", ""]\n以上', 2)).toEqual(["登录和注册", null]);
  });

  it("不是数组时全部留空", () => {
    expect(parseMergeReply("无法合并", 2)).toEqual([null, null]);
  });
});
