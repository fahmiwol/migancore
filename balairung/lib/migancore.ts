// Lisan/Balairung → MiganCore brain client.
// Talks to the local self-hosted brain only. No third-party endpoint. (Amanah doctrine.)

export type ToolEvent = { phase: "start" | "result"; names?: string[]; name?: string; ok?: boolean };
export type ChatChunk = { delta: string; done: boolean; tool?: ToolEvent };

// Parse one SSE `data:` payload into a chunk. MiganCore emits JSON frames:
//   {type:"chunk", content}  · {type:"tool_start", tools:[{name}]}
//   {type:"tool_result", tool, ok} · {type:"done"|"error"|"ping"}
// Tolerant of token/delta/content/text variants + raw-text frames.
function parseFrame(payload: string): ChatChunk | null {
  const s = payload.trim();
  if (!s || s === "[DONE]") return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(s);
  } catch {
    return { delta: s, done: false }; // plain-text frame
  }
  if (o.type === "tool_start") {
    const names = Array.isArray(o.tools)
      ? (o.tools as Array<{ name?: string }>).map((t) => t?.name).filter((n): n is string => !!n)
      : [];
    return { delta: "", done: false, tool: { phase: "start", names } };
  }
  if (o.type === "tool_result") {
    return { delta: "", done: false, tool: { phase: "result", name: String(o.tool ?? ""), ok: o.ok !== false } };
  }
  if (o.type === "ping") return null;
  if (o.type === "error") return { delta: `\n\n_[${(o.message as string) ?? "error"}]_`, done: false };
  const d = (o.token ?? o.delta ?? o.content ?? o.text ?? o.response ?? "") as string;
  return d ? { delta: d, done: false } : null;
}

/** Stream a chat turn via the same-origin proxy (/api/chat → MiganCore brain). */
export async function* askMigan(prompt: string, conversationId?: string): AsyncGenerator<ChatChunk> {
  let res: Response;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt, conversation_id: conversationId }),
    });
  } catch (e) {
    yield { delta: `[Balairung tak bisa menjangkau otak: ${String(e)}]`, done: true };
    return;
  }
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    yield { delta: `[Otak belum siap (${res.status}). ${detail.slice(0, 160)}]`, done: true };
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const frame of frames) {
      for (const line of frame.split("\n")) {
        if (line.startsWith("data:")) {
          const c = parseFrame(line.slice(5));
          if (c) yield c;
        }
      }
    }
  }
  yield { delta: "", done: true };
}

/** Sasmita — social listening summary (wire to Bright Data → MiganCore RAG). Stubbed for scaffold. */
export async function getSasmita(topic: string) {
  return {
    topic,
    window: "24 jam",
    positive: { pct: 62, count: 1284 },
    negative: { pct: 17, count: 352 },
    complaint: { pct: 14, count: 289 },
    suggestion: { pct: 7, count: 142 },
    topComplaints: ["antrian layanan lama", "biaya naik", "respons lambat"],
    topSuggestions: ["tambah kanal digital", "transparansi anggaran"],
  };
}
