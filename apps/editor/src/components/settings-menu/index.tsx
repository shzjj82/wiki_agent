import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock, LogOut, RefreshCw } from "lucide-react";
import { CheckUpdateSlot } from "@/components/app-update";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverSeparator, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import type { SyncSettings } from "@/store/syncSettings";

const iconProps = { size: 16 };

type Props = {
  label: string;
  settings: SyncSettings;
  onChange: (settings: SyncSettings) => void;
  onLogout: () => void;
  onChangePassword: () => void;
  onCreateTeam: () => void;
  onJoinTeam: () => void;
};

/** 只在登录后出现：创建/加入团队、同步、改密码、退出 */
export function SettingsMenu({
  label,
  settings,
  onChange,
  onLogout,
  onChangePassword,
  onCreateTeam,
  onJoinTeam,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-full min-w-0 shrink justify-start px-2 text-left text-xs font-normal text-muted-foreground"
          title={label}
        >
          <span className="min-w-0 truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-48">
        <Label className="flex h-8 w-full items-center justify-between gap-2 rounded-md px-2 font-normal hover:bg-muted">
          {t("settingsMenu.allowSync")}
          <Switch checked={settings.enabled} onCheckedChange={(enabled) => onChange({ enabled })} />
        </Label>
        <PopoverSeparator />
        <button
          type="button"
          className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-muted"
          onClick={() => {
            setOpen(false);
            onCreateTeam();
          }}
        >
          {t("team.createTeam")}
        </button>
        <button
          type="button"
          className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-muted"
          onClick={() => {
            setOpen(false);
            onJoinTeam();
          }}
        >
          {t("team.joinTeam")}
        </button>
        <PopoverSeparator />
        <CheckUpdateSlot>
          {(check) => (
            <button
              type="button"
              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-muted"
              onClick={() => {
                setOpen(false);
                check();
              }}
            >
              <RefreshCw {...iconProps} size={14} />
              {t("appUpdate.check")}
            </button>
          )}
        </CheckUpdateSlot>
        <button
          type="button"
          className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-muted"
          onClick={() => {
            setOpen(false);
            onChangePassword();
          }}
        >
          <Lock {...iconProps} size={14} />
          {t("common.changePassword")}
        </button>
        <button
          type="button"
          className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-destructive hover:bg-muted"
          onClick={() => {
            setOpen(false);
            onLogout();
          }}
        >
          <LogOut {...iconProps} size={14} />
          {t("settingsMenu.logOut")}
        </button>
      </PopoverContent>
    </Popover>
  );
}
