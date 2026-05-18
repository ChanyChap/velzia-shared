export const ADMIN_COMMS_ROLES = ["admin_empresa", "superadmin"] as const;

type RoleAccess = {
  role?: string | null;
};

type TeamAccess = {
  team_id?: string | null;
  can_view?: boolean | null;
  can_send?: boolean | null;
};

type AgentAccess = {
  profile_id?: string | null;
  can_view?: boolean | null;
  can_send?: boolean | null;
};

export type PhoneLineAccessShape = {
  id: string;
  status?: string | null;
  is_default?: boolean | null;
  auto_assign_team_id?: string | null;
  wa_line_role_access?: RoleAccess[] | null;
  wa_line_team_access?: TeamAccess[] | null;
  wa_line_agent_access?: AgentAccess[] | null;
};

type AccessMode = "view" | "send";

type CanAccessLineArgs = {
  line: PhoneLineAccessShape;
  profileId?: string | null;
  role?: string | null;
  customRoleId?: string | null;
  teamIds?: string[] | null;
  mode?: AccessMode;
};

export function isAdminCommsRole(role?: string | null) {
  return !!role && ADMIN_COMMS_ROLES.includes(role as (typeof ADMIN_COMMS_ROLES)[number]);
}

export function getEffectiveCommsRoleKey(role?: string | null, customRoleId?: string | null) {
  if (!role) return null;
  if (role === "custom" && customRoleId) return `custom:${customRoleId}`;
  return role;
}

export function canAccessPhoneLine({
  line,
  profileId,
  role,
  customRoleId,
  teamIds = [],
  mode = "view",
}: CanAccessLineArgs) {
  if (isAdminCommsRole(role)) return true;
  const safeTeamIds = teamIds ?? [];
  const effectiveRole = getEffectiveCommsRoleKey(role, customRoleId);

  const roleAccess = line.wa_line_role_access || [];
  const teamAccess = line.wa_line_team_access || [];
  const agentAccess = line.wa_line_agent_access || [];

  // Agent-level access always takes priority (explicit per-user grant)
  const canByAgent = agentAccess.some((entry) => {
    if (!profileId || entry.profile_id !== profileId) return false;
    return mode === "send" ? entry.can_send !== false : entry.can_view !== false;
  });
  if (canByAgent) return true;

  // When role-based restrictions exist, they are the SOLE authority.
  // Legacy team-based entries (wa_line_team_access / auto_assign_team_id) are
  // ignored because migration 484 replaced teams with roles but did not clean
  // up old team rows — those stale entries were granting unintended access.
  if (roleAccess.length > 0) {
    return roleAccess.some((entry) => entry.role === effectiveRole);
  }

  // Fallback: legacy team-based access (only when NO role entries exist)
  const hasTeamRestrictions =
    teamAccess.length > 0 ||
    agentAccess.length > 0 ||
    !!line.auto_assign_team_id;

  const canByTeam = teamAccess.some((entry) => {
    if (!entry.team_id || !safeTeamIds.includes(entry.team_id)) return false;
    return mode === "send" ? entry.can_send !== false : entry.can_view !== false;
  });
  if (canByTeam) return true;

  if (line.auto_assign_team_id && safeTeamIds.includes(line.auto_assign_team_id)) {
    return true;
  }

  return !hasTeamRestrictions;
}
