import type EditorJS from "@editorjs/editorjs";
import type { AttachmentData } from "@/store/fileStore";
import { htmlToBlocks } from "@/lib/document/htmlToBlocks";
import { isImageFile } from "@/lib/document/fileKinds";
import { imageBlockData } from "./tools/ImageBlockTool";

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

async function insertPastedImages(
  editor: EditorJS,
  files: File[],
  upload: (file: File) => Promise<AttachmentData>,
  isAlive: () => boolean,
) {
  const current = editor.blocks.getCurrentBlockIndex();
  const block = current >= 0 ? editor.blocks.getBlockByIndex(current) : undefined;
  const replace = Boolean(block?.isEmpty) && block?.name !== "header" && block?.name !== "table";
  let index = current < 0 ? editor.blocks.getBlocksCount() : replace ? current : current + 1;
  let replaceNext = replace;
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
}

type PasteOptions = {
  isAlive: () => boolean;
  isReadOnly: () => boolean;
  getUpload: () => ((file: File) => Promise<AttachmentData>) | undefined;
  onUploadError: (error: unknown) => void;
};

/** 粘贴图片走上传插入图片块；粘贴富文本 HTML 拆成多个块。返回解绑函数 */
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
      const upload = options.getUpload();
      if (!upload) {
        return;
      }
      void insertPastedImages(editor, images, upload, options.isAlive).catch(options.onUploadError);
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
