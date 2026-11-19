import { memo, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { ChevronDown, ChevronRight, Ellipsis, Plus, Share2, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageTree } from "@/components/page-tree";
import { SoftScrollbar } from "@/components/soft-scrollbar";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/lib/useMediaQuery";
import type { ExportFormat } from "@/lib/document/export";
import { pageTitle } from "@/i18n";
import type { PageNode } from "@/store/localStore";
import { listRememberedShares, sharePreviewUrl, type RememberedShare } from "@/store/shareMemory";
import { listShareFavorites, type ShareFavoriteItem } from "@/store/shareStore";
import type { RemoteSession } from "@/store/remoteStore";
import { canManageTeam, type TeamInfo } from "@/store/teamStore";

const iconProps = { size: 14 };
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
  onOpenId: Dispatch<SetStateAction<string | null>>;
  label: string;
  align: "start" | "end";
  items: MenuItem[];
  hoverOnly?: boolean;
}) {
  const open = openId === menuId;
  const hidden = hoverOnly && !open;
  const mobile = useIsMobile();
  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      className={hidden ? "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-sm:opacity-100" : undefined}
      onClick={(event) => {
        event.stopPropagation();
        if (!mobile) {
          return;
        }
        onOpenId((current) => (current === menuId ? null : menuId));
      }}
    >
      <Ellipsis {...iconProps} />
    </Button>
  );
  if (mobile) {
    return (
      <>
        {trigger}
        {open ? <Sheet open onOpenChange={(next) => onOpenId((current) => (next ? menuId : current === menuId ? null : current))}>
          <SheetContent side="bottom">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted" />
            <SheetTitle className="px-4 py-3 text-left">{label}</SheetTitle>
            <SheetDescription className="sr-only">{label}</SheetDescription>
            <div className="grid px-2 pb-2">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={
                    item.danger
                      ? "flex h-11 items-center rounded-lg px-3 text-left text-sm text-destructive"
                      : "flex h-11 items-center rounded-lg px-3 text-left text-sm"
                  }
                  onClick={() => {
                    onOpenId((current) => (current === menuId ? null : current));
                    item.onClick();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet> : null}
      </>
    );
  }
  return (
    <DropdownMenu
      modal={false}
      open={open}
      onOpenChange={(next) => onOpenId((current) => (next ? menuId : current === menuId ? null : current))}
    >
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-40">
        {items.map((item) => (
          <div key={item.id}>
            {item.separated ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              className={item.danger ? "text-destructive" : undefined}
              onSelect={() => {
                onOpenId((current) => (current === menuId ? null : current));
                item.onClick();
              }}
            >
              {item.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
          {open ? <ChevronDown {...iconProps} /> : <ChevronRight {...iconProps} />}
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
      <Collapsible open={isOpen("personal")} className="flex flex-col gap-0.5">
        <SectionHeader
          title={t("sidebar.personal")}
          open={isOpen("personal")}
          onToggle={() => toggle("personal")}
          onCreate={() => onCreateInSection(null)}
          createLabel={t("common.newPage")}
          foldable={hasPages(personal)}
          expandLabel={t("sidebar.expand")}
          collapseLabel={t("sidebar.collapse")}
        />
        {hasPages(personal) ? (
          <CollapsibleContent>
            <PageTree {...treeShared} nodes={personal} embedded menuId={menuId} onMenuId={setMenuId} />
          </CollapsibleContent>
        ) : null}
      </Collapsible>

      {visibleFavorites.length > 0 ? (
        <Collapsible open={isOpen("favorites")} className="flex flex-col gap-0.5">
          <SectionHeader
            title={t("sidebar.favorites")}
            open={isOpen("favorites")}
            onToggle={() => toggle("favorites")}
            expandLabel={t("sidebar.expand")}
            collapseLabel={t("sidebar.collapse")}
          />
          <CollapsibleContent>
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
                    <Star {...iconProps} className="fill-current" size={16} />
                    <span className="min-w-0 flex-1 truncate text-left">{pageTitle(item.title)}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      {shares.length > 0 ? (
      <Collapsible open={isOpen("shares")} className="flex flex-col gap-0.5">
        <SectionHeader
          title={t("sidebar.shares")}
          open={isOpen("shares")}
          onToggle={() => toggle("shares")}
          expandLabel={t("sidebar.expand")}
          collapseLabel={t("sidebar.collapse")}
        />
        <CollapsibleContent>
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
                      <Share2 {...iconProps} size={16} />
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
                      <ChevronRight {...iconProps} />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
        </CollapsibleContent>
      </Collapsible>
      ) : null}

      {session && teams.length > 0 ? (
        <Collapsible open={isOpen("teams")} className="flex flex-col gap-0.5">
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
          <CollapsibleContent className="flex flex-col gap-0.5">
            {teams.map((team) => {
                const key = `team:${team.id}`;
                const list = byTeam.get(team.id) ?? [];
                const open = isOpen(key);
                const pages = hasPages(list);
                const menu: MenuItem[] = [];
                if (onTeamDetails) menu.push({ id: "details", label: t("team.manageTeam"), onClick: () => onTeamDetails(team) });
                if (onInviteTeam && canManageTeam(team.role)) menu.push({ id: "invite", label: t("team.inviteMembers"), onClick: () => onInviteTeam(team) });
                if (canManageTeam(team.role)) {
                  if (onDissolveTeam) menu.push({ id: "dissolve", label: t("team.dissolve"), danger: true, onClick: () => onDissolveTeam(team) });
                } else if (onLeaveTeam) {
                  menu.push({ id: "leave", label: t("team.leave"), danger: true, onClick: () => onLeaveTeam(team) });
                }
                if (canCreateInTeam(team.id)) menu.push({ id: "page", label: t("common.newPage"), separated: true, onClick: () => onCreateInSection(team.id) });
                return (
                  <Collapsible key={team.id} open={pages ? open : true} className="flex flex-col gap-0.5 pl-6">
                    <SectionHeader
                      title={team.name}
                      open={open}
                      onToggle={() => toggle(key)}
                      onTitleClick={pages ? undefined : () => onOpenEmptyTeam?.(team.id)}
                      foldable={pages}
                      trailing={
                        menu.length > 0 ? (
                          <MoreMenu menuId={`team-menu:${team.id}`} openId={menuId} onOpenId={setMenuId} label={team.name} align="end" items={menu} hoverOnly />
                        ) : undefined
                      }
                      expandLabel={t("sidebar.expand")}
                      collapseLabel={t("sidebar.collapse")}
                      underParent
                    />
                    {pages ? (
                      <CollapsibleContent>
                        <PageTree {...treeShared} nodes={list} embedded menuId={menuId} onMenuId={setMenuId} />
                      </CollapsibleContent>
                    ) : null}
                  </Collapsible>
                );
              })}
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </SoftScrollbar>
  );
}

export const SidebarSections = memo(SidebarSectionsInner);
