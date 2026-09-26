// OR-8 — how must ADJACENT SAME-ROLE rows (group-chat speakers back to back) be laid out so the cache entry
// one call writes on the first speaker's row survives the next call, where a second speaker was appended?
//
// Production today (`chat/assembly/shape.ts:squashSameRole`) concatenates the two assistant rows into ONE
// string, so the block call 1 marked ("Mara: …") no longer exists as a block boundary in call 2. Measured on
// the lane cache-check: msg_011CfLbSECMApXsYxJBSxnBf wrote 3159 on Mara's row, the next call
// msg_011CfLbSPpYVWa6rGmBypmGb read only the system entry. This probe measures the candidate layouts.
//
// Every variant is a two-call pair with its OWN nonce (so no variant can read another's entry), fired on BOTH
// wires: the Anthropic Messages API direct, and OpenRouter (Anthropic pinned) with `debug.echo_upstream_body`
// so the exact body OR sends upstream is recorded. The system prompt is short and UNMARKED, so a miss reads 0.
// One variable moves per variant: the layout of call 2's assistant group (and, for the controls, the marker).
//
//   D  control   c1 [P*, M, cue]      c2 [P*, "M\n\nW", cue]         the harness caches at all
//   A  squash    c1 [P, M*, cue]      c2 [P, "M\n\nW"*, cue]         what ships: expected miss
//   A2 pair      c1 [P*, M*, cue]     c2 [P*, "M\n\nW"*, cue]        the d+2 marker on the user row rescues P only
//   B  parts     c1 [P, [M*], cue]    c2 [P, [M, W*], cue]           one assistant message, two text parts
//   C  unsquash  c1 [P, M*, cue]      c2 [P, M, W*, cue]             two consecutive assistant messages
//   EB negative  c1 as B              c2 [P, [M', W*], cue]          M' = M with one byte changed: must miss
//   EC negative  c1 as C              c2 [P, M', W*, cue]            same, unsquashed
//   CS product   c1 [P, M*, cue]      c2 [P, M, W*, cue]             C in the product's OpenRouter spelling: an
//                                                                    unmarked row is a plain string, a marked row
//                                                                    is one text part (openai-compat/body.ts rule 9)
//   N  no cue    c1 [P, M*]                                          does the wire accept ending on assistant?
//
// P = the long user row (just over the 1024-token floor), M/W = the two speakers' rows, * = the 5m marker,
// cue = the trailing user speaker cue the product sends ("Wren speaks next"), different in each call.

import { ANTHROPIC_PIN, NATIVE_MODEL, OR_MODEL, addSpend, filler, jsonl, printTable, readEnvKey, totalSpend, usageOf } from "./_kit.ts";

export const id = "or8";
export const title = "adjacent same-role rows: which layout keeps the prior call's cache entry readable";

const NATIVE_URL = "https://api.anthropic.com/v1/messages";
const OR_URL = "https://openrouter.ai/api/v1/chat/completions";
const MARKER = { type: "ephemeral" } as const;
const MAX_TOKENS = 16;
// ~60 tokens per nonce-stamped filler line: 19 lines puts P just over sonnet-5's 1024-token cache floor.
const PREFIX_LINES = 19;

const SYSTEM = "You narrate a group role-play. Reply in one short sentence as the named speaker.";
const MARA = "Mara: I set the lantern on the salt-crusted table and trace the ledger's last entry with one finger. \"Someone paid this toll in a name, not in coin. Whose name was it?\"";
const WREN = "Wren: I lean over her shoulder and squint at the smudged ink. \"That hand is the keeper's own. He paid his own toll, and he paid it the night the weir broke.\"";
// One byte changed inside MARA (the "lantern" → "lanterN"): the planted negative's mover.
const MARA_TAMPERED = MARA.replace("lantern", "lanterN");
const CUE_WREN = "[Wren speaks next.]";
const CUE_MARA = "[Mara speaks next.]";

interface Part {
  readonly text: string;
  readonly mark?: boolean;
}
interface Row {
  readonly role: "user" | "assistant";
  readonly parts: readonly Part[];
}

const text = (role: Row["role"], value: string, mark = false): Row => ({ role, parts: [{ text: value, mark }] });
const parts = (role: Row["role"], ...values: Part[]): Row => ({ role, parts: values });

// The same neutral rows on both wires, the marker on the part: OpenRouter forwards a marker only from a content
// part (openai-compat/body.ts rule 9). `product` spelling sends an unmarked single-part row as a plain string.
type Spelling = "parts" | "product";
const wireContent = (row: Row, spelling: Spelling) => {
  const only = row.parts.length === 1 ? row.parts[0] : undefined;
  if (spelling === "product" && only !== undefined && only.mark !== true) {
    return only.text;
  }
  return row.parts.map((p) => (p.mark === true ? { type: "text", text: p.text, cache_control: MARKER } : { type: "text", text: p.text }));
};

interface Variant {
  readonly name: string;
  readonly spelling?: Spelling;
  readonly calls: readonly (readonly Row[])[];
}

function variants(nonce: string): Variant[] {
  const long = (tag: string) => `The chronicle so far:\n${filler(`${nonce}-${tag}`, PREFIX_LINES)}`;
  const squashed = `${MARA}\n\n${WREN}`;
  const pD = long("D");
  const pA = long("A");
  const pA2 = long("A2");
  const pB = long("B");
  const pC = long("C");
  const pEB = long("EB");
  const pEC = long("EC");
  const pN = long("N");
  const pCS = long("CS");
  return [
    { name: "D-control", calls: [[text("user", pD, true), text("assistant", MARA), text("user", CUE_WREN)], [text("user", pD, true), text("assistant", squashed), text("user", CUE_MARA)]] },
    { name: "A-squash", calls: [[text("user", pA), text("assistant", MARA, true), text("user", CUE_WREN)], [text("user", pA), text("assistant", squashed, true), text("user", CUE_MARA)]] },
    { name: "A2-pair", calls: [[text("user", pA2, true), text("assistant", MARA, true), text("user", CUE_WREN)], [text("user", pA2, true), text("assistant", squashed, true), text("user", CUE_MARA)]] },
    {
      name: "B-parts",
      calls: [
        [text("user", pB), parts("assistant", { text: MARA, mark: true }), text("user", CUE_WREN)],
        [text("user", pB), parts("assistant", { text: MARA }, { text: WREN, mark: true }), text("user", CUE_MARA)],
      ],
    },
    {
      name: "C-unsquashed",
      calls: [
        [text("user", pC), text("assistant", MARA, true), text("user", CUE_WREN)],
        [text("user", pC), text("assistant", MARA), text("assistant", WREN, true), text("user", CUE_MARA)],
      ],
    },
    {
      name: "EB-parts-tampered",
      calls: [
        [text("user", pEB), parts("assistant", { text: MARA, mark: true }), text("user", CUE_WREN)],
        [text("user", pEB), parts("assistant", { text: MARA_TAMPERED }, { text: WREN, mark: true }), text("user", CUE_MARA)],
      ],
    },
    {
      name: "EC-unsquashed-tampered",
      calls: [
        [text("user", pEC), text("assistant", MARA, true), text("user", CUE_WREN)],
        [text("user", pEC), text("assistant", MARA_TAMPERED), text("assistant", WREN, true), text("user", CUE_MARA)],
      ],
    },
    {
      name: "CS-unsquashed-product-spelling",
      spelling: "product",
      calls: [
        [text("user", pCS), text("assistant", MARA, true), text("user", CUE_WREN)],
        [text("user", pCS), text("assistant", MARA), text("assistant", WREN, true), text("user", CUE_MARA)],
      ],
    },
    { name: "N-no-cue", calls: [[text("user", pN), text("assistant", MARA, true)]] },
  ];
}

interface CallOutcome {
  readonly status: number;
  readonly responseId: string | null;
  readonly promptTokens: number | null;
  readonly cacheWrite: number | null;
  readonly cacheRead: number | null;
  readonly cost: number | null;
  readonly error: string | null;
  readonly upstreamMessages: unknown;
}

interface NativeResponse {
  readonly id?: string;
  readonly usage?: { readonly input_tokens?: number; readonly cache_creation_input_tokens?: number; readonly cache_read_input_tokens?: number };
  readonly error?: unknown;
}

async function nativeCall(key: string, rows: readonly Row[], spelling: Spelling): Promise<CallOutcome> {
  const response = await fetch(NATIVE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: NATIVE_MODEL, max_tokens: MAX_TOKENS, system: SYSTEM, messages: rows.map((r) => ({ role: r.role, content: wireContent(r, spelling) })) }),
  });
  const json = (await response.json()) as NativeResponse;
  const u = json.usage;
  // Anthropic's `input_tokens` excludes the cached and written tokens; the prompt is the sum of the three.
  const prompt = u === undefined ? null : (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  return {
    status: response.status,
    responseId: json.id ?? null,
    promptTokens: prompt,
    cacheWrite: u?.cache_creation_input_tokens ?? null,
    cacheRead: u?.cache_read_input_tokens ?? null,
    cost: null,
    error: json.error === undefined ? null : JSON.stringify(json.error).slice(0, 600),
    upstreamMessages: null,
  };
}

interface OrChunk {
  readonly id?: string;
  readonly usage?: Parameters<typeof usageOf>[0]["usage"];
  readonly error?: unknown;
  readonly debug?: { readonly echo_upstream_body?: { readonly messages?: unknown; readonly system?: unknown } };
}

// The echo is streaming-only, so OpenRouter is called with `stream:true` and the SSE frames are folded here:
// the debug frame carries the upstream body, the last frame carries the usage.
async function orCall(key: string, rows: readonly Row[], spelling: Spelling): Promise<CallOutcome> {
  const response = await fetch(OR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: OR_MODEL,
      max_tokens: MAX_TOKENS,
      stream: true,
      usage: { include: true },
      provider: ANTHROPIC_PIN,
      debug: { echo_upstream_body: true },
      messages: [{ role: "system", content: SYSTEM }, ...rows.map((r) => ({ role: r.role, content: wireContent(r, spelling) }))],
    }),
  });
  const raw = await response.text();
  if (!response.ok) {
    // A refused call is a JSON body, not a stream; the upstream error and the echoed body sit under `metadata`.
    const refused = JSON.parse(raw) as { readonly error?: { readonly metadata?: { readonly raw?: string; readonly debug?: OrChunk["debug"] } } };
    const echo = refused.error?.metadata?.debug?.echo_upstream_body;
    return {
      status: response.status,
      responseId: null,
      promptTokens: null,
      cacheWrite: null,
      cacheRead: null,
      cost: null,
      error: refused.error?.metadata?.raw ?? raw.slice(0, 600),
      upstreamMessages: echo === undefined ? null : { system: echo.system, messages: echo.messages },
    };
  }
  let responseId: string | null = null;
  let usage: OrChunk["usage"];
  let error: string | null = null;
  let upstream: unknown = null;
  for (const line of raw.split(/\r?\n/u)) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") {
      continue;
    }
    const chunk = JSON.parse(line.slice("data: ".length)) as OrChunk;
    responseId ??= chunk.id ?? null;
    usage = chunk.usage ?? usage;
    if (chunk.error !== undefined) {
      error = JSON.stringify(chunk.error).slice(0, 600);
    }
    if (chunk.debug?.echo_upstream_body !== undefined) {
      upstream = { system: chunk.debug.echo_upstream_body.system, messages: chunk.debug.echo_upstream_body.messages };
    }
  }
  const summary = usageOf(usage === undefined ? {} : { usage });
  addSpend(summary.cost ?? 0);
  return {
    status: response.status,
    responseId,
    promptTokens: summary.promptTokens,
    cacheWrite: summary.cacheWriteTokens,
    cacheRead: summary.cachedTokens,
    cost: summary.cost,
    error,
    upstreamMessages: upstream,
  };
}

// Long text in the echo is cut to its head and byte length so the evidence row shows the SHAPE OR sent (how many
// messages, how many parts, where the marker sits) without re-committing the filler.
function trimEcho(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > 72 ? `${value.slice(0, 48)}…(${value.length} chars)` : value;
  }
  if (Array.isArray(value)) {
    return value.map(trimEcho);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, trimEcho(v)]));
  }
  return value;
}

type Wire = "direct" | "openrouter";

export async function run() {
  const keys: Record<Wire, string> = {
    direct: readEnvKey("ANTHROPIC_PROBE_KEY") || readEnvKey("ANTHROPIC_API_KEY"),
    openrouter: readEnvKey("OPENROUTER_PROBE_KEY") || readEnvKey("OPENROUTER_API_KEY"),
  };
  const out = jsonl(id);
  const rows: Record<string, unknown>[] = [];
  for (const wire of ["direct", "openrouter"] as const) {
    const nonce = `or8-${wire}-${Date.now()}`;
    for (const variant of variants(nonce)) {
      for (const [index, messages] of variant.calls.entries()) {
        const spelling = variant.spelling ?? "parts";
        const result = wire === "direct" ? await nativeCall(keys.direct, messages, spelling) : await orCall(keys.openrouter, messages, spelling);
        const row = { kind: "arm", probe: id, nonce, wire, variant: variant.name, call: index + 1, ...result, upstreamMessages: trimEcho(result.upstreamMessages) };
        out.append(row);
        rows.push(row);
      }
    }
  }

  const second = (wire: Wire, name: string) => rows.find((r) => r["wire"] === wire && r["variant"] === name && r["call"] === 2);
  const readOf = (wire: Wire, name: string) => (second(wire, name)?.["cacheRead"] as number | null | undefined) ?? null;
  const verdict = {
    kind: "verdict",
    probe: id,
    at: new Date().toISOString(),
    ...Object.fromEntries(
      (["direct", "openrouter"] as const).flatMap((wire) =>
        ["D-control", "A-squash", "A2-pair", "B-parts", "C-unsquashed", "EB-parts-tampered", "EC-unsquashed-tampered", "CS-unsquashed-product-spelling"].map((name) => [`${wire}:${name}:read`, readOf(wire, name)]),
      ),
    ),
    openrouterSpend: totalSpend(),
    noCueDirect: rows.find((r) => r["wire"] === "direct" && r["variant"] === "N-no-cue")?.["status"] ?? null,
    noCueOpenRouter: rows.find((r) => r["wire"] === "openrouter" && r["variant"] === "N-no-cue")?.["status"] ?? null,
  };
  out.append(verdict);
  printTable(rows.map(({ wire, variant, call, status, responseId, promptTokens, cacheWrite, cacheRead, cost }) => ({ wire, variant, call, status, responseId, promptTokens, cacheWrite, cacheRead, cost })));
  for (const r of rows.filter((row) => row["error"] !== null)) {
    console.log(`${String(r["wire"])} ${String(r["variant"])} call ${String(r["call"])}: ${String(r["error"])}`);
  }
  return verdict;
}
