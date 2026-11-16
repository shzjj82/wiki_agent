import { useEffect, useRef, useState } from "react";
import { Check, Copy, Down } from "@icon-park/react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { t } from "@/i18n";
import { copyText } from "@/lib/clipboard";
import { iconParkOutline } from "@/lib/iconPark";
import { CODE_LANGUAGES, codeLanguageLabel } from "@/lib/document/codeLint";
import { cn } from "@/lib/utils";

const quietButton =
  "h-7 gap-1 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground focus-visible:border-transparent focus-visible:ring-0";

type CodeBlockBarProps = {
  language: string;
  readOnly: boolean;
  getCode: () => string;
  onLanguage: (language: string) => void;
};

/** 代码块顶栏：语言用弹出菜单，复制是图标加文字 */
export function CodeBlockBar({ language, readOnly, getCode, onLanguage }: CodeBlockBarProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const label = codeLanguageLabel(language);

  useEffect(() => {
    if (!open) {
      return;
    }
    listRef.current?.querySelector<HTMLElement>("[data-selected='true']")?.scrollIntoView({ block: "nearest" });
  }, [open]);

  return (
    <div className="cdx-code__top">
      {readOnly ? (
        <span className="px-2 text-[13px] text-muted-foreground">{label}</span>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className={quietButton} aria-label={t("code.language")}>
              {label}
              <Down {...iconParkOutline} size={12} />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="max-h-72 w-44 overflow-y-auto p-1"
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <div ref={listRef} className="flex flex-col gap-0.5">
              {CODE_LANGUAGES.map((item) => {
                const name = item.id === "plain" ? t("code.plain") : item.label;
                const selected = item.id === language;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-selected={selected}
                    className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-muted"
                    onClick={() => {
                      onLanguage(item.id);
                      setOpen(false);
                    }}
                  >
                    <Check {...iconParkOutline} size={14} className={cn("shrink-0", selected ? "opacity-100" : "opacity-0")} />
                    {name}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(quietButton, "ml-auto")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          void copyText(getCode()).then((ok) => {
            if (!ok) {
              return;
            }
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          });
        }}
      >
        <Copy {...iconParkOutline} size={14} />
        {copied ? t("code.copied") : t("code.copy")}
      </Button>
    </div>
  );
}
