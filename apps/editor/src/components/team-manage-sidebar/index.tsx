import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Close } from "@icon-park/react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { canManageTeam, loadTeam, refreshTeamCode, setTeamRole, type TeamInfo, type TeamMember, type TeamRole } from "@/store/teamStore";
import { copyText } from "@/lib/clipboard";
import type { RemoteSession } from "@/store/remoteStore";

type Props = {
  session: RemoteSession;
  team: TeamInfo | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
};

type DetailRow = {
  field: string;
  value: string;
};

function formatTime(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const ROLES: TeamRole[] = ["owner", "developer", "user"];

function roleLabel(role: TeamRole): "team.roleOwner" | "team.roleDeveloper" | "team.roleUser" {
  if (role === "owner") return "team.roleOwner";
  if (role === "developer") return "team.roleDeveloper";
  return "team.roleUser";
}

export function TeamManageSidebar({ session, team, open, onClose, onChanged }: Props) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [shown, setShown] = useState(team);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const code = shown?.code;

  useEffect(() => {
    if (!team) return;
    setShown(team);
    let alive = true;
    void loadTeam(session, team.id)
      .then((detail) => {
        if (!alive) return;
        setShown(detail.team);
        setMembers(detail.members);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : t("team.loadFailed"));
      });
    return () => {
      alive = false;
    };
  }, [session, team, t]);

  const detailRows = useMemo<DetailRow[]>(
    () => [
      { field: t("team.name"), value: shown?.name ?? "" },
      { field: t("team.code"), value: code ?? "—" },
      { field: t("team.registeredAt"), value: formatTime(shown?.createdAt ?? "") },
      { field: t("team.updatedAt"), value: formatTime(shown?.updatedAt ?? "") },
    ],
    [code, shown?.createdAt, shown?.name, shown?.updatedAt, t],
  );

  const detailColumns = useMemo<ColumnDef<DetailRow, unknown>[]>(
    () => [
      { accessorKey: "field", header: t("team.field") },
      {
        accessorKey: "value",
        header: t("team.value"),
        cell: ({ row }) =>
          row.original.field === t("team.code") ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="font-mono tracking-[0.2em]">{code ?? "—"}</span>
              {code ? (
                <Button type="button" size="sm" variant="outline" onClick={() => void copyText(code)}>
                  {t("team.copyCode")}
                </Button>
              ) : null}
              {shown && canManageTeam(shown.role) ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    setError("");
                    void refreshTeamCode(session, shown.id)
                      .then((next) => {
                        setShown(next);
                        onChanged();
                      })
                      .catch((err: unknown) => {
                        setError(err instanceof Error ? err.message : t("team.refreshFailed"));
                      })
                      .finally(() => setBusy(false));
                  }}
                >
                  {t("team.refreshCode")}
                </Button>
              ) : null}
            </span>
          ) : (
            <span>{row.original.value}</span>
          ),
      },
    ],
    [busy, code, onChanged, session, shown, t],
  );

  const memberColumns = useMemo<ColumnDef<TeamMember, unknown>[]>(
    () => [
      { accessorKey: "identifier", header: t("team.member") },
      {
        accessorKey: "createdAt",
        header: t("team.registeredAt"),
        cell: ({ row }) => formatTime(row.original.createdAt),
      },
      {
        accessorKey: "role",
        header: t("team.role"),
        cell: ({ row }) => (
          <Select
            value={row.original.role}
            disabled={busy || !shown || !canManageTeam(shown.role)}
            onValueChange={(value) => {
              if (!shown) return;
              const role = value as TeamRole;
              const accountId = row.original.accountId;
              setBusy(true);
              setError("");
              void setTeamRole(session, shown.id, accountId, role)
                .then(() => {
                  setMembers((prev) => prev.map((item) => (item.accountId === accountId ? { ...item, role } : item)));
                  onChanged();
                })
                .catch((err: unknown) => setError(err instanceof Error ? err.message : t("team.roleFailed")))
                .finally(() => setBusy(false));
            }}
          >
            <SelectTrigger aria-label={t("team.role")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {t(roleLabel(role))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
      },
    ],
    [busy, onChanged, session, shown, t],
  );

  if (!shown) return null;

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
    <SheetContent className="pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <SheetDescription className="sr-only">{t("team.manageTeam")}</SheetDescription>
      <header className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
        <SheetTitle>{shown.name}</SheetTitle>
        <Button type="button" variant="ghost" size="icon" aria-label={t("team.close")} onClick={onClose}>
          <Close theme="outline" strokeWidth={3} size={16} />
        </Button>
      </header>
      <Tabs defaultValue="details" className="min-h-0 flex-1 gap-4 p-5">
        <TabsList>
          <TabsTrigger value="details">{t("team.manageTeam")}</TabsTrigger>
          <TabsTrigger value="members">{t("team.members")}</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <DataTable columns={detailColumns} data={detailRows} />
        </TabsContent>
        <TabsContent value="members" className="grid gap-3">
          <DataTable columns={memberColumns} data={members} empty={t("team.noMembers")} />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </TabsContent>
      </Tabs>
    </SheetContent>
    </Sheet>
  );
}
