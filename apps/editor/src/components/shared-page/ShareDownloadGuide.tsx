import { useEffect, useState } from "react";
import { Download } from "@icon-park/react";
import { useTranslation } from "react-i18next";
import { latestDownloadPageUrl } from "@/store/shareStore";

const iconProps = { theme: "outline" as const, strokeWidth: 3, size: 14 };

type VersionFile = {
  os?: string;
  url?: string;
  available?: boolean;
  optional?: boolean;
};

function currentOs(): "mac" | "win" {
  const ua = navigator.userAgent;
  return /Mac|iPhone|iPad/i.test(ua) ? "mac" : "win";
}

/** 从下载页同源的 /version.json 取出当前系统的最新安装包。取不到就只引导到下载页。 */
async function latestFileUrl(pageUrl: string): Promise<{ version: string; url: string } | null> {
  const endpoint = new URL("/version.json", pageUrl);
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) return null;
  const data = (await response.json()) as { version?: string; files?: VersionFile[] };
  const version = typeof data.version === "string" ? data.version : "";
  const os = currentOs();
  const files = (data.files ?? []).filter((file) => file.os === os && file.available !== false && file.url);
  const file = files.find((item) => !item.optional) ?? files[0];
  if (!file?.url) return version ? { version, url: pageUrl } : null;
  return { version, url: file.url };
}

export function ShareDownloadGuide() {
  const { t } = useTranslation();
  const pageUrl = latestDownloadPageUrl();
  const [href, setHref] = useState(pageUrl);
  const [version, setVersion] = useState("");

  useEffect(() => {
    let gone = false;
    void latestFileUrl(pageUrl)
      .then((next) => {
        if (gone || !next) return;
        setHref(next.url);
        setVersion(next.version);
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [pageUrl]);

  const label = version ? t("share.downloadLatestVersion", { version }) : t("share.downloadLatest");

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground sm:px-6">
      <p className="min-w-0 flex-1">{t("share.downloadGuide")}</p>
      <a
        href={href}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-foreground px-2.5 py-1.5 font-medium text-background"
        {...(href === pageUrl ? {} : { download: "" })}
      >
        <Download {...iconProps} />
        {label}
      </a>
    </div>
  );
}
