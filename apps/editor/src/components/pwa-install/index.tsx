import { useEffect, useState } from "react";
import { Install } from "@icon-park/react";
import { useTranslation } from "react-i18next";
import { isDesktopApp } from "@/lib/ai/skills";
import { Button } from "@/components/ui/button";

const iconProps = { theme: "outline" as const, strokeWidth: 3, size: 16 };

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function runningInstalled(): boolean {
  if (typeof window === "undefined" || isDesktopApp()) {
    return true;
  }
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function canInstallNow(): boolean {
  return Boolean(deferred) && !runningInstalled();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

/** 安全上下文里注册空的 Service Worker，浏览器才允许安装到桌面。桌面客户端不注册。 */
export function registerPwa(): void {
  if (!window.isSecureContext || !("serviceWorker" in navigator) || isDesktopApp()) {
    return;
  }
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

type Props = {
  variant: "header" | "menu";
  onOpen?: () => void;
};

/** 浏览器允许安装时才出现。点一下直接弹出系统安装框。 */
export function PwaInstallButton({ variant, onOpen }: Props) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(canInstallNow);

  useEffect(() => {
    const sync = () => setVisible(canInstallNow());
    listeners.add(sync);
    const media = window.matchMedia("(display-mode: standalone)");
    media.addEventListener("change", sync);
    return () => {
      listeners.delete(sync);
      media.removeEventListener("change", sync);
    };
  }, []);

  if (!visible) {
    return null;
  }

  async function install() {
    const promptEvent = deferred;
    if (!promptEvent) {
      return;
    }
    onOpen?.();
    deferred = null;
    emit();
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome !== "accepted") {
      deferred = promptEvent;
      emit();
    }
  }

  const label = t("pwa.install");

  if (variant === "header") {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => void install()}>
        <Install {...iconProps} />
        {label}
      </Button>
    );
  }

  return (
    <button
      type="button"
      className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted"
      onClick={() => void install()}
    >
      <Install {...iconProps} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}
