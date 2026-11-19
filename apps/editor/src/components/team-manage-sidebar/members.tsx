import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TEAM_ROLES, formatTeamTime, roleLabel } from "@/components/team/text";
import { canManageTeam, type TeamInfo, type TeamMember, type TeamRole } from "@/store/teamStore";

export function TeamMembersTab({
  shown,
  busy,
  error,
  visible,
  memberCount,
  filteredCount,
  currentPage,
  pages,
  pageSize,
  onAssignRole,
  onPage,
}: {
  shown: TeamInfo;
  busy: boolean;
  error: string;
  visible: TeamMember[];
  memberCount: number;
  filteredCount: number;
  currentPage: number;
  pages: number;
  pageSize: number;
  onAssignRole: (accountId: string, role: TeamRole) => void;
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
          canEdit ? (
            <Select
              value={row.original.role}
              disabled={busy}
              onValueChange={(value) => onAssignRole(row.original.accountId, value as TeamRole)}
            >
              <SelectTrigger aria-label={t("team.role")} className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEAM_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {t(roleLabel(role))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span>{t(roleLabel(row.original.role))}</span>
          ),
      },
      {
        accessorKey: "createdAt",
        header: t("team.registeredAt"),
        cell: ({ row }) => <span className="text-muted-foreground">{formatTeamTime(row.original.createdAt)}</span>,
      },
    ],
    [busy, canEdit, onAssignRole, t],
  );

  return (
    <>
      <DataTable columns={columns} data={visible} empty={memberCount === 0 ? t("team.noMembers") : t("team.noMatch")} />
      {filteredCount > pageSize ? (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{t("team.pageOf", { page: currentPage, pages })}</span>
          <span className="flex gap-2">
            <Button type="button" size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => onPage(currentPage - 1)}>
              {t("team.prevPage")}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={currentPage >= pages} onClick={() => onPage(currentPage + 1)}>
              {t("team.nextPage")}
            </Button>
          </span>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </>
  );
}
