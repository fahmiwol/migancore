// Shared server-side brain auth — self-healing access token, used by API proxy
// routes (chat, knowledge, …). The browser NEVER sees the token (Amanah: private,
// token stays server-side). Mirrors the original inline logic from app/api/chat.
const BRAIN = process.env.BRAIN_URL ?? "https://api.migancore.com";
const AGENT = process.env.BRAIN_AGENT_ID ?? "";
const EMAIL = process.env.BRAIN_EMAIL ?? "";
const PW = process.env.BRAIN_PW ?? "";
const STATIC = process.env.BRAIN_TOKEN ?? "";

let cached: { token: string; exp: number } | null = null;

function expOf(jwt: string): number {
  try {
    return JSON.parse(Buffer.from(jwt.split(".")[1], "base64").toString()).exp ?? 0;
  } catch {
    return 0;
  }
}

async function login(): Promise<string | null> {
  if (!EMAIL || !PW) return STATIC || null;
  try {
    const r = await fetch(`${BRAIN}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PW }),
    });
    if (!r.ok) return STATIC || null;
    const tok = (await r.json()).access_token as string;
    cached = { token: tok, exp: expOf(tok) };
    return tok;
  } catch {
    return STATIC || null;
  }
}

/** Cached brain access token; re-logs-in when within 60s of expiry or forced. */
export async function getBrainToken(force = false): Promise<string | null> {
  const now = Date.now() / 1000;
  if (!force && cached && cached.exp - 60 > now) return cached.token;
  return login();
}

export { BRAIN, AGENT };
