// Records what the server-detect probe and the native readers ask each rig arm, and what the arm answered,
// status included (a 501 or a 400 IS the answer for the embeddings and rerank probes). The real `detectServer`
// and `fetchEndpointModels` run over a recording `fetch`, so the transcript holds exactly their requests.
// Every arm below must be up (`rig.sh up <arm>`); the 27B arms need `LOCAL_RIG_MEMORY=24g`.
//
//   node scripts/probes/local-servers/record-facts.ts
//
// Output: `results/raw/transcripts/<arm>.json` and `tests/inference/catalog/_local-servers-transcripts.ts`
// (then `pnpm exec biome check --write` that file).

import { writeFileSync } from "node:fs";
import path from "node:path";
import { NO_PROVIDER_SECRETS } from "../../../packages/inference/src/backends/kit/sanitize.ts";
import { detectServer } from "../../../packages/inference/src/catalog/detect.ts";
import { fetchEndpointModels } from "../../../packages/inference/src/catalog/endpoint.ts";
import { DIR, waitFor, writeRaw } from "./_kit.ts";

type ModelInfoApi = "llama-cpp" | "koboldcpp";

interface Arm {
  readonly name: string;
  readonly port: number;
  readonly modelInfoApi: ModelInfoApi;
  readonly health: string;
  /** A conversation with a system row mid-history, rendered and sent, for the template-error recordings. */
  readonly midSystem?: { readonly maxTokens: number } | undefined;
}

const ARMS: readonly Arm[] = [
  { name: "llamacpp-chat", port: 28_112, modelInfoApi: "llama-cpp", health: "/health" },
  { name: "llamacpp-embed", port: 28_114, modelInfoApi: "llama-cpp", health: "/health" },
  { name: "llamacpp-embed-nopool", port: 28_119, modelInfoApi: "llama-cpp", health: "/health" },
  { name: "llamacpp-rerank", port: 28_120, modelInfoApi: "llama-cpp", health: "/health" },
  { name: "llamacpp-noprefill", port: 28_122, modelInfoApi: "llama-cpp", health: "/health" },
  { name: "llamacpp-stock", port: 28_123, modelInfoApi: "llama-cpp", health: "/health", midSystem: { maxTokens: 1 } },
  { name: "llamacpp-27b", port: 28_124, modelInfoApi: "llama-cpp", health: "/health", midSystem: { maxTokens: 8 } },
  { name: "kobold-chat", port: 28_116, modelInfoApi: "koboldcpp", health: "/api/extra/version" },
  { name: "kobold-embed", port: 28_121, modelInfoApi: "koboldcpp", health: "/api/extra/version" },
  { name: "kobold-27b", port: 28_125, modelInfoApi: "koboldcpp", health: "/api/extra/version", midSystem: { maxTokens: 8 } },
];

/** A system row after an assistant row: Qwen's stock template raises on it; the owner's served template takes it. */
const MID_SYSTEM_MESSAGES = [
  { role: "user", content: "hi" },
  { role: "assistant", content: "hello" },
  { role: "system", content: "Be brief." },
  { role: "user", content: "Say one word." },
];

export interface Exchange {
  readonly method: string;
  readonly path: string;
  /** The request body's top-level keys, sorted: what a replay matches on. */
  readonly bodyKeys: string;
  readonly status: number;
  readonly body: unknown;
  readonly ms: number;
}

const HEALTH_TRIES = 600;
const SNIPPET = 300;

function bodyKeysOf(body: unknown): string {
  if (typeof body !== "string") {
    return "";
  }
  const parsed = JSON.parse(body) as Record<string, unknown>;
  return Object.keys(parsed).sort().join(",");
}

function recordingFetch(log: Exchange[]): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    const started = Date.now();
    const res = await fetch(input, init);
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    log.push({ method: init?.method ?? "GET", path: url.pathname, bodyKeys: bodyKeysOf(init?.body), status: res.status, body, ms: Date.now() - started });
    return new Response(text, { status: res.status, headers: res.headers });
  };
}

const transcripts: Record<string, Exchange[]> = {};
for (const arm of ARMS) {
  const root = `http://127.0.0.1:${arm.port}`;
  console.log(`\n=== ${arm.name}`);
  await waitFor(`${root}${arm.health}`, HEALTH_TRIES);
  const log: Exchange[] = [];
  const recorded = recordingFetch(log);
  const detected = await detectServer({ fetch: recorded, baseUrl: `${root}/v1`, secret: null });
  const rows = await fetchEndpointModels({
    fetch: recorded,
    baseUrl: `${root}/v1`,
    secret: null,
    secrets: NO_PROVIDER_SECRETS,
    modelInfoApi: arm.modelInfoApi,
    warn: (message) => console.log(`warn: ${message}`),
  });
  console.log(
    JSON.stringify({
      detected,
      rows: rows.map(({ id, kind, embeddingDims, prefill, contextTrained }) => ({ id, kind, embeddingDims, prefill, contextTrained })),
    }),
  );
  if (arm.midSystem !== undefined) {
    const model = rows[0]?.id ?? "";
    const send = (pathName: string, body: unknown): Promise<Response> =>
      recorded(`${root}${pathName}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (arm.modelInfoApi === "llama-cpp") {
      await send("/apply-template", { messages: MID_SYSTEM_MESSAGES });
    }
    await send("/v1/chat/completions", { model, messages: MID_SYSTEM_MESSAGES, max_tokens: arm.midSystem.maxTokens, temperature: 0 });
    const last = log.at(-1);
    console.log(`mid-history system row: ${String(last?.status)} in ${String(last?.ms)} ms ${JSON.stringify(last?.body).slice(0, SNIPPET)}`);
  }
  transcripts[arm.name] = log;
  writeRaw("transcripts", arm.name, log);
}

const fixturePath = path.join(DIR, "../../../tests/inference/catalog/_local-servers-transcripts.ts");
const header = [
  "// GENERATED by scripts/probes/local-servers/record-facts.ts: every request the server-detect probe and the native",
  "// readers sent each rig arm, with the status and body it answered. Re-run the rig to refresh (then format with",
  "// biome); never hand-edit.",
  "",
  "export const LOCAL_SERVER_TRANSCRIPTS = ",
].join("\n");
writeFileSync(fixturePath, `${header}${JSON.stringify(transcripts, null, 2)} as const;\n`);
console.log(`\ntranscripts → ${fixturePath}`);
