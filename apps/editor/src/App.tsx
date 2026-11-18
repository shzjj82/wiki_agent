import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type EditorJS from "@editorjs/editorjs";
import { useTranslation } from "react-i18next";
import { ArrowCircleUp, CloudStorage, CloseSmall, Delete, Download, Export, HamburgerButton, HardDisk, MoreTwo, People, Redo, Search, Undo } from "@icon-park/react";
import type { EditorJsBlock, EditorJsDocument } from "@myblog/shared";
import { BlockEditor, type EditorHistoryApi } from "@/components/block-editor";
import type { PageLinkData } from "@/components/block-editor/tools/PageLinkTool";
import type { TodoBlockDetailRequest } from "@/components/block-editor/tools/TodoBlockTool";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { EditorSpotlight, type SpotlightAction } from "@/components/editor-spotlight";
import { EmptyState } from "@/components/empty-state";
import { FileDropZone } from "@/components/file-drop";
import { FileTypeIcon } from "@/components/file-type-icon";
import { FileViewer } from "@/components/file-viewer";
import { WikiChat } from "@/components/wiki-chat";
import { WorkDesk } from "@/components/work-desk";
import { ImportDialog, type ImportChoice } from "@/components/import-dialog";
import { LanguageSwitch } from "@/components/language-switch";
import { PwaInstallButton } from "@/components/pwa-install";
import { NotifyBell } from "@/components/notify-bell";
import { TodoDetailDialog, type TodoDetailTarget } from "@/components/notify-bell/TodoDetailDialog";
import { ShareDialog } from "@/components/share-dialog";
import { AppUpdateProvider, useAppUpdateUi } from "@/components/app-update";
import { SidebarSections } from "@/components/sidebar-sections";
import { isDesktopApp } from "@/lib/ai/skills";
import { SettingsMenu } from "@/components/settings-menu";
import { TeamDialog } from "@/components/team-dialog";
import { SyncChecklistDialog, SyncSummaryDialog } from "@/components/sync-dialogs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverSeparator, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/useMediaQuery";
import { useRevealCaret, useVisualViewport } from "@/lib/useKeyboardInset";
import {
  createLocal,
  ensureLocalPages,
  listLocal,
  loadLocal,
  removeLocal,
  reparentLocal,
  retitlePageLink,
  saveLocal,
  titleFromBody,
  withLivePageLinks,
  type EditorPage,
  type PageNode,
} from "@/store/localStore";
import {
  buildSyncPlan,
  pickSyncPlan,
  requiredSyncKeys,
  runSyncPlan,
  syncItems,
  syncPlanSize,
  type SyncPlan,
} from "@/store/localSync";
import {
  bindTodoPage,
  pageIdFromTodo,
  rememberTodoPage,
  todoNeedsPageBind,
  type NotifyTodo,
} from "@/store/notifyStore";
import {
  changePasswordRemote,
  createRemote,
  listRemote,
  loadRemote,
  loadSession,
  loginRemote,
  logoutRemote,
  registerRemote,
  removeRemote,
  reparentRemote,
  saveRemote,
  subscribeSession,
  type RemoteSession,
} from "@/store/remoteStore";
import { readSyncSettings, writeSyncSettings, type SyncSettings } from "@/store/syncSettings";
import {
  canManageTeam,
  canWriteTeam,
  dissolveTeam,
  leaveTeam,
  listTeams,
  readActiveTeamId,
  writeActiveTeamId,
  type TeamInfo,
} from "@/store/teamStore";
import { TeamListPanel } from "@/components/team-list-panel";
import { TeamManageSidebar } from "@/components/team-manage-sidebar";
import { pageTitle, setAppLocale, type AppLocale } from "@/i18n";
import { copyText } from "@/lib/clipboard";
import { documentFromMarkdown, titleFromMarkdown } from "@/lib/document/fromMarkdown";
import { exportDocument, type ExportFormat } from "@/lib/document/export";
import { fileKind, isImageFile } from "@/lib/document/fileKinds";
import { importSpreadsheet, importVideo, importWord, mergeImported, readInsertable, WORD_ACCEPT } from "@/lib/document/import";
import { imageBlockData } from "@/components/block-editor/tools/ImageBlockTool";
import { insertEditorBlocksAt, saveEditor } from "@/lib/document/insertBlocks";
import { loadSearchDocs, withLiveDocument } from "@/lib/document/search";
import {
  flushPendingAttachments,
  promoteAttachment,
  promoteDocument,
  saveAttachment,
  type AttachmentData,
} from "@/store/fileStore";
import { readAppLocation, takePendingPageId, writeAppLocation } from "@/lib/route";

const iconProps = { theme: "outline" as const, strokeWidth: 3, size: 16 };
const EMPTY_TEAMS: TeamInfo[] = [];
const SIDEBAR_WIDTH_KEY = "editor:sidebar-width";
const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 480;
function readSidebarWidth(): number {
  const raw = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
  if (!Number.isFinite(raw)) {
    return 260;
  }
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, raw));
}

type MenuRowProps = {
  icon?: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
};

/** 移动端「更多」菜单里的一行操作 */
function MenuRow({ icon, children, disabled, danger, onClick }: MenuRowProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm disabled:pointer-events-none disabled:opacity-50",
        danger ? "text-destructive hover:bg-destructive/10" : "hover:bg-muted",
      )}
      onClick={onClick}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

export function App() {
  return (
    <AppUpdateProvider>
      <AppMain />
    </AppUpdateProvider>
  );
}

function AppMain() {
  const { t, i18n } = useTranslation();
  const isMobile = useIsMobile();
  /** 可视视口（top + height）：外壳永远精确覆盖用户看到的那块区域 */
  const viewport = useVisualViewport();
  useRevealCaret(isMobile);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  /** 移动端编辑器底栏的挂载点：底栏由 BlockEditor 通过 portal 渲染进来，
      占据真实布局空间（在滚动区之后），因此永远不会跟着内容滚动 */
  const [barSlot, setBarSlot] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isMobile) {
      setSidebarOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile || !sidebarOpen) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobile, sidebarOpen]);
  const [session, setSession] = useState<RemoteSession | null>(() => loadSession());
  const [nodes, setNodes] = useState<PageNode[]>([]);
  const [page, setPage] = useState<EditorPage | null>(null);
  const [hint, setHint] = useState("");
  const [error, setError] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);
  const [query, setQuery] = useState("");
  /** 侧栏过滤用防抖后的关键字，避免每个字都重建整棵树 */
  const [sidebarQuery, setSidebarQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setSidebarQuery(query), 200);
    return () => window.clearTimeout(timer);
  }, [query]);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [sharePageId, setSharePageId] = useState<string | null>(null);
  const [shareEpoch, setShareEpoch] = useState(0);
  const appUpdate = useAppUpdateUi();
  const [syncPlan, setSyncPlan] = useState<SyncPlan | null>(null);
  const [syncStep, setSyncStep] = useState<"summary" | "checklist" | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [syncSettings, setSyncSettings] = useState<SyncSettings>(readSyncSettings);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [teamsReady, setTeamsReady] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [teamsListOpen, setTeamsListOpen] = useState(false);
  const [detailTeam, setDetailTeam] = useState<TeamInfo | null>(null);
  const [inviteTeam, setInviteTeam] = useState<TeamInfo | null>(null);
  const [leaveTarget, setLeaveTarget] = useState<TeamInfo | null>(null);
  const [dissolveTarget, setDissolveTarget] = useState<TeamInfo | null>(null);
  const [emptyTeamId, setEmptyTeamId] = useState<string | null>(null);
  const [teamPanel, setTeamPanel] = useState<"create" | "join">("create");
  const [activeTeamId, setActiveTeamId] = useState<string | null>(readActiveTeamId);
  const [exportOpen, setExportOpen] = useState(false);
  const [reveal, setReveal] = useState<{ text: string; nonce: number } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  /** 正在导入的 Word / Excel；index 只有拖入时才有，弹窗里选「作为附件」时插到这里 */
  const [pendingDrop, setPendingDrop] = useState<{ file: File; index: number | null } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [queuedDrop, setQueuedDrop] = useState<File[] | null>(null);
  const [viewing, setViewing] = useState<{ data: AttachmentData; replace: (next: AttachmentData) => void } | null>(null);
  const [todoDetail, setTodoDetail] = useState<TodoDetailTarget | null>(null);
  const [fileDeleteAsk, setFileDeleteAsk] = useState<{ name: string; resolve: (ok: boolean) => void } | null>(null);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [wikiOpen, setWikiOpen] = useState(false);
  const [wikiFocus, setWikiFocus] = useState(0);
  // 工作台还差得远，先不出现在界面上。
  const workEnabled = false;
  const [workOpen, setWorkOpen] = useState(false);
  const [workFocus, setWorkFocus] = useState(0);
  const [spotlightLaunch, setSpotlightLaunch] = useState<{
    actionId?: string;
    insertIndex: number;
    selection?: string;
  } | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const editorRef = useRef<EditorJS | null>(null);
  const nodesRef = useRef<PageNode[]>([]);
  nodesRef.current = nodes;
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;
  const saveTimer = useRef(0);
  const pageRef = useRef<EditorPage | null>(null);
  /** 正文编辑只写 pageRef，避免 setPage；此标记防止渲染时用过期 page state 盖掉草稿 */
  const draftDirtyRef = useRef(false);
  if (page?.id !== pageRef.current?.id) {
    draftDirtyRef.current = false;
    pageRef.current = page;
  } else if (!draftDirtyRef.current) {
    pageRef.current = page;
  }

  const openPageRef = useRef<(id: string, history?: "push" | "replace" | "none") => Promise<void>>(async () => undefined);

  useEffect(() => {
    const onPop = () => {
      const loc = readAppLocation();
      if (loc.pageId && loc.pageId !== pageRef.current?.id) {
        void openPageRef.current(loc.pageId, "none");
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const pageReadOnly = Boolean(
    teamsReady && page?.teamId && !canWriteTeam(teams.find((team) => team.id === page.teamId)?.role),
  );
  const readOnlyRef = useRef(pageReadOnly);
  readOnlyRef.current = pageReadOnly;
  /** 编辑器内部的撤销栈：顶栏按钮与 Cmd/Ctrl+Z 都走这里 */
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const historyRef = useRef<EditorHistoryApi | null>(null);
  const bindHistory = useCallback((api: EditorHistoryApi | null) => {
    historyRef.current = api;
    setHistoryState({ canUndo: api?.canUndo ?? false, canRedo: api?.canRedo ?? false });
  }, []);
  const sessionRef = useRef<RemoteSession | null>(session);
  sessionRef.current = session;
  const remote = session !== null;

  /**
   * Cmd/Ctrl+Z 撤销、Shift+Cmd/Ctrl+Z 或 Ctrl+Y 重做。
   * 编辑器之外的输入框（登录、搜索）留给浏览器原生撤销；编辑器里的输入一律走文档级历史，
   * 否则原生 undo 只改 DOM、不触发 onChange，存下来的还是改之前的内容。
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") {
        return;
      }
      const api = historyRef.current;
      if (!api || readOnlyRef.current) {
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      const inEditor = Boolean(target?.closest(".notion-editor"));
      if (!inEditor && target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      event.preventDefault();
      if (key === "y" || event.shiftKey) {
        api.redo();
      } else {
        api.undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => subscribeSession(setSession), []);

  const refreshLocal = useCallback((selectId?: string | null, history: "push" | "replace" = "replace") => {
    const list = listLocal();
    setNodes(list);
    let id = selectId === undefined ? (pageRef.current?.id ?? list[0]?.id) : (selectId ?? list[0]?.id);
    let loaded = id ? loadLocal(id) : undefined;
    if (!loaded && list[0] && id !== list[0].id) {
      id = list[0].id;
      loaded = loadLocal(id);
    }
    if (!loaded) {
      setPage(null);
      writeAppLocation(null, history);
      return;
    }
    const healed = withLivePageLinks(loaded, list);
    setPage(healed);
    writeAppLocation(healed.id, history);
    if (healed !== loaded) {
      saveLocal(healed);
      setNodes(listLocal());
    }
  }, []);

  /** 退出或换号后，还在路上的云端响应不能再写回界面 */
  const stale = (nextSession: RemoteSession) => sessionRef.current !== nextSession;

  const refreshRemote = useCallback(async (nextSession: RemoteSession, selectId?: string | null, history: "push" | "replace" = "replace") => {
    const list = await listRemote(nextSession);
    if (stale(nextSession)) {
      return;
    }
    setNodes(list);
    let id = selectId === undefined ? (pageRef.current?.id ?? list[0]?.id) : (selectId ?? list[0]?.id);
    if (!id) {
      setPage(null);
      writeAppLocation(null, history);
      return;
    }
    let loaded: EditorPage;
    try {
      loaded = await loadRemote(nextSession, id);
    } catch (err) {
      if (stale(nextSession) || !list[0] || id === list[0].id) {
        throw err;
      }
      id = list[0].id;
      loaded = await loadRemote(nextSession, id);
    }
    if (stale(nextSession)) {
      return;
    }
    const healed = withLivePageLinks(loaded, list);
    setPage(healed);
    writeAppLocation(healed.id, history);
    if (healed !== loaded) {
      void saveRemote(nextSession, healed).catch(() => undefined);
    }
  }, []);

  const openSpotlight = useCallback((opts?: { actionId?: string; insertIndex?: number; selection?: string }) => {
    const editor = editorRef.current;
    let index = opts?.insertIndex;
    if (typeof index !== "number" || index < 0) {
      const current = editor?.blocks.getCurrentBlockIndex();
      index = typeof current === "number" && current >= 0 ? current : 0;
    }
    setSpotlightLaunch({
      actionId: opts?.actionId,
      insertIndex: index,
      selection: opts?.selection,
    });
    setSpotlightOpen(true);
  }, []);

  const openWiki = useCallback(() => {
    if (!session) {
      setAuthOpen(true);
      return;
    }
    setViewing(null);
    setSpotlightOpen(false);
    setSpotlightLaunch(null);
    setWorkOpen(false);
    setWikiOpen(true);
    setWikiFocus((count) => count + 1);
  }, [session]);

  const openWork = useCallback(() => {
    if (!isDesktopApp()) {
      return;
    }
    if (!session) {
      setAuthOpen(true);
      return;
    }
    setViewing(null);
    setSpotlightOpen(false);
    setSpotlightLaunch(null);
    setWikiOpen(false);
    setWorkOpen(true);
    setWorkFocus((count) => count + 1);
  }, [session]);

  const loadAskPages = useCallback(async () => {
    const docs = await loadSearchDocs(session, nodes);
    const current = pageRef.current;
    const editor = editorRef.current;
    if (!current || !editor) {
      return docs;
    }
    try {
      return withLiveDocument(docs, {
        id: current.id,
        title: current.title,
        body: await saveEditor(editor),
        updatedAt: current.updatedAt,
      });
    } catch {
      return docs;
    }
  }, [session, nodes]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k" || event.isComposing) {
        return;
      }
      event.preventDefault();
      if (spotlightOpen) {
        setSpotlightOpen(false);
        setSpotlightLaunch(null);
        return;
      }
      openSpotlight();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [openSpotlight, spotlightOpen]);

  useEffect(() => {
    setError("");
    setHint("");
    setPage(null);
    setNodes([]);
    setSyncPlan(null);
    setSyncStep(null);
    setSyncError("");
    setDontAskAgain(false);
    if (!session) {
      setTeams([]);
      setTeamsReady(false);
      ensureLocalPages();
      refreshLocal(readAppLocation().pageId ?? takePendingPageId());
      return;
    }
    const settings = readSyncSettings();
    const plan = settings.enabled ? buildSyncPlan(session.username) : null;
    if (plan && syncPlanSize(plan) > 0) {
      setSyncPlan(plan);
      setSyncStep("summary");
    }
    void refreshRemote(session, readAppLocation().pageId ?? takePendingPageId())
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t("app.failedToLoadRemotePages"));
      })
      .then(() => flushPendingAttachments(session))
      .then((touched) => {
        if (touched && touched.length > 0) {
          setHint(t("attachment.promotedMany", { count: touched.length }));
        }
      })
      .catch(() => undefined);
    void listTeams(session)
      .then((list) => {
        if (sessionRef.current !== session) {
          return;
        }
        setTeams(list);
        setActiveTeamId((current) => {
          const next = current && list.some((team) => team.id === current) ? current : null;
          writeActiveTeamId(next);
          return next;
        });
      })
      .catch(() => undefined)
      .finally(() => {
        if (sessionRef.current === session) {
          setTeamsReady(true);
        }
      });
  }, [session, refreshLocal, refreshRemote]);

  useEffect(() => {
    if (!session) {
      return;
    }
    const onOnline = () => {
      void flushPendingAttachments(session)
        .then((touched) => {
          if (touched.length > 0) {
            setHint(t("attachment.promotedMany", { count: touched.length }));
          }
        })
        .catch(() => undefined);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [session]);

  function updateSyncSettings(next: SyncSettings) {
    writeSyncSettings(next);
    setSyncSettings(next);
    if (!next.enabled) {
      setSyncStep(null);
      setSyncPlan(null);
      return;
    }
    if (session) {
      const plan = buildSyncPlan(session.username);
      setSyncPlan(syncPlanSize(plan) > 0 ? plan : null);
    }
  }

  function applyDontAskAgain() {
    if (dontAskAgain && syncSettings.enabled) {
      writeSyncSettings({ enabled: false });
      setSyncSettings({ enabled: false });
    }
  }

  function closeSync() {
    if (syncing) {
      return;
    }
    applyDontAskAgain();
    setSyncStep(null);
    setSyncError("");
  }

  function openChecklist() {
    if (!syncPlan) {
      return;
    }
    applyDontAskAgain();
    setPicked(new Set(syncItems(syncPlan).map((item) => item.key)));
    setSyncError("");
    setSyncStep("checklist");
  }

  function togglePicked(key: string, on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  async function confirmSync() {
    if (!session || !syncPlan) {
      return;
    }
    const chosen = pickSyncPlan(syncPlan, picked);
    if (syncPlanSize(chosen) === 0) {
      return;
    }
    setSyncing(true);
    setSyncError("");
    try {
      await runSyncPlan(session, chosen);
      const rest = buildSyncPlan(session.username);
      setSyncPlan(syncPlanSize(rest) > 0 ? rest : null);
      setSyncStep(null);
      setHint(t("app.syncedItems", { count: syncPlanSize(chosen) }));
      await refreshRemote(session, null);
    } catch (err) {
      const rest = buildSyncPlan(session.username);
      setSyncPlan(syncPlanSize(rest) > 0 ? rest : null);
      if (syncPlanSize(rest) === 0) {
        setSyncStep(null);
      }
      setSyncError(err instanceof Error ? err.message : t("app.syncFailed"));
    } finally {
      setSyncing(false);
    }
  }

  function resetAuthFields() {
    setPassword("");
    setConfirm("");
    setNickname("");
    setError("");
  }

  function logout() {
    void logoutRemote(session);
    setSession(null);
    setTeamsListOpen(false);
    setEmptyTeamId(null);
    setDetailTeam(null);
    setInviteTeam(null);
    setWikiOpen(false);
    setWorkOpen(false);
    setAuthOpen(false);
    resetAuthFields();
  }

  async function exportPage(id: string, format: ExportFormat) {
    setError("");
    try {
      let body: EditorJsDocument | undefined;
      if (page?.id === id && editorRef.current) {
        body = (await editorRef.current.save()) as EditorJsDocument;
      } else if (session) {
        body = (await loadRemote(session, id)).body;
      } else {
        body = loadLocal(id)?.body;
      }
      if (!body) {
        throw new Error(t("app.pageNotFound"));
      }
      await exportDocument(format, titleFromBody(body), body);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("app.exportFailed"));
    }
  }

  async function revealPage(id: string, query: string) {
    if (pageRef.current?.id !== id) {
      await openPage(id);
    }
    setReveal({ text: query, nonce: Date.now() });
  }

  /** 切页前先落盘，避免子页面标题还在防抖里、父页面读到旧名称 */
  async function flushEditing() {
    const current = pageRef.current;
    const editor = editorRef.current;
    if (!current || !editor) {
      return;
    }
    window.clearTimeout(saveTimer.current);
    const body = (await editor.save()) as EditorJsDocument;
    window.clearTimeout(saveTimer.current);
    await persist({ ...current, body, title: titleFromBody(body) });
    window.clearTimeout(saveTimer.current);
  }

  async function openPage(id: string, history: "push" | "replace" | "none" = "push") {
    setTeamsListOpen(false);
    setEmptyTeamId(null);
    setSidebarOpen(false);
    if (history !== "none") {
      writeAppLocation(id, pageRef.current?.id === id ? "replace" : history);
    }
    setError("");
    setReveal(null);
    if (pageRef.current?.id !== id) {
      await flushEditing();
    }
    if (!session) {
      const loaded = loadLocal(id);
      if (!loaded) {
        setPage(null);
        return;
      }
      const healed = withLivePageLinks(loaded, listLocal());
      setPage(healed);
      if (healed !== loaded) {
        saveLocal(healed);
        setNodes(listLocal());
      }
      return;
    }
    const list = await listRemote(session);
    if (stale(session)) {
      return;
    }
    const loaded = await loadRemote(session, id);
    if (stale(session)) {
      return;
    }
    const healed = withLivePageLinks(loaded, list);
    setNodes(list);
    setPage(healed);
    if (healed !== loaded) {
      void saveRemote(session, healed).catch(() => undefined);
    }
  }
  openPageRef.current = openPage;

  async function createChildLink(): Promise<PageLinkData> {
    const parentId = pageRef.current?.id ?? null;
    if (!session) {
      const created = createLocal(parentId);
      setNodes(listLocal());
      return { pageId: created.id, slug: created.id, title: created.title };
    }
    const created = await createRemote(session, parentId);
    setNodes(await listRemote(session));
    return { pageId: created.id, slug: created.id, title: created.title };
  }

  /** 在父页面正文末尾补一个子页面链接；父页面正打开时先取编辑器里未保存的内容 */
  async function appendChildLink(parentId: string, link: PageLinkData) {
    const current = pageRef.current?.id === parentId ? pageRef.current : null;
    let body: EditorJsDocument | undefined;
    if (current && editorRef.current) {
      window.clearTimeout(saveTimer.current);
      body = (await editorRef.current.save()) as EditorJsDocument;
    }
    const block = { type: "pageLink", data: link };
    if (!session) {
      const parent = current ?? loadLocal(parentId);
      if (parent) {
        saveLocal({ ...parent, body: { ...(body ?? parent.body), blocks: [...(body ?? parent.body).blocks, block] } });
      }
      return;
    }
    const parent = current ?? (await loadRemote(session, parentId));
    await saveRemote(session, { ...parent, body: { ...(body ?? parent.body), blocks: [...(body ?? parent.body).blocks, block] } });
  }

  async function createPage(parentId: string | null, teamId?: string | null) {
    setTeamsListOpen(false);
    setEmptyTeamId(null);
    setError("");
    try {
      const inherited = parentId ? (nodes.find((node) => node.id === parentId)?.teamId ?? null) : null;
      const preferredTeam = teamId !== undefined ? teamId : activeTeamId;
      const writingTeam =
        !parentId && preferredTeam && canWriteTeam(teams.find((team) => team.id === preferredTeam)?.role) ? preferredTeam : null;
      if (teamId !== undefined) {
        writeActiveTeamId(teamId);
        setActiveTeamId(teamId);
      }
      const created = session ? await createRemote(session, parentId, inherited || writingTeam) : createLocal(parentId);
      if (parentId) {
        await appendChildLink(parentId, { pageId: created.id, slug: created.id, title: created.title });
      }
      if (session) {
        await refreshRemote(session, created.id, "push");
      } else {
        refreshLocal(created.id, "push");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("app.failedToCreatePage"));
    }
  }

  /** 打开待办关联的文档。历史无页待办先补绑当前页或本机记住的页面，再跳转 */
  async function writeTodoPage(todo: NotifyTodo) {
    if (!session) {
      throw new Error(t("notify.actionFailed"));
    }
    setError("");
    let pageId = pageIdFromTodo(todo);
    if (!pageId && todo.data?.legacyWithoutPage) {
      pageId = pageRef.current?.id ?? null;
    }
    if (!pageId) {
      throw new Error(t("notify.pageMissing"));
    }
    if (todoNeedsPageBind(todo)) {
      await bindTodoPage(session, todo.id, pageId);
    }
    rememberTodoPage(todo.id, pageId);
    await openPage(pageId);
  }

  async function readImport(file: File) {
    setError("");
    setPendingDrop({ file, index: null });
    setImportOpen(true);
  }

  function closeImport() {
    if (importBusy) {
      return;
    }
    setImportOpen(false);
    setPendingDrop(null);
  }

  async function applyImport(mode: ImportChoice) {
    const current = pageRef.current;
    const drop = pendingDrop;
    if (!drop || !current) {
      return;
    }
    setImportBusy(true);
    setError("");
    try {
      if (mode === "attach") {
        await insertDropped([drop.file], drop.index ?? dropIndex(null));
      } else {
        const kind = fileKind(drop.file.name);
        const imported =
          kind === "excel"
            ? await importSpreadsheet(drop.file)
            : kind === "video"
              ? await importVideo(drop.file, uploadFile)
              : await importWord(drop.file, uploadFile);
        const body = editorRef.current ? ((await editorRef.current.save()) as EditorJsDocument) : current.body;
        onEdit(mergeImported(mode, body, imported));
        setEditorEpoch((value) => value + 1);
      }
      setImportOpen(false);
      setPendingDrop(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("app.importFailed"));
    } finally {
      setImportBusy(false);
    }
  }

  async function uploadFile(file: File): Promise<AttachmentData> {
    const { data, localOnly } = await saveAttachment(session, file);
    if (localOnly) {
      setHint(t("attachment.savedLocally"));
    }
    return data;
  }

  function confirmDeleteFile(name: string): Promise<boolean> {
    return new Promise((resolve) => setFileDeleteAsk({ name, resolve }));
  }

  function answerDeleteFile(ok: boolean) {
    fileDeleteAsk?.resolve(ok);
    setFileDeleteAsk(null);
  }

  /** 上传服务当时不可用而存在本机的附件，打开时再补传一次，成功后块数据改指向云端 */
  async function promoteViewing(blob: Blob) {
    const current = viewing;
    if (!session || !current || current.data.source !== "local") {
      return;
    }
    const next = await promoteAttachment(session, current.data, blob).catch(() => null);
    if (next) {
      current.replace(next);
      setHint(t("attachment.promoted"));
    }
  }

  /** 按松手位置落在哪个块的上半或下半，算出插入下标；标题块始终在最前 */
  function dropIndex(point: { x: number; y: number } | null): number {
    const editor = editorRef.current;
    if (!editor) {
      return 0;
    }
    const total = editor.blocks.getBlocksCount();
    const floor = editor.blocks.getBlockByIndex(0)?.name === "header" ? 1 : 0;
    const target = point ? document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>(".ce-block") : null;
    const blocks = Array.from(document.querySelectorAll<HTMLElement>(".notion-editor .ce-block"));
    const at = target ? blocks.indexOf(target) : -1;
    if (at < 0) {
      return total;
    }
    const rect = target!.getBoundingClientRect();
    return Math.max(floor, point!.y > rect.top + rect.height / 2 ? at + 1 : at);
  }

  /** 拖入：Markdown / 文本转成正文，图片插入为图片，Word、PDF、Excel、视频、代码作为附件，其他提示不支持 */
  async function insertDropped(files: File[], index: number) {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const blocks: EditorJsBlock[] = [];
    const skipped: string[] = [];
    setHint(t("attachment.processing"));
    try {
      for (const file of files) {
        const content = await readInsertable(file);
        if (isImageFile(file)) {
          blocks.push({ type: "image", data: imageBlockData(await uploadFile(file)) });
        } else if (content) {
          blocks.push(...content);
        } else if (fileKind(file.name)) {
          blocks.push({ type: "attachment", data: await uploadFile(file) });
        } else {
          skipped.push(file.name);
        }
      }
      await insertEditorBlocksAt(editor, blocks, index);
      setHint("");
      if (skipped.length > 0) {
        setError(t("attachment.unsupported", { name: skipped.join(t("common.listSeparator")) }));
      }
    } catch (err) {
      setHint("");
      setError(err instanceof Error ? err.message : t("attachment.uploadFailed"));
    }
  }

  async function dropFiles(files: File[], point: { x: number; y: number } | null) {
    setError("");
    if (!pageRef.current || !editorRef.current) {
      setQueuedDrop(files);
      await createPage(null);
      return;
    }
    const index = dropIndex(point);
    const [single] = files;
    const kind = single && files.length === 1 ? fileKind(single.name) : null;
    if (single && (kind === "word" || kind === "excel" || kind === "video")) {
      setPendingDrop({ file: single, index });
      setImportOpen(true);
      return;
    }
    await insertDropped(files, index);
  }

  useEffect(() => {
    if (queuedDrop && editorReady && page) {
      setQueuedDrop(null);
      void dropFiles(queuedDrop, null);
    }
  }, [queuedDrop, editorReady, page?.id]);

  function patchSidebarNode(page: EditorPage) {
    setNodes((prev) => {
      let changed = false;
      const next = prev.map((node) => {
        if (node.id !== page.id) {
          return node;
        }
        if (
          node.title === page.title &&
          node.updatedAt === page.updatedAt &&
          node.parentId === page.parentId &&
          (node.teamId ?? null) === (page.teamId ?? null)
        ) {
          return node;
        }
        changed = true;
        return {
          id: page.id,
          title: page.title,
          parentId: page.parentId,
          updatedAt: page.updatedAt,
          teamId: page.teamId,
        };
      });
      return changed ? next : prev;
    });
  }

  function onEdit(body: EditorJsDocument) {
    const current = pageRef.current;
    if (!current || readOnlyRef.current) {
      return;
    }
    const title = titleFromBody(body);
    const next = { ...current, body, title };
    // 正文编辑只更新 ref，避免整壳因 setPage 重渲；标题变了才同步侧栏
    draftDirtyRef.current = true;
    pageRef.current = next;
    if (title !== current.title) {
      setPage(next);
      setNodes((prev) => prev.map((node) => (node.id === next.id ? { ...node, title: next.title } : node)));
    }
    window.clearTimeout(saveTimer.current);
    setHint((prev) => (prev === t("app.saving") ? prev : t("app.saving")));
    saveTimer.current = window.setTimeout(() => void persist(next), 700);
  }

  async function mirrorParentLink(active: RemoteSession, child: EditorPage) {
    if (!child.parentId || pageRef.current?.id === child.parentId) {
      return;
    }
    const parent = await loadRemote(active, child.parentId);
    const body = retitlePageLink(parent.body, child.id, child.title);
    if (!body) {
      return;
    }
    await saveRemote(active, { ...parent, body });
  }

  async function persist(next: EditorPage): Promise<boolean> {
    const viewingId = pageRef.current?.id;
    try {
      if (!session) {
        const saved = saveLocal(next);
        if (pageRef.current?.id === viewingId && viewingId === next.id) {
          draftDirtyRef.current = false;
          pageRef.current = saved;
          setPage(saved);
        }
        patchSidebarNode(saved);
      } else {
        const { body } = await promoteDocument(session, next.body);
        const saved = await saveRemote(session, { ...next, body });
        if (saved.parentId && pageRef.current?.id !== saved.parentId) {
          await mirrorParentLink(session, saved).catch(() => undefined);
        }
        if (stale(session)) {
          return true;
        }
        if (pageRef.current?.id === next.id) {
          draftDirtyRef.current = false;
          pageRef.current = saved;
          setPage(saved);
        }
        patchSidebarNode(saved);
      }
      setHint(t("app.saved"));
      setError("");
      return true;
    } catch (err) {
      setHint("");
      setError(err instanceof Error ? err.message : t("app.failedToSave"));
      return false;
    }
  }

  /** 编辑器会按新语言重建，先把编辑器里的最新内容存下来 */
  async function switchLocale(locale: AppLocale) {
    const current = pageRef.current;
    if (current && editorRef.current) {
      window.clearTimeout(saveTimer.current);
      const body = (await editorRef.current.save()) as EditorJsDocument;
      if (!(await persist({ ...current, body, title: titleFromBody(body) }))) {
        return;
      }
    }
    await setAppLocale(locale);
    setHint("");
    setError("");
  }

  function descendantIds(rootId: string): string[] {
    const drop = new Set<string>([rootId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const node of nodes) {
        if (node.parentId && drop.has(node.parentId) && !drop.has(node.id)) {
          drop.add(node.id);
          grew = true;
        }
      }
    }
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const depthOf = (id: string) => {
      let depth = 0;
      let current = byId.get(id);
      const seen = new Set<string>();
      while (current?.parentId && !seen.has(current.id)) {
        seen.add(current.id);
        depth += 1;
        current = byId.get(current.parentId);
      }
      return depth;
    };
    return [...drop].sort((a, b) => depthOf(b) - depthOf(a));
  }

  async function movePage(id: string, parentId: string | null) {
    const currentId = pageRef.current?.id ?? null;
    const source = nodes.find((node) => node.id === id);
    const touched = new Set([id, parentId, source?.parentId ?? null]);
    setError("");
    try {
      if (!session) {
        reparentLocal(id, parentId);
        if (currentId && currentId !== id && touched.has(currentId)) {
          setEditorEpoch((value) => value + 1);
        }
        refreshLocal(currentId);
        return;
      }
      await reparentRemote(session, id, parentId);
      if (currentId && currentId !== id && touched.has(currentId)) {
        setEditorEpoch((value) => value + 1);
      }
      await refreshRemote(session, currentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("app.failedToMovePage"));
    }
  }

  function removePage(id: string) {
    setPendingDeleteId(id);
  }

  async function confirmRemove() {
    const id = pendingDeleteId;
    if (!id) {
      return;
    }
    setPendingDeleteId(null);
    setError("");
    try {
      if (!session) {
        removeLocal(id);
        setPage(null);
        refreshLocal(null);
        return;
      }
      for (const targetId of descendantIds(id)) {
        await removeRemote(session, targetId);
      }
      setPage(null);
      await refreshRemote(session, null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("app.failedToDelete"));
    }
  }

  async function submitAuth() {
    const user = username.trim();
    if (!user || !password) {
      setError(t("app.credentialsRequired"));
      return;
    }
    if (joining && password !== confirm) {
      setError(t("app.passwordsMismatch"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = joining
        ? await registerRemote(user, password, nickname.trim() || undefined)
        : await loginRemote(user, password);
      resetAuthFields();
      setUsername("");
      setAuthOpen(false);
      setSession(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : joining ? t("common.signUpFailed") : t("common.loginFailed"));
    } finally {
      setBusy(false);
    }
  }

  const sidebarHandlers = useRef({
    openPage,
    createPage,
    removePage,
    movePage,
    exportPage,
    canWriteTeamId: (teamId: string) => canWriteTeam(teams.find((team) => team.id === teamId)?.role),
  });
  sidebarHandlers.current = {
    openPage,
    createPage,
    removePage,
    movePage,
    exportPage,
    canWriteTeamId: (teamId: string) => canWriteTeam(teams.find((team) => team.id === teamId)?.role),
  };
  const onSidebarOpen = useCallback((id: string) => void sidebarHandlers.current.openPage(id), []);
  const onSidebarCreateChild = useCallback((parentId: string) => void sidebarHandlers.current.createPage(parentId), []);
  const onSidebarCreateInSection = useCallback((teamId: string | null) => void sidebarHandlers.current.createPage(null, teamId), []);
  const onSidebarDelete = useCallback((id: string) => sidebarHandlers.current.removePage(id), []);
  const onSidebarReparent = useCallback((id: string, parentId: string | null) => void sidebarHandlers.current.movePage(id, parentId), []);
  const onSidebarExport = useCallback((id: string, format: ExportFormat) => void sidebarHandlers.current.exportPage(id, format), []);
  const onSidebarShare = useCallback((id: string) => setSharePageId(id), []);
  const canCreateInTeam = useCallback((teamId: string) => sidebarHandlers.current.canWriteTeamId(teamId), []);

  if (authOpen && !session) {
    return (
      <div className="relative flex min-h-svh items-center justify-center bg-muted p-6">
        <div className="absolute top-3 right-6">
          <LanguageSwitch onChange={(locale) => void switchLocale(locale)} />
        </div>
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <img src="/logo.png" alt="" className="size-7 rounded-md" />
              {joining ? t("app.signUp") : t("app.logIn")}
            </CardTitle>
            <CardDescription>
              {joining ? t("app.signUpHint") : t("app.loginHint")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void submitAuth();
              }}
            >
              <div className="grid gap-2">
                <Label htmlFor="username">{t("app.username")}</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  placeholder={t("app.usernameHint")}
                />
              </div>
              {joining ? (
                <div className="grid gap-2">
                  <Label htmlFor="nickname">{t("app.nicknameOptional")}</Label>
                  <Input
                    id="nickname"
                    value={nickname}
                    onChange={(event) => setNickname(event.target.value)}
                    autoComplete="nickname"
                    placeholder={t("app.defaultsToYourUsername")}
                  />
                </div>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor="password">{t("app.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={joining ? "new-password" : "current-password"}
                  placeholder={joining ? t("common.atLeast6Characters") : undefined}
                />
              </div>
              {joining ? (
                <div className="grid gap-2">
                  <Label htmlFor="confirm">{t("app.confirmPassword")}</Label>
                  <Input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              ) : null}
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy
                  ? joining
                    ? t("app.signingUp")
                    : t("app.loggingIn")
                  : joining
                    ? t("app.signUp")
                    : t("app.logIn")}
              </Button>
            </form>
            <Button
              type="button"
              variant="ghost"
              className="mt-2 w-full"
              onClick={() => {
                setJoining((value) => !value);
                setError("");
              }}
            >
              {joining ? t("app.haveAnAccountLogIn") : t("app.noAccountSignUp")}
            </Button>
            <Button
              type="button"
              variant="link"
              className="w-full"
              onClick={() => {
                setAuthOpen(false);
                resetAuthFields();
              }}
            >
              {t("app.keepEditingLocally")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  function startSidebarResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidthRef.current;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (ev: PointerEvent) => {
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidth + ev.clientX - startX));
      sidebarWidthRef.current = next;
      setSidebarWidth(next);
    };
    const stop = (ev: PointerEvent) => {
      if (target.hasPointerCapture(ev.pointerId)) {
        target.releasePointerCapture(ev.pointerId);
      }
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidthRef.current));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  return (
    <div
      /* 整个外壳钉在“可视视口”上（top 跟随 offsetTop、height = 可视高度）：
         键盘弹出 / iOS 平移可视视口露光标时，外壳始终精确覆盖用户看到的那块区域，
         底栏（布局流内）正好贴住键盘上沿；文档没有可滚动内容，iOS 无法平移页面 */
      className="fixed inset-x-0 grid overflow-hidden bg-background"
      style={{
        gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : `${sidebarWidth}px minmax(0, 1fr)`,
        top: viewport.top,
        height: viewport.height,
      }}
    >
      {isMobile && sidebarOpen ? (
        <button
          type="button"
          aria-label={t("app.closePageList")}
          className="fixed inset-0 z-40 bg-foreground/25 backdrop-blur-[1px]"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <aside
        className={cn(
          "relative flex h-full min-h-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar px-3 py-4 text-sidebar-foreground",
          isMobile &&
            "fixed inset-y-0 left-0 z-50 w-[min(84vw,320px)] transition-transform duration-200 ease-out",
          // 阴影只在打开时挂：关闭态若保留，12px 偏移 + 32px 模糊会从屏幕左缘渗进来
          isMobile && sidebarOpen && "translate-x-0 shadow-[12px_0_32px_rgb(0_0_0/0.14)]",
          isMobile && !sidebarOpen && "-translate-x-full shadow-none",
        )}
        aria-hidden={isMobile && !sidebarOpen}
        style={
          isMobile
            ? {
                paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
                paddingTop: "max(1rem, env(safe-area-inset-top))",
                paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
              }
            : undefined
        }
      >
        {isMobile ? (
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="truncate px-1 text-sm font-semibold text-foreground">{t("app.title")}</span>
            <Button type="button" variant="ghost" size="icon" aria-label={t("app.closePageList")} onClick={() => setSidebarOpen(false)}>
              <CloseSmall {...iconProps} />
            </Button>
          </div>
        ) : null}
        <div className="relative mb-3">
          <Search
            {...iconProps}
            size={14}
            className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("app.search")}
            aria-label={t("app.search")}
            className="h-8 bg-background pl-7"
          />
        </div>
        <SidebarSections
          nodes={nodes}
          teams={session ? teams : EMPTY_TEAMS}
          query={sidebarQuery}
          selectedId={page?.id}
          shareEpoch={shareEpoch}
          session={session}
          canCreateInTeam={canCreateInTeam}
          onCreateInSection={onSidebarCreateInSection}
          onCreateTeam={
            session
              ? () => {
                  setTeamPanel("create");
                  setTeamOpen(true);
                }
              : undefined
          }
          onJoinTeam={
            session
              ? () => {
                  setTeamPanel("join");
                  setTeamOpen(true);
                }
              : undefined
          }
          onTeamDetails={session ? (team) => setDetailTeam(team) : undefined}
          onInviteTeam={session ? (team) => setInviteTeam(team) : undefined}
          onLeaveTeam={session ? (team) => setLeaveTarget(team) : undefined}
          onDissolveTeam={session ? (team) => setDissolveTarget(team) : undefined}
          onOpenEmptyTeam={session ? (teamId) => setEmptyTeamId(teamId) : undefined}
          onOpen={onSidebarOpen}
          onCreateChild={onSidebarCreateChild}
          onDelete={onSidebarDelete}
          onReparent={onSidebarReparent}
          onExport={onSidebarExport}
          onShare={session ? onSidebarShare : undefined}
        />
        <div className="mt-3 flex items-center gap-0.5 border-t border-sidebar-border px-1 pt-3 text-xs text-muted-foreground">
          {session ? (
            <>
              <div className="min-w-0 flex-1">
                <SettingsMenu
                  label={session.username}
                  settings={syncSettings}
                  onChange={updateSyncSettings}
                  onLogout={logout}
                  onChangePassword={() => setPasswordOpen(true)}
                  onCreateTeam={() => {
                    setTeamPanel("create");
                    setTeamOpen(true);
                  }}
                  onJoinTeam={() => {
                    setTeamPanel("join");
                    setTeamOpen(true);
                  }}
                  teamMode={activeTeamId !== null}
                  canSwitchTeam={teams.length > 0}
                  canManageTeam={canManageTeam(teams.find((team) => team.id === activeTeamId)?.role)}
                  onManageTeam={() => {
                    const current = teams.find((team) => team.id === activeTeamId);
                    if (current) setDetailTeam(current);
                  }}
                  onToggleTeamMode={() => {
                    if (teams.length === 0) {
                      return;
                    }
                    if (activeTeamId) {
                      writeActiveTeamId(null);
                      setActiveTeamId(null);
                      return;
                    }
                    const next = teams[0];
                    writeActiveTeamId(next.id);
                    setActiveTeamId(next.id);
                  }}
                />
              </div>
              <NotifyBell session={session} onWriteTodo={(todo) => writeTodoPage(todo)} onOpenPage={(id) => openPage(id)} />
            </>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <Button type="button" variant="ghost" size="sm" className="min-w-0 flex-1 justify-start" onClick={() => setAuthOpen(true)}>
                <People {...iconProps} />
                {t("app.logIn")}
              </Button>
              {appUpdate.available ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("appUpdate.availableShort")}
                  title={t("appUpdate.availableShort")}
                  onClick={() => appUpdate.openAvailable()}
                >
                  <ArrowCircleUp {...iconProps} />
                </Button>
              ) : null}
            </div>
          )}
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t("app.resizeSidebar")}
          className={cn(
            "absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize touch-none hover:bg-foreground/15",
            isMobile && "hidden",
          )}
          onPointerDown={startSidebarResize}
        />
      </aside>
      <main className="flex h-full min-h-0 min-w-0 flex-col bg-background">
        <header
          className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 pt-2 pb-1 text-xs text-muted-foreground sm:gap-4 sm:border-b-0 sm:px-6 sm:pt-3 sm:pb-0"
          /* 安全距离用内联 style：避免 Tailwind px-* / pt-* 的覆盖顺序不确定 */
          style={
            isMobile
              ? {
                  paddingTop: "max(0.5rem, env(safe-area-inset-top))",
                  paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
                  paddingRight: "max(0.75rem, env(safe-area-inset-right))",
                  // 头部不可滚：把竖划手势拦掉，否则 iOS 会拖动整页导致外壳抖动
                  touchAction: "none",
                }
              : undefined
          }
        >
          <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 sm:gap-3">
            {isMobile ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("app.openPageList")}
                aria-expanded={sidebarOpen}
                onClick={() => setSidebarOpen(true)}
              >
                <HamburgerButton {...iconProps} />
              </Button>
            ) : null}
            <span className="inline-flex shrink-0 items-center gap-1.5">
              {remote ? <CloudStorage {...iconProps} size={14} /> : <HardDisk {...iconProps} size={14} />}
              <span className="hidden sm:inline">{remote ? t("app.remote") : t("app.local")}</span>
            </span>
            <span className={cn("min-w-0 truncate", error && "text-destructive")}>{error || hint}</span>
          </span>
          <input
            ref={importInputRef}
            type="file"
            accept={WORD_ACCEPT}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) {
                void readImport(file);
              }
            }}
          />
          {teamsListOpen ? (
            <Button type="button" variant="ghost" size="icon" aria-label={t("team.close")} onClick={() => setTeamsListOpen(false)}>
              <CloseSmall {...iconProps} />
            </Button>
          ) : (
          <>
          {/* 桌面端：完整按钮组 */}
          <span className="hidden shrink-0 items-center gap-2 sm:inline-flex">
            {session && syncSettings.enabled && syncPlan && !syncStep ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setSyncStep("summary")}>
                <CloudStorage {...iconProps} />
                {t("common.syncLocalPages")} · {syncPlanSize(syncPlan)}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t("app.undo")}
              disabled={!page || emptyTeamId !== null || pageReadOnly || !historyState.canUndo}
              onClick={() => historyRef.current?.undo()}
            >
              <Undo {...iconProps} />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t("app.redo")}
              disabled={!page || emptyTeamId !== null || pageReadOnly || !historyState.canRedo}
              onClick={() => historyRef.current?.redo()}
            >
              <Redo {...iconProps} />
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={!page || emptyTeamId !== null} onClick={() => importInputRef.current?.click()}>
              <Download {...iconProps} />
              {t("common.import")}
            </Button>
            <Popover open={exportOpen} onOpenChange={setExportOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" disabled={!page || emptyTeamId !== null}>
                  <Export {...iconProps} />
                  {t("app.export")}
                </Button>
              </PopoverTrigger>
              <PopoverContent>
                {(["pdf", "word"] as const).map((format) => (
                  <button
                    key={format}
                    type="button"
                    className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-muted"
                    onClick={() => {
                      setExportOpen(false);
                      if (page) {
                        void exportPage(page.id, format);
                      }
                    }}
                  >
                    <FileTypeIcon type={format} />
                    {format === "pdf" ? t("common.exportPdf") : t("common.exportWord")}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <Button type="button" variant="outline" size="sm" disabled={!page || emptyTeamId !== null || pageReadOnly} onClick={() => page && void removePage(page.id)}>
              <Delete {...iconProps} />
              {t("common.delete")}
            </Button>
            <Button type="button" variant="outline" size="icon" aria-label={t("wikiAsk.title")} onClick={openWiki}>
              <span className="text-[11px] font-semibold leading-none tracking-wide">AI</span>
            </Button>
            {workEnabled ? (
              <Button type="button" variant="outline" size="sm" aria-label={t("work.title")} onClick={openWork}>
                {t("work.title")}
              </Button>
            ) : null}
            <LanguageSwitch onChange={(locale) => void switchLocale(locale)} />
            <PwaInstallButton variant="header" />
          </span>
          {/* 移动端：更多菜单 + AI */}
          <span className="inline-flex shrink-0 items-center gap-1 sm:hidden">
            <Popover open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="icon" aria-label={t("app.moreActions")}>
                  <MoreTwo {...iconProps} />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-1">
                {session && syncSettings.enabled && syncPlan && !syncStep ? (
                  <>
                    <MenuRow
                      icon={<CloudStorage {...iconProps} />}
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setSyncStep("summary");
                      }}
                    >
                      {t("common.syncLocalPages")} · {syncPlanSize(syncPlan)}
                    </MenuRow>
                    <PopoverSeparator />
                  </>
                ) : null}
                <MenuRow
                  icon={<Download {...iconProps} />}
                  disabled={!page || emptyTeamId !== null}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    importInputRef.current?.click();
                  }}
                >
                  {t("common.import")}
                </MenuRow>
                <MenuRow
                  icon={<FileTypeIcon type="pdf" />}
                  disabled={!page || emptyTeamId !== null}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    if (page) void exportPage(page.id, "pdf");
                  }}
                >
                  {t("common.exportPdf")}
                </MenuRow>
                <MenuRow
                  icon={<FileTypeIcon type="word" />}
                  disabled={!page || emptyTeamId !== null}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    if (page) void exportPage(page.id, "word");
                  }}
                >
                  {t("common.exportWord")}
                </MenuRow>
                <MenuRow
                  icon={<Delete {...iconProps} />}
                  danger
                  disabled={!page || emptyTeamId !== null || pageReadOnly}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    if (page) void removePage(page.id);
                  }}
                >
                  {t("common.delete")}
                </MenuRow>
                <PopoverSeparator />
                <PwaInstallButton variant="menu" onOpen={() => setMobileMenuOpen(false)} />
                <div className="flex items-center justify-between gap-2 px-2 py-1">
                  <span className="text-xs text-muted-foreground">{t("common.language")}</span>
                  <LanguageSwitch onChange={(locale) => void switchLocale(locale)} />
                </div>
              </PopoverContent>
            </Popover>
            <Button type="button" variant="outline" size="icon" aria-label={t("wikiAsk.title")} onClick={openWiki}>
              <span className="text-[11px] font-semibold leading-none tracking-wide">AI</span>
            </Button>
            {workEnabled ? (
              <Button type="button" variant="outline" size="sm" aria-label={t("work.title")} onClick={openWork}>
                {t("work.title")}
              </Button>
            ) : null}
          </span>
          </>
          )}
        </header>
        <FileDropZone
          hasPage={Boolean(page) && !teamsListOpen && !emptyTeamId}
          className="min-h-0 flex-1"
          onDrop={(files, point) => void dropFiles(files, point)}
        >
          {emptyTeamId ? (
            <EmptyState hasPages={false} onCreate={() => void createPage(null, emptyTeamId)} />
          ) : teamsListOpen && session ? (
            <TeamListPanel
              session={session}
              teams={teams}
              onChanged={() => {
                void listTeams(session).then((list) => {
                  if (sessionRef.current === session) setTeams(list);
                });
              }}
              onManage={(team) => setDetailTeam(team)}
            />
          ) : page ? (
            <BlockEditor
              key={`${remote ? "remote" : "local"}:${page.id}:${editorEpoch}:${i18n.language}:${pageReadOnly ? "ro" : "rw"}`}
              doc={page.body}
              pageId={page.id}
              readOnly={pageReadOnly}
              onChange={onEdit}
              onOpenPage={(id) => void openPage(id)}
              onCreateChild={createChildLink}
              resolvePageTitle={(pageId) => nodesRef.current.find((node) => node.id === pageId)?.title}
              onReady={(editor) => {
                editorRef.current = editor;
                setEditorReady(Boolean(editor));
              }}
              onAi={(index) => openSpotlight({ actionId: "ai-chat", insertIndex: index })}
              onAskSelection={(text) => openSpotlight({ actionId: "ai-chat", selection: text })}
              onUploadFile={uploadFile}
              onUploadError={setError}
              onOpenFile={(data, replace) => {
                setWikiOpen(false);
                setWorkOpen(false);
                setViewing({ data, replace });
              }}
              onConfirmDeleteFile={confirmDeleteFile}
              onHistory={bindHistory}
              barSlot={barSlot}
              reveal={reveal}
              onTodoDetail={(request: TodoBlockDetailRequest) => setTodoDetail({ mode: "block", request })}
            />
          ) : (
            <EmptyState hasPages={nodes.length > 0} onCreate={() => void createPage(null)} />
          )}
        </FileDropZone>
        {/* 底栏挂在滚动区之后：滚动区到这里结束，底栏不会盖正文，也滚不动 */}
        <div ref={setBarSlot} className="shrink-0" />
      </main>
      <TodoDetailDialog
        session={session}
        target={todoDetail}
        dueLabel=""
        onClose={() => setTodoDetail(null)}
      />
      {viewing ? (
        <FileViewer
          key={viewing.data.fileId}
          file={viewing.data}
          session={session}
          onLoaded={(blob) => void promoteViewing(blob)}
          className="file-viewer-drawer fixed top-0 right-0 bottom-0 z-40 shadow-[-12px_0_32px_rgb(0_0_0/0.08)]"
          onClose={() => setViewing(null)}
        />
      ) : null}
      <EditorSpotlight
        open={spotlightOpen}
        onOpenChange={(open) => {
          setSpotlightOpen(open);
          if (!open) {
            setSpotlightLaunch(null);
          }
        }}
        actions={
          [
            {
              id: "ai-chat",
              title: t("app.aiChatTitle"),
              chip: t("app.aiChatChip"),
              subtitle: t("app.aiChatSubtitle"),
              keywords: "ai 写作 助手 聊天 chat gpt 智能 bubble",
              icon: "robot",
            },
            {
              id: "wiki-ask",
              title: t("wikiAsk.title"),
              subtitle: t("wikiAsk.subtitle"),
              keywords: t("wikiAsk.keywords"),
              icon: "search",
            },
            ...(workEnabled
              ? [
                  {
                    id: "work-desk",
                    title: t("work.title"),
                    subtitle: t("work.subtitle"),
                    keywords: t("work.keywords"),
                    icon: "search" as const,
                  },
                ]
              : []),
          ] satisfies SpotlightAction[]
        }
        editor={editorReady ? editorRef.current : null}
        insertIndex={spotlightLaunch?.insertIndex ?? 0}
        launchActionId={spotlightLaunch?.actionId}
        selection={spotlightLaunch?.selection}
        loadPages={loadAskPages}
        onOpenPage={(id, query) => void revealPage(id, query)}
        onAskWiki={openWiki}
        onAskWork={openWork}
      />
      <WikiChat
        open={wikiOpen}
        focusToken={wikiFocus}
        loggedIn={Boolean(session)}
        loadPages={loadAskPages}
        onClose={() => setWikiOpen(false)}
        onLogin={() => {
          setWikiOpen(false);
          setAuthOpen(true);
        }}
      />
      {workEnabled ? (
        <WorkDesk
          open={workOpen}
          focusToken={workFocus}
          loggedIn={Boolean(session)}
          onClose={() => setWorkOpen(false)}
          onLogin={() => {
            setWorkOpen(false);
            setAuthOpen(true);
          }}
          onDeliver={async (markdown) => {
            const body = documentFromMarkdown(markdown);
            const title = titleFromMarkdown(markdown, t("work.resultReady"));
            const writingTeam =
              activeTeamId && canWriteTeam(teams.find((team) => team.id === activeTeamId)?.role) ? activeTeamId : null;
            const created = session
              ? await createRemote(session, null, writingTeam, { title, body })
              : createLocal(null, { title, body });
            if (session) {
              await refreshRemote(session, created.id);
            } else {
              refreshLocal(created.id);
            }
            return { id: created.id, title: created.title || title };
          }}
          onOpenResult={(id) => {
            setWorkOpen(false);
            void openPage(id);
          }}
        />
      ) : null}
      <Dialog open={fileDeleteAsk !== null} onOpenChange={(open) => !open && answerDeleteFile(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("attachment.deleteTitle")}</DialogTitle>
            <DialogDescription>{t("attachment.deleteConfirm", { name: fileDeleteAsk?.name ?? "" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => answerDeleteFile(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" className="bg-destructive text-white hover:bg-destructive/90" onClick={() => answerDeleteFile(true)}>
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={dissolveTarget !== null} onOpenChange={(open) => !open && setDissolveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("team.dissolve")}</DialogTitle>
            <DialogDescription>{t("team.dissolveConfirm", { name: dissolveTarget?.name ?? "" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDissolveTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                const target = dissolveTarget;
                if (!session || !target) return;
                setDissolveTarget(null);
                void dissolveTeam(session, target.id)
                  .then(async () => {
                    if (activeTeamId === target.id) {
                      writeActiveTeamId(null);
                      setActiveTeamId(null);
                    }
                    if (emptyTeamId === target.id) setEmptyTeamId(null);
                    if (detailTeam?.id === target.id) setDetailTeam(null);
                    if (inviteTeam?.id === target.id) setInviteTeam(null);
                    const list = await listTeams(session);
                    if (sessionRef.current === session) setTeams(list);
                    await refreshRemote(session, pageRef.current?.teamId === target.id ? null : pageRef.current?.id);
                  })
                  .catch((err: unknown) => setError(err instanceof Error ? err.message : t("team.failed")));
              }}
            >
              {t("team.dissolve")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={leaveTarget !== null} onOpenChange={(open) => !open && setLeaveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("team.leave")}</DialogTitle>
            <DialogDescription>{t("team.leaveConfirm", { name: leaveTarget?.name ?? "" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLeaveTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                const target = leaveTarget;
                if (!session || !target) return;
                setLeaveTarget(null);
                void leaveTeam(session, target.id)
                  .then(async () => {
                    if (activeTeamId === target.id) {
                      writeActiveTeamId(null);
                      setActiveTeamId(null);
                    }
                    if (emptyTeamId === target.id) setEmptyTeamId(null);
                    if (detailTeam?.id === target.id) setDetailTeam(null);
                    if (inviteTeam?.id === target.id) setInviteTeam(null);
                    const list = await listTeams(session);
                    if (sessionRef.current === session) setTeams(list);
                    await refreshRemote(session, pageRef.current?.teamId === target.id ? null : pageRef.current?.id);
                  })
                  .catch((err: unknown) => setError(err instanceof Error ? err.message : t("team.failed")));
              }}
            >
              {t("team.leave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={pendingDeleteId !== null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("app.deletePage")}</DialogTitle>
            <DialogDescription>
              {(() => {
                const title = pageTitle(nodes.find((node) => node.id === pendingDeleteId)?.title);
                return t("app.deletePageConfirm", { title });
              })()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingDeleteId(null)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" className="bg-destructive text-white hover:bg-destructive/90" onClick={() => void confirmRemove()}>
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ImportDialog
        open={importOpen}
        busy={importBusy}
        fileName={pendingDrop?.file.name ?? ""}
        fileSize={pendingDrop?.file.size}
        allowAttach={pendingDrop?.index != null}
        kind={pendingDrop && fileKind(pendingDrop.file.name) === "excel" ? "excel" : pendingDrop && fileKind(pendingDrop.file.name) === "video" ? "video" : "word"}
        onCancel={closeImport}
        onConfirm={(mode) => void applyImport(mode)}
      />
      {session ? (
        <TeamManageSidebar
          session={session}
          team={detailTeam}
          open={detailTeam !== null}
          onClose={() => setDetailTeam(null)}
          onChanged={() => {
            void listTeams(session).then((list) => {
              if (sessionRef.current === session) setTeams(list);
            });
          }}
        />
      ) : null}
      {session ? (
        <TeamDialog
          open={teamOpen}
          session={session}
          onActiveTeam={(id) => {
            writeActiveTeamId(id);
            setActiveTeamId(id);
          }}
          onChange={() =>
            listTeams(session).then((list) => {
              setTeams(list);
              if (session) {
                void refreshRemote(session, pageRef.current?.id ?? null);
              }
            })
          }
          onClose={() => setTeamOpen(false)}
          panel={teamPanel}
        />
      ) : null}
      <Dialog open={inviteTeam !== null} onOpenChange={(open) => !open && setInviteTeam(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("team.inviteMembers")}</DialogTitle>
            <DialogDescription>{t("team.inviteHint")}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 font-mono text-sm tracking-[0.2em]">{inviteTeam?.code ?? "—"}</p>
            {inviteTeam?.code ? (
              <Button type="button" variant="outline" onClick={() => void copyText(inviteTeam.code ?? "")}>
                {t("team.copyCode")}
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      {session && sharePageId ? (
        <ShareDialog
          session={session}
          pageId={sharePageId}
          title={pageTitle(nodes.find((node) => node.id === sharePageId)?.title)}
          onClose={() => setSharePageId(null)}
          onShared={() => setShareEpoch((n) => n + 1)}
        />
      ) : null}
      <ChangePasswordDialog
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
        onSubmit={async (oldPassword, newPassword) => {
          if (!session) {
            throw new Error(t("app.pleaseLogInFirst"));
          }
          await changePasswordRemote(session, oldPassword, newPassword);
          setHint(t("app.passwordChanged"));
        }}
      />
      <SyncSummaryDialog
        open={syncStep === "summary" && syncPlan !== null}
        username={session?.username ?? ""}
        items={syncPlan ? syncItems(syncPlan) : []}
        dontAskAgain={dontAskAgain}
        onDontAskAgainChange={setDontAskAgain}
        onLater={closeSync}
        onContinue={openChecklist}
      />
      <SyncChecklistDialog
        open={syncStep === "checklist" && syncPlan !== null}
        items={syncPlan ? syncItems(syncPlan) : []}
        picked={picked}
        required={syncPlan ? requiredSyncKeys(syncPlan, picked) : new Set()}
        syncing={syncing}
        error={syncError}
        onToggle={togglePicked}
        onToggleAll={(on) => setPicked(on && syncPlan ? new Set(syncItems(syncPlan).map((item) => item.key)) : new Set())}
        onBack={() => {
          setSyncError("");
          setSyncStep("summary");
        }}
        onClose={closeSync}
        onConfirm={() => void confirmSync()}
      />
    </div>
  );
}
