import { NextResponse } from "next/server";
import { z } from "zod";
import { submitSurveyResponse } from "@/lib/submit-response";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        value: z.union([z.string(), z.number()]),
      }),
    )
    .min(1),
});

function readIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid answers payload." }, { status: 400 });
  }

  const result = await submitSurveyResponse(
    token,
    parsed.data.answers,
    readIp(request),
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, responseId: result.responseId }, { status: 201 });
}
