import { useEffect, useState } from "react";
import { Copy, Link2, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { shareSiteOrigin } from "@/store/shareStore";

export function teamInviteUrl(code: string): string {
  return `${shareSiteOrigin()}/app/join/${encodeURIComponent(code)}`;
}

/** 点邀请码或邀请链接即复制，并在旁边显示已复制。 */
export function TeamInviteFields({
  code,
  onRefresh,
  refreshing = false,
}: {
  code: string | null;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [failed, setFailed] = useState(false);
  const link = code ? teamInviteUrl(code) : "";

  useEffect(() => {
    if (!copied && !failed) {
      return;
    }
    const timer = window.setTimeout(() => {
      setCopied(null);
      setFailed(false);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [copied, failed]);

  async function copy(kind: "code" | "link", text: string) {
    const ok = await copyText(text);
    setFailed(!ok);
    setCopied(ok ? kind : null);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1">
        <span className="text-xs text-muted-foreground">{t("team.code")}</span>
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            className="min-w-0 flex-1 truncate rounded-lg px-2 py-1 text-left font-mono text-sm tracking-[0.2em] hover:bg-muted disabled:pointer-events-none"
            disabled={!code}
            onClick={() => code && void copy("code", code)}
          >
            {code ?? "—"}
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("team.copyCode")}
            disabled={!code}
            onClick={() => code && void copy("code", code)}
          >
            <Copy size={16} />
          </Button>
          {onRefresh ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("team.refreshCode")}
              disabled={refreshing}
              onClick={onRefresh}
            >
              <RefreshCw size={16} />
            </Button>
          ) : null}
          {copied === "code" ? <span className="shrink-0 text-xs text-muted-foreground">{t("team.copied")}</span> : null}
        </div>
      </div>
      <div className="grid gap-1">
        <span className="text-xs text-muted-foreground">{t("team.inviteLink")}</span>
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            className="min-w-0 flex-1 truncate rounded-lg px-2 py-1 text-left text-sm hover:bg-muted disabled:pointer-events-none"
            disabled={!link}
            title={link}
            onClick={() => link && void copy("link", link)}
          >
            {link || "—"}
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("team.inviteLink")}
            disabled={!link}
            onClick={() => link && void copy("link", link)}
          >
            <Link2 size={16} />
          </Button>
          {copied === "link" ? <span className="shrink-0 text-xs text-muted-foreground">{t("team.copied")}</span> : null}
        </div>
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-2">{t("team.inviteLinkHint")}</p>
      {failed ? <p className="text-sm text-destructive sm:col-span-2">{t("team.copyFailed")}</p> : null}
    </div>
  );
}
