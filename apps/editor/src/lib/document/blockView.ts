import type { EditorJsBlock } from "@myblog/shared";
import type { DiffPart } from "./textDiff";

const INLINE = new Set(["b", "strong", "i", "em", "u", "s", "code", "br", "a", "mark"]);

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function decode(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (full, body: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', nbsp: " " };
    const hit = named[body.toLowerCase()];
    if (hit) return hit;
    if (body.startsWith("#")) {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    return full;
  });
}

/** 编辑器里的行内 HTML 只留安全的少量标签，其余转义成文字 */
function renderInline(raw: string): string {
  return String(raw)
    .split(/(<[^>]*>)/)
    .map((token) => {
      if (!token.startsWith("<")) return escapeText(token);
      const matched = /^<\/?([a-zA-Z0-9]+)([^>]*)>$/.exec(token);
      if (!matched) return "";
      const name = matched[1]!.toLowerCase();
      if (!INLINE.has(name)) return "";
      if (token.startsWith("</")) return name === "br" ? "" : `</${name}>`;
      if (name === "br") return "<br>\n";
      if (name === "a") {
        const href = /href\s*=\s*("([^"]*)"|'([^']*)')/i.exec(matched[2] ?? "");
        const url = href?.[2] ?? href?.[3] ?? "";
        return /^https?:\/\//i.test(url) ? `<a href="${escapeText(url)}" target="_blank" rel="noreferrer">` : "<a>";
      }
      return `<${name}>`;
    })
    .join("");
}

function listItems(data: Record<string, unknown>): string[] {
  const items = Array.isArray(data.items) ? data.items : [];
  return items.map((item) => (typeof item === "string" ? item : String((item as { content?: string })?.content ?? "")));
}

/** 一个块渲染成正文 HTML：标题、列表、代码、表格都按各自的样式，而不是 Markdown 记号 */
export function blockHtml(block: EditorJsBlock | undefined): string {
  if (!block) return "";
  const data = block.data ?? {};
  if (block.type === "document") {
    return ((data.blocks as EditorJsBlock[]) ?? []).map((item) => blockHtml(item)).filter(Boolean).join("\n");
  }
  switch (block.type) {
    case "header": {
      const level = Math.min(3, Math.max(1, Number(data.level) || 2));
      const size = ["text-xl", "text-lg", "text-base"][level - 1];
      return `<p class="${size} font-semibold">${renderInline(String(data.text ?? ""))}</p>`;
    }
    case "paragraph":
      return `<p>${renderInline(String(data.text ?? ""))}</p>`;
    case "quote":
      return `<blockquote class="border-l-2 border-border pl-2 text-muted-foreground italic">${renderInline(String(data.text ?? ""))}</blockquote>`;
    case "list": {
      const tag = data.style === "ordered" ? "ol" : "ul";
      const items = listItems(data).map((item) => `<li>${renderInline(item)}</li>`);
      return `<${tag} class="list-inside ${tag === "ol" ? "list-decimal" : "list-disc"}">${items.join("\n")}</${tag}>`;
    }
    case "code":
      return `<pre class="overflow-auto rounded bg-muted px-2 py-1 text-xs">${escapeText(String(data.code ?? ""))}</pre>`;
    case "table": {
      const rows = Array.isArray(data.content) ? (data.content as unknown[][]) : [];
      const body = rows
        .map((row) => `<tr>${row.map((cell) => `<td class="border border-border px-1.5 py-0.5">${renderInline(String(cell ?? ""))}</td>`).join("")}</tr>`)
        .join("");
      return `<table class="border-collapse text-xs">${body}</table>`;
    }
    case "image": {
      const file = data.file as { url?: string } | undefined;
      const url = String(file?.url || data.url || "");
      const caption = renderInline(String(data.caption ?? ""));
      const img = /^https?:\/\//i.test(url) ? `<img src="${escapeText(url)}" alt="" class="max-h-40 rounded">` : "";
      return `<figure class="flex flex-col gap-1">${img}${caption ? `<figcaption class="text-xs text-muted-foreground">${caption}</figcaption>` : ""}</figure>`;
    }
    case "delimiter":
      return `<hr class="border-border">`;
    case "todo": {
      const items = Array.isArray(data.items) ? data.items : [];
      return items
        .map((item) => {
          const row = item as { text?: string; status?: string; done?: boolean };
          const done = row.status === "done" || (!row.status && row.done);
          return `<p>${done ? "☑" : "☐"} ${renderInline(String(row.text ?? ""))}</p>`;
        })
        .join("\n");
    }
    default:
      return typeof data.text === "string" ? `<p>${renderInline(data.text)}</p>` : "";
  }
}

/** HTML 去掉标签、还原转义后的纯文字，和 blockHtml 一一对应，用来做逐字对比 */
export function blockText(block: EditorJsBlock | undefined): string {
  return decode(blockHtml(block).replace(/<[^>]*>/g, ""));
}

/**
 * 把逐字对比的结果嵌回正文 HTML：相同的字照常显示，只有这一侧有的字套上高亮。
 * 按纯文字的位置对齐，不会把标签拆开。
 */
export function highlightHtml(html: string, parts: DiffPart[], show: "add" | "del", tone: string): string {
  const wanted = parts.filter((part) => part.kind === "same" || part.kind === show);
  let index = 0;
  let offset = 0;
  const mark = (plain: string) => {
    let out = "";
    let cursor = 0;
    while (cursor < plain.length && index < wanted.length) {
      const part = wanted[index]!;
      const take = Math.min(plain.length - cursor, part.text.length - offset);
      const slice = escapeText(plain.slice(cursor, cursor + take));
      out += part.kind === "same" ? slice : `<mark class="${tone}">${slice}</mark>`;
      cursor += take;
      offset += take;
      if (offset >= part.text.length) {
        index += 1;
        offset = 0;
      }
    }
    if (cursor < plain.length) out += escapeText(plain.slice(cursor));
    return out;
  };
  return html
    .split(/(<[^>]*>)/)
    .map((token) => (token.startsWith("<") ? token : mark(decode(token))))
    .join("");
}
