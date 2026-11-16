import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { copyText } from "@/lib/clipboard";
import {
  createShare,
  listShares,
  revokeShare,
  sharePageUrl,
  type ShareLink,
} from "@/store/shareStore";
import type { RemoteSession } from "@/store/remoteStore";

const EXPIRY = [
  { id: "never", seconds: null },
  { id: "day", seconds: 86_400 },
  { id: "week", seconds: 7 * 86_400 },
  { id: "month", seconds: 30 * 86_400 },
] as const;

type ExpiryId = (typeof EXPIRY)[number]["id"];

function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}/${month}/${day}`;
}

export function ShareDialog({
  session,
  pageId,
  title,
  onClose,
}: {
  session: RemoteSession;
  pageId: string;
  title: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [expiry, setExpiry] = useState<ExpiryId>("week");
  const [shares, setShares] = useState<ShareLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let gone = false;
    void listShares(session, pageId)
      .then((rows) => {
        if (!gone) setShares(rows);
      })
      .catch((err: unknown) => {
        if (!gone) setError(err instanceof Error ? err.message : t("share.failed"));
      });
    return () => {
      gone = true;
    };
  }, [session, pageId, t]);

  async function copy(token: string) {
    if (await copyText(sharePageUrl(token))) setCopied(token);
  }

  async function create() {
    setBusy(true);
    setError("");
    try {
      const seconds = EXPIRY.find((item) => item.id === expiry)?.seconds ?? null;
      const created = await createShare(session, { pageId, expiresIn: seconds });
      const rows = await listShares(session, pageId);
      setShares(rows);
      await copy(created.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("share.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: string) {
    setError("");
    try {
      await revokeShare(session, token);
      setShares((rows) => rows.filter((row) => row.token !== token));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("share.failed"));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-full min-w-0 overflow-x-hidden sm:max-w-md">
        <DialogHeader className="min-w-0">
          <DialogTitle className="break-words">{t("share.title")}</DialogTitle>
          <DialogDescription className="break-words">
            {title}
            {" · "}
            {t("share.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t("share.expiry")}</p>
          <div className="flex flex-wrap gap-2">
            {EXPIRY.map((item) => (
              <Button key={item.id} type="button" size="sm" variant={expiry === item.id ? "default" : "outline"} onClick={() => setExpiry(item.id)}>
                {t(`share.${item.id}`)}
              </Button>
            ))}
          </div>
        </div>
        <Button type="button" onClick={() => void create()} disabled={busy}>
          {busy ? t("share.creating") : t("share.create")}
        </Button>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t("share.existing")}</p>
          {shares.length === 0 ? <p className="text-sm text-muted-foreground">{t("share.empty")}</p> : null}
          <ul className="max-h-48 space-y-2 overflow-auto">
            {shares.map((share) => {
              const expired = Boolean(share.expiresAt && Date.parse(share.expiresAt) <= Date.now());
              return (
                <li key={share.token} className="min-w-0 rounded-md border border-border p-2">
                  <p className="break-all text-xs">{sharePageUrl(share.token) || `/s/${share.token}`}</p>
                  <p className="mt-1 break-words text-[11px] text-muted-foreground">
                    {share.sharedBy ? `${t("share.sharedBy", { name: share.sharedBy, time: formatDay(share.createdAt) })} · ` : ""}
                    {expired ? t("share.expired") : share.expiresAt ? t("share.until", { time: formatDay(share.expiresAt) }) : t("share.noExpiry")}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => void copy(share.token)}>
                      {copied === share.token ? t("share.copied") : t("share.copy")}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => void revoke(share.token)}>
                      {t("share.revoke")}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        {error ? <p className="min-w-0 break-words text-sm text-destructive">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
