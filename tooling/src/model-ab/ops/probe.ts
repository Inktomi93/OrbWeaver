// Running the matrix against ONE serving endpoint. Probes run SERIALLY (a parallel matrix would make the
// per-probe ms meaningless on a single engine) and every failure — HTTP, transport, or a verify defect —
// becomes a ProbeResult, never a thrown harness error.

import { budget } from "@orb/tooling/_shared/load-budget";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ChatResponse, Probe, ProbeResult } from "../contract/types.ts";
import { PROBES } from "./probes.ts";

refuseDirectInvocation(import.meta.url, "node tooling/src/model-ab/cli.ts <verb>");

// A CEILING, load-scaled through the one policy (#1232): the literal is the QUIET-BOX base.
const PROBE_TIMEOUT_MS_BASE = 180_000;
const PROBE_TIMEOUT_MS = budget(PROBE_TIMEOUT_MS_BASE);
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
    // @orb-waive caught-failure-ownership(res.json): res.ok/status are read independently of json — a non-JSON error body just means the `message` field falls back to empty in the failure branch below; the HTTP failure itself is never lost. Ends if the ok/status path starts depending on json having parsed.
    const json = (await res.json().catch(() => ({}))) as ChatResponse;
    if (!res.ok) {
      const message = String(json.message ?? json.error?.message ?? "").slice(0, ERROR_CHARS);
      return { probe: probe.name, ok: false, status: res.status, ms, error: message };
    }
    const msg = json.choices?.[0]?.message ?? {};
    const reasoning = msg.reasoning_content ?? msg.reasoning ?? "";
    const content = msg.content ?? "";
    // `verify` is REQUIRED (contract/types.ts, #1507). The old `probe.verify ? … : null` combined with the
    // `{}` json fallback above to make any 200 an `ok:true` for a verifier-less probe — a green about a
    // body nobody read. Every probe now answers for its own response.
    const defect = probe.verify(json);
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
