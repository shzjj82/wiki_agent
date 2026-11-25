import { beforeEach, describe, expect, it } from "vitest";
import type { EditorPage } from "@/store/localStore";
import { pickSyncPlan, requiredSyncKeys, syncItems, syncPlanSize, type SyncPlan } from "@/store/localSync";

function page(id: string, extra: Partial<EditorPage> = {}): EditorPage {
  return {
    id,
    title: id,
    parentId: null,
    body: { time: 0, blocks: [], version: "2" },
    updatedAt: "2026-11-19T00:00:00.000Z",
    ...extra,
  };
}

function plan(creates: EditorPage[], updates: EditorPage[] = []): SyncPlan {
  return { user: "u", creates, updates, deletes: [] };
}

function seed(pages: EditorPage[]) {
  localStorage.setItem("editor:pages", JSON.stringify(pages));
}

beforeEach(() => {
  localStorage.clear();
});

describe("syncPlanSize / syncItems", () => {
  it("counts every kind of change", () => {
    const p: SyncPlan = {
      user: "u",
      creates: [page("a")],
      updates: [page("b")],
      deletes: [{ localId: "c", title: "c", remote: { user: "u", id: "r", syncedAt: "" }, deletedAt: "" }],
    };
    expect(syncPlanSize(p)).toBe(3);
    expect(syncPlanSize(null)).toBe(0);
    expect(syncItems(p).map((item) => item.key)).toEqual(["create:a", "update:b", "delete:c"]);
  });
});

describe("requiredSyncKeys", () => {
  it("pulls in a parent that has not been created yet", () => {
    const parent = page("parent");
    const child = page("child", { parentId: "parent" });
    seed([parent, child]);
    const required = requiredSyncKeys(plan([parent, child]), new Set(["create:child"]));
    expect([...required]).toEqual(["create:parent"]);
  });

  it("pulls in pages linked from the body", () => {
    const linked = page("linked");
    const host = page("host", {
      body: { time: 0, version: "2", blocks: [{ type: "pageLink", data: { pageId: "linked" } }] },
    });
    seed([linked, host]);
    const required = requiredSyncKeys(plan([linked, host]), new Set(["create:host"]));
    expect([...required]).toEqual(["create:linked"]);
  });
});

describe("pickSyncPlan", () => {
  it("keeps the selected items plus their dependencies", () => {
    const parent = page("parent");
    const child = page("child", { parentId: "parent" });
    const other = page("other");
    seed([parent, child, other]);
    const picked = pickSyncPlan(plan([parent, child, other]), new Set(["create:child"]));
    expect(picked.creates.map((item) => item.id)).toEqual(["parent", "child"]);
  });
});
