import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  canManageTeam,
  loadTeam,
  setTeamRole,
  type TeamInfo,
  type TeamMember,
  type TeamRole,
} from "@/store/teamStore";
import type { RemoteSession } from "@/store/remoteStore";

const PAGE_SIZE = 8;

/** 团队详情抽屉的资料、成员和分页。 */
export function useTeamDetail(session: RemoteSession, team: TeamInfo | null, onChanged: () => void) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [shown, setShown] = useState(team);
  const [name, setName] = useState(team?.name ?? "");
  const [description, setDescription] = useState(team?.description ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState("details");
  const [editing, setEditing] = useState(false);
  const [roleDraft, setRoleDraft] = useState<Record<string, TeamRole>>({});
  const canEdit = Boolean(shown && canManageTeam(shown.role));

  useEffect(() => {
    if (!team) return;
    setShown(team);
    setName(team.name);
    setDescription(team.description ?? "");
    setQuery("");
    setPage(1);
    setTab("details");
    setEditing(false);
    setRoleDraft({});
    let alive = true;
    void loadTeam(session, team.id)
      .then((detail) => {
        if (!alive) return;
        setShown(detail.team);
        setName(detail.team.name);
        setDescription(detail.team.description ?? "");
        setMembers(detail.members);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : t("team.loadFailed"));
      });
    return () => {
      alive = false;
    };
  }, [session, team, t]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((member) => member.identifier.toLowerCase().includes(needle));
  }, [members, query]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function draftRole(accountId: string, role: TeamRole) {
    const original = members.find((item) => item.accountId === accountId)?.role;
    setRoleDraft((prev) => {
      const next = { ...prev };
      if (role === original) delete next[accountId];
      else next[accountId] = role;
      return next;
    });
  }

  function saveRoles() {
    if (!shown || !canManageTeam(shown.role)) return;
    const changes = Object.entries(roleDraft);
    if (!changes.length) return;
    setBusy(true);
    setError("");
    void (async () => {
      for (const [accountId, role] of changes) {
        await setTeamRole(session, shown.id, accountId, role);
        setMembers((prev) => prev.map((item) => (item.accountId === accountId ? { ...item, role } : item)));
        setRoleDraft((prev) => {
          const next = { ...prev };
          delete next[accountId];
          return next;
        });
      }
    })()
      .then(() => {
        setEditing(false);
        onChanged();
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : t("team.roleFailed")))
      .finally(() => setBusy(false));
  }

  /** 退出编辑时丢弃没保存的改动 */
  function toggleEditing(on: boolean) {
    setEditing(on);
    if (!on && shown) {
      setName(shown.name);
      setDescription(shown.description ?? "");
      setRoleDraft({});
      setError("");
    }
  }

  function switchTab(next: string) {
    toggleEditing(false);
    setTab(next);
  }

  return {
    members,
    shown,
    setShown,
    name,
    setName,
    description,
    setDescription,
    error,
    setError,
    busy,
    setBusy,
    query,
    setQuery,
    setPage,
    tab,
    setTab: switchTab,
    canEdit,
    editing: canEdit && editing,
    toggleEditing,
    visible,
    filteredCount: filtered.length,
    currentPage,
    pages,
    pageSize: PAGE_SIZE,
    roleDraft,
    rolesDirty: Object.keys(roleDraft).length > 0,
    draftRole,
    saveRoles,
  };
}
