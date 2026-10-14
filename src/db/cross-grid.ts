import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { getAnonymityFloor } from "@/db/settings";
import { answers, questions, responses, surveys, teams } from "@/db/schema";
import type { TenureBand } from "@/lib/employee-attributes";
import {
  chooseCrossAxes,
  coarserCrossFilters,
  compareCrossKeys,
  crossValueKey,
  crossValueLabel,
  pinnedCrossAxes,
  planCrossGrid,
  type CrossAxis,
  type CrossCellComplement,
} from "@/lib/cross-grid";
import { MIN_TEAM_RESPONSES } from "@/lib/min-cell";
import { parseReportSlice, type ReportSlice } from "@/lib/report-slice";

export type CrossGridCell = {
  rowKey: string;
  colKey: string;
  responseCount: number;
  averageScore: number | null;
};

export type SurveyCrossGrid =
  | { kind: "unavailable" }
  | {
      kind: "grid";
      rowAxis: CrossAxis;
      colAxis: CrossAxis;
      rows: { key: string; label: string }[];
      cols: { key: string; label: string }[];
      cells: CrossGridCell[];
    };

type ResponseAttr = {
  responseId: string;
  teamId: string | null;
  role: string | null;
  tenure: TenureBand | null;
  office: string | null;
};

/**
 * Score for one breakdown crossed with another, inside the current report
 * filters. The floor counts responses. The score is the mean of scale
 * answers, rounded like the team breakdown. Null when the pulse does not exist.
 */
export async function getSurveyCrossGrid(
  token: string,
  options?: {
    teamId?: string | null;
    role?: string | null;
    tenure?: string | null;
    office?: string | null;
    rows?: string | null;
    cols?: string | null;
    floor?: number;
  },
): Promise<SurveyCrossGrid | null> {
  const [survey] = await db
    .select({ id: surveys.id })
    .from(surveys)
    .where(eq(surveys.publicToken, token))
    .limit(1);
  if (!survey) {
    return null;
  }

  const slice = parseReportSlice({
    teamId: options?.teamId,
    role: options?.role,
    tenure: options?.tenure,
    office: options?.office,
  });
  const axes = chooseCrossAxes(
    { rows: options?.rows, cols: options?.cols },
    pinnedCrossAxes(slice),
  );
  if (!axes) {
    return { kind: "unavailable" };
  }

  const floor = await resolveFloor(options?.floor);
  const [attributeRows, scaleRows] = await Promise.all([
    db
      .select({
        responseId: responses.id,
        teamId: responses.teamId,
        teamName: teams.name,
        role: responses.role,
        tenureBand: responses.tenureBand,
        office: responses.office,
      })
      .from(responses)
      .leftJoin(teams, eq(responses.teamId, teams.id))
      .where(eq(responses.surveyId, survey.id)),
    db
      .select({
        responseId: answers.responseId,
        value: answers.value,
      })
      .from(answers)
      .innerJoin(questions, eq(answers.questionId, questions.id))
      .where(and(eq(questions.surveyId, survey.id), eq(questions.type, "scale"))),
  ]);

  const teamNames = new Map<string, string>();
  const population: ResponseAttr[] = [];
  for (const row of attributeRows) {
    if (row.teamId && row.teamName) {
      teamNames.set(row.teamId, row.teamName);
    }
    population.push({
      responseId: row.responseId,
      teamId: row.teamId,
      role: row.role,
      tenure: row.tenureBand,
      office: row.office,
    });
  }

  const scaleValues = new Map<string, number[]>();
  for (const row of scaleRows) {
    const n = numericValue(row.value?.value);
    if (n === null) {
      continue;
    }
    const list = scaleValues.get(row.responseId) ?? [];
    list.push(n);
    scaleValues.set(row.responseId, list);
  }

  const buckets = new Map<
    string,
    { rowKey: string; colKey: string; responseIds: Set<string>; values: number[] }
  >();
  for (const row of population) {
    if (!matchesSlice(row, slice)) {
      continue;
    }
    const rowKey = crossValueKey(axes.rows, row);
    const colKey = crossValueKey(axes.cols, row);
    const id = pocketId(rowKey, colKey);
    const bucket = buckets.get(id) ?? {
      rowKey,
      colKey,
      responseIds: new Set<string>(),
      values: [],
    };
    bucket.responseIds.add(row.responseId);
    for (const value of scaleValues.get(row.responseId) ?? []) {
      bucket.values.push(value);
    }
    buckets.set(id, bucket);
  }

  const parents: CrossCellComplement[][] = coarserCrossFilters(slice).map((filter) => {
    const counts = new Map<string, { rowKey: string; colKey: string; count: number }>();
    for (const row of population) {
      if (!matchesFilter(row, filter)) {
        continue;
      }
      const rowKey = crossValueKey(axes.rows, row);
      const colKey = crossValueKey(axes.cols, row);
      const id = pocketId(rowKey, colKey);
      const current = counts.get(id) ?? { rowKey, colKey, count: 0 };
      current.count += 1;
      counts.set(id, current);
    }
    const complements: CrossCellComplement[] = [];
    for (const [id, parent] of counts) {
      const complement = parent.count - (buckets.get(id)?.responseIds.size ?? 0);
      if (complement > 0) {
        complements.push({
          rowKey: parent.rowKey,
          colKey: parent.colKey,
          complement,
        });
      }
    }
    return complements;
  });

  const published = planCrossGrid(
    [...buckets.values()].map((bucket) => ({
      rowKey: bucket.rowKey,
      colKey: bucket.colKey,
      count: bucket.responseIds.size,
    })),
    floor,
    parents,
  );
  const cells: CrossGridCell[] = [];
  for (const bucket of buckets.values()) {
    const shown = published.some(
      (cell) => cell.rowKey === bucket.rowKey && cell.colKey === bucket.colKey,
    );
    if (!shown) {
      continue;
    }
    cells.push({
      rowKey: bucket.rowKey,
      colKey: bucket.colKey,
      responseCount: bucket.responseIds.size,
      averageScore: average(bucket.values),
    });
  }

  const rowLabel = (key: string) => crossValueLabel(axes.rows, key, teamNames);
  const colLabel = (key: string) => crossValueLabel(axes.cols, key, teamNames);
  const rowKeys = [...new Set(cells.map((cell) => cell.rowKey))].sort((a, b) =>
    compareCrossKeys(axes.rows, a, b, rowLabel),
  );
  const colKeys = [...new Set(cells.map((cell) => cell.colKey))].sort((a, b) =>
    compareCrossKeys(axes.cols, a, b, colLabel),
  );

  return {
    kind: "grid",
    rowAxis: axes.rows,
    colAxis: axes.cols,
    rows: rowKeys.map((key) => ({ key, label: rowLabel(key) })),
    cols: colKeys.map((key) => ({ key, label: colLabel(key) })),
    cells,
  };
}

function matchesSlice(row: ResponseAttr, slice: ReportSlice): boolean {
  if (slice.unmatched) {
    return false;
  }
  return matchesFilter(row, slice);
}

function matchesFilter(
  row: ResponseAttr,
  filter: {
    teamId: string | null;
    role: string | null;
    tenure: TenureBand | null;
    office: string | null;
  },
): boolean {
  if (filter.teamId && row.teamId?.toLowerCase() !== filter.teamId) {
    return false;
  }
  if (filter.role && row.role !== filter.role) {
    return false;
  }
  if (filter.tenure && row.tenure !== filter.tenure) {
    return false;
  }
  if (filter.office && row.office !== filter.office) {
    return false;
  }
  return true;
}

function pocketId(rowKey: string, colKey: string): string {
  return `${rowKey.length}:${rowKey}\0${colKey}`;
}

async function resolveFloor(floor: number | undefined): Promise<number> {
  if (
    typeof floor === "number" &&
    Number.isInteger(floor) &&
    floor >= MIN_TEAM_RESPONSES
  ) {
    return floor;
  }
  const configured = await getAnonymityFloor();
  return Number.isInteger(configured) && configured >= MIN_TEAM_RESPONSES
    ? configured
    : MIN_TEAM_RESPONSES;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return Math.round((values.reduce((sum, n) => sum + n, 0) / values.length) * 10) / 10;
}

function numericValue(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
