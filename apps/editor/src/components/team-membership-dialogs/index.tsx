import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { RemoteSession } from "@/store/remoteStore";
import { dissolveTeam, leaveTeam, type TeamInfo } from "@/store/teamStore";

/** 解散和退出共用确认框。两边的善后步骤一样，只是调用的接口不同。 */
export function TeamMembershipDialogs({
  session,
  dissolveTarget,
  leaveTarget,
  onCloseDissolve,
  onCloseLeave,
  onDone,
  onError,
}: {
  session: RemoteSession | null;
  dissolveTarget: TeamInfo | null;
  leaveTarget: TeamInfo | null;
  onCloseDissolve: () => void;
  onCloseLeave: () => void;
  onDone: (teamId: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();

  function run(target: TeamInfo | null, close: () => void, action: (session: RemoteSession, id: string) => Promise<void>) {
    if (!session || !target) return;
    const teamId = target.id;
    close();
    void action(session, teamId)
      .then(() => onDone(teamId))
      .catch((err: unknown) => onError(err instanceof Error ? err.message : t("team.failed")));
  }

  return (
    <>
      <Dialog open={dissolveTarget !== null} onOpenChange={(open) => !open && onCloseDissolve()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("team.dissolve")}</DialogTitle>
            <DialogDescription>{t("team.dissolveConfirm", { name: dissolveTarget?.name ?? "" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCloseDissolve}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => run(dissolveTarget, onCloseDissolve, dissolveTeam)}
            >
              {t("team.dissolve")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={leaveTarget !== null} onOpenChange={(open) => !open && onCloseLeave()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("team.leave")}</DialogTitle>
            <DialogDescription>{t("team.leaveConfirm", { name: leaveTarget?.name ?? "" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCloseLeave}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => run(leaveTarget, onCloseLeave, leaveTeam)}
            >
              {t("team.leave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
