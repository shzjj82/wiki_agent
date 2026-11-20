import type { EditorJsBlock, EditorJsDocument } from "@myblog/shared";

/**
 * 团队文章的三方合并，思路同 Git：以双方共同的上一版（base）为准，
 * 比较「我的改动」和「对方的改动」，按块 id 逐块决定取谁。
 *
 * - 只有一方改了某块：取改了的那一方
 * - 双方改成一样：随便取
 * - 双方都改了同一块且结果不同，或一方改、一方删：记为冲突
 *
 * 块顺序以对方为准，我新增的块跟在我这边它前面那一块后面。
 */
export type ConflictChoice = "ours" | "theirs" | "both" | "ai";

/** 一处冲突；mine / theirs 缺省表示那一方删掉了这块 */
export type BlockConflict = { id: string; base?: EditorJsBlock; mine?: EditorJsBlock; theirs?: EditorJsBlock };

export type MergeResult = {
  conflicts: BlockConflict[];
  /** 按每处冲突的取法拼出最终文档，没列出的冲突按 fallback 取；选 ai 时用 aiBlocks 里的块 */
  build: (choices?: Record<string, ConflictChoice>, fallback?: ConflictChoice, aiBlocks?: Record<string, EditorJsBlock>) => EditorJsDocument;
};

function sig(block: EditorJsBlock | undefined): string {
  return block ? JSON.stringify([block.type, block.data]) : "";
}

export function sameDocument(a: EditorJsDocument, b: EditorJsDocument): boolean {
  return a.blocks.length === b.blocks.length && a.blocks.every((block, index) => block.id === b.blocks[index]?.id && sig(block) === sig(b.blocks[index]));
}

function copyId(): string {
  return Math.random().toString(36).slice(2, 12);
}

function wrap(source: EditorJsDocument, blocks: EditorJsBlock[]): EditorJsDocument {
  return { ...source, time: Date.now(), blocks };
}

/** 一处冲突按取法展开成要放进文档的块 */
function resolveSlot(conflict: BlockConflict, choice: ConflictChoice, aiBlocks: Record<string, EditorJsBlock>): EditorJsBlock[] {
  const { mine, theirs } = conflict;
  if (choice === "ai") return aiBlocks[conflict.id] ? [aiBlocks[conflict.id]!] : mine ? [mine] : [];
  if (choice === "ours") return mine ? [mine] : [];
  if (choice === "theirs") return theirs ? [theirs] : [];
  if (mine && theirs) return [mine, { ...theirs, id: copyId() }];
  return mine ? [mine] : theirs ? [theirs] : [];
}

export function mergeDocuments(base: EditorJsDocument, mine: EditorJsDocument, theirs: EditorJsDocument): MergeResult {
  const all = [...base.blocks, ...mine.blocks, ...theirs.blocks];
  if (all.some((block) => !block.id)) {
    return mergeWhole(base, mine, theirs);
  }
  const baseById = new Map(base.blocks.map((block) => [block.id!, block]));
  const mineById = new Map(mine.blocks.map((block) => [block.id!, block]));
  const theirsById = new Map(theirs.blocks.map((block) => [block.id!, block]));

  const order: string[] = theirs.blocks.map((block) => block.id!);
  for (const id of mineById.keys()) {
    if (theirsById.has(id)) continue;
    const at = mine.blocks.findIndex((block) => block.id === id);
    let anchor = -1;
    for (let index = at - 1; index >= 0; index -= 1) {
      anchor = order.indexOf(mine.blocks[index]!.id!);
      if (anchor >= 0) break;
    }
    order.splice(anchor + 1, 0, id);
  }

  type Slot = { block: EditorJsBlock | null } | { conflict: BlockConflict };
  const slots: Slot[] = order.map((id) => {
    const b = baseById.get(id);
    const m = mineById.get(id);
    const th = theirsById.get(id);
    if (sig(m) === sig(th)) return { block: m ?? null };
    if (sig(m) === sig(b)) return { block: th ?? null };
    if (sig(th) === sig(b)) return { block: m ?? null };
    return { conflict: { id, base: b, mine: m, theirs: th } };
  });
  const conflicts = slots.flatMap((slot) => ("conflict" in slot ? [slot.conflict] : []));

  return {
    conflicts,
    build: (choices = {}, fallback = "ours", aiBlocks = {}) =>
      wrap(
        mine,
        slots.flatMap((slot) => {
          if ("conflict" in slot) return resolveSlot(slot.conflict, choices[slot.conflict.id] ?? fallback, aiBlocks);
          return slot.block ? [slot.block] : [];
        }),
      ),
  };
}

/** 有块缺 id 时没法逐块对齐，只能整篇比较，整篇算一处冲突 */
function mergeWhole(base: EditorJsDocument, mine: EditorJsDocument, theirs: EditorJsDocument): MergeResult {
  const pick = sameDocument(mine, base) ? theirs : sameDocument(theirs, base) || sameDocument(mine, theirs) ? mine : null;
  if (pick) return { conflicts: [], build: () => pick };
  const whole: BlockConflict = {
    id: "",
    base: { type: "document", data: { blocks: base.blocks } },
    mine: { type: "document", data: { blocks: mine.blocks } },
    theirs: { type: "document", data: { blocks: theirs.blocks } },
  };
  return {
    conflicts: [whole],
    build: (choices = {}, fallback = "ours", aiBlocks = {}) => {
      const choice = choices[""] ?? fallback;
      if (choice === "ai" && aiBlocks[""]) return wrap(mine, [aiBlocks[""]]);
      if (choice === "ours") return mine;
      if (choice === "theirs") return theirs;
      return wrap(mine, [...mine.blocks, ...theirs.blocks.map((block) => ({ ...block, id: copyId() }))]);
    },
  };
}
