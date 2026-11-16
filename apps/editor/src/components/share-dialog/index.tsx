import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { copyText } from "@/lib/clipboard";
import { createShare, createShareToken, sharePageUrl } from "@/store/shareStore";
import { rememberShare } from "@/store/shareMemory";
import type { RemoteSession } from "@/store/remoteStore";

const EXPIRY = [
  { id: "day", seconds: 86_400 },
  { id: "week", seconds: 7 * 86_400 },
  { id: "month", seconds: 30 * 86_400 },
] as const;

type ExpiryId = (typeof EXPIRY)[number]["id"];

export function ShareDialog({
  session,
  pageId,
  title,
  onClose,
  onShared,
}: {
  session: RemoteSession;
  pageId: string;
  title: string;
  onClose: () => void;
  onShared?: () => void;
}) {
  const { t } = useTranslation();
  const [expiry, setExpiry] = useState<ExpiryId>("week");
  const [token, setToken] = useState(createShareToken);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const url = sharePageUrl(token);

  function pickExpiry(id: ExpiryId) {
    if (busy || id === expiry) return;
    setExpiry(id);
    setToken(createShareToken());
    setSent(false);
    setCopied(false);
    setError("");
  }

  async function share() {
    setError("");
    const seconds = EXPIRY.find((item) => item.id === expiry)?.seconds ?? 7 * 86_400;
    if (!sent) {
      setBusy(true);
      try {
        const created = await createShare(session, { pageId, expiresIn: seconds, token });
        rememberShare({
          token: created.token,
          pageId,
          title: created.title || title,
          expiresAt: created.expiresAt,
        });
        onShared?.();
        setSent(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("share.failed"));
        return;
      } finally {
        setBusy(false);
      }
    }
    if (await copyText(url)) setCopied(true);
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
              <Button key={item.id} type="button" size="sm" variant={expiry === item.id ? "default" : "outline"} disabled={busy} onClick={() => pickExpiry(item.id)}>
                {t(`share.${item.id}`)}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 flex-1 truncate rounded-md border border-border px-2.5 py-1.5 text-xs leading-5" title={url}>{url}</p>
          <Button type="button" className="shrink-0" onClick={() => void share()} disabled={busy}>
            {busy ? t("share.creating") : copied ? t("share.copied") : t("share.menu")}
          </Button>
        </div>
        {error ? <p className="min-w-0 break-words text-sm text-destructive">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
