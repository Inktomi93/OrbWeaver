#!/usr/bin/env node

/**
 * pnpm probe:history-system-rows [--endpoint <url>] [--model <id>] [--key <api-key>] [--verbose]
 *
 * THE MEASUREMENT BEHIND `ModelCapability.turns.historySystemRows` (D129(B)).
 *
 * The D129(B) narrator mapping ships a `narrator`-kind canon row as a wire `system` row — but ONLY on a
 * (model × wire-shape) where that is MEASURED to work. D69 forbids guessing it from a model name, and the
 * existing `turns.midConversationSystem` bit cannot answer it: that one is wire-tested for the DEPTH-0 TAIL
 * only ("a real system row inside the stable prefix would mutate cached bytes", `assembly/injections`), and a
 * narrator row is MID-HISTORY. So the fact needs its own measurement, and this is it — the same
 * measure-then-declare seam `tools.silencesProse` rides (measured by a spike, DECLARED in the one capability
 * factory; here: `domain/connection/catalog/turns.ts::historySystemRows`).
 *
 * TWO INDEPENDENT QUESTIONS, both required for a `true` cell — a wire that accepts the row and ignores it is
 * worse than one that rejects it, because the narrator's words would silently stop being story:
 *
 *   ACCEPTED — does the endpoint take a `system` row at index 1 of a multi-row `messages[]` without a 4xx?
 *              (The Anthropic Messages API, for one, hoists `system` to a top-level param and rejects it in
 *              the array outright; openai-compat wires generally accept it. That is the cheap half.)
 *   HONORED  — does the model treat the mid-history system row as AUTHORITY rather than as filler? Measured
 *              by planting a codeword instruction in it and comparing against a CONTROL run that ships the
 *              identical bytes as an ASSISTANT row. A model that obeys both is not honoring the channel; it
 *              is just reading text, and the mapping buys nothing. `honored` = obeyed-as-system AND the
 *              control's outcome is what the assistant-voiced delivery already gives us.
 *
 * HAND-RUN, never CI: it spends a real generation on a real endpoint. Defaults to the local vLLM gen engine
 * (free), so the first cell anyone can fill is the `vllm` arm. `--key` for a hosted openai-compat endpoint.
 *
 * The output is a table, not a write: this probe NEVER edits the capability factory. A human reads the
 * verdict and lands the measured cell in `turns.ts` with the run's date + numbers in the comment, exactly as
 * `silencesProse` carries its 36/36 receipt.
 */

import process from "node:process";

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function argValue(flag: string, fallback: string): string {
  const i = args.indexOf(flag);
  const next = i >= 0 ? args[i + 1] : undefined;
  return next ?? fallback;
}
const ENDPOINT = argValue("--endpoint", "http://127.0.0.1:8000/v1/chat/completions");
const MODEL = argValue("--model", "local");
const API_KEY = argValue("--key", "");
const VERBOSE = args.includes("--verbose");

/** The planted authority. Deliberately a mechanical instruction with a single-token answer, so "obeyed" is a
 *  string comparison and not a judgement call about prose quality. */
const CODEWORD = "MARLINSPIKE";
/** How much of a rejection body to echo — enough to see the provider's own error text, not a wall. */
const ERROR_BODY_CHARS = 400;
/** The 4xx boundary: at or above this the wire REFUSED the shape (the `accepted` half of the measurement). */
const HTTP_CLIENT_ERROR = 400;
const INSTRUCTION = `Ignore the topic of the conversation. Reply with exactly one word: ${CODEWORD}`;

/** One wire row as the openai-compat surface takes it. */
interface WireMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

/** The history the probe ships. `midRole` is the axis: `system` is the measurement, `assistant` the control
 *  (identical bytes, the delivery we already have — so a difference is attributable to the ROLE alone). */
function history(midRole: "system" | "assistant"): readonly WireMessage[] {
  return [
    { role: "user", content: "Tell me about the harbour." },
    { role: midRole, content: INSTRUCTION },
    { role: "user", content: "Go on then." },
  ];
}

interface Outcome {
  readonly status: number;
  readonly obeyed: boolean;
  readonly text: string;
}

async function run(midRole: "system" | "assistant"): Promise<Outcome> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(API_KEY.length > 0 ? { Authorization: `Bearer ${API_KEY}` } : {}),
    },
    body: JSON.stringify({ model: MODEL, messages: history(midRole), max_tokens: 32, temperature: 0 }),
  });
  const body = await res.text();
  if (!res.ok) {
    return { status: res.status, obeyed: false, text: body.slice(0, ERROR_BODY_CHARS) };
  }
  // Parsed defensively: this is an arbitrary third-party endpoint, and a probe that throws on an unexpected
  // envelope reports "the wire rejected it", which is a different (and wrong) measurement.
  let text = "";
  try {
    const parsed: unknown = JSON.parse(body);
    const choice = (parsed as { choices?: { message?: { content?: unknown } }[] }).choices?.[0]?.message?.content;
    text = typeof choice === "string" ? choice : "";
  } catch {
    text = "";
  }
  return { status: res.status, obeyed: text.toUpperCase().includes(CODEWORD), text };
}

const measured = await run("system");
const control = await run("assistant");

const accepted = measured.status < HTTP_CLIENT_ERROR;
// HONORED = the wire took the row AND the model read it. Both halves are required and neither is sufficient:
// a 4xx is the obvious no, and an accepted-but-ignored row is the WORSE no (the narrator's words would
// silently stop being story). The CONTROL does not gate the verdict — it qualifies it: when the
// assistant-voiced delivery obeys too, this run has not isolated system AUTHORITY, only that a mid-history
// system row survives and is read. That is still exactly what the D129(B) mapping needs, and the qualifier is
// printed so nobody reads a stronger claim off the table than the run supports.
const honored = accepted && measured.obeyed;

process.stdout.write(`endpoint  ${ENDPOINT}\nmodel     ${MODEL}\n\n`);
process.stdout.write(`system-row    status=${String(measured.status)} obeyed=${String(measured.obeyed)}\n`);
process.stdout.write(`assistant-ctl status=${String(control.status)} obeyed=${String(control.obeyed)}\n\n`);
if (VERBOSE) {
  process.stdout.write(`--- system-row reply ---\n${measured.text}\n--- control reply ---\n${control.text}\n\n`);
}
process.stdout.write(`ACCEPTED (no 4xx on a mid-array system row): ${String(accepted)}\n`);
process.stdout.write(`HONORED  (taken AND obeyed):                 ${String(honored)}\n`);
process.stdout.write(`control also obeyed (assistant-voiced):      ${String(control.obeyed)}\n\n`);
if (!honored) {
  process.stdout.write(
    `VERDICT: turns.historySystemRows stays FALSE for this (model x wire-shape) — ${accepted ? "the wire took the row but the model IGNORED it (the worse failure: a narrator row would silently stop being story)" : "the wire REJECTED the row"}.\n`,
  );
} else {
  process.stdout.write(
    `VERDICT: turns.historySystemRows = true is SUPPORTED for this (model x wire-shape)${control.obeyed ? " — qualified: the assistant-voiced control obeyed too, so this run shows the row SURVIVES and is READ, not that system carries extra authority here" : " — and the assistant-voiced control did NOT obey, so the system channel carried authority the ordinary delivery did not"}.\n`,
  );
  process.stdout.write(
    `  A human lands the cell (never this script): packages/server/src/domain/connection/catalog/turns.ts::historySystemRows,\n  with today's date + these numbers in the comment — the way tools.silencesProse carries its 36/36 receipt.\n`,
  );
}
