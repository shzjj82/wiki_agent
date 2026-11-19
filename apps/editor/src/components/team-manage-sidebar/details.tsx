import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Hint, InfoCell } from "@/components/team/hint";
import { formatTeamTime, roleHint, roleLabel } from "@/components/team/text";
import { updateTeam, type TeamInfo } from "@/store/teamStore";
import type { RemoteSession } from "@/store/remoteStore";

export function TeamDetailsTab({
  session,
  shown,
  name,
  description,
  canEdit,
  busy,
  error,
  onName,
  onDescription,
  onShown,
  onBusy,
  onError,
  onChanged,
}: {
  session: RemoteSession;
  shown: TeamInfo;
  name: string;
  description: string;
  canEdit: boolean;
  busy: boolean;
  error: string;
  onName: (value: string) => void;
  onDescription: (value: string) => void;
  onShown: (team: TeamInfo) => void;
  onBusy: (busy: boolean) => void;
  onError: (error: string) => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const dirty = name.trim() !== shown.name || description.trim() !== (shown.description ?? "");

  return (
    <>
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canEdit || !name.trim()) return;
        onBusy(true);
        onError("");
        void updateTeam(session, shown.id, { name, description })
          .then((next) => {
            onShown(next);
            onName(next.name);
            onDescription(next.description ?? "");
            onChanged();
          })
          .catch((err: unknown) => onError(err instanceof Error ? err.message : t("team.saveFailed")))
          .finally(() => onBusy(false));
      }}
    >
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
        <InfoCell label={t("team.name")}>
          {canEdit ? (
            <Input id="team-detail-name" value={name} onChange={(event) => onName(event.target.value)} />
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
        <InfoCell label={t("team.registeredAt")}>{formatTeamTime(shown.createdAt)}</InfoCell>
        <InfoCell label={t("team.updatedAt")}>{formatTeamTime(shown.updatedAt)}</InfoCell>
        <InfoCell label={t("team.about")} className="sm:col-span-2">
          {canEdit ? (
            <textarea
              id="team-detail-description"
              value={description}
              rows={3}
              placeholder={t("team.detailsPlaceholder")}
              onChange={(event) => onDescription(event.target.value)}
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
    </>
  );
}
