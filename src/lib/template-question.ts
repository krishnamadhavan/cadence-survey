import type {
  ChoiceOptions,
  QuestionOptions,
  QuestionType,
  ScaleOptions,
} from "@/db/schema";
import { questionTypes } from "@/db/schema";

export const TEMPLATE_NAME_MAX = 80;
export const TEMPLATE_DESCRIPTION_MAX = 280;
export const QUESTION_PROMPT_MAX = 280;
export const CHOICE_MIN = 2;
export const CHOICE_MAX = 20;
export const LABEL_MAX = 40;
export const SCALE_ABS_MIN = 0;
export const SCALE_ABS_MAX = 10;

export function parseTemplateName(value: string): string | null {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > TEMPLATE_NAME_MAX) {
    return null;
  }
  return name;
}

export function parseTemplateDescription(value: string): string | null {
  const description = value.trim().replace(/\s+/g, " ");
  if (description.length === 0) {
    return null;
  }
  if (description.length > TEMPLATE_DESCRIPTION_MAX) {
    return null;
  }
  return description;
}

export function parseQuestionPrompt(value: string): string | null {
  const prompt = value.trim().replace(/\s+/g, " ");
  if (prompt.length < 1 || prompt.length > QUESTION_PROMPT_MAX) {
    return null;
  }
  return prompt;
}

export function parseQuestionType(value: string): QuestionType | null {
  return (questionTypes as readonly string[]).includes(value)
    ? (value as QuestionType)
    : null;
}

export function parseRequired(value: FormDataEntryValue | null): boolean {
  const raw = String(value ?? "").toLowerCase();
  return raw === "on" || raw === "true" || raw === "1";
}

export function parseScaleOptions(input: {
  min: string;
  max: string;
  minLabel: string;
  maxLabel: string;
}): ScaleOptions | null {
  const min = Number.parseInt(input.min, 10);
  const max = Number.parseInt(input.max, 10);
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    return null;
  }
  if (min < SCALE_ABS_MIN || max > SCALE_ABS_MAX || min >= max) {
    return null;
  }

  const minLabel = input.minLabel.trim().replace(/\s+/g, " ");
  const maxLabel = input.maxLabel.trim().replace(/\s+/g, " ");
  if (minLabel.length > LABEL_MAX || maxLabel.length > LABEL_MAX) {
    return null;
  }

  return {
    min,
    max,
    ...(minLabel ? { minLabel } : {}),
    ...(maxLabel ? { maxLabel } : {}),
  };
}

export function parseChoiceOptions(raw: string): ChoiceOptions | null {
  const parts = raw.includes("\n") ? raw.split("\n") : raw.split(",");
  const choices: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const choice = part.trim().replace(/\s+/g, " ");
    if (!choice || seen.has(choice)) {
      continue;
    }
    seen.add(choice);
    choices.push(choice);
  }
  if (choices.length < CHOICE_MIN || choices.length > CHOICE_MAX) {
    return null;
  }
  return { choices };
}

export function parseQuestionOptions(
  type: QuestionType,
  input: {
    min: string;
    max: string;
    minLabel: string;
    maxLabel: string;
    choices: string;
  },
): { ok: true; options: QuestionOptions } | { ok: false } {
  if (type === "text") {
    return { ok: true, options: null };
  }
  if (type === "scale") {
    const options = parseScaleOptions(input);
    return options ? { ok: true, options } : { ok: false };
  }
  const options = parseChoiceOptions(input.choices);
  return options ? { ok: true, options } : { ok: false };
}

export function isScaleOptions(
  options: QuestionOptions,
): options is ScaleOptions {
  return Boolean(options && "min" in options && "max" in options);
}

export function isChoiceOptions(
  options: QuestionOptions,
): options is ChoiceOptions {
  return Boolean(options && "choices" in options);
}

export function formatQuestionType(type: QuestionType): string {
  if (type === "scale") {
    return "Scale";
  }
  if (type === "choice") {
    return "Choice";
  }
  return "Text";
}

export function formatQuestionOptions(
  type: QuestionType,
  options: QuestionOptions,
): string {
  if (type === "scale" && isScaleOptions(options)) {
    const range = `${options.min}–${options.max}`;
    if (options.minLabel || options.maxLabel) {
      return `${range} · ${options.minLabel ?? ""}–${options.maxLabel ?? ""}`;
    }
    return range;
  }
  if (type === "choice" && isChoiceOptions(options)) {
    return options.choices.join(", ");
  }
  return "—";
}

export function formatQuestionSummary(
  type: QuestionType,
  options: QuestionOptions,
  required: boolean,
): string {
  const parts = [formatQuestionType(type)];
  const optionText = formatQuestionOptions(type, options);
  if (optionText !== "—") {
    parts.push(optionText);
  }
  parts.push(required ? "Required" : "Optional");
  return parts.join(" · ");
}

export function choicesToField(options: QuestionOptions): string {
  if (!isChoiceOptions(options)) {
    return "";
  }
  return options.choices.join("\n");
}
