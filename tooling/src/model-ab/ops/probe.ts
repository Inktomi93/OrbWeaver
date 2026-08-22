// Running the matrix against ONE serving endpoint. Probes run SERIALLY (a parallel matrix would make the
// per-probe ms meaningless on a single engine) and every failure — HTTP, transport, or a verify defect —
// becomes a ProbeResult, never a thrown harness error.
import type { ChatResponse, Probe, ProbeResult } from "../contract/types.ts";
import { PROBES } from "./probes.ts";

const PROBE_TIMEOUT_MS = 180_000;
const HEAD_CHARS = 160;
const ERROR_CHARS = 200;

export async function runProbe(baseUrl: string, model: string, probe: Probe): Promise<ProbeResult> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, ...probe.body() }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const ms = Date.now() - t0;
    const json = (await res.json().catch(() => ({}))) as ChatResponse;
    if (!res.ok) {
      const message = String(json.message ?? json.error?.message ?? "").slice(0, ERROR_CHARS);
      return { probe: probe.name, ok: false, status: res.status, ms, error: message };
    }
    const msg = json.choices?.[0]?.message ?? {};
    const reasoning = msg.reasoning_content ?? msg.reasoning ?? "";
    const content = msg.content ?? "";
    const defect = probe.verify ? probe.verify(json) : null;
    return {
      probe: probe.name,
      ok: defect === null,
      status: res.status,
      ms,
      finishReason: json.choices?.[0]?.finish_reason,
      reasoningChars: reasoning.length,
      contentChars: content.length,
      completionTokens: json.usage?.completion_tokens,
      error: defect ?? undefined,
      contentHead: content.slice(0, HEAD_CHARS),
      reasoningHead: reasoning.slice(0, HEAD_CHARS),
    };
  } catch (e) {
    return { probe: probe.name, ok: false, status: 0, ms: Date.now() - t0, error: String(e).slice(0, ERROR_CHARS) };
  }
}

export async function runProbes(baseUrl: string, model: string, onResult: (r: ProbeResult) => void): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  const step = async (idx: number): Promise<void> => {
    const probe = PROBES[idx];
    if (probe === undefined) {
      return;
    }
    const r = await runProbe(baseUrl, model, probe);
    results.push(r);
    onResult(r);
    return step(idx + 1);
  };
  await step(0);
  return results;
}
