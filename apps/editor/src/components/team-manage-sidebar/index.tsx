import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CircleHelp, Search, X } from "lucide-react";
import { cn } from "cn";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  canManageTeam,
  loadTeam,
  setTeamRole,
  updateTeam,
  type TeamInfo,
  type TeamMember,
  type TeamRole,
} from "@/store/teamStore";
import type { RemoteSession } from "@/store/remoteStore";

type Props = {
  session: RemoteSession;
  team: TeamInfo | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
};

const ROLES: TeamRole[] = ["owner", "developer", "user"];
const PAGE_SIZE = 8;

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

function roleLabel(role: TeamRole): "team.roleOwner" | "team.roleDeveloper" | "team.roleUser" {
  if (role === "owner") return "team.roleOwner";
  if (role === "developer") return "team.roleDeveloper";
  return "team.roleUser";
}

function roleHint(role: TeamRole): "team.roleOwnerHint" | "team.roleDeveloperHint" | "team.roleUserHint" {
  if (role === "owner") return "team.roleOwnerHint";
  if (role === "developer") return "team.roleDeveloperHint";
  return "team.roleUserHint";
}

function roleStatus(role: TeamRole): "team.roleStatusManage" | "team.roleStatusEdit" | "team.roleStatusRead" {
  if (role === "owner") return "team.roleStatusManage";
  if (role === "developer") return "team.roleStatusEdit";
  return "team.roleStatusRead";
}

const ROLE_CAPS: Record<TeamRole, Array<"team.roleCapWrite" | "team.roleCapRoles" | "team.roleCapCode" | "team.roleCapDissolve" | "team.roleCapRead">> = {
  owner: ["team.roleCapWrite", "team.roleCapRoles", "team.roleCapCode", "team.roleCapDissolve"],
  developer: ["team.roleCapWrite"],
  user: ["team.roleCapRead"],
};

function Hint({ text }: { text: string }) {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <button type="button" className="inline-flex text-muted-foreground" aria-label={text}>
            <CircleHelp size={14} />
          </button>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side="top"
            sideOffset={6}
            className="z-50 max-w-56 rounded-md bg-foreground px-2 py-1.5 text-xs leading-5 text-background"
          >
            {text}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

function InfoCell({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 min-w-0 text-sm">{children}</div>
    </div>
  );
}

export function TeamManageSidebar({ session, team, open, onClose, onChanged }: Props) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [shown, setShown] = useState(team);
  const [name, setName] = useState(team?.name ?? "");
  const [description, setDescription] = useState(team?.description ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState("details");
  const canEdit = Boolean(shown && canManageTeam(shown.role));

  useEffect(() => {
    if (!team) return;
    setShown(team);
    setName(team.name);
    setDescription(team.description ?? "");
    setQuery("");
    setPage(1);
    setTab("details");
    let alive = true;
    void loadTeam(session, team.id)
      .then((detail) => {
        if (!alive) return;
        setShown(detail.team);
        setName(detail.team.name);
        setDescription(detail.team.description ?? "");
        setMembers(detail.members);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : t("team.loadFailed"));
      });
    return () => {
      alive = false;
    };
  }, [session, team, t]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((member) => member.identifier.toLowerCase().includes(needle));
  }, [members, query]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const memberColumns = useMemo<ColumnDef<TeamMember, unknown>[]>(
    () => [
      { accessorKey: "identifier", header: t("team.member") },
      {
        accessorKey: "role",
        header: t("team.role"),
        cell: ({ row }) =>
          shown && canManageTeam(shown.role) ? (
          <Select
            value={row.original.role}
            disabled={busy}
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
            <SelectTrigger aria-label={t("team.role")} className="h-8 w-28">
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
          ) : (
            <span>{t(roleLabel(row.original.role))}</span>
          ),
      },
      {
        accessorKey: "createdAt",
        header: t("team.registeredAt"),
        cell: ({ row }) => <span className="text-muted-foreground">{formatTime(row.original.createdAt)}</span>,
      },
    ],
    [busy, onChanged, session, shown, t],
  );

  if (!shown) return null;

  const dirty = name.trim() !== shown.name || description.trim() !== (shown.description ?? "");

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <SheetDescription className="sr-only">{t("team.manageTeam")}</SheetDescription>
        <header className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
          <SheetTitle>{shown.name}</SheetTitle>
          <Button type="button" variant="ghost" size="icon" aria-label={t("team.close")} onClick={onClose}>
            <X size={16} />
          </Button>
        </header>
        <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-4 overflow-auto p-5">
          <div className="flex items-center gap-3">
            <TabsList className="shrink-0">
              <TabsTrigger value="details">{t("team.manageTeam")}</TabsTrigger>
              <TabsTrigger value="members">{t("team.members")}</TabsTrigger>
              <TabsTrigger value="roles">{t("team.roleInfo")}</TabsTrigger>
            </TabsList>
            {tab === "members" ? (
              <div className="relative ml-auto min-w-36 flex-1 sm:max-w-56">
                <Search size={14} className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  aria-label={t("team.memberSearch")}
                  placeholder={t("team.memberSearch")}
                  className="h-8 bg-background pl-7"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                />
              </div>
            ) : null}
          </div>
          <TabsContent value="details" className="grid h-auto flex-none content-start items-start gap-5">
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!canEdit || !name.trim()) return;
                setBusy(true);
                setError("");
                void updateTeam(session, shown.id, { name, description })
                  .then((next) => {
                    setShown(next);
                    setName(next.name);
                    setDescription(next.description ?? "");
                    onChanged();
                  })
                  .catch((err: unknown) => setError(err instanceof Error ? err.message : t("team.saveFailed")))
                  .finally(() => setBusy(false));
              }}
            >
              <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
                <InfoCell label={t("team.name")}>
                  {canEdit ? (
                    <Input id="team-detail-name" value={name} onChange={(event) => setName(event.target.value)} />
                  ) : (
                    <p>{shown.name}</p>
                  )}
                </InfoCell>
                <InfoCell label={t("team.role")}>
                  <p className="flex items-center gap-1">
                    <span>{t(roleLabel(shown.role))}</span>
                    <Hint text={t(roleHint(shown.role))} />
                  </p>
                </InfoCell>
                <InfoCell label={t("team.registeredAt")}>{formatTime(shown.createdAt)}</InfoCell>
                <InfoCell label={t("team.updatedAt")}>{formatTime(shown.updatedAt)}</InfoCell>
                <InfoCell label={t("team.about")} className="sm:col-span-2">
                  {canEdit ? (
                    <textarea
                      id="team-detail-description"
                      value={description}
                      rows={3}
                      placeholder={t("team.detailsPlaceholder")}
                      onChange={(event) => setDescription(event.target.value)}
                      className="w-full resize-y rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                  ) : (
                    <p className="whitespace-pre-wrap text-muted-foreground">{shown.description?.trim() || t("team.noDescription")}</p>
                  )}
                </InfoCell>
              </div>
              {canEdit ? (
                <Button type="submit" size="sm" className="w-fit" disabled={busy || !dirty || !name.trim()}>
                  {t("team.saveDetails")}
                </Button>
              ) : null}
            </form>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </TabsContent>
          <TabsContent value="members" className="grid h-auto flex-none content-start items-start gap-3">
            <DataTable
              columns={memberColumns}
              data={visible}
              empty={members.length === 0 ? t("team.noMembers") : t("team.noMatch")}
            />
            {filtered.length > PAGE_SIZE ? (
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{t("team.pageOf", { page: currentPage, pages })}</span>
                <span className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                    {t("team.prevPage")}
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>
                    {t("team.nextPage")}
                  </Button>
                </span>
              </div>
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </TabsContent>
          <TabsContent value="roles" className="grid h-auto flex-none grid-cols-1 content-start items-start gap-3">
            {ROLES.map((role) => (
              <section key={role} className="h-auto self-start rounded-xl border border-border px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">{t(roleLabel(role))}</h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">{t(roleStatus(role))}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{t(roleHint(role))}</p>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {ROLE_CAPS[role].map((key) => (
                    <li key={key} className="rounded-md bg-muted px-2 py-1 text-xs text-foreground">
                      {t(key)}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
