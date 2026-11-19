import type { TeamRole } from "@/store/teamStore";

export const TEAM_ROLES: TeamRole[] = ["owner", "developer", "user"];

export type RoleLabelKey = "team.roleOwner" | "team.roleDeveloper" | "team.roleUser";
export type RoleHintKey = "team.roleOwnerHint" | "team.roleDeveloperHint" | "team.roleUserHint";
export type RoleStatusKey = "team.roleStatusManage" | "team.roleStatusEdit" | "team.roleStatusRead";
export type RoleCapKey =
  | "team.roleCapWrite"
  | "team.roleCapRoles"
  | "team.roleCapCode"
  | "team.roleCapDissolve"
  | "team.roleCapRead";

export function roleLabel(role: TeamRole): RoleLabelKey {
  if (role === "owner") return "team.roleOwner";
  if (role === "developer") return "team.roleDeveloper";
  return "team.roleUser";
}

export function roleHint(role: TeamRole): RoleHintKey {
  if (role === "owner") return "team.roleOwnerHint";
  if (role === "developer") return "team.roleDeveloperHint";
  return "team.roleUserHint";
}

export function roleStatus(role: TeamRole): RoleStatusKey {
  if (role === "owner") return "team.roleStatusManage";
  if (role === "developer") return "team.roleStatusEdit";
  return "team.roleStatusRead";
}

export const ROLE_CAPS: Record<TeamRole, RoleCapKey[]> = {
  owner: ["team.roleCapWrite", "team.roleCapRoles", "team.roleCapCode", "team.roleCapDissolve"],
  developer: ["team.roleCapWrite"],
  user: ["team.roleCapRead"],
};

export function formatTeamTime(value: string, withClock = true, empty = withClock ? "—" : ""): string {
  if (!value) return empty;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return empty;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withClock ? { hour: "2-digit" as const, minute: "2-digit" as const } : {}),
  }).format(date);
}
