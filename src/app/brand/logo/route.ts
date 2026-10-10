import { getWorkspaceLogo } from "@/db/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const logo = await getWorkspaceLogo();
  if (!logo) {
    return new Response(null, { status: 404 });
  }
  return new Response(new Blob([new Uint8Array(logo.bytes)]), {
    status: 200,
    headers: {
      "Content-Type": logo.contentType,
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
