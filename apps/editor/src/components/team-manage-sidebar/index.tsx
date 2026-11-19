import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TeamInfo } from "@/store/teamStore";
import type { RemoteSession } from "@/store/remoteStore";
import { TeamDetailsTab } from "./details";
import { TeamMembersTab } from "./members";
import { TeamRolesTab } from "./roles";
import { useTeamDetail } from "./useTeamDetail";

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
          <div className="flex items-center gap-3">
            <TabsList className="shrink-0">
              <TabsTrigger value="details">{t("team.manageTeam")}</TabsTrigger>
              <TabsTrigger value="members">{t("team.members")}</TabsTrigger>
              <TabsTrigger value="roles">{t("team.roleInfo")}</TabsTrigger>
            </TabsList>
            {detail.tab === "members" ? (
              <div className="relative ml-auto min-w-36 flex-1 sm:max-w-56">
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
            ) : null}
          </div>
          <TabsContent value="details" className="grid h-auto flex-none content-start items-start gap-5">
            <TeamDetailsTab
              session={session}
              shown={shown}
              name={detail.name}
              description={detail.description}
              canEdit={detail.canEdit}
              busy={detail.busy}
              error={detail.error}
              onName={detail.setName}
              onDescription={detail.setDescription}
              onShown={detail.setShown}
              onBusy={detail.setBusy}
              onError={detail.setError}
              onChanged={onChanged}
            />
          </TabsContent>
          <TabsContent value="members" className="grid h-auto flex-none content-start items-start gap-3">
            <TeamMembersTab
              shown={shown}
              busy={detail.busy}
              error={detail.error}
              visible={detail.visible}
              memberCount={detail.members.length}
              filteredCount={detail.filteredCount}
              currentPage={detail.currentPage}
              pages={detail.pages}
              pageSize={detail.pageSize}
              onAssignRole={detail.assignRole}
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
