import { beforeEach, describe, expect, it } from "vitest";
import type { ChatBubble } from "@/lib/ai/chat";
import { loadWritingPage, saveWritingPage, writingTitle } from "@/lib/ai/writingThread";

const bubble = (id: string, content: string): ChatBubble => ({
  id,
  role: "user",
  content,
  attachments: [
    { id: "img", kind: "image", name: "a.png", url: "blob:local" },
    { id: "note", kind: "text", name: "n.txt", text: "笔记" },
  ],
});

describe("writing threads", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keeps each page's chats apart and drops local image blobs", () => {
    saveWritingPage("page-a", {
      activeId: "t1",
      threads: [{ id: "t1", title: "写开头", updatedAt: 2, bubbles: [bubble("1", "写开头")] }],
    });
    saveWritingPage("page-b", {
      activeId: "t2",
      threads: [{ id: "t2", title: "另一篇", updatedAt: 1, bubbles: [bubble("2", "另一篇")] }],
    });
    const page = loadWritingPage("page-a");
    expect(page.activeId).toBe("t1");
    expect(page.threads.map((item) => item.title)).toEqual(["写开头"]);
    expect(page.threads[0]?.bubbles[0]?.attachments?.map((item) => item.kind)).toEqual(["text"]);
    expect(loadWritingPage("page-b").threads.map((item) => item.title)).toEqual(["另一篇"]);
    expect(loadWritingPage("missing").threads).toEqual([]);
  });

  it("turns an older single transcript into one history item", () => {
    localStorage.setItem(
      "editor:writing-threads",
      JSON.stringify({ "page-a": { updatedAt: 5, bubbles: [bubble("1", "旧对话")] } }),
    );
    const page = loadWritingPage("page-a");
    expect(page.threads).toHaveLength(1);
    expect(page.threads[0]?.bubbles[0]?.content).toBe("旧对话");
    expect(writingTitle(page.threads[0]?.bubbles ?? [], "未命名")).toBe("旧对话");
  });
});
