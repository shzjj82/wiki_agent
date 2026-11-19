import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { TeamPreview, TeamRole } from "@/store/teamStore";

function formatTime(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
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

function Cell({ label, children, wide = false }: { label: string; children: string; wide?: boolean }) {
  return (
    <div className={wide ? "rounded-xl border border-border bg-muted/30 px-3 py-3 sm:col-span-2" : "rounded-xl border border-border bg-muted/30 px-3 py-3"}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1.5 whitespace-pre-wrap text-sm">{children}</p>
    </div>
  );
}

/** 打开邀请链接后先看团队信息，确认才加入。 */
export function TeamJoinDialog({
  open,
  loading,
  busy,
  error,
  preview,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  loading: boolean;
  busy: boolean;
  error: string;
  preview: TeamPreview | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const role = preview?.role ?? "user";
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{preview?.alreadyMember ? t("team.joinAlready") : t("team.joinAsk")}</DialogTitle>
          <DialogDescription>{preview?.alreadyMember ? t(roleHint(role)) : t("team.joinAskHint")}</DialogDescription>
        </DialogHeader>
        {loading ? <p className="text-sm text-muted-foreground">{t("team.joinLoading")}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {preview ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Cell label={t("team.name")}>{preview.name}</Cell>
            <Cell label={t("team.members")}>{t("team.memberCount", { count: preview.memberCount })}</Cell>
            <Cell label={t("team.registeredAt")}>{formatTime(preview.createdAt)}</Cell>
            <Cell label={t("team.updatedAt")}>{formatTime(preview.updatedAt)}</Cell>
            <Cell label={t("team.about")} wide>
              {preview.description?.trim() || t("team.noDescription")}
            </Cell>
            <Cell label={t("team.role")} wide>
              {preview.alreadyMember ? t(roleLabel(role)) : t("team.roleUser")}
            </Cell>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            {preview ? t("team.joinLater") : t("team.close")}
          </Button>
          {preview ? (
            <Button type="button" disabled={busy || loading} onClick={onConfirm}>
              {preview.alreadyMember ? t("team.joinEnter") : t("team.join")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
