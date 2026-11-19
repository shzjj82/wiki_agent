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

  function assignRole(accountId: string, role: TeamRole) {
    if (!shown || !canManageTeam(shown.role)) return;
    setBusy(true);
    setError("");
    void setTeamRole(session, shown.id, accountId, role)
      .then(() => {
        setMembers((prev) => prev.map((item) => (item.accountId === accountId ? { ...item, role } : item)));
        onChanged();
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : t("team.roleFailed")))
      .finally(() => setBusy(false));
  }

  /** 关掉编辑开关时丢弃没保存的改动 */
  function toggleEditing(on: boolean) {
    setEditing(on);
    if (!on && shown) {
      setName(shown.name);
      setDescription(shown.description ?? "");
      setError("");
    }
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
    setTab,
    canEdit,
    editing: canEdit && editing,
    toggleEditing,
    visible,
    filteredCount: filtered.length,
    currentPage,
    pages,
    pageSize: PAGE_SIZE,
    assignRole,
  };
}
