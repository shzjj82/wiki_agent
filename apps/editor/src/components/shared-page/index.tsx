import { useEffect, useMemo, useState } from "react";
import type { EditorJsBlock, EditorJsDocument } from "@myblog/shared";
import { useTranslation } from "react-i18next";
import { viewShare, type SharedPageNode, type SharedPageView } from "@/store/shareStore";

const ALLOWED = new Set(["B", "I", "STRONG", "EM", "U", "S", "MARK", "CODE", "BR", "A", "SPAN"]);

function sanitize(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const clean = (node: Node): Node => {
    if (node.nodeType === Node.TEXT_NODE) return node.cloneNode();
    if (node.nodeType !== Node.ELEMENT_NODE) return document.createTextNode("");
    const el = node as HTMLElement;
    if (!ALLOWED.has(el.tagName)) {
      const frag = document.createDocumentFragment();
      for (const child of el.childNodes) frag.appendChild(clean(child));
      return frag;
    }
    if (el.tagName === "A") {
      const href = el.getAttribute("href") ?? "";
      if (!/^https?:\/\//i.test(href)) {
        const span = document.createElement("span");
        for (const child of el.childNodes) span.appendChild(clean(child));
        return span;
      }
      const link = document.createElement("a");
      link.setAttribute("href", href);
      link.setAttribute("rel", "nofollow noopener noreferrer");
      link.setAttribute("target", "_blank");
      for (const child of el.childNodes) link.appendChild(clean(child));
      return link;
    }
    const next = document.createElement(el.tagName.toLowerCase());
    for (const child of el.childNodes) next.appendChild(clean(child));
    return next;
  };
  const holder = document.createElement("div");
  for (const child of doc.body.childNodes) holder.appendChild(clean(child));
  return holder.innerHTML;
}

function RichText({ html, className }: { html: string; className?: string }) {
  return <div className={`break-words ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: sanitize(html) }} />;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

type ListItem = { text: string; checked?: boolean; items: ListItem[] };

function listItems(value: unknown): ListItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return { text: item, items: [] };
    const row = asRecord(item);
    const meta = asRecord(row.meta);
    return {
      text: textOf(row.content ?? row.text),
      checked: typeof meta.checked === "boolean" ? meta.checked : undefined,
      items: listItems(row.items),
    };
  });
}

function ListView({ items, ordered }: { items: ListItem[]; ordered: boolean }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={ordered ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5"}>
      {items.map((item, index) => (
        <li key={index}>
          {item.checked == null ? null : <span className="mr-1">{item.checked ? "☑" : "☐"}</span>}
          <RichText html={item.text} className="inline [&_a]:underline" />
          {item.items.length > 0 ? <ListView items={item.items} ordered={ordered} /> : null}
        </li>
      ))}
    </Tag>
  );
}

function imageUrl(data: Record<string, unknown>): string {
  const file = asRecord(data.file);
  const url = textOf(file.url || data.url);
  return /^https?:\/\//i.test(url) ? url : "";
}

function BlockView({ block, onOpenTitle }: { block: EditorJsBlock; onOpenTitle?: (title: string) => void }) {
  const { t } = useTranslation();
  const data = asRecord(block.data);
  if (block.type === "header") {
    const level = Math.min(6, Math.max(1, Number(data.level) || 2));
    const className = `${["text-3xl", "text-2xl", "text-xl", "text-lg", "text-base", "text-sm"][level - 1]} break-words font-semibold [&_a]:underline`;
    const html = sanitize(textOf(data.text));
    if (level === 1) return <h1 className={className} dangerouslySetInnerHTML={{ __html: html }} />;
    if (level === 2) return <h2 className={className} dangerouslySetInnerHTML={{ __html: html }} />;
    if (level === 3) return <h3 className={className} dangerouslySetInnerHTML={{ __html: html }} />;
    if (level === 4) return <h4 className={className} dangerouslySetInnerHTML={{ __html: html }} />;
    if (level === 5) return <h5 className={className} dangerouslySetInnerHTML={{ __html: html }} />;
    return <h6 className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  if (block.type === "paragraph" || block.type === "quote") {
    const quote = block.type === "quote";
    return (
      <div className={quote ? "border-l-2 border-foreground/20 pl-4" : undefined}>
        <RichText html={textOf(data.text)} className="leading-7 [&_a]:underline" />
        {quote && textOf(data.caption) ? <RichText html={textOf(data.caption)} className="mt-1 text-xs text-muted-foreground" /> : null}
      </div>
    );
  }
  if (block.type === "list" || block.type === "checklist") {
    const ordered = data.style === "ordered";
    return <ListView items={listItems(data.items)} ordered={ordered} />;
  }
  if (block.type === "delimiter") {
    return <hr className="border-border" />;
  }
  if (block.type === "table") {
    const rows = Array.isArray(data.content) ? data.content : [];
    const head = data.withHeadings === true;
    return (
      <div className="max-w-full min-w-0 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {Array.isArray(row)
                  ? row.map((cell, cellIndex) => {
                      const Cell = head && rowIndex === 0 ? "th" : "td";
                      return (
                        <Cell key={cellIndex} className="border border-border px-2 py-1 text-left align-top">
                          <RichText html={textOf(cell)} className="[&_a]:underline" />
                        </Cell>
                      );
                    })
                  : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (block.type === "image") {
    const src = imageUrl(data);
    if (!src) return <p className="text-sm text-muted-foreground">{t("share.imageHidden")}</p>;
    return (
      <figure className="space-y-1">
        <img src={src} alt="" className="max-w-full rounded-md" />
        {textOf(data.caption) ? <RichText html={textOf(data.caption)} className="text-xs text-muted-foreground" /> : null}
      </figure>
    );
  }
  if (block.type === "pageLink") {
    const title = textOf(data.title).trim();
    if (!title) return null;
    return (
      <button
        type="button"
        className="w-full min-w-0 break-words rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted/60"
        onClick={() => onOpenTitle?.(title)}
      >
        {title}
      </button>
    );
  }
  if (block.type === "code") {
    return (
      <pre className="max-w-full overflow-x-auto rounded-md bg-muted p-3 text-xs">
        <code>{textOf(data.code)}</code>
      </pre>
    );
  }
  const fallback = textOf(data.text || data.title || data.content);
  if (!fallback) return null;
  return <RichText html={fallback} className="leading-7 [&_a]:underline" />;
}

/** 页面标题已经单独显示。正文开头再放一个相同的一级标题，就会出现两个头。 */
function bodyWithoutDuplicateTitle(title: string, body: EditorJsDocument): EditorJsBlock[] {
  const blocks = Array.isArray(body?.blocks) ? body.blocks : [];
  const first = blocks[0];
  if (!first || first.type !== "header") return blocks;
  const data = asRecord(first.data);
  const level = Number(data.level) || 1;
  if (level !== 1) return blocks;
  const text = plainText(textOf(data.text));
  if (!text || text !== title.trim()) return blocks;
  return blocks.slice(1);
}

function Article({ title, body, onOpenTitle }: { title: string; body: EditorJsDocument; onOpenTitle?: (title: string) => void }) {
  const { t } = useTranslation();
  const blocks = bodyWithoutDuplicateTitle(title, body);
  if (blocks.length === 0) return <p className="text-muted-foreground">{t("share.emptyBody")}</p>;
  return (
    <div className="min-w-0 space-y-4">
      {blocks.map((block, index) => (
        <BlockView key={block.id || index} block={block} onOpenTitle={onOpenTitle} />
      ))}
    </div>
  );
}

function formatDay(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}/${month}/${day}`;
}

function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function findByTitle(node: SharedPageNode, title: string): SharedPageNode | null {
  if (node.title.trim() === title.trim()) return node;
  for (const child of node.children ?? []) {
    const found = findByTitle(child, title);
    if (found) return found;
  }
  return null;
}

function hasChild(node: SharedPageNode): boolean {
  return (node.children ?? []).length > 0;
}

function PageNav({
  nodes,
  active,
  onOpen,
  depth = 0,
}: {
  nodes: SharedPageNode[];
  active: SharedPageNode;
  onOpen: (node: SharedPageNode) => void;
  depth?: number;
}) {
  return (
    <ul className="flex min-w-0 flex-col gap-0.5">
      {nodes.map((node, index) => (
        <li key={`${depth}-${index}-${node.title}`} className="min-w-0">
          <button
            type="button"
            className={`w-full break-words rounded-md px-2 py-1 text-left text-sm ${node === active ? "bg-muted font-medium" : "hover:bg-muted/60"}`}
            style={{ paddingLeft: 8 + depth * 12 }}
            onClick={() => onOpen(node)}
          >
            {node.title}
          </button>
          {node.children?.length ? <PageNav nodes={node.children} active={active} onOpen={onOpen} depth={depth + 1} /> : null}
        </li>
      ))}
    </ul>
  );
}

export function SharedPage({ token }: { token: string }) {
  const { t } = useTranslation();
  const [page, setPage] = useState<SharedPageView | null>(null);
  const [missing, setMissing] = useState(false);
  const [picked, setPicked] = useState<SharedPageNode | null>(null);

  useEffect(() => {
    let gone = false;
    if (!token) {
      setMissing(true);
      return;
    }
    setPicked(null);
    void viewShare(token)
      .then((next) => {
        if (!gone) setPage(next);
      })
      .catch(() => {
        if (!gone) setMissing(true);
      });
    return () => {
      gone = true;
    };
  }, [token]);

  const root = useMemo<SharedPageNode | null>(
    () => (page ? { title: page.title, body: page.body, children: page.children ?? [] } : null),
    [page],
  );
  const current = picked && root && findByTitle(root, picked.title) ? picked : root;

  useEffect(() => {
    const previous = document.title;
    if (current?.title) document.title = current.title;
    return () => {
      document.title = previous;
    };
  }, [current?.title]);

  const when = page ? formatDay(page.sharedAt) : "";
  const until = page?.expiresAt ? formatDay(page.expiresAt) : "";
  const byline = page
    ? page.sharedBy
      ? t("share.sharedBy", { name: page.sharedBy, time: when })
      : t("share.sharedAt", { time: when })
    : "";

  function openTitle(title: string) {
    if (!root) return;
    const next = findByTitle(root, title);
    if (next) setPicked(next);
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6 px-4 py-8 md:flex-row md:px-6">
        {missing ? (
          <div className="min-w-0 space-y-2">
            <h1 className="break-words text-2xl font-semibold">{t("share.unavailableTitle")}</h1>
            <p className="break-words text-muted-foreground">{t("share.unavailable")}</p>
          </div>
        ) : current && root ? (
          <>
            {hasChild(root) ? (
              <nav className="min-w-0 md:w-56 md:shrink-0">
                <p className="mb-2 text-xs text-muted-foreground">{t("share.subpages")}</p>
                <PageNav nodes={[root]} active={current} onOpen={setPicked} />
              </nav>
            ) : null}
            <article className="min-w-0 flex-1">
              <header className="mb-6 space-y-2">
                <h1 className="break-words text-3xl font-semibold">{current.title}</h1>
                <p className="break-words text-xs text-muted-foreground">
                  {byline}
                  {until ? ` · ${t("share.until", { time: until })}` : ` · ${t("share.noExpiry")}`}
                </p>
              </header>
              <Article title={current.title} body={current.body} onOpenTitle={openTitle} />
            </article>
          </>
        ) : (
          <p className="text-muted-foreground">{t("share.loading")}</p>
        )}
      </div>
    </main>
  );
}
