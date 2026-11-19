import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { LanguageSwitch } from "@/components/language-switch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setAppLocale } from "@/i18n";
import { appHomePath, joinCodeFromPath, safeRedirect } from "@/lib/route";
import { loadSession, loginRemote, registerRemote } from "@/store/remoteStore";

/** `/login?redirect=…`：登录或注册成功后回到原来的地址。 */
export function LoginView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = safeRedirect(params.get("redirect"));
  const [joining, setJoining] = useState(false);
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (loadSession()) {
    return <Navigate to={redirect} replace />;
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
      if (joining) {
        await registerRemote(user, password, nickname.trim() || undefined);
      } else {
        await loginRemote(user, password);
      }
      navigate(redirect, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : joining ? t("common.signUpFailed") : t("common.loginFailed"));
      setBusy(false);
    }
  }

  function keepLocal() {
    // 邀请链接必须登录，回去只会再跳到登录页，所以本地编辑一律回编辑器首页。
    const back = joinCodeFromPath(redirect.split("?")[0]) ? appHomePath() : redirect;
    navigate(back, { replace: true });
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center bg-muted p-6">
      <div className="absolute top-3 right-6">
        <LanguageSwitch onChange={(locale) => void setAppLocale(locale)} />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <img src="/logo.png" alt="" className="size-7 rounded-md" />
            {joining ? t("app.signUp") : t("app.logIn")}
          </CardTitle>
          <CardDescription>{joining ? t("app.signUpHint") : t("app.loginHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="username">{t("app.username")}</Label>
              <Input
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                placeholder={t("app.usernameHint")}
              />
            </div>
            {joining ? (
              <div className="grid gap-2">
                <Label htmlFor="nickname">{t("app.nicknameOptional")}</Label>
                <Input
                  id="nickname"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  autoComplete="nickname"
                  placeholder={t("app.defaultsToYourUsername")}
                />
              </div>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="password">{t("app.password")}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={joining ? "new-password" : "current-password"}
                placeholder={joining ? t("common.atLeast6Characters") : undefined}
              />
            </div>
            {joining ? (
              <div className="grid gap-2">
                <Label htmlFor="confirm">{t("app.confirmPassword")}</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="new-password"
                />
              </div>
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy
                ? joining
                  ? t("app.signingUp")
                  : t("app.loggingIn")
                : joining
                  ? t("app.signUp")
                  : t("app.logIn")}
            </Button>
          </form>
          <Button
            type="button"
            variant="ghost"
            className="mt-2 w-full"
            onClick={() => {
              setJoining((value) => !value);
              setError("");
            }}
          >
            {joining ? t("app.haveAnAccountLogIn") : t("app.noAccountSignUp")}
          </Button>
          <Button type="button" variant="link" className="w-full" onClick={keepLocal}>
            {t("app.keepEditingLocally")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
