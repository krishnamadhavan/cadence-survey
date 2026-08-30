import ExcelJS from "exceljs";
import type { SurveyResults, TeamHealth } from "@/db/results";
import type { WrittenComment } from "@/lib/comments";
import {
  sanitizeFilenameToken,
  sanitizeSpreadsheetValue,
} from "@/lib/spreadsheet";

export type ExportFormat = "csv" | "xlsx";

function healthLabel(health: TeamHealth): string {
  if (health === "low") {
    return "Low";
  }
  if (health === "watch") {
    return "Watch";
  }
  return "Ok";
}

function formatScore(value: number | null): string {
  if (value === null) {
    return "";
  }
  return value.toFixed(1);
}

function csvCell(value: string | number | null | undefined): string {
  const sanitized = sanitizeSpreadsheetValue(value);
  const text = String(sanitized);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function csvLine(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",");
}

function excelCells(values: (string | number | null | undefined)[]) {
  return values.map((value) => sanitizeSpreadsheetValue(value));
}

export function parseExportFormat(value: string | null): ExportFormat | null {
  if (value === "csv") {
    return "csv";
  }
  if (value === "xlsx" || value === "xls") {
    return "xlsx";
  }
  return null;
}

export function resultsFilename(token: string, format: ExportFormat): string {
  const day = new Date().toISOString().slice(0, 10);
  return `${sanitizeFilenameToken(token)}-results-${day}.${format}`;
}

export function buildResultsCsv(
  results: SurveyResults,
  comments: WrittenComment[] = [],
): string {
  const lines: string[] = [
    csvLine(["Survey", results.survey.title]),
    csvLine(["Token", results.survey.publicToken]),
    csvLine(["Responses", results.survey.responseCount]),
    csvLine(["Average score", formatScore(results.survey.averageScore)]),
    "",
    csvLine(["Team", "Responses", "Average score", "Status"]),
  ];

  if (results.teams.length === 0) {
    lines.push(csvLine(["Not enough responses per team to show a breakdown."]));
  } else {
    for (const team of results.teams) {
      lines.push(
        csvLine([
          team.teamName,
          team.responseCount,
          formatScore(team.averageScore),
          healthLabel(team.health),
        ]),
      );
    }
  }

  lines.push("");
  lines.push(csvLine(["Question", "Type", "Team", "Average", "Answers", "Choice", "Count", "Percent"]));

  for (const question of results.questions) {
    if (question.scale) {
      lines.push(
        csvLine([
          question.prompt,
          "scale",
          "Overall",
          formatScore(question.scale.average),
          question.scale.count,
          "",
          "",
          "",
        ]),
      );
      for (const team of question.scale.byTeam) {
        lines.push(
          csvLine([
            question.prompt,
            "scale",
            team.teamName,
            formatScore(team.average),
            team.count,
            "",
            "",
            "",
          ]),
        );
      }
    }

    if (question.choice) {
      for (const option of question.choice.options) {
        const n = question.choice.counts[option] ?? 0;
        const pct = question.choice.count
          ? Math.round((n / question.choice.count) * 100)
          : 0;
        lines.push(
          csvLine([
            question.prompt,
            "choice",
            "Overall",
            "",
            question.choice.count,
            option,
            n,
            `${pct}%`,
          ]),
        );
      }
      for (const team of question.choice.byTeam) {
        for (const option of question.choice.options) {
          const n = team.counts[option] ?? 0;
          const pct = team.count ? Math.round((n / team.count) * 100) : 0;
          lines.push(
            csvLine([
              question.prompt,
              "choice",
              team.teamName,
              "",
              team.count,
              option,
              n,
              `${pct}%`,
            ]),
          );
        }
      }
    }

    if (question.text) {
      lines.push(
        csvLine([
          question.prompt,
          "text",
          "Overall",
          "",
          question.text.count,
          "",
          "",
          "",
        ]),
      );
    }
  }

  lines.push("");
  lines.push(csvLine(["Question", "Team", "Comment"]));
  if (comments.length === 0) {
    lines.push(csvLine(["No written comments."]));
  } else {
    for (const comment of comments) {
      lines.push(csvLine([comment.question, comment.teamName, comment.text]));
    }
  }

  // Excel on Windows opens UTF-8 more reliably with a BOM.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export async function buildResultsXlsx(
  results: SurveyResults,
  comments: WrittenComment[] = [],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Cadence";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Summary");
  summary.addRow(excelCells(["Survey", results.survey.title]));
  summary.addRow(excelCells(["Token", results.survey.publicToken]));
  summary.addRow(["Responses", results.survey.responseCount]);
  summary.addRow(["Average score", results.survey.averageScore]);
  summary.getColumn(1).width = 18;
  summary.getColumn(2).width = 40;

  const teams = workbook.addWorksheet("Teams");
  teams.addRow(["Team", "Responses", "Average score", "Status"]);
  teams.getRow(1).font = { bold: true };
  if (results.teams.length === 0) {
    teams.addRow(["Not enough responses per team to show a breakdown."]);
  } else {
    for (const team of results.teams) {
      teams.addRow(
        excelCells([
          team.teamName,
          team.responseCount,
          team.averageScore,
          healthLabel(team.health),
        ]),
      );
    }
  }
  teams.getColumn(1).width = 28;
  teams.getColumn(2).width = 14;
  teams.getColumn(3).width = 16;
  teams.getColumn(4).width = 10;

  const questions = workbook.addWorksheet("Questions");
  questions.addRow([
    "Question",
    "Type",
    "Team",
    "Average",
    "Answers",
    "Choice",
    "Count",
    "Percent",
  ]);
  questions.getRow(1).font = { bold: true };

  for (const question of results.questions) {
    if (question.scale) {
      questions.addRow(
        excelCells([
          question.prompt,
          "scale",
          "Overall",
          question.scale.average,
          question.scale.count,
        ]),
      );
      for (const team of question.scale.byTeam) {
        questions.addRow(
          excelCells([
            question.prompt,
            "scale",
            team.teamName,
            team.average,
            team.count,
          ]),
        );
      }
    }

    if (question.choice) {
      for (const option of question.choice.options) {
        const n = question.choice.counts[option] ?? 0;
        const pct = question.choice.count
          ? Math.round((n / question.choice.count) * 100)
          : 0;
        questions.addRow(
          excelCells([
            question.prompt,
            "choice",
            "Overall",
            null,
            question.choice.count,
            option,
            n,
            pct / 100,
          ]),
        );
      }
      for (const team of question.choice.byTeam) {
        for (const option of question.choice.options) {
          const n = team.counts[option] ?? 0;
          const pct = team.count ? Math.round((n / team.count) * 100) : 0;
          questions.addRow(
            excelCells([
              question.prompt,
              "choice",
              team.teamName,
              null,
              team.count,
              option,
              n,
              pct / 100,
            ]),
          );
        }
      }
    }

    if (question.text) {
      questions.addRow(
        excelCells([
          question.prompt,
          "text",
          "Overall",
          null,
          question.text.count,
        ]),
      );
    }
  }

  questions.getColumn(1).width = 48;
  questions.getColumn(2).width = 10;
  questions.getColumn(3).width = 22;
  questions.getColumn(4).width = 12;
  questions.getColumn(5).width = 12;
  questions.getColumn(6).width = 22;
  questions.getColumn(7).width = 10;
  questions.getColumn(8).width = 10;
  questions.getColumn(8).numFmt = "0%";

  const commentsSheet = workbook.addWorksheet("Comments");
  commentsSheet.addRow(["Question", "Team", "Comment"]);
  commentsSheet.getRow(1).font = { bold: true };
  if (comments.length === 0) {
    commentsSheet.addRow(["No written comments."]);
  } else {
    for (const comment of comments) {
      commentsSheet.addRow(
        excelCells([comment.question, comment.teamName, comment.text]),
      );
    }
  }
  commentsSheet.getColumn(1).width = 48;
  commentsSheet.getColumn(2).width = 22;
  commentsSheet.getColumn(3).width = 80;
  commentsSheet.getColumn(3).alignment = { wrapText: true, vertical: "top" };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
