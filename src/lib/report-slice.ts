import {
  parseRole,
  parseTenureBand,
  ROLE_MAX_LENGTH,
  type TenureBand,
} from "@/lib/employee-attributes";
import { OFFICE_MAX_LENGTH, parseTeamOffice } from "@/lib/team-slug";

export type ReportSlice = {
  teamId: string | null;
  role: string | null;
  tenure: TenureBand | null;
  /** Null means every office, including answers stored with no office. */
  office: string | null;
  /** The query was present but could not name a real team or tenure band. */
  unmatched: boolean;
};

const TEAM_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Blank or missing means all roles. A role is matched exactly after the
 * same trim used when it was stored. Over-long input matches nothing.
 */
export function normalizeReportRole(role: string | null | undefined): string | null {
  if (role == null) {
    return null;
  }
  const parsed = parseRole(role);
  if (!parsed.ok) {
    return role.trim().slice(0, ROLE_MAX_LENGTH + 1);
  }
  return parsed.role;
}

/**
 * Blank means every office. The value is trimmed the same way it is stored.
 * Over-long input is kept so it matches nothing instead of the whole report.
 */
export function normalizeReportOffice(office: string | null | undefined): string | null {
  if (office == null) {
    return null;
  }
  const parsed = parseTeamOffice(office);
  if (!parsed.ok) {
    return office.trim().replace(/\s+/g, " ").slice(0, OFFICE_MAX_LENGTH + 1);
  }
  return parsed.office;
}

/**
 * Blank on any dimension means all of that dimension. An unknown team id
 * or tenure band matches nothing, so the slice stays empty instead of
 * widening to the whole report.
 */
export function parseReportSlice(input: {
  teamId?: string | null;
  role?: string | null;
  tenure?: string | null;
  office?: string | null;
}): ReportSlice {
  const teamRaw = blankToNull(input.teamId);
  const tenureRaw = blankToNull(input.tenure);
  const role = normalizeReportRole(input.role);
  const office = normalizeReportOffice(input.office);

  let unmatched = false;
  let teamId: string | null = null;
  if (teamRaw) {
    if (!TEAM_ID.test(teamRaw)) {
      unmatched = true;
    } else {
      teamId = teamRaw.toLowerCase();
    }
  }

  let tenure: TenureBand | null = null;
  if (tenureRaw) {
    const parsed = parseTenureBand(tenureRaw);
    if (parsed === "invalid" || parsed === null) {
      unmatched = true;
    } else {
      tenure = parsed;
    }
  }

  return { teamId, role, tenure, office, unmatched };
}

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
