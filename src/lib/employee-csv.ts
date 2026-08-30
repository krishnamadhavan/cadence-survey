import { normalizeEmail } from "@/lib/email";

export type EmployeeCsvRow = {
  line: number;
  name: string;
  email: string;
  team: string;
};

export type EmployeeCsvError = {
  line: number;
  message: string;
};

export type ParsedEmployeeCsv = {
  rows: EmployeeCsvRow[];
  errors: EmployeeCsvError[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseCsvRecords(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
        continue;
      }
      if (char === '"') {
        inQuotes = false;
        continue;
      }
      field += char;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field.trim());
      field = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(field.trim());
      field = "";
      if (row.some((value) => value !== "")) {
        records.push(row);
      }
      row = [];
      continue;
    }
    field += char;
  }

  row.push(field.trim());
  if (row.some((value) => value !== "")) {
    records.push(row);
  }

  return records;
}

function headerIndex(headers: string[], aliases: string[]): number {
  return headers.findIndex((header) => aliases.includes(header));
}

export function parseEmployeeCsv(text: string): ParsedEmployeeCsv {
  const records = parseCsvRecords(text);
  if (records.length === 0) {
    return { rows: [], errors: [{ line: 1, message: "The file is empty." }] };
  }

  const headers = (records[0] ?? []).map((header) => header.trim().toLowerCase());
  const nameIndex = headerIndex(headers, ["name", "full name", "employee"]);
  const emailIndex = headerIndex(headers, ["email", "e-mail", "work email"]);
  const teamIndex = headerIndex(headers, ["team", "team name", "department"]);

  const missing: string[] = [];
  if (nameIndex < 0) missing.push("name");
  if (emailIndex < 0) missing.push("email");
  if (teamIndex < 0) missing.push("team");
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [
        {
          line: 1,
          message: `Missing column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}. Use name, email, team.`,
        },
      ],
    };
  }

  const rows: EmployeeCsvRow[] = [];
  const errors: EmployeeCsvError[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < records.length; i += 1) {
    const line = i + 1;
    const record = records[i] ?? [];
    const name = (record[nameIndex] ?? "").trim();
    const email = normalizeEmail(record[emailIndex] ?? "");
    const team = (record[teamIndex] ?? "").trim();

    if (!name && !email && !team) {
      continue;
    }
    if (!name || !email || !team) {
      errors.push({
        line,
        message: "Name, email, and team are all required.",
      });
      continue;
    }
    if (!EMAIL_RE.test(email)) {
      errors.push({ line, message: `Invalid email: ${email}` });
      continue;
    }
    if (seen.has(email)) {
      errors.push({ line, message: `Duplicate email in file: ${email}` });
      continue;
    }
    seen.add(email);
    rows.push({ line, name, email, team });
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push({ line: 1, message: "No employee rows found." });
  }

  return { rows, errors };
}

export function matchTeamId(
  teamLabel: string,
  teams: { id: string; name: string; slug: string }[],
): string | null {
  const needle = teamLabel.trim().toLowerCase();
  const match = teams.find(
    (team) =>
      team.name.toLowerCase() === needle || team.slug.toLowerCase() === needle,
  );
  return match?.id ?? null;
}
