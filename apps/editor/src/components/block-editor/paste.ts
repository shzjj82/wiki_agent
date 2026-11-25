import type EditorJS from "@editorjs/editorjs";
import type { AttachmentData } from "@/store/fileStore";
import { htmlToBlocks } from "@/lib/document/htmlToBlocks";
import { isImageFile } from "@/lib/document/fileKinds";
import { paragraphBlocks, type PastePlace } from "./imagePaste";
import { imageBlockData } from "./tools/ImageBlockTool";

export type { PastePlace };

export function pastePlace(editor: EditorJS): PastePlace {
  const current = editor.blocks.getCurrentBlockIndex();
  const block = current >= 0 ? editor.blocks.getBlockByIndex(current) : undefined;
  const replace = Boolean(block?.isEmpty) && block?.name !== "header" && block?.name !== "table";
  const index = current < 0 ? editor.blocks.getBlocksCount() : replace ? current : current + 1;
  return { index, replaceId: replace && block ? block.id : null };
}

function imageFilesFromClipboard(data: DataTransfer): File[] {
  const files = Array.from(data.files).filter(isImageFile);
  if (files.length > 0) {
    return files;
  }
  const fromItems: File[] = [];
  for (const item of Array.from(data.items)) {
    if (item.kind !== "file") {
      continue;
    }
    const file = item.getAsFile();
    if (file && isImageFile(file)) {
      fromItems.push(file);
    }
  }
  return fromItems;
}

export async function insertPastedImages(
  editor: EditorJS,
  files: File[],
  upload: (file: File) => Promise<AttachmentData>,
  isAlive: () => boolean,
  place: PastePlace,
) {
  let index = place.index;
  let replaceNext = Boolean(place.replaceId);
  for (const file of files) {
    if (!isAlive()) {
      return;
    }
    const uploaded = await upload(file);
    if (!isAlive()) {
      return;
    }
    editor.blocks.insert("image", imageBlockData(uploaded), {}, index, false, replaceNext);
    replaceNext = false;
    index += 1;
  }
  try {
    editor.caret.setToBlock(Math.max(place.index, index - 1), "end");
  } catch {
    /* 光标放不回去就算了 */
  }
}

export function insertPastedText(editor: EditorJS, text: string, place: PastePlace) {
  const blocks = paragraphBlocks(text);
  if (!blocks.length) {
    throw new Error("OCR_EMPTY");
  }
  editor.blocks.insertMany(blocks, place.index);
  if (place.replaceId) {
    const stale = editor.blocks.getBlockIndex(place.replaceId);
    if (stale >= 0) {
      editor.blocks.delete(stale);
    }
  }
  try {
    editor.caret.setToBlock(place.index + blocks.length - 1, "end");
  } catch {
    /* 光标放不回去就算了 */
  }
}

type PasteOptions = {
  isAlive: () => boolean;
  isReadOnly: () => boolean;
  onImagePaste: (files: File[], place: PastePlace) => void;
};

/** 粘贴图片先交给页面选择；粘贴富文本 HTML 拆成多个块。返回解绑函数 */
export function bindPaste(holder: HTMLElement, editor: EditorJS, options: PasteOptions): () => void {
  const onPaste = (event: ClipboardEvent) => {
    const data = event.clipboardData;
    const target = event.target instanceof Element ? event.target : null;
    if (!data || data.types.includes("application/x-editor-js")) {
      return;
    }
    const images = imageFilesFromClipboard(data);
    if (images.length > 0) {
      if (options.isReadOnly() || target?.closest(".tc-table, input, textarea")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      options.onImagePaste(images, pastePlace(editor));
      return;
    }
    if (data.files.length > 0) {
      return;
    }
    if (!target?.closest(".ce-block") || target.closest(".tc-table, .cdx-quote__caption, input, textarea")) {
      return;
    }
    const html = data.getData("text/html");
    if (!html) {
      return;
    }
    const blocks = htmlToBlocks(html);
    if (blocks.length === 0 || (blocks.length === 1 && blocks[0].type === "paragraph")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const current = editor.blocks.getCurrentBlockIndex();
    const block = current >= 0 ? editor.blocks.getBlockByIndex(current) : undefined;
    const replace = Boolean(block?.isEmpty) && block?.name !== "table";
    const at = current < 0 ? editor.blocks.getBlocksCount() : replace ? current : current + 1;
    editor.blocks.insertMany(blocks, at);
    if (replace && block) {
      editor.blocks.delete(editor.blocks.getBlockIndex(block.id));
    }
    editor.caret.setToBlock(at + blocks.length - 1, "end");
  };
  holder.addEventListener("paste", onPaste, true);
  return () => holder.removeEventListener("paste", onPaste, true);
}
