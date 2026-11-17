import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Down, Plus, Right, Share } from "@icon-park/react";
import { useTranslation } from "react-i18next";
import { PageTree } from "@/components/page-tree";
import { SoftScrollbar } from "@/components/soft-scrollbar";
import { Button } from "@/components/ui/button";
import type { ExportFormat } from "@/lib/document/export";
import { pageTitle } from "@/i18n";
import type { PageNode } from "@/store/localStore";
import { listRememberedShares, sharePreviewUrl, type RememberedShare } from "@/store/shareMemory";
import type { TeamInfo } from "@/store/teamStore";

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

function SectionHeader({
  title,
  open,
  onToggle,
  onCreate,
  createLabel,
  expandLabel,
  collapseLabel,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  onCreate?: () => void;
  createLabel?: string;
  expandLabel: string;
  collapseLabel: string;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-0.5 bg-sidebar py-0.5">
      <Button type="button" variant="ghost" size="icon-xs" aria-expanded={open} aria-label={open ? collapseLabel : expandLabel} onClick={onToggle}>
        {open ? <Down {...iconProps} /> : <Right {...iconProps} />}
      </Button>
      <button type="button" className="min-w-0 flex-1 truncate px-1 text-left text-[11px] font-semibold tracking-wide text-muted-foreground" onClick={onToggle}>
        {title}
      </button>
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
};

type Props = TreeHandlers & {
  nodes: PageNode[];
  teams: TeamInfo[];
  canCreateInTeam: (teamId: string) => boolean;
  onCreateInSection: (teamId: string | null) => void;
  shareEpoch?: number;
};

export function SidebarSections({
  nodes,
  teams,
  query = "",
  selectedId,
  canCreateInTeam,
  onCreateInSection,
  onOpen,
  onCreateChild,
  onDelete,
  onReparent,
  onExport,
  onShare,
  shareEpoch = 0,
}: Props) {
  const { t } = useTranslation();
  const [openMap, setOpenMap] = useState<SectionOpen>(() => readSectionOpen());
  const [shares, setShares] = useState<RememberedShare[]>(() => listRememberedShares());

  useEffect(() => {
    setShares(listRememberedShares());
  }, [shareEpoch]);

  const personal = useMemo(() => nodes.filter((node) => !node.teamId), [nodes]);
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

  const treeProps: TreeHandlers = {
    selectedId,
    query,
    onOpen,
    onCreateChild,
    onDelete,
    onReparent,
    onExport,
    onShare,
  };

  function emptyHint(text: string): ReactNode {
    return <p className="px-2 py-2 text-xs text-muted-foreground">{text}</p>;
  }

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
        {isOpen("personal") ? (
          personal.length > 0 || query.trim() ? (
            <PageTree {...treeProps} nodes={personal} embedded />
          ) : (
            emptyHint(t("sidebar.emptyPersonal"))
          )
        ) : null}
      </section>

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

      {teams.map((team) => {
        const key = `team:${team.id}`;
        const list = byTeam.get(team.id) ?? [];
        return (
          <section key={team.id} className="flex flex-col gap-0.5">
            <SectionHeader
              title={team.name}
              open={isOpen(key)}
              onToggle={() => toggle(key)}
              onCreate={canCreateInTeam(team.id) ? () => onCreateInSection(team.id) : undefined}
              createLabel={t("common.newPage")}
              expandLabel={t("sidebar.expand")}
              collapseLabel={t("sidebar.collapse")}
            />
            {isOpen(key) ? (
              list.length > 0 || query.trim() ? (
                <PageTree {...treeProps} nodes={list} embedded />
              ) : (
                emptyHint(t("sidebar.emptyTeam"))
              )
            ) : null}
          </section>
        );
      })}
    </SoftScrollbar>
  );
}
