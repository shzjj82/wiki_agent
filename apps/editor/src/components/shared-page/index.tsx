import { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { EditorJsDocument } from "@myblog/shared";
import { useTranslation } from "react-i18next";
import { BlockEditor } from "@/components/block-editor";
import { SoftScrollbar } from "@/components/soft-scrollbar";
import { Button } from "@/components/ui/button";
import { useVisualViewport } from "@/lib/useKeyboardInset";
import { useIsMobile } from "@/lib/useMediaQuery";
import { ShareAccess } from "@/components/shared-page/ShareAccess";
import { viewShare, type SharedPageNode, type SharedPageView } from "@/store/shareStore";

const iconProps = { size: 16 };

type SharePage = {
  id: string;
  title: string;
  parentId: string | null;
  body: EditorJsDocument;
};

function formatDay(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}/${month}/${day}`;
}

function flattenShare(node: SharedPageNode, parentId: string | null, out: SharePage[], seq: { n: number }) {
  const id = node.id?.trim() || `share-${seq.n++}`;
  out.push({ id, title: node.title, parentId, body: node.body });
  for (const child of node.children ?? []) flattenShare(child, id, out, seq);
}

export function SharedPage({ token }: { token: string }) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const viewport = useVisualViewport();
  const [page, setPage] = useState<SharedPageView | null>(null);
  const [missing, setMissing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    if (!token) {
      setMissing(true);
      return;
    }
    setSelectedId(null);
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

  const pages = useMemo(() => {
    if (!page) return [];
    const out: SharePage[] = [];
    flattenShare({ id: page.id, title: page.title, body: page.body, children: page.children ?? [] }, null, out, { n: 0 });
    return out;
  }, [page]);
  const current = pages.find((item) => item.id === selectedId) ?? pages[0] ?? null;
  const parent = current?.parentId ? pages.find((item) => item.id === current.parentId) : null;

  useEffect(() => {
    if (pages[0] && !pages.some((item) => item.id === selectedId)) setSelectedId(pages[0].id);
  }, [pages, selectedId]);

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

  function openPage(id: string) {
    if (!pages.some((item) => item.id === id)) return;
    setSelectedId(id);
  }

  if (missing) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background px-6 text-foreground">
        <div className="max-w-md space-y-2">
          <h1 className="break-words text-2xl font-semibold">{t("share.unavailableTitle")}</h1>
          <p className="break-words text-muted-foreground">{t("share.unavailable")}</p>
        </div>
      </main>
    );
  }

  return (
    <div
      className="fixed inset-x-0 flex flex-col overflow-hidden bg-background text-foreground"
      style={{ top: viewport.top, height: viewport.height }}
    >
      <header
        className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 pt-2 pb-1 text-xs text-muted-foreground sm:border-b-0 sm:px-6 sm:pt-3 sm:pb-0"
        style={
          isMobile
            ? {
                paddingTop: "max(0.5rem, env(safe-area-inset-top))",
                paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
                paddingRight: "max(0.75rem, env(safe-area-inset-right))",
                touchAction: "none",
              }
            : undefined
        }
      >
        {parent ? (
          <Button type="button" variant="ghost" size="sm" className="max-w-[40%] shrink-0" onClick={() => openPage(parent.id)}>
            <ChevronLeft {...iconProps} />
            <span className="truncate">{parent.title}</span>
          </Button>
        ) : null}
        <span className="min-w-0 flex-1 truncate">
          {page ? `${byline}${until ? ` · ${t("share.until", { time: until })}` : ` · ${t("share.noExpiry")}`}` : t("share.loading")}
        </span>
        {page ? <ShareAccess token={token} /> : null}
      </header>
      {current ? (
        <SoftScrollbar className="min-h-0 flex-1" jumpToBottomLabel={t("common.scrollToBottom")}>
          <BlockEditor
            key={current.id}
            doc={current.body}
            pageId={current.id}
            readOnly
            onChange={() => undefined}
            onOpenPage={openPage}
            resolvePageTitle={(id) => pages.find((item) => item.id === id)?.title}
          />
        </SoftScrollbar>
      ) : (
        <p className="px-6 py-8 text-muted-foreground">{t("share.loading")}</p>
      )}
    </div>
  );
}
