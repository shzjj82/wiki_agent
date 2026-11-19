import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTeam, joinTeam, type TeamInfo } from "@/store/teamStore";
import type { RemoteSession } from "@/store/remoteStore";
import { formatTeamTime, roleHint, roleLabel } from "@/components/team/text";

type Props = {
  session: RemoteSession;
  teams: TeamInfo[];
  onChanged: () => void;
  onManage: (team: TeamInfo) => void;
};

export function TeamListPanel({ session, teams, onChanged, onManage }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("team.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <h2 className="text-base font-medium">{t("team.list")}</h2>
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const next = name.trim();
          if (!next) return;
          void run(async () => {
            await createTeam(session, next);
            setName("");
          });
        }}
      >
        <Label htmlFor="team-list-name">{t("team.createTeam")}</Label>
        <div className="flex gap-2">
          <Input id="team-list-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={t("team.namePlaceholder")} />
          <Button type="submit" disabled={busy || !name.trim()}>
            {t("team.create")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("team.createHint")}</p>
      </form>
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!code.trim()) return;
          void run(async () => {
            await joinTeam(session, code);
            setCode("");
          });
        }}
      >
        <Label htmlFor="team-list-code">{t("team.joinTeam")}</Label>
        <div className="flex gap-2">
          <Input id="team-list-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder={t("team.joinPlaceholder")} />
          <Button type="submit" variant="outline" disabled={busy || !code.trim()}>
            {t("team.join")}
          </Button>
        </div>
      </form>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {teams.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("team.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {teams.map((team) => (
            <li key={team.id} className="rounded-lg border border-border px-3 py-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{team.name}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {team.description?.trim() || t("team.noDescription")}
                  </p>
                  <p className="mt-2 text-xs text-foreground">{t(roleLabel(team.role))}</p>
                  <p className="text-xs leading-5 text-muted-foreground">{t(roleHint(team.role))}</p>
                  {team.updatedAt ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t("team.updatedAt")} {formatTeamTime(team.updatedAt, false)}
                    </p>
                  ) : null}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => onManage(team)}>
                  {t("team.manageTeam")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
