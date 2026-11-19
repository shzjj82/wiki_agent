import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import {
  buildSyncPlan,
  pickSyncPlan,
  requiredSyncKeys,
  runSyncPlan,
  syncItems,
  syncPlanSize,
  type SyncPlan,
} from "@/store/localSync";
import type { RemoteSession } from "@/store/remoteStore";
import { readSyncSettings, writeSyncSettings, type SyncSettings } from "@/store/syncSettings";

/** 登录后把本机页面同步到云端：先看摘要，再勾选清单。 */
export function useLocalSync({
  session,
  setHint,
  reloadPages,
}: {
  session: RemoteSession | null;
  setHint: Dispatch<SetStateAction<string>>;
  reloadPages: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [plan, setPlan] = useState<SyncPlan | null>(null);
  const [step, setStep] = useState<"summary" | "checklist" | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<SyncSettings>(readSyncSettings);

  useEffect(() => {
    setPlan(null);
    setStep(null);
    setError("");
    setDontAskAgain(false);
    if (!session) return;
    const next = readSyncSettings().enabled ? buildSyncPlan(session.username) : null;
    if (next && syncPlanSize(next) > 0) {
      setPlan(next);
      setStep("summary");
    }
  }, [session]);

  function updateSettings(next: SyncSettings) {
    writeSyncSettings(next);
    setSettings(next);
    if (!next.enabled) {
      setStep(null);
      setPlan(null);
      return;
    }
    if (session) {
      const rebuilt = buildSyncPlan(session.username);
      setPlan(syncPlanSize(rebuilt) > 0 ? rebuilt : null);
    }
  }

  function applyDontAskAgain() {
    if (dontAskAgain && settings.enabled) {
      writeSyncSettings({ enabled: false });
      setSettings({ enabled: false });
    }
  }

  function close() {
    if (syncing) return;
    applyDontAskAgain();
    setStep(null);
    setError("");
  }

  function openChecklist() {
    if (!plan) return;
    applyDontAskAgain();
    setPicked(new Set(syncItems(plan).map((item) => item.key)));
    setError("");
    setStep("checklist");
  }

  function toggle(key: string, on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function confirm() {
    if (!session || !plan) return;
    const chosen = pickSyncPlan(plan, picked);
    if (syncPlanSize(chosen) === 0) return;
    setSyncing(true);
    setError("");
    try {
      await runSyncPlan(session, chosen);
      const rest = buildSyncPlan(session.username);
      setPlan(syncPlanSize(rest) > 0 ? rest : null);
      setStep(null);
      setHint(t("app.syncedItems", { count: syncPlanSize(chosen) }));
      await reloadPages();
    } catch (err) {
      const rest = buildSyncPlan(session.username);
      setPlan(syncPlanSize(rest) > 0 ? rest : null);
      if (syncPlanSize(rest) === 0) setStep(null);
      setError(err instanceof Error ? err.message : t("app.syncFailed"));
    } finally {
      setSyncing(false);
    }
  }

  const items = plan ? syncItems(plan) : [];

  return {
    settings,
    updateSettings,
    /** 顶栏「同步本地页面」按钮上的数字；弹窗开着或没开同步时为 0 */
    pending: session && settings.enabled && plan && !step ? syncPlanSize(plan) : 0,
    openSummary: () => setStep("summary"),
    summaryProps: {
      open: step === "summary" && plan !== null,
      username: session?.username ?? "",
      items,
      dontAskAgain,
      onDontAskAgainChange: setDontAskAgain,
      onLater: close,
      onContinue: openChecklist,
    },
    checklistProps: {
      open: step === "checklist" && plan !== null,
      items,
      picked,
      required: plan ? requiredSyncKeys(plan, picked) : new Set<string>(),
      syncing,
      error,
      onToggle: toggle,
      onToggleAll: (on: boolean) => setPicked(on ? new Set(items.map((item) => item.key)) : new Set()),
      onBack: () => {
        setError("");
        setStep("summary");
      },
      onClose: close,
      onConfirm: () => void confirm(),
    },
  };
}
