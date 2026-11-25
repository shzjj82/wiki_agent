export type WikiSource = {
  docId: string;
  title: string;
  sourceType: string;
  /** 摘录，交给已有的 locateFromSource */
  content: string;
  sourceName?: string;
  /** 服务端按 LocateTarget 给的跳转；没有时前端再用 locateFromSource */
  locate?: unknown;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function attachmentName(content: string): string {
  const match = /^【附件：([^】]+)】/.exec(content.trim());
  return match?.[1]?.trim() ?? "";
}

/** 同一页面、同一文件只留一条出处。 */
export function readSources(value: unknown): WikiSource[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: WikiSource[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    const docId = text(row.docId);
    if (!docId) {
      continue;
    }
    const sourceType = text(row.sourceType) || "editorjs";
    const content = text(row.content);
    const sourceName = text(row.sourceName) || attachmentName(content);
    const sourceKey = text(row.sourceKey) || text(row.imageUrl);
    const key = `${docId}\n${sourceType}\n${sourceKey}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({
      docId,
      title: text(row.title) || text(row.slug) || "页面",
      sourceType,
      content,
      ...(sourceName ? { sourceName } : {}),
      ...(row.locate && typeof row.locate === "object" ? { locate: row.locate } : {}),
    });
  }
  return out;
}

export function sourceTypeKey(
  sourceType: string,
):
  | "wikiAsk.sourcePage"
  | "wikiAsk.sourceImage"
  | "wikiAsk.sourceWord"
  | "wikiAsk.sourceExcel"
  | "wikiAsk.sourcePdf"
  | "wikiAsk.sourceText"
  | "wikiAsk.sourceFile" {
  switch (sourceType) {
    case "editorjs":
      return "wikiAsk.sourcePage";
    case "image":
      return "wikiAsk.sourceImage";
    case "doc":
    case "docx":
      return "wikiAsk.sourceWord";
    case "xls":
    case "xlsx":
    case "csv":
      return "wikiAsk.sourceExcel";
    case "pdf":
      return "wikiAsk.sourcePdf";
    case "txt":
      return "wikiAsk.sourceText";
    default:
      return "wikiAsk.sourceFile";
  }
}

/** 页面显示标题，附件显示文件名。 */
export function sourceDirection(source: WikiSource): string {
  if (source.sourceType !== "editorjs" && source.sourceType !== "image" && source.sourceName) {
    return source.sourceName;
  }
  return source.title;
}
