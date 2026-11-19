import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  readShareFavorite,
  ShareRequestError,
  writeShareFavorite,
  type ShareFavorite,
} from "@/store/shareStore";
import { loadSession, loginRemote, logoutRemote, registerRemote, type RemoteSession } from "@/store/remoteStore";
import { ShareDownloadGuide } from "@/views/shared/ShareDownloadGuide";

const iconProps = { size: 16 };

/** 分享页右上角：登录入口；登录后可收藏，作者本人不显示收藏。 */
export function ShareAccess({ token }: { token: string }) {
  const { t } = useTranslation();
  const [session, setSession] = useState<RemoteSession | null>(() => loadSession());
  const [authOpen, setAuthOpen] = useState(false);
  const [favorite, setFavorite] = useState<ShareFavorite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session || !token) {
      setFavorite(null);
      return;
    }
    let gone = false;
    setFavorite(null);
    setError("");
    void readShareFavorite(session, token)
      .then((next) => {
        if (!gone) setFavorite(next);
      })
      .catch(() => {
        if (!gone) setFavorite({ favorited: false, owned: false });
      });
    return () => {
      gone = true;
    };
  }, [session, token]);

  async function toggleFavorite() {
    if (!session) {
      setAuthOpen(true);
      return;
    }
    if (favorite?.owned || busy) return;
    const nextSaved = !favorite?.favorited;
    setBusy(true);
    setError("");
    try {
      setFavorite(await writeShareFavorite(session, token, nextSaved));
    } catch (err) {
      if (err instanceof ShareRequestError && err.code === "SHARE_OWN_PAGE") {
        setFavorite({ favorited: false, owned: true });
        return;
      }
      setError(err instanceof Error ? err.message : t("share.favoriteFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await logoutRemote(session);
    setSession(null);
    setFavorite(null);
    setError("");
  }

  const showFavorite = !session || favorite?.owned !== true;

  return (
    <>
      <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
        <span className="inline-flex items-center gap-1">
          <ShareDownloadGuide />
          {showFavorite ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy || Boolean(session && favorite === null)}
              aria-pressed={favorite?.favorited === true}
              onClick={() => void toggleFavorite()}
            >
              <Star {...iconProps} className={favorite?.favorited ? "fill-current" : undefined} />
              {favorite?.favorited ? t("share.favorited") : t("share.favorite")}
            </Button>
          ) : null}
          {session ? (
            <>
              <span className="max-w-32 truncate px-2 text-xs text-foreground">{session.username}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => void logout()}>
                {t("settingsMenu.logOut")}
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setAuthOpen(true)}>
              {t("app.logIn")}
            </Button>
          )}
        </span>
        {error ? <p className="max-w-48 text-right text-xs text-destructive">{error}</p> : null}
      </div>
      <ShareAuthDialog open={authOpen} onOpenChange={setAuthOpen} onSession={setSession} />
    </>
  );
}

function ShareAuthDialog({
  open,
  onOpenChange,
  onSession,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSession: (session: RemoteSession) => void;
}) {
  const { t } = useTranslation();
  const [joining, setJoining] = useState(false);
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function close(next: boolean) {
    if (!next) {
      setError("");
      setJoining(false);
    }
    onOpenChange(next);
  }

  async function submit() {
    const user = username.trim();
    if (!user || !password) {
      setError(t("app.credentialsRequired"));
      return;
    }
    if (joining && password !== confirm) {
      setError(t("app.passwordsMismatch"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = joining
        ? await registerRemote(user, password, nickname.trim() || undefined)
        : await loginRemote(user, password);
      setUsername("");
      setNickname("");
      setPassword("");
      setConfirm("");
      onSession(next);
      close(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : joining ? t("common.signUpFailed") : t("common.loginFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{joining ? t("app.signUp") : t("app.logIn")}</DialogTitle>
          <DialogDescription>{joining ? t("app.signUpHint") : t("share.loginHint")}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="share-username">{t("app.username")}</Label>
            <Input
              id="share-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              placeholder={t("app.usernameHint")}
            />
          </div>
          {joining ? (
            <div className="grid gap-1.5">
              <Label htmlFor="share-nickname">{t("app.nicknameOptional")}</Label>
              <Input
                id="share-nickname"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                autoComplete="nickname"
              />
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="share-password">{t("app.password")}</Label>
            <Input
              id="share-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={joining ? "new-password" : "current-password"}
            />
          </div>
          {joining ? (
            <div className="grid gap-1.5">
              <Label htmlFor="share-confirm">{t("app.confirmPassword")}</Label>
              <Input
                id="share-confirm"
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
              />
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={busy}>
            {busy ? (joining ? t("app.signingUp") : t("app.loggingIn")) : joining ? t("app.signUp") : t("app.logIn")}
          </Button>
        </form>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setJoining((value) => !value);
            setError("");
          }}
        >
          {joining ? t("app.haveAnAccountLogIn") : t("app.noAccountSignUp")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
