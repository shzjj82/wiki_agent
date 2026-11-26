import { renderChatMarkdown } from "./markdown";
import { sourceTagTone, type WikiSource } from "./sources";

function citePattern(): RegExp {
  return /\{\{cite:(\d+)\}\}/g;
}

export function hasCiteMarks(content: string): boolean {
  return /\{\{cite:\d+\}\}/.test(content);
}

/** 没写 {{cite:n}} 时，把出处嵌进正文，不要单独垫在气泡最下面。 */
export function withCiteMarks(content: string, sources: WikiSource[]): string {
  if (!sources.length) {
    return content;
  }
  let text = content;
  const used = new Set(
    [...text.matchAll(/\{\{cite:(\d+)\}\}/g)].map((match) => Number(match[1])),
  );
  for (let index = 0; index < sources.length; index += 1) {
    if (used.has(index)) {
      continue;
    }
    const label = citeLabel(sources[index]!);
    if (!label) {
      continue;
    }
    const wrapped = `《${label}》`;
    const at = text.indexOf(wrapped);
    const from = at >= 0 ? at : text.indexOf(label);
    const size = at >= 0 ? wrapped.length : label.length;
    if (from < 0) {
      continue;
    }
    const sample = text.slice(Math.max(0, from - 24), from + size);
    text = `${text.slice(0, from)}${sourceLabel(index, sample)}${text.slice(from + size)}`;
    used.add(index);
  }
  const leftover = sources.map((_, index) => index).filter((index) => !used.has(index));
  if (!leftover.length) {
    return text;
  }
  const marks = leftover.map((index) => sourceLabel(index, text)).join("");
  const cut = text.search(/\n\n/);
  if (cut < 0) {
    return `${text.trimEnd()} ${marks}`;
  }
  return `${text.slice(0, cut)} ${marks}${text.slice(cut)}`;
}

function sourceLabel(index: number, sample: string): string {
  const mark = `{{cite:${index}}}`;
  if (/[\u3400-\u9fff（）：「」]/.test(sample)) {
    return `（来源：${mark}）`;
  }
  return `(来源: ${mark})`;
}

const TOKEN = "\u0001";

/** 复制时把标记还原成书名，不把 {{cite:0}} 带进剪贴板。 */
export function citePlain(content: string, sources: WikiSource[] | undefined): string {
  const text = sources?.length ? withCiteMarks(content, sources) : content;
  return text.replace(citePattern(), (_all, index: string) => {
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
