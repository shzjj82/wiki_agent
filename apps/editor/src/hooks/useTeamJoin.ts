import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import type { RemoteSession } from "@/store/remoteStore";
import { joinTeam, listTeams, previewTeam, writeActiveTeamId, type TeamInfo, type TeamPreview } from "@/store/teamStore";
import { joinCodeFromPath, writeAppLocation } from "@/lib/route";

export type JoinPrompt = {
  code: string;
  loading: boolean;
  error: string;
  preview: TeamPreview | null;
};

/** 打开 /app/join/:code 后先读团队资料，确认后才加入。 */
export function useTeamJoin({
  session,
  sessionRef,
  pageIdRef,
  onNeedLogin,
  setTeams,
  setActiveTeamId,
  setHint,
  setError,
}: {
  session: RemoteSession | null;
  sessionRef: MutableRefObject<RemoteSession | null>;
  /** 取消或加入后回到的文档 */
  pageIdRef: MutableRefObject<string | null>;
  /** 没登录时去登录页，登录后会回到这条邀请链接。 */
  onNeedLogin: () => void;
  setTeams: Dispatch<SetStateAction<TeamInfo[]>>;
  setActiveTeamId: Dispatch<SetStateAction<string | null>>;
  setHint: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string>>;
}) {
  const { t } = useTranslation();
  const [joinPrompt, setJoinPrompt] = useState<JoinPrompt | null>(null);
  const [joinBusy, setJoinBusy] = useState(false);
  const needLoginRef = useRef(onNeedLogin);
  needLoginRef.current = onNeedLogin;
  const code = joinCodeFromPath(useLocation().pathname);

  useEffect(() => {
    if (!code) {
      setJoinPrompt(null);
      return;
    }
    if (!session) {
      setJoinPrompt(null);
      needLoginRef.current();
      return;
    }
    let alive = true;
    setJoinPrompt({ code, loading: true, error: "", preview: null });
    void previewTeam(session, code)
      .then((preview) => {
        if (!alive) return;
        setJoinPrompt({ code, loading: false, error: "", preview });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setJoinPrompt({
          code,
          loading: false,
          error: err instanceof Error ? err.message : t("team.loadFailed"),
          preview: null,
        });
      });
    return () => {
      alive = false;
    };
  }, [code, session, t]);

  function leaveJoinUrl() {
    writeAppLocation(pageIdRef.current, "replace");
  }

  function cancelJoin() {
    if (joinBusy) return;
    leaveJoinUrl();
  }

  function confirmJoin() {
    if (!session || !joinPrompt?.preview || joinBusy) return;
    const preview = joinPrompt.preview;
    const code = joinPrompt.code;
    setJoinBusy(true);
    setError("");
    const done = (id: string, message: string) => {
      writeActiveTeamId(id);
      setActiveTeamId(id);
      setHint(message);
      leaveJoinUrl();
    };
    const finish = (task: Promise<void>) => {
      void task
        .catch((err: unknown) => {
          setJoinPrompt((current) =>
            current ? { ...current, error: err instanceof Error ? err.message : t("team.joinFailed") } : current,
          );
        })
        .finally(() => setJoinBusy(false));
    };
    if (preview.alreadyMember) {
      finish(
        listTeams(session).then((list) => {
          if (sessionRef.current !== session) return;
          setTeams(list);
          done(preview.id, t("team.joinAlready"));
        }),
      );
      return;
    }
    finish(
      joinTeam(session, code).then(async (joined) => {
        if (sessionRef.current !== session) return;
        const list = await listTeams(session);
        if (sessionRef.current !== session) return;
        setTeams(list);
        done(joined.id, t("team.joined"));
      }),
    );
  }

  return { joinPrompt, joinBusy, cancelJoin, confirmJoin };
}
