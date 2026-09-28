import { sanitizeSpreadsheetValue } from "@/lib/spreadsheet";

export type FeedbackCsvRow = {
  surveyTitle: string;
  question: string;
  teamName: string;
  text: string;
  submittedAt: string;
};

export function buildFeedbackCsv(rows: FeedbackCsvRow[]): string {
  const grouped = [...rows].sort(
    (left, right) =>
      left.teamName.localeCompare(right.teamName) ||
      left.surveyTitle.localeCompare(right.surveyTitle) ||
      right.submittedAt.localeCompare(left.submittedAt),
  );
  const lines = [csvLine(["Team", "Survey", "Question", "Comment", "Submitted"])];
  for (const row of grouped) {
    lines.push(
      csvLine([row.teamName, row.surveyTitle, row.question, row.text, row.submittedAt]),
    );
  }
  return `${lines.join("\n")}\n`;
}

function csvCell(value: string | number | null | undefined): string {
  const text = String(sanitizeSpreadsheetValue(value));
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function csvLine(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",");
}
