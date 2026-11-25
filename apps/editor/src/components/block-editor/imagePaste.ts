export type PastePlace = {
  index: number;
  replaceId: string | null;
};

type OcrPiece = { text?: string; error?: string };

/** 识别结果拼成正文。一张都没有文字时抛出服务端错误或 OCR_EMPTY。 */
export function ocrPlainText(items: OcrPiece[]): string {
  const texts = items.map((item) => (item.text ?? "").trim()).filter(Boolean);
  if (texts.length) {
    return texts.join("\n\n");
  }
  const error = items.map((item) => (item.error ?? "").trim()).find(Boolean);
  throw new Error(error || "OCR_EMPTY");
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 空行分段，段内换行保留。文字先转义，避免识别结果被当成 HTML。 */
export function paragraphBlocks(text: string): { type: "paragraph"; data: { text: string } }[] {
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => ({
      type: "paragraph",
      data: { text: escapeText(part).replace(/\n/g, "<br>") },
    }));
}
