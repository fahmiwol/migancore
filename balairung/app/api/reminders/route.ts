import { NextRequest } from "next/server";
import { BRAIN, AGENT, getBrainToken } from "@/lib/brainAuth";

// Server-side proxy for reminders (Pengeling). Browser → here → MiganCore
// /v1/reminders with the user's token + the SAME agent_id chat uses.
// Amanah: the token stays server-side, never reaches the browser.
export const runtime = "nodejs";

async function brainFetch(path: string, init: RequestInit) {
  let token = await getBrainToken();
  if (!token) return { status: 503, data: { error: "auth_failed" } };
  const hit = (t: string) =>
    fetch(`${BRAIN}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
    });
  let up: Response;
  try {
    up = await hit(token);
    if (up.status === 401) {
      token = (await getBrainToken(true)) ?? token;
      up = await hit(token);
    }
  } catch (e) {
    return { status: 502, data: { error: "brain_unreachable", detail: String(e) } };
  }
  return { status: up.status, data: await up.json().catch(() => ({})) };
}

// GET — active reminders; ?view=pending → only fired-not-acked (the alert feed).
export async function GET(req: NextRequest) {
  if (!AGENT) return Response.json({ error: "brain_not_configured" }, { status: 503 });
  const view = new URL(req.url).searchParams.get("view");
  const path = view === "pending" ? "/v1/reminders/pending" : "/v1/reminders";
  const { status, data } = await brainFetch(path, { method: "GET" });
  return Response.json(data, { status });
}

// POST {title, due_at, notes?} — create a reminder for the chat agent.
export async function POST(req: NextRequest) {
  if (!AGENT) return Response.json({ error: "brain_not_configured" }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  const title = String(b.title ?? "").trim();
  const due_at = String(b.due_at ?? "").trim();
  if (!title || !due_at) return Response.json({ error: "title_and_due_at_required" }, { status: 400 });
  const { status, data } = await brainFetch("/v1/reminders", {
    method: "POST",
    body: JSON.stringify({ title, due_at, notes: b.notes ?? null, agent_id: AGENT }),
  });
  return Response.json(data, { status });
}

// PATCH {id} — acknowledge (status → done).
export async function PATCH(req: NextRequest) {
  if (!AGENT) return Response.json({ error: "brain_not_configured" }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  const id = String(b.id ?? "").trim();
  if (!id) return Response.json({ error: "id_required" }, { status: 400 });
  const { status, data } = await brainFetch(`/v1/reminders/${encodeURIComponent(id)}/done`, { method: "PATCH" });
  return Response.json(data, { status });
}
