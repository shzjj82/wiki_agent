import { memo, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type DragEvent, type SetStateAction } from "react";
import { ArrowUpToLine, ChevronDown, ChevronRight, Ellipsis, FileText, Plus, Share2, Trash2 } from "lucide-react";
import { FileTypeIcon } from "@/components/file-type-icon";
import { SoftScrollbar } from "@/components/soft-scrollbar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/lib/useMediaQuery";
import { pageTitle } from "@/i18n";
import type { ExportFormat } from "@/lib/document/export";
import { useTranslation } from "react-i18next";
import type { PageNode } from "@/store/localStore";

const iconProps = { size: 16 };
const DRAG_MIME = "application/x-editor-page-id";

type TreeNode = PageNode & { children: TreeNode[] };

type Props = {
  nodes: PageNode[];
  query?: string;
  selectedId?: string;
  onOpen: (id: string) => void;
  onCreateChild: (parentId: string) => void;
  onDelete: (id: string) => void;
  onReparent: (id: string, parentId: string | null) => void;
  onExport: (id: string, format: ExportFormat) => void;
  onShare?: (id: string) => void;
  teamNames?: Record<string, string>;
  /** 嵌在侧栏分区里时由外层滚动，不再自带 SoftScrollbar */
  embedded?: boolean;
  /** 和侧栏其它菜单共用，保证同时只打开一个 */
  menuId?: string | null;
  onMenuId?: Dispatch<SetStateAction<string | null>>;
};

function pageMenuKey(id: string) {
  return `page:${id}`;
}

function buildTree(nodes: PageNode[]): TreeNode[] {
  const ids = new Set(nodes.map((node) => node.id));
  const byParent = new Map<string | null, PageNode[]>();
  for (const node of nodes) {
    const key = node.parentId && ids.has(node.parentId) ? node.parentId : null;
    const list = byParent.get(key) ?? [];
    list.push(node);
    byParent.set(key, list);
  }
  const walk = (parentId: string | null): TreeNode[] =>
    (byParent.get(parentId) ?? []).map((node) => ({ ...node, children: walk(node.id) }));
  return walk(null);
}

function blockedIds(nodes: PageNode[], rootId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const list = children.get(node.parentId);
    if (list) list.push(node.id);
    else children.set(node.parentId, [node.id]);
  }
  const drop = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    for (const child of children.get(id) ?? []) {
      if (drop.has(child)) continue;
      drop.add(child);
      stack.push(child);
    }
  }
  return drop;
}

function filterTree(items: TreeNode[], query: string): TreeNode[] {
  const keyword = query.trim().toLocaleLowerCase();
  if (!keyword) {
    return items;
  }
  const walk = (list: TreeNode[]): TreeNode[] => {
    const out: TreeNode[] = [];
    for (const node of list) {
      const children = walk(node.children);
      const self = pageTitle(node.title).toLocaleLowerCase().includes(keyword);
      if (self || children.length > 0) {
        out.push({ ...node, children: self ? node.children : children });
      }
    }
    return out;
  };
  return walk(items);
}

type RowMenuProps = {
  nodeId: string;
  open: boolean;
  selected: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateChild: (parentId: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string, format: ExportFormat) => void;
  onShare?: (id: string) => void;
  onExpand: (id: string) => void;
};

/** 菜单默认不挂 Popover，点开才挂，避免每行常驻 Radix 开销 */
const RowMenu = memo(function RowMenu({
  nodeId,
  open,
  selected,
  onOpenChange,
  onCreateChild,
  onDelete,
  onExport,
  onShare,
  onExpand,
}: RowMenuProps) {
  const { t } = useTranslation();
  const mobile = useIsMobile();
  const triggerClass =
    open || selected
      ? "relative z-20 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
      : "relative z-20 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-sidebar-accent hover:text-foreground focus-visible:opacity-100 max-sm:opacity-100";

  const trigger = (
    <button
      type="button"
      className={triggerClass}
      aria-label={t("pageTree.more")}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (mobile) {
          onOpenChange(!open);
        }
      }}
    >
      <Ellipsis {...iconProps} size={14} />
    </button>
  );
  const actions = (
    <>
      <button type="button" className="flex h-11 items-center gap-2 rounded-lg px-3 text-left text-sm" onClick={() => { onExpand(nodeId); onCreateChild(nodeId); onOpenChange(false); }}>
        <Plus {...iconProps} size={14} />
        {t("pageTree.addSubpage")}
      </button>
      {onShare ? (
        <button type="button" className="flex h-11 items-center gap-2 rounded-lg px-3 text-left text-sm" onClick={() => { onShare(nodeId); onOpenChange(false); }}>
          <Share2 {...iconProps} size={14} />
          {t("share.menu")}
        </button>
      ) : null}
      <button type="button" className="flex h-11 items-center gap-2 rounded-lg px-3 text-left text-sm" onClick={() => { onExport(nodeId, "pdf"); onOpenChange(false); }}>
        <FileTypeIcon type="pdf" />
        {t("common.exportPdf")}
      </button>
      <button type="button" className="flex h-11 items-center gap-2 rounded-lg px-3 text-left text-sm" onClick={() => { onExport(nodeId, "word"); onOpenChange(false); }}>
        <FileTypeIcon type="word" />
        {t("common.exportWord")}
      </button>
      <button type="button" className="flex h-11 items-center gap-2 rounded-lg px-3 text-left text-sm text-destructive" onClick={() => { onDelete(nodeId); onOpenChange(false); }}>
        <Trash2 {...iconProps} size={14} />
        {t("common.delete")}
      </button>
    </>
  );
  if (mobile) {
    return (
      <>
        {trigger}
        {open ? <Sheet open onOpenChange={onOpenChange}>
          <SheetContent side="bottom">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted" />
            <SheetTitle className="px-4 py-3 text-left">{t("pageTree.more")}</SheetTitle>
            <SheetDescription className="sr-only">{t("pageTree.more")}</SheetDescription>
            <div className="grid px-2 pb-2">{actions}</div>
          </SheetContent>
        </Sheet> : null}
      </>
    );
  }
  return (
    <DropdownMenu modal={false} open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          onSelect={() => {
            onExpand(nodeId);
            onCreateChild(nodeId);
          }}
        >
          <Plus {...iconProps} size={14} />
          {t("pageTree.addSubpage")}
        </DropdownMenuItem>
        {onShare ? (
          <DropdownMenuItem onSelect={() => onShare(nodeId)}>
            <Share2 {...iconProps} size={14} />
            {t("share.menu")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onExport(nodeId, "pdf")}>
          <FileTypeIcon type="pdf" />
          {t("common.exportPdf")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExport(nodeId, "word")}>
          <FileTypeIcon type="word" />
          {t("common.exportWord")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onSelect={() => onDelete(nodeId)}>
          <Trash2 {...iconProps} size={14} />
          {t("common.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

function PageTreeInner({
  nodes,
  query = "",
  selectedId,
  onOpen,
  onCreateChild,
  onDelete,
  onReparent,
  onExport,
  onShare,
  teamNames = {},
  embedded = false,
  menuId: menuIdProp,
  onMenuId,
}: Props) {
  const { t } = useTranslation();
  /** 默认折叠。当前页和它的上级会展开，刷新后按地址里的页面恢复。 */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null | "root">(null);
  const [localMenuId, setLocalMenuId] = useState<string | null>(null);
  const menuId = onMenuId ? (menuIdProp ?? null) : localMenuId;
  const setMenuId = onMenuId ?? setLocalMenuId;
  const draggingRef = useRef<string | null>(null);
  const blockedRef = useRef<Set<string> | null>(null);
  const tree = useMemo(() => filterTree(buildTree(nodes), query), [nodes, query]);
  const searching = query.trim().length > 0;

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    const byId = new Map(nodes.map((node) => [node.id, node]));
    if (!byId.has(selectedId)) {
      return;
    }
    setExpanded((prev) => {
      const next = { ...prev };
      let changed = false;
      const mark = (id: string | null | undefined) => {
        if (!id || next[id]) {
          return;
        }
        next[id] = true;
        changed = true;
      };
      mark(selectedId);
      let current = byId.get(selectedId);
      const seen = new Set<string>();
      while (current?.parentId && !seen.has(current.id)) {
        seen.add(current.id);
        mark(current.parentId);
        current = byId.get(current.parentId);
      }
      return changed ? next : prev;
    });
  }, [selectedId, nodes]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const expandNode = useCallback((id: string) => {
    setExpanded((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  }, []);

  const clearDrag = useCallback(() => {
    draggingRef.current = null;
    blockedRef.current = null;
    setDraggingId(null);
    setDropId(null);
  }, []);

  const canDrop = useCallback(
    (targetId: string, sourceId: string) => {
      if (sourceId === targetId) {
        return false;
      }
      const source = nodes.find((node) => node.id === sourceId);
      if (!source || source.parentId === targetId) {
        return false;
      }
      const blocked = blockedRef.current ?? blockedIds(nodes, sourceId);
      blockedRef.current = blocked;
      return !blocked.has(targetId);
    },
    [nodes],
  );

  function beginDrag(event: DragEvent, id: string) {
    event.dataTransfer.setData(DRAG_MIME, id);
    event.dataTransfer.setData("text/plain", id);
    event.dataTransfer.effectAllowed = "move";
    draggingRef.current = id;
    blockedRef.current = blockedIds(nodes, id);
    window.requestAnimationFrame(() => {
      if (draggingRef.current === id) {
        setDraggingId(id);
      }
    });
  }

  function readDragId(event: DragEvent) {
    return event.dataTransfer.getData(DRAG_MIME) || event.dataTransfer.getData("text/plain") || draggingRef.current;
  }

  function acceptDrop(event: DragEvent, parentId: string | null) {
    event.preventDefault();
    event.stopPropagation();
    const id = readDragId(event);
    clearDrag();
    if (!id) {
      return;
    }
    if (parentId && !canDrop(parentId, id)) {
      return;
    }
    const source = nodes.find((node) => node.id === id);
    if (!source || source.parentId === parentId) {
      return;
    }
    if (parentId) {
      setExpanded((prev) => ({ ...prev, [parentId]: true }));
    }
    onReparent(id, parentId);
  }

  const onMenuOpenChange = useCallback(
    (id: string, open: boolean) => {
      const key = pageMenuKey(id);
      setMenuId((current) => (open ? key : current === key ? null : current));
    },
    [setMenuId],
  );

  const dragging = draggingId ? nodes.find((node) => node.id === draggingId) : undefined;

  function renderNodes(items: TreeNode[], depth: number) {
    return items.map((node) => {
      const open = searching || expanded[node.id] === true;
      const isDrop = dropId === node.id;
      const selected = selectedId === node.id;
      return (
        <li key={node.id}>
          <div
            className={
              draggingId === node.id
                ? "group flex items-center gap-0.5 rounded-md opacity-40"
                : isDrop
                  ? "group flex items-center gap-0.5 rounded-md bg-sidebar-accent"
                  : "group flex items-center gap-0.5"
            }
            style={{ paddingLeft: depth * 14 }}
            onDragOver={(event) => {
              const sourceId = draggingRef.current;
              if (!sourceId || !canDrop(node.id, sourceId)) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = "move";
              setDropId((prev) => (prev === node.id ? prev : node.id));
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setDropId((prev) => (prev === node.id ? null : prev));
              }
            }}
            onDrop={(event) => acceptDrop(event, node.id)}
          >
            {node.children.length > 0 ? (
              <button
                type="button"
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                aria-label={open ? t("pageTree.collapse") : t("pageTree.expand")}
                onClick={() => toggle(node.id)}
              >
                {open ? <ChevronDown {...iconProps} size={14} /> : <ChevronRight {...iconProps} size={14} />}
              </button>
            ) : (
              <span className="size-6 shrink-0" aria-hidden />
            )}
            <button
              type="button"
              draggable
              title={t("pageTree.dragToMove")}
              className={
                selected
                  ? "flex h-8 min-w-0 flex-1 cursor-grab items-center gap-2 rounded-md bg-sidebar-accent px-2 text-left text-sm font-medium active:cursor-grabbing"
                  : "flex h-8 min-w-0 flex-1 cursor-grab items-center gap-2 rounded-md px-2 text-left text-sm font-medium hover:bg-sidebar-accent/70 active:cursor-grabbing"
              }
              onClick={() => onOpen(node.id)}
              onDragStart={(event) => beginDrag(event, node.id)}
              onDragEnd={clearDrag}
            >
              <FileText {...iconProps} />
              <span className="min-w-0 flex-1 truncate text-left">{pageTitle(node.title)}</span>
              {node.teamId && teamNames[node.teamId] ? (
                <span className="max-w-16 shrink-0 truncate text-[10px] text-muted-foreground">{teamNames[node.teamId]}</span>
              ) : null}
            </button>
            <RowMenu
              nodeId={node.id}
              open={menuId === pageMenuKey(node.id)}
              selected={selected}
              onOpenChange={(next) => onMenuOpenChange(node.id, next)}
              onCreateChild={onCreateChild}
              onDelete={onDelete}
              onExport={onExport}
              onShare={onShare}
              onExpand={expandNode}
            />
          </div>
          {node.children.length > 0 && open ? <ul className="flex flex-col gap-0.5">{renderNodes(node.children, depth + 1)}</ul> : null}
          {draggingId === node.id ? <span className="sr-only">{t("pageTree.dragging")}</span> : null}
        </li>
      );
    });
  }

  const body = (
    <>
      {dragging?.parentId ? (
        <div
          className={
            dropId === "root"
              ? "mx-1 flex items-center gap-2 rounded-md bg-sidebar-accent px-2 py-2 text-xs"
              : "mx-1 flex items-center gap-2 rounded-md px-2 py-2 text-xs text-muted-foreground"
          }
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "move";
            setDropId((prev) => (prev === "root" ? prev : "root"));
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setDropId((prev) => (prev === "root" ? null : prev));
            }
          }}
          onDrop={(event) => acceptDrop(event, null)}
        >
          <ArrowUpToLine {...iconProps} size={14} />
          {t("pageTree.moveToTopLevel")}
        </div>
      ) : null}
      {searching && tree.length === 0 ? (
        <p className="px-2 py-3 text-xs text-muted-foreground">{t("pageTree.noMatchingPages")}</p>
      ) : (
        <ul className="flex flex-col gap-0.5">{renderNodes(tree, 0)}</ul>
      )}
    </>
  );

  if (embedded) {
    return <div className="flex min-w-0 flex-col gap-1">{body}</div>;
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
      <SoftScrollbar className="min-h-0 flex-1" contentClassName="px-0">
        {body}
      </SoftScrollbar>
    </div>
  );
}

export const PageTree = memo(PageTreeInner);
