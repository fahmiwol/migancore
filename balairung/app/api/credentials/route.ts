import { NextRequest } from "next/server";
import { BRAIN, getBrainToken } from "@/lib/brainAuth";

// Server-side proxy → MiganCore credential vault (/v1/credentials). Token stays
// server-side (Amanah). Secrets are encrypted in the brain + never returned.
// Mirrors the knowledge/chat proxies (self-healing token on 401).
export const runtime = "nodejs";

async function call(method: string, path: string, token: string, body?: unknown) {
  return fetch(`${BRAIN}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function withAuth(method: string, path: string, body?: unknown) {
  let token = await getBrainToken();
  if (!token) return Response.json({ error: "auth_failed" }, { status: 503 });
  let r = await call(method, path, token, body);
  if (r.status === 401) {
    token = (await getBrainToken(true)) ?? token;
    r = await call(method, path, token, body);
  }
  const text = await r.text();
  return new Response(text || "null", {
    status: r.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function GET() {
  return withAuth("GET", "/v1/credentials");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return withAuth("POST", "/v1/credentials", body);
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id") || "";
  return withAuth("DELETE", `/v1/credentials/${encodeURIComponent(id)}`);
}
