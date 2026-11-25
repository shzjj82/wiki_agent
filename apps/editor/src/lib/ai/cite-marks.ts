import { renderChatMarkdown } from "./markdown";
import { sourceTagTone, type WikiSource } from "./sources";

function citePattern(): RegExp {
  return /\{\{cite:(\d+)\}\}/g;
}

export function hasCiteMarks(content: string): boolean {
  return citePattern().test(content);
}

const TOKEN = "\u0001";

/** 复制时把标记还原成书名，不把 {{cite:0}} 带进剪贴板。 */
export function citePlain(content: string, sources: WikiSource[] | undefined): string {
  return content.replace(citePattern(), (_all, index: string) => {
    const source = sources?.[Number(index)];
    return source ? `《${citeLabel(source)}》` : "";
  });
}

/** 正文里的 {{cite:n}} 换成可点击的《标题》和类型标签。 */
export function renderCitedMarkdown(
  content: string,
  sources: WikiSource[],
  typeLabel: (source: WikiSource) => string,
): string {
  const marked = content.replace(citePattern(), (_all, index: string) => `${TOKEN}cite:${index}${TOKEN}`);
  const html = renderChatMarkdown(marked);
  return html.replace(new RegExp(`${TOKEN}cite:(\\d+)${TOKEN}`, "g"), (_all, index: string) => {
    const source = sources[Number(index)];
    if (!source) {
      return "";
    }
    const title = escapeHtml(citeLabel(source));
    const tag = escapeHtml(typeLabel(source));
    return `<button type="button" data-cite="${index}" class="mx-0.5 inline-flex items-baseline gap-1 align-baseline text-inherit"><span class="underline underline-offset-2">《${title}》</span><span class="${sourceTagTone(source.sourceType)} rounded px-1 text-[10px] leading-4 font-medium">${tag}</span></button>`;
  });
}

function citeLabel(source: WikiSource): string {
  if (source.sourceType !== "editorjs" && source.sourceType !== "image" && source.sourceName) {
    return source.sourceName.replace(/\.(docx?|xlsx?|csv|pdf|txt)$/i, "") || source.title;
  }
  return source.title;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
