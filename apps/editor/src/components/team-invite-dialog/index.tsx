import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TeamInviteFields } from "@/components/team-invite";
import type { RemoteSession } from "@/store/remoteStore";
import { refreshTeamCode, type TeamInfo } from "@/store/teamStore";

/** 邀请码和邀请链接只在这个入口里，不放进团队详情。 */
export function TeamInviteDialog({
  session,
  team,
  onClose,
  onUpdated,
  onError,
}: {
  session: RemoteSession | null;
  team: TeamInfo | null;
  onClose: () => void;
  onUpdated: (team: TeamInfo) => void;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);

  return (
    <Dialog open={team !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("team.inviteMembers")}</DialogTitle>
          <DialogDescription>{t("team.inviteHint")}</DialogDescription>
        </DialogHeader>
        <TeamInviteFields
          code={team?.code ?? null}
          refreshing={refreshing}
          onRefresh={
            session && team
              ? () => {
                  const current = team;
                  setRefreshing(true);
                  onError("");
                  void refreshTeamCode(session, current.id)
                    .then(onUpdated)
                    .catch((err: unknown) => onError(err instanceof Error ? err.message : t("team.refreshFailed")))
                    .finally(() => setRefreshing(false));
                }
              : undefined
          }
        />
      </DialogContent>
    </Dialog>
  );
}
