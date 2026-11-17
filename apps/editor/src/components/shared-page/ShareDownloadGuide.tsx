import { Download } from "@icon-park/react";
import { useTranslation } from "react-i18next";
import { latestDownloadPageUrl } from "@/store/shareStore";

const iconProps = { theme: "outline" as const, strokeWidth: 3, size: 14 };

/** 只打开下载页。页面自己选当前能下的最新安装包，这里不写死版本。 */
export function ShareDownloadGuide() {
  const { t } = useTranslation();

  return (
    <a
      href={latestDownloadPageUrl()}
      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[0.8rem] font-medium text-foreground hover:bg-muted"
    >
      <Download {...iconProps} />
      {t("share.downloadLatest")}
    </a>
  );
}
