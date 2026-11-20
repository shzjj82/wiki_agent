import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TEAM_ROLES, formatTeamTime, roleLabel } from "@/components/team/text";
import { canManageTeam, type TeamInfo, type TeamMember, type TeamRole } from "@/store/teamStore";

/** 拥有者唯一且不可转让，成员只能在开发者和用户之间切换 */
const MEMBER_ROLES = TEAM_ROLES.filter((role) => role !== "owner");

/** 页码列表，首尾页常驻，当前页前后各留一页，其余用 null 表示省略 */
function pageItems(current: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  const start = Math.max(2, Math.min(current - 1, pages - 4));
  const end = Math.min(pages - 1, Math.max(current + 1, 5));
  const middle = Array.from({ length: end - start + 1 }, (_, index) => start + index);
  return [1, ...(start > 2 ? [null] : []), ...middle, ...(end < pages - 1 ? [null] : []), pages];
}

export function TeamMembersTab({
  shown,
  editing,
  roleDraft,
  busy,
  error,
  visible,
  memberCount,
  filteredCount,
  currentPage,
  pages,
  pageSize,
  onDraftRole,
  onPage,
}: {
  shown: TeamInfo;
  /** 点了编辑才能改角色，保存时统一提交 */
  editing: boolean;
  roleDraft: Record<string, TeamRole>;
  busy: boolean;
  error: string;
  visible: TeamMember[];
  memberCount: number;
  filteredCount: number;
  currentPage: number;
  pages: number;
  pageSize: number;
  onDraftRole: (accountId: string, role: TeamRole) => void;
  onPage: (page: number) => void;
}) {
  const { t } = useTranslation();
  const canEdit = canManageTeam(shown.role);
  const columns = useMemo<ColumnDef<TeamMember, unknown>[]>(
    () => [
      { accessorKey: "identifier", header: t("team.member") },
      {
        accessorKey: "role",
        header: t("team.role"),
        cell: ({ row }) =>
          editing && canEdit && row.original.role !== "owner" ? (
            <Select
              value={roleDraft[row.original.accountId] ?? row.original.role}
              disabled={busy}
              onValueChange={(value) => onDraftRole(row.original.accountId, value as TeamRole)}
            >
              <SelectTrigger aria-label={t("team.role")} className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEMBER_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {t(roleLabel(role))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="inline-flex h-8 items-center">{t(roleLabel(row.original.role))}</span>
          ),
      },
      {
        accessorKey: "createdAt",
        header: t("team.registeredAt"),
        cell: ({ row }) => <span className="text-muted-foreground">{formatTeamTime(row.original.createdAt)}</span>,
      },
    ],
    [busy, canEdit, editing, onDraftRole, roleDraft, t],
  );

  return (
    <>
      <DataTable columns={columns} data={visible} empty={memberCount === 0 ? t("team.noMembers") : t("team.noMatch")} />
      {filteredCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{t("team.memberTotal", { count: filteredCount, size: pageSize })}</span>
          <span className="flex items-center gap-1">
            <Button type="button" size="sm" variant="ghost" disabled={currentPage <= 1} onClick={() => onPage(currentPage - 1)}>
              {t("team.prevPage")}
            </Button>
            {pageItems(currentPage, pages).map((item, index) =>
              item === null ? (
                <span key={`gap-${index}`} className="px-1">…</span>
              ) : (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant={item === currentPage ? "outline" : "ghost"}
                  className="min-w-7 px-2"
                  aria-current={item === currentPage ? "page" : undefined}
                  onClick={() => onPage(item)}
                >
                  {item}
                </Button>
              ),
            )}
            <Button type="button" size="sm" variant="ghost" disabled={currentPage >= pages} onClick={() => onPage(currentPage + 1)}>
              {t("team.nextPage")}
            </Button>
          </span>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </>
  );
}
