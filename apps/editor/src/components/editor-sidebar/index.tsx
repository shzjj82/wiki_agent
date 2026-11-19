import type { MutableRefObject, PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { CircleArrowUp, Search, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NotifyBell } from "@/components/notify-bell";
import { SettingsMenu } from "@/components/settings-menu";
import { SidebarSections } from "@/components/sidebar-sections";
import { cn } from "@/lib/utils";
import type { ExportFormat } from "@/lib/document/export";
import type { NotifyTodo } from "@/store/notifyStore";
import type { PageNode } from "@/store/localStore";
import type { RemoteSession } from "@/store/remoteStore";
import type { SyncSettings } from "@/store/syncSettings";
import type { TeamInfo } from "@/store/teamStore";

const iconProps = { size: 16 };
const SIDEBAR_WIDTH_KEY = "editor:sidebar-width";
const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 480;

export function readSidebarWidth(): number {
  const raw = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
  if (!Number.isFinite(raw)) {
    return 260;
  }
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, raw));
}

type Props = {
  isMobile: boolean;
  open: boolean;
  widthRef: MutableRefObject<number>;
  onWidth: (width: number) => void;
  onClose: () => void;
  query: string;
  onQuery: (query: string) => void;
  nodes: PageNode[];
  teams: TeamInfo[];
  sidebarQuery: string;
  selectedId?: string;
  shareEpoch: number;
  session: RemoteSession | null;
  canCreateInTeam: (teamId: string) => boolean;
  onCreateInSection: (teamId: string | null) => void;
  onCreateTeam?: () => void;
  onJoinTeam?: () => void;
  onTeamDetails?: (team: TeamInfo) => void;
  onInviteTeam?: (team: TeamInfo) => void;
  onLeaveTeam?: (team: TeamInfo) => void;
  onDissolveTeam?: (team: TeamInfo) => void;
  onOpenEmptyTeam?: (teamId: string) => void;
  onOpen: (id: string) => void;
  onOpenPage: (id: string) => void | Promise<void>;
  onCreateChild: (parentId: string) => void;
  onDelete: (id: string) => void;
  onReparent: (id: string, parentId: string | null) => void;
  onExport: (id: string, format: ExportFormat) => void;
  onShare?: (id: string) => void;
  syncSettings: SyncSettings;
  onSyncSettings: (settings: SyncSettings) => void;
  onLogout: () => void;
  onChangePassword: () => void;
  onWriteTodo: (todo: NotifyTodo) => Promise<void>;
  updateAvailable: boolean;
  onOpenUpdate: () => void;
  onLogin: () => void;
};

export function EditorSidebar({
  isMobile,
  open,
  widthRef,
  onWidth,
  onClose,
  query,
  onQuery,
  nodes,
  teams,
  sidebarQuery,
  selectedId,
  shareEpoch,
  session,
  canCreateInTeam,
  onCreateInSection,
  onCreateTeam,
  onJoinTeam,
  onTeamDetails,
  onInviteTeam,
  onLeaveTeam,
  onDissolveTeam,
  onOpenEmptyTeam,
  onOpen,
  onOpenPage,
  onCreateChild,
  onDelete,
  onReparent,
  onExport,
  onShare,
  syncSettings,
  onSyncSettings,
  onLogout,
  onChangePassword,
  onWriteTodo,
  updateAvailable,
  onOpenUpdate,
  onLogin,
}: Props) {
  const { t } = useTranslation();

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = widthRef.current;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (ev: PointerEvent) => {
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidth + ev.clientX - startX));
      widthRef.current = next;
      onWidth(next);
    };
    const stop = (ev: PointerEvent) => {
      if (target.hasPointerCapture(ev.pointerId)) {
        target.releasePointerCapture(ev.pointerId);
      }
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(widthRef.current));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  return (
    <aside
      className={cn(
        "relative flex h-full min-h-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar px-3 py-4 text-sidebar-foreground",
        isMobile && "fixed inset-y-0 left-0 z-50 w-[min(84vw,320px)] transition-transform duration-200 ease-out",
        isMobile && open && "translate-x-0 shadow-[12px_0_32px_rgb(0_0_0/0.14)]",
        isMobile && !open && "-translate-x-full shadow-none",
      )}
      aria-hidden={isMobile && !open}
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
          <Button type="button" variant="ghost" size="icon" aria-label={t("app.closePageList")} onClick={onClose}>
            <X {...iconProps} />
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
          onChange={(event) => onQuery(event.target.value)}
          placeholder={t("app.search")}
          aria-label={t("app.search")}
          className="h-8 bg-background pl-7"
        />
      </div>
      <SidebarSections
        nodes={nodes}
        teams={teams}
        query={sidebarQuery}
        selectedId={selectedId}
        shareEpoch={shareEpoch}
        session={session}
        canCreateInTeam={canCreateInTeam}
        onCreateInSection={onCreateInSection}
        onCreateTeam={onCreateTeam}
        onJoinTeam={onJoinTeam}
        onTeamDetails={onTeamDetails}
        onInviteTeam={onInviteTeam}
        onLeaveTeam={onLeaveTeam}
        onDissolveTeam={onDissolveTeam}
        onOpenEmptyTeam={onOpenEmptyTeam}
        onOpen={onOpen}
        onCreateChild={onCreateChild}
        onDelete={onDelete}
        onReparent={onReparent}
        onExport={onExport}
        onShare={onShare}
      />
      <div className="mt-3 flex items-center gap-0.5 border-t border-sidebar-border px-1 pt-3 text-xs text-muted-foreground">
        {session ? (
          <>
            <div className="min-w-0 flex-1">
              <SettingsMenu
                label={session.username}
                settings={syncSettings}
                onChange={onSyncSettings}
                onLogout={onLogout}
                onChangePassword={onChangePassword}
                onCreateTeam={onCreateTeam ?? (() => undefined)}
                onJoinTeam={onJoinTeam ?? (() => undefined)}
              />
            </div>
            <NotifyBell session={session} onWriteTodo={onWriteTodo} onOpenPage={onOpenPage} />
          </>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <Button type="button" variant="ghost" size="sm" className="min-w-0 flex-1 justify-start" onClick={onLogin}>
              <Users {...iconProps} />
              {t("app.logIn")}
            </Button>
            {updateAvailable ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("appUpdate.availableShort")}
                title={t("appUpdate.availableShort")}
                onClick={onOpenUpdate}
              >
                <CircleArrowUp {...iconProps} />
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
        onPointerDown={startResize}
      />
    </aside>
  );
}
