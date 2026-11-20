import { useCallback, useEffect, useRef, useState } from "react";
import type EditorJS from "@editorjs/editorjs";
import { useTranslation } from "react-i18next";
import type { EditorHistoryApi } from "@/components/block-editor";
import { EditorSpotlight, type SpotlightAction } from "@/components/editor-spotlight";
import { EditorWorkspace } from "@/components/editor-workspace";
import { FileViewer } from "@/components/file-viewer";
import { WikiChat } from "@/components/wiki-chat";
import { WorkDesk } from "@/components/work-desk";
import { ImportDialog } from "@/components/import-dialog";
import { ConflictDialog } from "@/components/conflict-dialog";
import { TodoDetailDialog, type TodoDetailTarget } from "@/components/notify-bell/TodoDetailDialog";
import { isDesktopApp } from "@/lib/ai/skills";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createLocal, ensureLocalPages, type EditorPage, type PageNode } from "@/store/localStore";
import { createRemote } from "@/store/remoteStore";
import { canWriteTeam } from "@/store/teamStore";
import { pageTitle } from "@/i18n";
import { documentFromMarkdown, titleFromMarkdown } from "@/lib/document/fromMarkdown";
import { fileKind } from "@/lib/document/fileKinds";
import { saveEditor } from "@/lib/document/insertBlocks";
import { loadSearchDocs, withLiveDocument } from "@/lib/document/search";
import { flushPendingAttachments } from "@/store/fileStore";
import { readAppLocation } from "@/lib/route";
import { usePageCatalog } from "@/hooks/usePageCatalog";
import { usePageActions } from "@/hooks/usePageActions";
import { usePageCommands, useWorkspace } from "@/layouts/workspace/context";

function importKind(file: File | undefined): "word" | "excel" | "video" {
  const kind = file ? fileKind(file.name) : null;
  return kind === "excel" || kind === "video" ? kind : "word";
}

/** `/app`、`/app/:pageId`、`/app/join/:code` 共用这一个视图，地址只决定打开哪篇文档。侧栏和团队弹窗在 WorkspaceLayout 里。 */
export function EditorView() {
  const { t, i18n } = useTranslation();
  const {
    isMobile,
    session,
    sessionRef,
    nodes,
    setNodes,
    teams,
    teamsReady,
    activeTeamId,
    setHint,
    setError,
    sidebarOpen,
    setSidebarOpen,
    setSelectedPageId,
    openLogin,
    sync,
  } = useWorkspace();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  /** 移动端编辑器底栏的挂载点：底栏由 BlockEditor 通过 portal 渲染进来，
      占据真实布局空间（在滚动区之后），因此永远不会跟着内容滚动 */
  const [barSlot, setBarSlot] = useState<HTMLDivElement | null>(null);
  const [page, setPage] = useState<EditorPage | null>(null);
  const [emptyTeamId, setEmptyTeamId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [todoDetail, setTodoDetail] = useState<TodoDetailTarget | null>(null);
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
  const pageRef = useRef<EditorPage | null>(null);
  /** 正文编辑只写 pageRef，避免 setPage；此标记防止渲染时用过期 page state 盖掉草稿 */
  const draftDirtyRef = useRef(false);
  if (page?.id !== pageRef.current?.id) {
    draftDirtyRef.current = false;
    pageRef.current = page;
  } else if (!draftDirtyRef.current) {
    pageRef.current = page;
  }

  useEffect(() => setSelectedPageId(page?.id ?? null), [page?.id, setSelectedPageId]);
  useEffect(() => () => setSelectedPageId(null), [setSelectedPageId]);

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

  const { refreshLocal, refreshRemote } = usePageCatalog({ pageRef, sessionRef, setNodes, setPage });
  const {
    openPageRef,
    conflict,
    resolveConflict,
    importState,
    viewing,
    setViewing,
    fileDeleteAsk,
    pendingDeleteId,
    cancelRemove,
    reveal,
    editorEpoch,
    openPage,
    createPage,
    createChildLink,
    writeTodoPage,
    readImport,
    closeImport,
    applyImport,
    uploadFile,
    confirmDeleteFile,
    answerDeleteFile,
    promoteViewing,
    dropFiles,
    onEdit,
    switchLocale,
    movePage,
    removePage,
    confirmRemove,
    exportPage,
    revealPage,
  } = usePageActions({
    page,
    setPage,
    pageRef,
    draftDirtyRef,
    editorRef,
    editorReady,
    readOnlyRef,
    refreshLocal,
    refreshRemote,
    setEmptyTeamId,
  });

  useEffect(() => {
    const onPop = () => {
      const loc = readAppLocation();
      if (loc.pageId && loc.pageId !== pageRef.current?.id) {
        void openPageRef.current(loc.pageId, "none");
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [openPageRef]);

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
      openLogin();
      return;
    }
    setViewing(null);
    setSpotlightOpen(false);
    setSpotlightLaunch(null);
    setWorkOpen(false);
    setWikiOpen(true);
    setWikiFocus((count) => count + 1);
  }, [session, openLogin, setViewing]);

  const openWork = useCallback(() => {
    if (!isDesktopApp()) {
      return;
    }
    if (!session) {
      openLogin();
      return;
    }
    setViewing(null);
    setSpotlightOpen(false);
    setSpotlightLaunch(null);
    setWikiOpen(false);
    setWorkOpen(true);
    setWorkFocus((count) => count + 1);
  }, [session, openLogin, setViewing]);

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

  /** 换号或退出：清掉上一个账号的文档和面板，再按地址重新打开。 */
  useEffect(() => {
    setPage(null);
    setNodes([]);
    setEmptyTeamId(null);
    setWikiOpen(false);
    setWorkOpen(false);
    if (!session) {
      ensureLocalPages();
      refreshLocal(readAppLocation().pageId);
      return;
    }
    void refreshRemote(session, readAppLocation().pageId)
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

  usePageCommands({
    openPage: (id) => openPage(id),
    createPage,
    removePage,
    movePage,
    exportPage,
    writeTodoPage,
    openEmptyTeam: setEmptyTeamId,
    reloadPages: async (selectId) => {
      if (session) {
        await refreshRemote(session, selectId);
      } else {
        refreshLocal(selectId);
      }
    },
    teamRemoved: async (teamId) => {
      setEmptyTeamId((current) => (current === teamId ? null : current));
      if (session) {
        await refreshRemote(session, pageRef.current?.teamId === teamId ? null : pageRef.current?.id);
      }
    },
  });

  return (
    <>
      <EditorWorkspace
        isMobile={isMobile}
        sidebarOpen={sidebarOpen}
        onOpenSidebar={() => setSidebarOpen(true)}
        remote={remote}
        importInputRef={importInputRef}
        onImportFile={(file) => void readImport(file)}
        syncPending={sync.pending}
        onOpenSync={sync.open}
        page={page}
        emptyTeamId={emptyTeamId}
        pageReadOnly={pageReadOnly}
        canUndo={historyState.canUndo}
        canRedo={historyState.canRedo}
        onUndo={() => historyRef.current?.undo()}
        onRedo={() => historyRef.current?.redo()}
        exportOpen={exportOpen}
        onExportOpen={setExportOpen}
        onExport={(format) => {
          if (page) void exportPage(page.id, format);
        }}
        onDeletePage={() => {
          if (page) void removePage(page.id);
        }}
        onOpenWiki={openWiki}
        workEnabled={workEnabled}
        onOpenWork={openWork}
        onSwitchLocale={(locale) => void switchLocale(locale)}
        mobileMenuOpen={mobileMenuOpen}
        onMobileMenu={setMobileMenuOpen}
        onDrop={(files, point) => void dropFiles(files, point)}
        nodes={nodes}
        editorEpoch={editorEpoch}
        language={i18n.language}
        onEdit={onEdit}
        onOpenPage={(id) => void openPage(id)}
        onCreateChild={createChildLink}
        resolvePageTitle={(pageId) => nodesRef.current.find((node) => node.id === pageId)?.title}
        onEditorReady={(editor) => {
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
        onBarSlot={setBarSlot}
        reveal={reveal}
        onTodoDetail={(request) => setTodoDetail({ mode: "block", request })}
        onCreatePage={(parentId, teamId) => void createPage(parentId, teamId)}
      />

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
          openLogin();
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
            openLogin();
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
      <ConflictDialog conflict={conflict} onResolve={(choices, ai) => void resolveConflict(choices, ai)} />
      <Dialog open={pendingDeleteId !== null} onOpenChange={(open) => !open && cancelRemove()}>
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
            <Button type="button" variant="outline" onClick={cancelRemove}>
              {t("common.cancel")}
            </Button>
            <Button type="button" className="bg-destructive text-white hover:bg-destructive/90" onClick={() => void confirmRemove()}>
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ImportDialog
        open={importState.open}
        busy={importState.busy}
        fileName={importState.drop?.file.name ?? ""}
        fileSize={importState.drop?.file.size}
        allowAttach={importState.drop?.index != null}
        kind={importKind(importState.drop?.file)}
        onCancel={closeImport}
        onConfirm={(mode) => void applyImport(mode)}
      />
    </>
  );
}
