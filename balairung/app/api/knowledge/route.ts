import { NextRequest } from "next/server";
import { BRAIN, AGENT, getBrainToken } from "@/lib/brainAuth";

// Server-side proxy: teach the brain a document (RAG). Browser → here → brain
// /v1/memory/knowledge with the user's token + the SAME agent_id the chat uses
// (so the chunks land in the collection chat retrieves from). "Migan jadi tahu."
export const runtime = "nodejs";

async function call(token: string, text: string, source: string) {
  return fetch(`${BRAIN}/v1/memory/knowledge`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text, source, agent_id: AGENT }),
  });
}

export async function POST(req: NextRequest) {
  if (!AGENT) return Response.json({ error: "brain_not_configured" }, { status: 503 });
  const { text, source } = await req.json().catch(() => ({}));
  const body = String(text ?? "").trim();
  if (body.length < 20) return Response.json({ error: "text_too_short" }, { status: 400 });

  let token = await getBrainToken();
  if (!token) return Response.json({ error: "auth_failed" }, { status: 503 });

  const src = String(source ?? "dokumen").slice(0, 120);
  let up: Response;
  try {
    up = await call(token, body, src);
    if (up.status === 401) {
      token = (await getBrainToken(true)) ?? token;
      up = await call(token, body, src);
    }
  } catch (e) {
    return Response.json({ error: "brain_unreachable", detail: String(e) }, { status: 502 });
  }
  const data = await up.json().catch(() => ({}));
  return Response.json(data, { status: up.status });
}

// GET — list what the agent knows (per-agent vault), grouped by source.
export async function GET() {
  if (!AGENT) return Response.json({ error: "brain_not_configured" }, { status: 503 });
  let token = await getBrainToken();
  if (!token) return Response.json({ error: "auth_failed" }, { status: 503 });
  const url = `${BRAIN}/v1/memory/knowledge?agent_id=${encodeURIComponent(AGENT)}`;
  const hit = (t: string) => fetch(url, { headers: { Authorization: `Bearer ${t}` } });
  let up: Response;
  try {
    up = await hit(token);
    if (up.status === 401) { token = (await getBrainToken(true)) ?? token; up = await hit(token); }
  } catch (e) {
    return Response.json({ error: "brain_unreachable", detail: String(e) }, { status: 502 });
  }
  return Response.json(await up.json().catch(() => ({})), { status: up.status });
}

// DELETE ?source=… — forget one document from the agent's knowledge.
export async function DELETE(req: NextRequest) {
  if (!AGENT) return Response.json({ error: "brain_not_configured" }, { status: 503 });
  const source = new URL(req.url).searchParams.get("source") ?? "";
  if (!source) return Response.json({ error: "source_required" }, { status: 400 });
  let token = await getBrainToken();
  if (!token) return Response.json({ error: "auth_failed" }, { status: 503 });
  const url = `${BRAIN}/v1/memory/knowledge?source=${encodeURIComponent(source)}&agent_id=${encodeURIComponent(AGENT)}`;
  const hit = (t: string) => fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${t}` } });
  let up: Response;
  try {
    up = await hit(token);
    if (up.status === 401) { token = (await getBrainToken(true)) ?? token; up = await hit(token); }
  } catch (e) {
    return Response.json({ error: "brain_unreachable", detail: String(e) }, { status: 502 });
  }
  return Response.json(await up.json().catch(() => ({})), { status: up.status });
}
