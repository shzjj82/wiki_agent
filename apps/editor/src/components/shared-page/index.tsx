import { useEffect, useState } from "react";
import type { EditorJsBlock, EditorJsDocument } from "@myblog/shared";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { resharePage, sharePageUrl, viewShare, type SharedPageView } from "@/store/shareStore";

const ALLOWED = new Set(["B", "I", "STRONG", "EM", "U", "S", "MARK", "CODE", "BR", "A", "SPAN"]);

const EXPIRY = [
  { id: "never", seconds: null },
  { id: "day", seconds: 86_400 },
  { id: "week", seconds: 7 * 86_400 },
  { id: "month", seconds: 30 * 86_400 },
] as const;

type ExpiryId = (typeof EXPIRY)[number]["id"];

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
  return <div className={className} dangerouslySetInnerHTML={{ __html: sanitize(html) }} />;
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

function BlockView({ block }: { block: EditorJsBlock }) {
  const { t } = useTranslation();
  const data = asRecord(block.data);
  if (block.type === "header") {
    const level = Math.min(6, Math.max(1, Number(data.level) || 2));
    const className = `${["text-3xl", "text-2xl", "text-xl", "text-lg", "text-base", "text-sm"][level - 1]} font-semibold [&_a]:underline`;
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
      <div className="overflow-x-auto">
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
  if (block.type === "code") {
    return (
      <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
        <code>{textOf(data.code)}</code>
      </pre>
    );
  }
  const fallback = textOf(data.text || data.title || data.content);
  if (!fallback) return null;
  return <RichText html={fallback} className="leading-7 [&_a]:underline" />;
}

function Article({ body }: { body: EditorJsDocument }) {
  const { t } = useTranslation();
  const blocks = Array.isArray(body?.blocks) ? body.blocks : [];
  if (blocks.length === 0) return <p className="text-muted-foreground">{t("share.emptyBody")}</p>;
  return (
    <div className="space-y-4">
      {blocks.map((block, index) => (
        <BlockView key={block.id || index} block={block} />
      ))}
    </div>
  );
}

function formatWhen(iso: string | null, language: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(language);
}

export function SharedPage({ token }: { token: string }) {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState<SharedPageView | null>(null);
  const [missing, setMissing] = useState(false);
  const [expiry, setExpiry] = useState<ExpiryId>("week");
  const [allowReshare, setAllowReshare] = useState(false);
  const [childUrl, setChildUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let gone = false;
    if (!token) {
      setMissing(true);
      return;
    }
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

  useEffect(() => {
    const previous = document.title;
    if (page?.title) document.title = page.title;
    return () => {
      document.title = previous;
    };
  }, [page?.title]);

  async function makeChild() {
    setBusy(true);
    setError("");
    try {
      const seconds = EXPIRY.find((item) => item.id === expiry)?.seconds ?? null;
      const created = await resharePage(token, { expiresIn: seconds, allowReshare });
      const url = sharePageUrl(created.token);
      setChildUrl(url);
      await navigator.clipboard.writeText(url).catch(() => undefined);
      setCopied(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("share.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10">
        {missing ? (
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">{t("share.unavailableTitle")}</h1>
            <p className="text-muted-foreground">{t("share.unavailable")}</p>
          </div>
        ) : page ? (
          <>
            <header className="space-y-2">
              <h1 className="text-3xl font-semibold">{page.title}</h1>
              <p className="text-xs text-muted-foreground">
                {t("share.sharedAt", { time: formatWhen(page.sharedAt, i18n.language) })}
                {page.expiresAt ? ` · ${t("share.until", { time: formatWhen(page.expiresAt, i18n.language) })}` : ` · ${t("share.noExpiry")}`}
              </p>
            </header>
            <Article body={page.body} />
            {page.allowReshare ? (
              <section className="space-y-3 rounded-xl border border-border p-4">
                <h2 className="text-sm font-medium">{t("share.reshareTitle")}</h2>
                <div className="flex flex-wrap gap-2">
                  {EXPIRY.map((item) => (
                    <Button key={item.id} type="button" size="sm" variant={expiry === item.id ? "default" : "outline"} onClick={() => setExpiry(item.id)}>
                      {t(`share.${item.id}`)}
                    </Button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={allowReshare} onChange={(event) => setAllowReshare(event.target.checked)} />
                  {t("share.allowReshare")}
                </label>
                <Button type="button" onClick={() => void makeChild()} disabled={busy}>
                  {busy ? t("share.creating") : t("share.reshareAction")}
                </Button>
                {childUrl ? (
                  <div className="flex gap-2">
                    <input readOnly value={childUrl} className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs" />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void navigator.clipboard.writeText(childUrl);
                        setCopied(true);
                      }}
                    >
                      {copied ? t("share.copied") : t("share.copy")}
                    </Button>
                  </div>
                ) : null}
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
              </section>
            ) : null}
          </>
        ) : (
          <p className="text-muted-foreground">{t("share.loading")}</p>
        )}
      </article>
    </main>
  );
}
