import { NextRequest } from "next/server";

// Server-side proxy to the MiganCore brain. Browser never talks to the brain directly
// (Amanah: private, no CORS, token server-side only).
// Self-healing auth: caches an access token and re-logs-in (BRAIN_EMAIL/BRAIN_PW) when it
// expires or a 401 comes back — fixes the ~60-min access-token expiry pain.
export const runtime = "nodejs";

const BRAIN = process.env.BRAIN_URL ?? "https://api.migancore.com";
const AGENT = process.env.BRAIN_AGENT_ID ?? "";
const EMAIL = process.env.BRAIN_EMAIL ?? "";
const PW = process.env.BRAIN_PW ?? "";
const STATIC = process.env.BRAIN_TOKEN ?? "";

let cached: { token: string; exp: number } | null = null;

function expOf(jwt: string): number {
  try { return JSON.parse(Buffer.from(jwt.split(".")[1], "base64").toString()).exp ?? 0; } catch { return 0; }
}

async function login(): Promise<string | null> {
  if (!EMAIL || !PW) return STATIC || null;
  try {
    const r = await fetch(`${BRAIN}/v1/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PW }),
    });
    if (!r.ok) return STATIC || null;
    const tok = (await r.json()).access_token as string;
    cached = { token: tok, exp: expOf(tok) };
    return tok;
  } catch { return STATIC || null; }
}

async function getToken(force = false): Promise<string | null> {
  const now = Date.now() / 1000;
  if (!force && cached && cached.exp - 60 > now) return cached.token;
  return login();
}

async function callBrain(message: string, conversation_id: string | undefined, token: string) {
  return fetch(`${BRAIN}/v1/agents/${AGENT}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, conversation_id }),
  });
}

export async function POST(req: NextRequest) {
  const { message, conversation_id } = await req.json();
  if (!AGENT) return Response.json({ error: "brain_not_configured" }, { status: 503 });
  let token = await getToken();
  if (!token) return Response.json({ error: "auth_failed" }, { status: 503 });
  let upstream: Response;
  try {
    upstream = await callBrain(message, conversation_id, token);
    if (upstream.status === 401) { // token rotated/expired → refresh once and retry
      token = (await getToken(true)) ?? token;
      upstream = await callBrain(message, conversation_id, token);
    }
  } catch (e) {
    return Response.json({ error: "brain_unreachable", detail: String(e) }, { status: 502 });
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream", "Cache-Control": "no-cache" },
  });
}
