import type { AiAttachment } from "@myblog/shared";
import { parseLocalFiles, uid, type LocalAttachment } from "@/lib/ai/chat";
import { readFileText } from "@/lib/document/fileText";
import { fileExtension } from "@/lib/document/fileKinds";
import { pageTodos, type SearchDoc } from "@/lib/document/search";
import { t } from "@/i18n";

export const MESSAGE_LIMIT = 8000;

export function capImages(list: AiAttachment[]): AiAttachment[] {
  let images = 0;
  return list.filter((item) => {
    if (item.kind !== "image") {
      return true;
    }
    images += 1;
    return images <= 6;
  });
}

export function asksAboutTodos(query: string): boolean {
  return /待办|未完成|未开始|进行中|已完成|已终止|todo/i.test(query);
}

function keepsTodo(query: string, status: string, done: boolean): boolean {
  const wantDone = /已完成/.test(query);
  const wantCancel = /已终止|取消|终止/.test(query);
  const wantActive = /未完成|未开始|进行中|待办|todo/i.test(query);
  if (wantDone && !wantActive && !wantCancel) {
    return done || status === "已完成";
  }
  if (wantCancel && !wantActive && !wantDone) {
    return status === "已终止";
  }
  if (wantActive && !wantDone && !wantCancel) {
    return status === "未开始" || status === "进行中" || (!done && status !== "已终止" && status !== "已完成");
  }
  return true;
}

export function formatTodos(docs: SearchDoc[], query: string, rule: string, empty: string): string {
  const lines = [rule];
  for (const page of pageTodos(docs)) {
    const items = page.items.filter((item) => keepsTodo(query, item.status, item.done));
    if (!items.length) {
      continue;
    }
    lines.push(`《${page.title}》`);
    for (const item of items) {
      const range = item.start || item.end ? `（${item.start || "?"}至${item.end || "?"}）` : "";
      lines.push(`- ${item.status}：${item.text}${range}`);
    }
  }
  return lines.length > 1 ? lines.join("\n") : empty;
}

export async function readUpload(files: File[]): Promise<LocalAttachment[]> {
  const plain: File[] = [];
  const out: LocalAttachment[] = [];
  for (const file of files) {
    const ext = fileExtension(file.name);
    if (ext === "docx" || ext === "xlsx" || ext === "xls" || ext === "csv") {
      const text = (await readFileText(file)).trim();
      if (!text) {
        throw new Error(t("document.emptyImport"));
      }
      out.push({ id: uid(), kind: "text", name: file.name, text });
      continue;
    }
    plain.push(file);
  }
  if (plain.length) {
    out.push(...(await parseLocalFiles(plain)));
  }
  return out;
}

export function userContent(question: string, files: LocalAttachment[] | undefined, uploadedLabel: string, questionLabel: string, fallback: string): string {
  const ask = question.trim();
  const uploaded = (files ?? [])
    .flatMap((file) => (file.kind === "text" && file.text.trim() ? [`《${file.name}》\n${file.text.trim()}`] : []))
    .join("\n\n");
  if (!uploaded) {
    return ask;
  }
  const questionPart = `${questionLabel}\n${ask || fallback}`;
  const room = MESSAGE_LIMIT - questionPart.length - 2;
  const filePart = `${uploadedLabel}\n${uploaded}`.slice(0, Math.max(0, room));
  return `${filePart}\n\n${questionPart}`;
}

export function skillErrorMessage(code: string): string {
  if (code === "DESKTOP_ONLY") {
    return t("wikiAsk.skillDesktopOnly");
  }
  if (code === "COMMAND_TIMEOUT") {
    return t("wikiAsk.skillTimeout");
  }
  return t("wikiAsk.skillFailed");
}
