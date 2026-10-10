import { parseRole, parseTenureBand, type TenureBand } from "@/lib/employee-attributes";
import { parseCsvRecords } from "@/lib/employee-csv";
import { responseQuestionHeaders } from "@/lib/response-export";

export const RESPONSE_IMPORT_MAX_BYTES = 1024 * 1024;
export const RESPONSE_IMPORT_MAX_ROWS = 5000;

export type ResponseImportQuestion = {
  id: string;
  prompt: string;
  position: number;
  type: "scale" | "text" | "choice";
  min?: number;
  max?: number;
  choices?: string[];
};

export type ResponseImportAnswer = {
  questionId: string;
  value: string | number;
};

export type ResponseImportRow = {
  line: number;
  team: string;
  role: string | null;
  tenureBand: TenureBand | null;
  submittedAt: Date | null;
  answers: ResponseImportAnswer[];
};

export type ResponseImportIssue = {
  line: number;
  message: string;
};

export type ParsedResponseImport =
  | { ok: true; rows: ResponseImportRow[] }
  | { ok: false; errors: ResponseImportIssue[] };

const TEAM_ALIASES = ["team", "team name", "department"];
const ROLE_ALIASES = ["role", "job role", "job title"];
const TENURE_ALIASES = ["tenure", "tenure band", "tenure_band"];
const SUBMITTED_ALIASES = ["submitted", "submitted at"];

const RESERVED = new Set([
  ...TEAM_ALIASES,
  ...ROLE_ALIASES,
  ...TENURE_ALIASES,
  ...SUBMITTED_ALIASES,
]);

export function responseImportTemplate(
  questions: { prompt: string; position: number }[],
): string {
  const headers = [
    "Team",
    "Role",
    "Tenure",
    "Submitted",
    ...responseQuestionHeaders(questions),
  ];
  return `\uFEFF${headers.map(csvCell).join(",")}\r\n`;
}

export function parseResponseImport(
  text: string,
  questions: ResponseImportQuestion[],
): ParsedResponseImport {
  const records = parseCsvRecords(text);
  if (records.length === 0) {
    return { ok: false, errors: [{ line: 1, message: "The file is empty." }] };
  }

  const headerErrors = headerProblems(questions);
  if (headerErrors.length > 0) {
    return { ok: false, errors: headerErrors };
  }

  const headerLabels = records[0] ?? [];
  const headers = headerLabels.map(fold);
  const duplicate = duplicateHeader(headerLabels);
  if (duplicate) {
    return {
      ok: false,
      errors: [{ line: 1, message: `Duplicate column: ${duplicate}.` }],
    };
  }

  const teamIndex = headerIndex(headers, TEAM_ALIASES);
  const roleIndex = headerIndex(headers, ROLE_ALIASES);
  const tenureIndex = headerIndex(headers, TENURE_ALIASES);
  const submittedIndex = headerIndex(headers, SUBMITTED_ALIASES);
  if (teamIndex < 0) {
    return {
      ok: false,
      errors: [
        {
          line: 1,
          message: "Missing column: team. Use Team, and one column per question.",
        },
      ],
    };
  }

  const questionHeaders = responseQuestionHeaders(questions);
  const questionIndexes = questions.map((question, index) => ({
    question,
    index: headers.indexOf(fold(questionHeaders[index] ?? "")),
    header: questionHeaders[index] ?? question.prompt,
  }));
  const missing = questionIndexes.filter((column) => column.index < 0).map((column) => column.header);
  if (missing.length > 0) {
    const label = missing.length === 1 ? "column" : "columns";
    return {
      ok: false,
      errors: [{ line: 1, message: `Missing ${label}: ${missing.join(", ")}.` }],
    };
  }

  const used = new Set(
    [teamIndex, roleIndex, tenureIndex, submittedIndex, ...questionIndexes.map((column) => column.index)].filter(
      (index) => index >= 0,
    ),
  );
  const unknown = headerLabels.filter((header, index) => fold(header) !== "" && !used.has(index));
  if (unknown.length > 0) {
    const label = unknown.length === 1 ? "column" : "columns";
    return {
      ok: false,
      errors: [{ line: 1, message: `Unknown ${label}: ${unknown.join(", ")}.` }],
    };
  }

  if (records.length - 1 > RESPONSE_IMPORT_MAX_ROWS) {
    return {
      ok: false,
      errors: [
        {
          line: 1,
          message: `Import at most ${RESPONSE_IMPORT_MAX_ROWS} responses at a time.`,
        },
      ],
    };
  }

  const rows: ResponseImportRow[] = [];
  const errors: ResponseImportIssue[] = [];
  for (let i = 1; i < records.length; i += 1) {
    const line = i + 1;
    const record = records[i] ?? [];
    const parsed = parseRow(record, line, {
      teamIndex,
      roleIndex,
      tenureIndex,
      submittedIndex,
      questionIndexes,
    });
    if (parsed.errors.length > 0) {
      errors.push(...parsed.errors);
      continue;
    }
    if (parsed.row) {
      rows.push(parsed.row);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  if (rows.length === 0) {
    return { ok: false, errors: [{ line: 1, message: "No response rows found." }] };
  }
  return { ok: true, rows };
}

function headerProblems(questions: ResponseImportQuestion[]): ResponseImportIssue[] {
  const errors: ResponseImportIssue[] = [];
  const seen = new Map<string, string>();
  for (const header of responseQuestionHeaders(questions)) {
    const key = fold(header);
    const previous = seen.get(key);
    if (previous) {
      errors.push({
        line: 1,
        message: `Two questions would use the same column: ${previous}.`,
      });
    } else {
      seen.set(key, header);
    }
    if (RESERVED.has(key)) {
      errors.push({
        line: 1,
        message: `${header} is reserved. Rename that question before importing.`,
      });
    }
  }
  return errors;
}

function parseRow(
  record: string[],
  line: number,
  columns: {
    teamIndex: number;
    roleIndex: number;
    tenureIndex: number;
    submittedIndex: number;
    questionIndexes: {
      question: ResponseImportQuestion;
      index: number;
      header: string;
    }[];
  },
): { row: ResponseImportRow | null; errors: ResponseImportIssue[] } {
  const team = (record[columns.teamIndex] ?? "").trim();
  const answers: ResponseImportAnswer[] = [];
  const errors: ResponseImportIssue[] = [];

  if (record.every((cell) => cell.trim() === "")) {
    return { row: null, errors };
  }
  if (!team) {
    errors.push({ line, message: "Team is required." });
  }

  let role: string | null = null;
  if (columns.roleIndex >= 0) {
    const parsedRole = parseRole(record[columns.roleIndex] ?? "");
    if (!parsedRole.ok) {
      errors.push({ line, message: parsedRole.error });
    } else {
      role = parsedRole.role;
    }
  }

  let tenureBand: TenureBand | null = null;
  if (columns.tenureIndex >= 0) {
    const parsedTenure = parseTenureBand(record[columns.tenureIndex] ?? "");
    if (parsedTenure === "invalid") {
      errors.push({ line, message: "Tenure must be <1yr, 1-3yr, or 3yr+." });
    } else {
      tenureBand = parsedTenure;
    }
  }

  let submittedAt: Date | null = null;
  if (columns.submittedIndex >= 0) {
    const parsedDate = parseSubmitted(record[columns.submittedIndex] ?? "");
    if (parsedDate === "invalid") {
      errors.push({ line, message: "Submitted must be a date like 2024-05-02." });
    } else {
      submittedAt = parsedDate;
    }
  }

  for (const column of columns.questionIndexes) {
    const raw = (record[column.index] ?? "").trim();
    if (!raw) {
      continue;
    }
    const value = parseAnswer(column.question, column.header, raw);
    if (!value.ok) {
      errors.push({ line, message: value.message });
      continue;
    }
    answers.push({ questionId: column.question.id, value: value.value });
  }

  if (errors.length > 0) {
    return { row: null, errors };
  }
  if (!team) {
    return { row: null, errors };
  }
  if (answers.length === 0) {
    return { row: null, errors: [{ line, message: "This row has no answers." }] };
  }
  return {
    row: { line, team, role, tenureBand, submittedAt, answers },
    errors: [],
  };
}

function parseAnswer(
  question: ResponseImportQuestion,
  header: string,
  raw: string,
): { ok: true; value: string | number } | { ok: false; message: string } {
  if (question.type === "scale") {
    const min = integerOption(question.min, 1);
    const max = integerOption(question.max, 5);
    const value = /^-?\d+$/.test(raw) ? Number(raw) : Number.NaN;
    if (!Number.isInteger(value) || value < min || value > max) {
      return { ok: false, message: `${header} must be a whole number from ${min} to ${max}.` };
    }
    return { ok: true, value };
  }
  if (question.type === "choice") {
    const choices = question.choices ?? [];
    if (!choices.includes(raw)) {
      const listed = choices.length > 0 ? choices.join(", ") : "the listed options";
      return { ok: false, message: `${header} must be one of: ${listed}.` };
    }
    return { ok: true, value: raw };
  }
  return { ok: true, value: raw };
}

function parseSubmitted(raw: string): Date | null | "invalid" {
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (day) {
    return utcDate(Number(day[1]), Number(day[2]), Number(day[3]));
  }
  const stamp =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/.exec(
      text,
    );
  if (!stamp) {
    return "invalid";
  }
  const parsed = new Date(text.replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) {
    return "invalid";
  }
  return parsed;
}

function utcDate(year: number, month: number, day: number): Date | "invalid" {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "invalid";
  }
  return date;
}

function integerOption(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

function headerIndex(headers: string[], aliases: string[]): number {
  return headers.findIndex((header) => aliases.includes(header));
}

function duplicateHeader(headers: string[]): string | null {
  const seen = new Set<string>();
  for (const header of headers) {
    const key = fold(header);
    if (!key) {
      continue;
    }
    if (seen.has(key)) {
      return header.trim();
    }
    seen.add(key);
  }
  return null;
}

function fold(value: string): string {
  return value.trim().toLowerCase();
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}
