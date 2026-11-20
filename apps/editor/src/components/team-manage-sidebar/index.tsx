import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TeamInfo } from "@/store/teamStore";
import type { RemoteSession } from "@/store/remoteStore";
import { TEAM_DETAILS_FORM, TeamDetailsTab } from "./details";
import { TeamMembersTab } from "./members";
import { TeamRolesTab } from "./roles";
import { useTeamDetail } from "./useTeamDetail";

/** 下划线式 tab：贴住标题行底边，不撑开宽度 */
const LINE_TAB = "h-full flex-none rounded-none px-0.5 group-data-horizontal/tabs:after:bottom-0";

type Props = {
  session: RemoteSession;
  team: TeamInfo | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
};

export function TeamManageSidebar({ session, team, open, onClose, onChanged }: Props) {
  const { t } = useTranslation();
  const detail = useTeamDetail(session, team, onChanged);
  if (!detail.shown) return null;
  const shown = detail.shown;
  const dirty = detail.name.trim() !== shown.name || detail.description.trim() !== (shown.description ?? "");

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <SheetDescription className="sr-only">{t("team.manageTeam")}</SheetDescription>
        <header className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
          <SheetTitle>{shown.name}</SheetTitle>
          <Button type="button" variant="ghost" size="icon" aria-label={t("team.close")} onClick={onClose}>
            <X size={16} />
          </Button>
        </header>
        <Tabs value={detail.tab} onValueChange={detail.setTab} className="min-h-0 flex-1 gap-4 overflow-auto p-5">
          <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border">
            <TabsList variant="line" className="-mb-px shrink-0 gap-5 self-stretch p-0 group-data-horizontal/tabs:h-auto">
              <TabsTrigger value="details" className={LINE_TAB}>{t("team.manageTeam")}</TabsTrigger>
              <TabsTrigger value="members" className={LINE_TAB}>{t("team.members")}</TabsTrigger>
              <TabsTrigger value="roles" className={LINE_TAB}>{t("team.roleInfo")}</TabsTrigger>
            </TabsList>
            {detail.canEdit && detail.tab !== "roles" ? (
              <div className="ml-auto flex items-center gap-2">
                {detail.editing ? (
                  <>
                    <Button type="button" variant="ghost" size="sm" disabled={detail.busy} onClick={() => detail.toggleEditing(false)}>
                      {t("common.cancel")}
                    </Button>
                    {detail.tab === "details" ? (
                      <Button type="submit" form={TEAM_DETAILS_FORM} size="sm" disabled={detail.busy || !dirty || !detail.name.trim()}>
                        {t("team.saveDetails")}
                      </Button>
                    ) : (
                      <Button type="button" size="sm" disabled={detail.busy || !detail.rolesDirty} onClick={detail.saveRoles}>
                        {t("team.saveDetails")}
                      </Button>
                    )}
                  </>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={() => detail.toggleEditing(true)}>
                    {t("team.editDetails")}
                  </Button>
                )}
              </div>
            ) : null}
          </div>
          <TabsContent value="details" className="flex min-h-0 flex-col gap-3">
            <TeamDetailsTab
              session={session}
              shown={shown}
              name={detail.name}
              description={detail.description}
              editing={detail.editing}
              busy={detail.busy}
              error={detail.error}
              onName={detail.setName}
              onDescription={detail.setDescription}
              onShown={detail.setShown}
              onBusy={detail.setBusy}
              onError={detail.setError}
              onChanged={onChanged}
              onSaved={() => detail.toggleEditing(false)}
            />
          </TabsContent>
          <TabsContent value="members" className="grid h-auto flex-none content-start items-start gap-3">
            <div className="relative w-full justify-self-end sm:max-w-64">
              <Search size={14} className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={detail.query}
                aria-label={t("team.memberSearch")}
                placeholder={t("team.memberSearch")}
                className="h-8 bg-background pl-7"
                onChange={(event) => {
                  detail.setQuery(event.target.value);
                  detail.setPage(1);
                }}
              />
            </div>
            <TeamMembersTab
              shown={shown}
              editing={detail.editing}
              roleDraft={detail.roleDraft}
              busy={detail.busy}
              error={detail.error}
              visible={detail.visible}
              memberCount={detail.members.length}
              filteredCount={detail.filteredCount}
              currentPage={detail.currentPage}
              pages={detail.pages}
              pageSize={detail.pageSize}
              onDraftRole={detail.draftRole}
              onPage={detail.setPage}
            />
          </TabsContent>
          <TabsContent value="roles" className="grid h-auto flex-none grid-cols-1 content-start items-start gap-3">
            <TeamRolesTab />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
