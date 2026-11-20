import type { EditorJsBlock } from "@myblog/shared";
import { gatewayUrl, loadSession, prepareSession, wikiHeaders } from "@/store/remoteStore";
import { t } from "@/i18n";
import type { BlockConflict } from "./merge";
import { blockText } from "./blockView";

function side(block: EditorJsBlock | undefined): string | null {
  if (!block) return null;
  const text = blockText(block).trim();
  return text || "";
}

/**
 * 把冲突交给 wiki 的合并接口。服务端自己调模型，一次返回每处合并后的文本。
 * 失败的位置是 null。
 */
export async function suggestMerges(conflicts: BlockConflict[], signal?: AbortSignal): Promise<(string | null)[]> {
  const session = loadSession();
  const ready = session ? await prepareSession(session) : null;
  if (!ready?.token) {
    throw new Error("UNAUTHORIZED");
  }
  const response = await fetch(new URL(gatewayUrl("/wiki/agents/merge"), window.location.origin), {
    method: "POST",
    headers: wikiHeaders({
      "Content-Type": "application/json",
      Authorization: `Bearer ${ready.token}`,
    }),
    body: JSON.stringify({
      conflicts: conflicts.map((conflict) => ({
        id: conflict.id,
        base: side(conflict.base),
        mine: side(conflict.mine),
        theirs: side(conflict.theirs),
      })),
    }),
    signal,
  });
  const json = (await response.json().catch(() => null)) as { success?: boolean; message?: string; data?: { merges?: (string | null)[] } } | null;
  if (!json?.success || !Array.isArray(json.data?.merges)) {
    throw new Error(json?.message || t("collab.aiFailed"));
  }
  return conflicts.map((_, index) => {
    const value = json.data?.merges?.[index];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  });
}

/** AI 给的纯文本变回一个块：能沿用原来的类型就沿用，否则做成普通段落 */
export function mergedBlock(conflict: BlockConflict, text: string): EditorJsBlock {
  const source = conflict.mine ?? conflict.theirs;
  const id = source?.id ?? Math.random().toString(36).slice(2, 12);
  if (source && (source.type === "header" || source.type === "quote")) {
    return { id, type: source.type, data: { ...source.data, text } };
  }
  if (source?.type === "code") {
    return { id, type: "code", data: { ...source.data, code: text } };
  }
  return { id, type: "paragraph", data: { text: text.replace(/\n/g, "<br>") } };
}
