import { useTranslation } from "react-i18next";
import { ROLE_CAPS, TEAM_ROLES, roleHint, roleLabel, roleStatus } from "@/components/team/text";

export function TeamRolesTab() {
  const { t } = useTranslation();
  return (
    <>
      {TEAM_ROLES.map((role) => (
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
    </>
  );
}
