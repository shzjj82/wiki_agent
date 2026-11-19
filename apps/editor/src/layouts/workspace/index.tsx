import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { AppUpdateProvider, useAppUpdateUi } from "@/components/app-update";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { EditorSidebar, readSidebarWidth } from "@/components/editor-sidebar";
import { ShareDialog } from "@/components/share-dialog";
import { SyncChecklistDialog, SyncSummaryDialog } from "@/components/sync-dialogs";
import { TeamDialog } from "@/components/team-dialog";
import { TeamInviteDialog } from "@/components/team-invite-dialog";
import { TeamJoinDialog } from "@/components/team-join-dialog";
import { TeamManageSidebar } from "@/components/team-manage-sidebar";
import { TeamMembershipDialogs } from "@/components/team-membership-dialogs";
import { useTeamJoin } from "@/hooks/useTeamJoin";
import { pageTitle } from "@/i18n";
import type { ExportFormat } from "@/lib/document/export";
import { appPagePath, loginPath } from "@/lib/route";
import { useIsMobile } from "@/lib/useMediaQuery";
import { useRevealCaret, useVisualViewport } from "@/lib/useKeyboardInset";
import { ensureLocalPages, listLocal, type PageNode } from "@/store/localStore";
import { pageIdFromTodo, type NotifyTodo } from "@/store/notifyStore";
import { changePasswordRemote, listRemote, loadSession, logoutRemote, subscribeSession, type RemoteSession } from "@/store/remoteStore";
import { canWriteTeam, listTeams, readActiveTeamId, writeActiveTeamId, type TeamInfo } from "@/store/teamStore";
import { WorkspaceContext, WorkspaceStatusContext, type PageCommands, type WorkspaceContextValue } from "./context";
import { useLocalSync } from "./useLocalSync";

const EMPTY_TEAMS: TeamInfo[] = [];

/**
 * `/app` 下所有页面共用的外壳：左侧栏 + 右侧 `<Outlet />`。
 * 登录状态、页面树、团队、本地同步和团队相关弹窗都放在这里，换子页面也不会丢。
 */
export function WorkspaceLayout() {
  return (
    <AppUpdateProvider>
      <WorkspaceShell />
    </AppUpdateProvider>
  );
}

function WorkspaceShell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  /** 可视视口（top + height）：外壳永远精确覆盖用户看到的那块区域 */
  const viewport = useVisualViewport();
  useRevealCaret(isMobile);
  const appUpdate = useAppUpdateUi();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;
  const [query, setQuery] = useState("");
  /** 侧栏过滤用防抖后的关键字，避免每个字都重建整棵树 */
  const [sidebarQuery, setSidebarQuery] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setSidebarQuery(query), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!isMobile) setSidebarOpen(false);
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile || !sidebarOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobile, sidebarOpen]);

  const [session, setSession] = useState<RemoteSession | null>(() => loadSession());
  const sessionRef = useRef<RemoteSession | null>(session);
  sessionRef.current = session;
  useEffect(() => subscribeSession(setSession), []);

  const [nodes, setNodes] = useState<PageNode[]>([]);
  const [hint, setHint] = useState("");
  const [error, setError] = useState("");
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const teamsRef = useRef(teams);
  teamsRef.current = teams;
  const [teamsReady, setTeamsReady] = useState(false);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(readActiveTeamId);

  const [selectedPageId, setSelectedState] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const setSelectedPageId = useCallback((id: string | null) => {
    selectedRef.current = id;
    setSelectedState(id);
  }, []);
  const commandsRef = useRef<PageCommands | null>(null);

  const [teamOpen, setTeamOpen] = useState(false);
  const [teamPanel, setTeamPanel] = useState<"create" | "join">("create");
  const [detailTeam, setDetailTeam] = useState<TeamInfo | null>(null);
  const [inviteTeam, setInviteTeam] = useState<TeamInfo | null>(null);
  const [dissolveTarget, setDissolveTarget] = useState<TeamInfo | null>(null);
  const [leaveTarget, setLeaveTarget] = useState<TeamInfo | null>(null);
  const [sharePageId, setSharePageId] = useState<string | null>(null);
  const [shareEpoch, setShareEpoch] = useState(0);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const openLogin = useCallback((replace = false) => navigate(loginPath(), { replace }), [navigate]);
  /** 只取侧栏的页面树。编辑器页会连同当前文档一起加载，用不到这里 */
  const loadNodes = useCallback(async (current: RemoteSession | null) => {
    if (!current) {
      ensureLocalPages();
      setNodes(listLocal());
      return;
    }
    const list = await listRemote(current);
    if (sessionRef.current === current) setNodes(list);
  }, []);
  const reloadPages = useCallback(
    (selectId?: string | null) => commandsRef.current?.reloadPages(selectId) ?? loadNodes(sessionRef.current),
    [loadNodes],
  );
  const reloadTeams = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    void listTeams(current)
      .then((list) => {
        if (sessionRef.current === current) setTeams(list);
      })
      .catch(() => undefined);
  }, []);

  function chooseActiveTeam(id: string | null) {
    writeActiveTeamId(id);
    setActiveTeamId(id);
  }

  useEffect(() => {
    setError("");
    setHint("");
    if (!session) {
      setTeams([]);
      setTeamsReady(false);
      return;
    }
    void listTeams(session)
      .then((list) => {
        if (sessionRef.current !== session) return;
        setTeams(list);
        setActiveTeamId((current) => {
          const next = current && list.some((team) => team.id === current) ? current : null;
          writeActiveTeamId(next);
          return next;
        });
      })
      .catch(() => undefined)
      .finally(() => {
        if (sessionRef.current === session) setTeamsReady(true);
      });
  }, [session]);

  /** 子页面注册了页面操作就由它加载（子组件的 effect 先于外壳执行）；否则外壳自己填侧栏。 */
  useEffect(() => {
    if (commandsRef.current) return;
    setNodes([]);
    void loadNodes(session).catch(() => undefined);
  }, [session, loadNodes]);

  const sync = useLocalSync({ session, setHint, reloadPages: () => reloadPages(null) });

  const { joinPrompt, joinBusy, cancelJoin, confirmJoin } = useTeamJoin({
    session,
    sessionRef,
    pageIdRef: selectedRef,
    onNeedLogin: () => openLogin(true),
    setTeams,
    setActiveTeamId,
    setHint,
    setError,
  });

  function logout() {
    void logoutRemote(session);
    setSession(null);
    setDetailTeam(null);
    setInviteTeam(null);
    setError("");
  }

  const onSidebarOpen = useCallback(
    (id: string) => {
      const commands = commandsRef.current;
      if (commands) {
        void commands.openPage(id);
        return;
      }
      setSidebarOpen(false);
      navigate(appPagePath(id));
    },
    [navigate],
  );
  const onSidebarCreateChild = useCallback((parentId: string) => void commandsRef.current?.createPage(parentId), []);
  const onSidebarCreateInSection = useCallback((teamId: string | null) => void commandsRef.current?.createPage(null, teamId), []);
  const onSidebarDelete = useCallback((id: string) => commandsRef.current?.removePage(id), []);
  const onSidebarReparent = useCallback((id: string, parentId: string | null) => void commandsRef.current?.movePage(id, parentId), []);
  const onSidebarExport = useCallback((id: string, format: ExportFormat) => void commandsRef.current?.exportPage(id, format), []);
  const onSidebarShare = useCallback((id: string) => setSharePageId(id), []);
  const canCreateInTeam = useCallback(
    (teamId: string) => canWriteTeam(teamsRef.current.find((team) => team.id === teamId)?.role),
    [],
  );

  async function writeTodoPage(todo: NotifyTodo) {
    const commands = commandsRef.current;
    if (commands) {
      await commands.writeTodoPage(todo);
      return;
    }
    const pageId = pageIdFromTodo(todo);
    if (pageId) onSidebarOpen(pageId);
  }

  const syncPending = sync.pending;
  const openSync = sync.openSummary;
  const context = useMemo<WorkspaceContextValue>(
    () => ({
      isMobile,
      session,
      sessionRef,
      nodes,
      setNodes,
      teams,
      teamsReady,
      activeTeamId,
      setActiveTeamId,
      setHint,
      setError,
      sidebarOpen,
      setSidebarOpen,
      setSelectedPageId,
      openLogin,
      sync: { pending: syncPending, open: openSync },
      commandsRef,
    }),
    [isMobile, session, nodes, teams, teamsReady, activeTeamId, sidebarOpen, setSelectedPageId, openLogin, syncPending, openSync],
  );
  const status = useMemo(() => ({ hint, error }), [hint, error]);

  return (
    <WorkspaceContext.Provider value={context}>
      <WorkspaceStatusContext.Provider value={status}>
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
        <EditorSidebar
          isMobile={isMobile}
          open={sidebarOpen}
          widthRef={sidebarWidthRef}
          onWidth={setSidebarWidth}
          onClose={() => setSidebarOpen(false)}
          query={query}
          onQuery={setQuery}
          nodes={nodes}
          teams={session ? teams : EMPTY_TEAMS}
          sidebarQuery={sidebarQuery}
          selectedId={selectedPageId ?? undefined}
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
          onOpenEmptyTeam={session ? (teamId) => commandsRef.current?.openEmptyTeam(teamId) : undefined}
          onOpen={onSidebarOpen}
          onOpenPage={onSidebarOpen}
          onCreateChild={onSidebarCreateChild}
          onDelete={onSidebarDelete}
          onReparent={onSidebarReparent}
          onExport={onSidebarExport}
          onShare={session ? onSidebarShare : undefined}
          syncSettings={sync.settings}
          onSyncSettings={sync.updateSettings}
          onLogout={logout}
          onChangePassword={() => setPasswordOpen(true)}
          teamMode={activeTeamId !== null}
          canSwitchTeam={teams.length > 0}
          onManageTeam={() => {
            const current = teams.find((team) => team.id === activeTeamId);
            if (current) setDetailTeam(current);
          }}
          onToggleTeamMode={() => {
            if (teams.length === 0) return;
            chooseActiveTeam(activeTeamId ? null : teams[0].id);
          }}
          onWriteTodo={writeTodoPage}
          updateAvailable={appUpdate.available}
          onOpenUpdate={() => appUpdate.openAvailable()}
          onLogin={() => openLogin()}
        />
        <Outlet />

        <TeamMembershipDialogs
          session={session}
          dissolveTarget={dissolveTarget}
          leaveTarget={leaveTarget}
          onCloseDissolve={() => setDissolveTarget(null)}
          onCloseLeave={() => setLeaveTarget(null)}
          onDone={async (teamId) => {
            if (!session) return;
            if (activeTeamId === teamId) chooseActiveTeam(null);
            if (detailTeam?.id === teamId) setDetailTeam(null);
            if (inviteTeam?.id === teamId) setInviteTeam(null);
            const list = await listTeams(session);
            if (sessionRef.current === session) setTeams(list);
            await commandsRef.current?.teamRemoved(teamId);
          }}
          onError={setError}
        />
        {session ? (
          <TeamManageSidebar
            session={session}
            team={detailTeam}
            open={detailTeam !== null}
            onClose={() => setDetailTeam(null)}
            onChanged={reloadTeams}
          />
        ) : null}
        {session ? (
          <TeamDialog
            open={teamOpen}
            session={session}
            onActiveTeam={chooseActiveTeam}
            onChange={() =>
              listTeams(session).then((list) => {
                setTeams(list);
                void reloadPages();
              })
            }
            onClose={() => setTeamOpen(false)}
            panel={teamPanel}
          />
        ) : null}
        <TeamJoinDialog
          open={joinPrompt !== null}
          loading={joinPrompt?.loading ?? false}
          busy={joinBusy}
          error={joinPrompt?.error ?? ""}
          preview={joinPrompt?.preview ?? null}
          onCancel={cancelJoin}
          onConfirm={confirmJoin}
        />
        <TeamInviteDialog
          session={session}
          team={inviteTeam}
          onClose={() => setInviteTeam(null)}
          onUpdated={(next) => {
            setInviteTeam(next);
            setTeams((list) => list.map((item) => (item.id === next.id ? { ...item, code: next.code } : item)));
          }}
          onError={setError}
        />
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
        <SyncSummaryDialog {...sync.summaryProps} />
        <SyncChecklistDialog {...sync.checklistProps} />
      </div>
      </WorkspaceStatusContext.Provider>
    </WorkspaceContext.Provider>
  );
}
