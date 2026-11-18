import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { Down, More, Plus, Right, Share, Star } from "@icon-park/react";
import { useTranslation } from "react-i18next";
import { PageTree } from "@/components/page-tree";
import { SoftScrollbar } from "@/components/soft-scrollbar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverSeparator, PopoverTrigger } from "@/components/ui/popover";
import type { ExportFormat } from "@/lib/document/export";
import { pageTitle } from "@/i18n";
import type { PageNode } from "@/store/localStore";
import { listRememberedShares, sharePreviewUrl, type RememberedShare } from "@/store/shareMemory";
import { listShareFavorites, type ShareFavoriteItem } from "@/store/shareStore";
import type { RemoteSession } from "@/store/remoteStore";
import { canManageTeam, type TeamInfo } from "@/store/teamStore";

const iconProps = { theme: "outline" as const, strokeWidth: 3, size: 14 };
const SECTION_KEY = "editor:sidebar-section-open";

type SectionOpen = Record<string, boolean>;

function readSectionOpen(): SectionOpen {
  try {
    const raw = localStorage.getItem(SECTION_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as SectionOpen) : {};
  } catch {
    return {};
  }
}

function writeSectionOpen(value: SectionOpen) {
  localStorage.setItem(SECTION_KEY, JSON.stringify(value));
}

type MenuItem = { id: string; label: string; onClick: () => void; danger?: boolean; separated?: boolean };

function MoreMenu({
  menuId,
  openId,
  onOpenId,
  label,
  align,
  items,
  hoverOnly = false,
}: {
  menuId: string;
  openId: string | null;
  onOpenId: (id: string | null) => void;
  label: string;
  align: "start" | "end";
  items: MenuItem[];
  hoverOnly?: boolean;
}) {
  const open = openId === menuId;
  const hidden = hoverOnly && !open;
  return (
    <Popover open={open} onOpenChange={(next) => onOpenId(next ? menuId : openId === menuId ? null : openId)}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          className={hidden ? "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-sm:opacity-100" : undefined}
          onClick={(event) => event.stopPropagation()}
        >
          <More {...iconProps} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-40">
        {items.map((item) => (
          <div key={item.id}>
            {item.separated ? <PopoverSeparator /> : null}
            <button
              type="button"
              className={
                item.danger
                  ? "flex h-8 w-full items-center rounded-md px-2 text-left text-destructive hover:bg-muted"
                  : "flex h-8 w-full items-center rounded-md px-2 text-left hover:bg-muted"
              }
              onClick={() => {
                onOpenId(null);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function SectionHeader({
  title,
  open,
  onToggle,
  onTitleClick,
  onCreate,
  createLabel,
  leading,
  trailing,
  foldable = true,
  expandLabel,
  collapseLabel,
  /** 贴在「我的团队」下面，和上一行标题锁成同一列 */
  underParent = false,
  /** 盖住下面正在滚走的团队名 */
  front = false,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  onTitleClick?: () => void;
  onCreate?: () => void;
  createLabel?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  foldable?: boolean;
  expandLabel: string;
  collapseLabel: string;
  underParent?: boolean;
  front?: boolean;
}) {
  return (
    <div
      className="group sticky flex h-7 shrink-0 items-center gap-0.5 bg-sidebar"
      style={{ top: underParent ? "1.75rem" : 0, zIndex: front ? 20 : 10 }}
    >
      {leading}
      {foldable ? (
        <Button type="button" variant="ghost" size="icon-xs" aria-expanded={open} aria-label={open ? collapseLabel : expandLabel} onClick={onToggle}>
          {open ? <Down {...iconProps} /> : <Right {...iconProps} />}
        </Button>
      ) : (
        <Button type="button" variant="ghost" size="icon-xs" tabIndex={-1} aria-hidden className="pointer-events-none invisible" />
      )}
      <button type="button" className="min-w-0 flex-1 truncate px-1 text-left text-[11px] font-semibold tracking-wide text-muted-foreground" onClick={onTitleClick ?? onToggle}>
        {title}
      </button>
      {trailing}
      {onCreate ? (
        <Button type="button" variant="ghost" size="icon-xs" aria-label={createLabel} onClick={onCreate}>
          <Plus {...iconProps} />
        </Button>
      ) : null}
    </div>
  );
}

type TreeHandlers = {
  selectedId?: string;
  query?: string;
  onOpen: (id: string) => void;
  onCreateChild: (parentId: string) => void;
  onDelete: (id: string) => void;
  onReparent: (id: string, parentId: string | null) => void;
  onExport: (id: string, format: ExportFormat) => void;
  onShare?: (id: string) => void;
  session?: RemoteSession | null;
};

type Props = TreeHandlers & {
  nodes: PageNode[];
  teams: TeamInfo[];
  canCreateInTeam: (teamId: string) => boolean;
  onCreateInSection: (teamId: string | null) => void;
  onCreateTeam?: () => void;
  onJoinTeam?: () => void;
  onTeamDetails?: (team: TeamInfo) => void;
  onInviteTeam?: (team: TeamInfo) => void;
  onLeaveTeam?: (team: TeamInfo) => void;
  onDissolveTeam?: (team: TeamInfo) => void;
  onOpenEmptyTeam?: (teamId: string) => void;
  shareEpoch?: number;
};

function SidebarSectionsInner({
  nodes,
  teams,
  query = "",
  selectedId,
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
  onCreateChild,
  onDelete,
  onReparent,
  onExport,
  onShare,
  shareEpoch = 0,
  session = null,
}: Props) {
  const { t } = useTranslation();
  const [openMap, setOpenMap] = useState<SectionOpen>(() => readSectionOpen());
  const [menuId, setMenuId] = useState<string | null>(null);
  const [shares, setShares] = useState<RememberedShare[]>(() => listRememberedShares());
  const [favorites, setFavorites] = useState<ShareFavoriteItem[]>([]);

  useEffect(() => {
    setShares(listRememberedShares());
  }, [shareEpoch]);

  useEffect(() => {
    if (!session) {
      setFavorites([]);
      return;
    }
    let gone = false;
    const load = () => {
      void listShareFavorites(session)
        .then((list) => {
          if (!gone) setFavorites(list);
        })
        .catch(() => {
          if (!gone) setFavorites([]);
        });
    };
    load();
    window.addEventListener("focus", load);
    return () => {
      gone = true;
      window.removeEventListener("focus", load);
    };
  }, [session]);

  const personal = useMemo(() => nodes.filter((node) => !node.teamId), [nodes]);
  const needle = query.trim().toLowerCase();
  const visibleFavorites = useMemo(() => {
    if (!needle) return favorites;
    return favorites.filter((item) => `${item.title} ${item.sharedBy ?? ""}`.toLowerCase().includes(needle));
  }, [favorites, needle]);
  const byTeam = useMemo(() => {
    const map = new Map<string, PageNode[]>();
    for (const team of teams) {
      map.set(
        team.id,
        nodes.filter((node) => node.teamId === team.id),
      );
    }
    return map;
  }, [nodes, teams]);

  function isOpen(id: string, fallback = true) {
    return openMap[id] ?? fallback;
  }

  function toggle(id: string, fallback = true) {
    setOpenMap((prev) => {
      const next = { ...prev, [id]: !(prev[id] ?? fallback) };
      writeSectionOpen(next);
      return next;
    });
  }

  function hasPages(list: PageNode[]) {
    if (!needle) return list.length > 0;
    return list.some((node) => pageTitle(node.title).toLowerCase().includes(needle));
  }

  const treeShared = {
    selectedId,
    query,
    onOpen,
    onCreateChild,
    onDelete,
    onReparent,
    onExport,
    onShare,
  } satisfies TreeHandlers;

  return (
    <SoftScrollbar className="min-h-0 flex-1" contentClassName="flex flex-col gap-3 pb-2">
      <section className="flex flex-col gap-0.5">
        <SectionHeader
          title={t("sidebar.personal")}
          open={isOpen("personal")}
          onToggle={() => toggle("personal")}
          onCreate={() => onCreateInSection(null)}
          createLabel={t("common.newPage")}
          expandLabel={t("sidebar.expand")}
          collapseLabel={t("sidebar.collapse")}
        />
        {isOpen("personal") && hasPages(personal) ? <PageTree {...treeShared} nodes={personal} embedded /> : null}
      </section>

      {visibleFavorites.length > 0 ? (
        <section className="flex flex-col gap-0.5">
          <SectionHeader
            title={t("sidebar.favorites")}
            open={isOpen("favorites")}
            onToggle={() => toggle("favorites")}
            expandLabel={t("sidebar.expand")}
            collapseLabel={t("sidebar.collapse")}
          />
          {isOpen("favorites") ? (
            <ul className="flex flex-col gap-0.5">
              {visibleFavorites.map((item) => (
                <li key={item.token}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 w-full justify-start! px-2 text-left font-medium"
                    title={item.sharedBy ? `${pageTitle(item.title)} · ${item.sharedBy}` : sharePreviewUrl(item.token)}
                    onClick={() => {
                      const url = sharePreviewUrl(item.token);
                      if (url) window.open(url, "_blank", "noopener,noreferrer");
                    }}
                  >
                    <span className="size-6 shrink-0" aria-hidden />
                    <Star {...iconProps} theme="filled" size={16} />
                    <span className="min-w-0 flex-1 truncate text-left">{pageTitle(item.title)}</span>
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {shares.length > 0 ? (
      <section className="flex flex-col gap-0.5">
        <SectionHeader
          title={t("sidebar.shares")}
          open={isOpen("shares")}
          onToggle={() => toggle("shares")}
          expandLabel={t("sidebar.expand")}
          collapseLabel={t("sidebar.collapse")}
        />
        {isOpen("shares") ? (
            <ul className="flex flex-col gap-0.5">
              {shares.map((share) => (
                <li key={share.token}>
                  <div className="group flex items-center gap-0.5">
                    <span className="size-6 shrink-0" aria-hidden />
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 min-w-0 flex-1 justify-start! px-2 text-left font-medium"
                      title={sharePreviewUrl(share.token)}
                      onClick={() => {
                        const url = sharePreviewUrl(share.token);
                        if (url) {
                          window.open(url, "_blank", "noopener,noreferrer");
                        }
                      }}
                    >
                      <Share {...iconProps} size={16} />
                      <span className="min-w-0 flex-1 truncate text-left">{pageTitle(share.title)}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={t("sidebar.openSource")}
                      onClick={() => onOpen(share.pageId)}
                    >
                      <Right {...iconProps} />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
        ) : null}
      </section>
      ) : null}

      {session && teams.length > 0 ? (
        <section className="flex flex-col gap-0.5">
          <SectionHeader
            title={t("sidebar.teams")}
            open={isOpen("teams")}
            onToggle={() => toggle("teams")}
            trailing={
              onCreateTeam && onJoinTeam ? (
                <MoreMenu
                  menuId="teams"
                  openId={menuId}
                  onOpenId={setMenuId}
                  label={t("sidebar.teams")}
                  align="end"
                  items={[
                    { id: "create", label: t("team.createTeam"), onClick: onCreateTeam },
                    { id: "join", label: t("team.joinTeam"), onClick: onJoinTeam },
                  ]}
                />
              ) : null
            }
            expandLabel={t("sidebar.expand")}
            collapseLabel={t("sidebar.collapse")}
            front
          />
          {isOpen("teams")
            ? teams.map((team) => {
                const key = `team:${team.id}`;
                const list = byTeam.get(team.id) ?? [];
                const open = isOpen(key);
                const pages = hasPages(list);
                const menu = [
                  onTeamDetails ? { id: "details", label: t("team.manageTeam"), onClick: () => onTeamDetails(team) } : null,
                  onInviteTeam ? { id: "invite", label: t("team.inviteMembers"), onClick: () => onInviteTeam(team) } : null,
                  canManageTeam(team.role)
                    ? onDissolveTeam
                      ? { id: "dissolve", label: t("team.dissolve"), danger: true, onClick: () => onDissolveTeam(team) }
                      : null
                    : onLeaveTeam
                      ? { id: "leave", label: t("team.leave"), danger: true, onClick: () => onLeaveTeam(team) }
                      : null,
                  canCreateInTeam(team.id) ? { id: "page", label: t("common.newPage"), separated: true, onClick: () => onCreateInSection(team.id) } : null,
                ].filter((item) => item !== null);
                return (
                  <div key={team.id} className="flex flex-col gap-0.5 pl-6">
                    <SectionHeader
                      title={team.name}
                      open={open}
                      onToggle={() => toggle(key)}
                      onTitleClick={pages ? undefined : () => onOpenEmptyTeam?.(team.id)}
                      foldable={pages}
                      trailing={
                        menu.length > 0 ? (
                          <MoreMenu menuId={team.id} openId={menuId} onOpenId={setMenuId} label={team.name} align="end" items={menu} hoverOnly />
                        ) : undefined
                      }
                      expandLabel={t("sidebar.expand")}
                      collapseLabel={t("sidebar.collapse")}
                      underParent
                    />
                    {open && hasPages(list) ? <PageTree {...treeShared} nodes={list} embedded /> : null}
                  </div>
                );
              })
            : null}
        </section>
      ) : null}
    </SoftScrollbar>
  );
}

export const SidebarSections = memo(SidebarSectionsInner);
