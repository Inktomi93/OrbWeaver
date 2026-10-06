// Live acceptance matrix for Smart's two speaker pickers (work item 0492): the Utility arbiter and the reranker,
// each reached through the app's own inference runtime, connection rows and role clients, then the production
// `speakerArbiterFor`, `smartArbitrate` and `rerankPick`. Only the stores are in memory; every model call is real.
//
//   node scripts/probes/smart-picker-live/run.ts <cell>...      one or more cells from CELLS (see README.md)
//   node scripts/probes/smart-picker-live/run.ts report         the per-cell table from results.jsonl

import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { SpeakerRef } from "@orb/contracts/chat";
import { speakerKey, TALKATIVENESS_DEFAULT } from "@orb/contracts/chat";
import type { Capability, DeclaredCapability } from "@orb/contracts/inference";
import { RERANK_FLOOR } from "@orb/contracts/inference";
import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import type { RoleClientsWithSignal } from "@orb/inference";
import { createInferenceRuntime, resolveSideGenSampling } from "@orb/inference";
import type { CharacterId, UserCredentialId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type {
  ArbiterCandidate,
  SmartArbitrationResult,
  SpeakerCandidate,
  SpeakerReranker,
  TranscriptLine,
} from "../../../packages/server/src/domain/chat/contract/arbitration.ts";
import { characterLine } from "../../../packages/server/src/domain/chat/engine/character-line.ts";
import { rerankPick } from "../../../packages/server/src/domain/chat/engine/rerank-pick.ts";
import { humanPlayerNames } from "../../../packages/server/src/domain/chat/engine/select-speakers.ts";
import { smartArbitrate } from "../../../packages/server/src/domain/chat/engine/smart-arbitrate.ts";
import { speakerArbiterFor } from "../../../packages/server/src/entry/compose/chat.ts";
import { fakeApiKeySecret, fakeConnection, fakeDeps } from "../../../tests/inference/_support.ts";
import { principal } from "../../../tests/support/factories/principal.ts";
import { execGit } from "../../../tooling/src/_shared/git.ts";
import { readEnvKey } from "../openrouter/_kit.ts";
import type { Scene } from "./scenes.ts";
import { SCENES } from "./scenes.ts";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.join(DIR, "results.jsonl");
const OWNER = castId<UserId>("user_smartpickerlive");
const MISSING_MODEL = "orb-probe-missing-model";
const MISSING_RERANK_MODEL = "Xenova/orb-probe-missing-reranker";
const RERANK_MODEL = "Xenova/ms-marco-MiniLM-L-6-v2";
const OPENROUTER_CHAT = "https://openrouter.ai/api/v1/chat/completions";
const RNG_SEED = 24_601;
// Park-Miller minimal standard: every product stays below 2^53, so plain float arithmetic is exact.
const PM_MODULUS = 2_147_483_647;
const PM_MULTIPLIER = 48_271;
const EXIT_MISUSE = 3;
const RUN_ID_CHARS = 8;
const SCORE_DIGITS = 3;
/** Row text caps: enough of a reply or an error to read the cause, not the whole provider body. */
const REPLY_CHARS = 1500;
const ERROR_CHARS = 400;

interface Cell {
  readonly kind: "arbiter" | "rerank";
  readonly providerId: string;
  readonly model: string;
  readonly baseUrl?: string;
  readonly keyEnv?: string;
  /** Re-send the app's own structured body as a streaming call with OpenRouter's upstream echo. */
  readonly echoUpstream?: boolean;
  /** What the user states under the connection's Advanced capability, when the endpoint states nothing. */
  readonly declared?: DeclaredCapability;
}

const CELLS: Record<string, Cell> = {
  "openai-gpt-5.4-mini": { kind: "arbiter", providerId: "openai", model: "gpt-5.4-mini", keyEnv: "OPENAI_PROBE_KEY" },
  "gemini-3.8-flash": { kind: "arbiter", providerId: "google", model: "gemini-3.8-flash", keyEnv: "GEMINI_PROBE_KEY" },
  "gemini-3.1-pro-preview": { kind: "arbiter", providerId: "google", model: "gemini-3.1-pro-preview", keyEnv: "GEMINI_PROBE_KEY" },
  "openrouter-claude-sonnet-5.5": {
    kind: "arbiter",
    providerId: "openrouter",
    model: "anthropic/claude-sonnet-5.5",
    keyEnv: "OPENROUTER_PROBE_KEY",
    echoUpstream: true,
  },
  "custom-deepseek-flash": {
    kind: "arbiter",
    providerId: "custom-openai",
    model: "deepseek-flash",
    baseUrl: "https://api.deepseek.com/v1",
    keyEnv: "DEEPSEEK_PROBE_KEY",
  },
  // The same row with tool calls declared under Advanced: the forced-tool vehicle a Custom endpoint can serve.
  "custom-deepseek-flash-declared-tools": {
    kind: "arbiter",
    providerId: "custom-openai",
    model: "deepseek-flash",
    baseUrl: "https://api.deepseek.com/v1",
    keyEnv: "DEEPSEEK_PROBE_KEY",
    declared: { generation: { tools: { parallel: false } } },
  },
  // ...and with schema-constrained output declared instead: the response-format vehicle.
  "custom-deepseek-flash-declared-structured": {
    kind: "arbiter",
    providerId: "custom-openai",
    model: "deepseek-flash",
    baseUrl: "https://api.deepseek.com/v1",
    keyEnv: "DEEPSEEK_PROBE_KEY",
    declared: { generation: { output: { structured: true } } },
  },
  "vllm-qwen3.8-27b": { kind: "arbiter", providerId: "vllm", model: "qwen3.8-27b", baseUrl: "http://127.0.0.1:28941/v1" },
  "llamacpp-gemma-4-e4b": { kind: "arbiter", providerId: "llama-cpp", model: "gemma-4-e4b-it", baseUrl: "http://127.0.0.1:28942/v1" },
  "anthropic-claude-sonnet-5-5": { kind: "arbiter", providerId: "anthropic", model: "claude-sonnet-5-5", keyEnv: "ANTHROPIC_PROBE_KEY" },
  "openrouter-claude-sonnet-4.6": {
    kind: "arbiter",
    providerId: "openrouter",
    model: "anthropic/claude-sonnet-4.6",
    keyEnv: "OPENROUTER_PROBE_KEY",
    echoUpstream: true,
  },
  "openrouter-claude-haiku-4.5": {
    kind: "arbiter",
    providerId: "openrouter",
    model: "anthropic/claude-haiku-4.5",
    keyEnv: "OPENROUTER_PROBE_KEY",
    echoUpstream: true,
  },
  // Google's OpenAI-compatible endpoint: the app has no row for it, so it is a Custom connection.
  "custom-gemini-3.8-flash-compat": {
    kind: "arbiter",
    providerId: "custom-openai",
    model: "gemini-3.8-flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyEnv: "GEMINI_PROBE_KEY",
    declared: { features: { thinkingOff: "none" } },
  },
  "custom-gemini-3.1-pro-preview-compat": {
    kind: "arbiter",
    providerId: "custom-openai",
    model: "gemini-3.1-pro-preview",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyEnv: "GEMINI_PROBE_KEY",
    declared: { features: { thinkingOff: "none" } },
  },
  "ollama-gemma4-e4b": { kind: "arbiter", providerId: "ollama", model: "gemma4:e4b", baseUrl: "http://127.0.0.1:28943/v1" },
  "koboldcpp-gemma-4-e4b": { kind: "arbiter", providerId: "koboldcpp", model: "koboldcpp/gemma-4-E4B-it-Q8_0", baseUrl: "http://127.0.0.1:28944/v1" },
  "local-light-rerank": { kind: "rerank", providerId: "local-light", model: RERANK_MODEL },
};

const runId = mintTypeId(ID_PREFIX.chatTurn).slice(-RUN_ID_CHARS);
const secrets = new Map<string, ReturnType<typeof fakeApiKeySecret>>();
/** The last send the runtime's wire tap saw: the request body and the reply text. */
const wire: { body: Record<string, unknown> | null; reply: string | undefined } = { body: null, reply: undefined };
const deps = fakeDeps({
  fetch: globalThis.fetch,
  secrets,
  captureWire: (entry): void => {
    wire.body = entry.body;
    wire.reply = entry.responseBody;
  },
});
const runtime = await createInferenceRuntime({
  ...deps,
  captureWireReply: true,
  // The shipped reranker files, copied out of the stack's model cache; nothing downloads mid-run.
  localLight: { cacheDir: readEnvKey("SMART_PICKER_MODEL_CACHE"), allowRemoteModels: false },
});
const owner = principal(OWNER);

/** The code each row ran against: HEAD plus whether product code had uncommitted edits, so a row from a tree
 *  mid-fix is never read as the committed branch. */
const git = (gitArgs: readonly string[]): string => execGit(DIR, gitArgs).trim();
const tree = { head: git(["rev-parse", "--short", "HEAD"]), dirtyProduct: git(["status", "--porcelain", "--", "../../../packages"]).length > 0 };

function row(fields: Record<string, unknown>): void {
  appendFileSync(RESULTS, `${JSON.stringify({ run: runId, at: new Date().toISOString(), tree, ...fields })}\n`);
}

function seededRng(seed: number): () => number {
  let state = seed % PM_MODULUS;
  return () => {
    state = (state * PM_MULTIPLIER) % PM_MODULUS;
    return (state - 1) / (PM_MODULUS - 1);
  };
}

/** One scene as the turn verb hands it to either picker: ids per cast key, the canon window, the human names. */
interface Staged {
  readonly ids: ReadonlyMap<string, CharacterId>;
  readonly candidates: readonly ArbiterCandidate[];
  readonly speakerCandidates: readonly SpeakerCandidate[];
  readonly characterLines: ReadonlyMap<CharacterId, string>;
  readonly transcript: readonly TranscriptLine[];
  readonly humanNames: readonly string[];
  readonly lastSpeaker: SpeakerRef | null;
}

function stage(scene: Scene): Staged {
  const ids = new Map(scene.cast.map((c) => [c.key, mintTypeId(ID_PREFIX.character)] as const));
  const idOf = (key: string): CharacterId => {
    const id = ids.get(key);
    if (id === undefined) {
      throw new Error(`${scene.id}: no cast key ${key}`);
    }
    return id;
  };
  const transcript = scene.lines.map((l): TranscriptLine => {
    const member = scene.cast.find((c) => c.key === l.who);
    return member === undefined
      ? { speakerName: l.who, text: l.text, characterId: null }
      : { speakerName: member.name, text: l.text, characterId: idOf(member.key) };
  });
  const lastKey = scene.lines.findLast((l) => scene.cast.some((c) => c.key === l.who))?.who;
  return {
    ids,
    candidates: scene.cast.map((c) => ({
      ref: { kind: "character", characterId: idOf(c.key) },
      talkativeness: TALKATIVENESS_DEFAULT,
      disabled: false,
      leftSeq: null,
    })),
    speakerCandidates: scene.cast.map((c) => ({ ref: { kind: "character", characterId: idOf(c.key) }, name: c.name })),
    characterLines: new Map(
      scene.cast.map((c) => [idOf(c.key), characterLine({ name: c.name, description: c.persona, personality: "" }, undefined, Date.now())] as const),
    ),
    transcript,
    humanNames: humanPlayerNames(scene.humans, transcript),
    lastSpeaker: lastKey === undefined ? null : { kind: "character", characterId: idOf(lastKey) },
  };
}

function keysOf(staged: Staged, refs: readonly SpeakerRef[]): string[] {
  return refs.map((ref) => [...staged.ids].find(([, id]) => speakerKey({ kind: "character", characterId: id }) === speakerKey(ref))?.[0] ?? "?");
}

/** Every `enum` array in a captured request body: the response vocabulary the wire actually carried. */
function enumsIn(value: unknown): string[][] {
  if (Array.isArray(value)) {
    return value.flatMap(enumsIn);
  }
  if (value === null || typeof value !== "object") {
    return [];
  }
  return Object.entries(value).flatMap(([k, v]) => (k === "enum" && Array.isArray(v) ? [v.map(String)] : enumsIn(v)));
}

/** Which structured vehicle the request rode, read off the body the wire sent. */
function vehicleOf(body: Record<string, unknown> | null): string {
  if (body === null) {
    return "none";
  }
  const rf = body["response_format"] as { type?: string } | undefined;
  if (rf !== undefined) {
    return `response_format:${rf.type ?? "?"}`;
  }
  if (Array.isArray(body["tools"])) {
    return `forced-tool:${JSON.stringify(body["tool_choice"] ?? null)}`;
  }
  const anthropicFormat = (body["output_config"] as { format?: { type?: string } } | undefined)?.format;
  if (anthropicFormat !== undefined) {
    return `output_config.format:${anthropicFormat.type ?? "?"}`;
  }
  if (body["format"] !== undefined) {
    return "ollama-format:schema";
  }
  const gen = body["generationConfig"] as Record<string, unknown> | undefined;
  if (gen !== undefined && ("responseJsonSchema" in gen || "responseSchema" in gen)) {
    return `generationConfig:${String(gen["responseMimeType"] ?? "?")}`;
  }
  return "unconstrained";
}

interface CallLog {
  calls: number;
  errors: string[];
  tokensIn: number | null;
  tokensOut: number | null;
  bodies: Record<string, unknown>[];
  replies: string[];
  /** The structured text each call returned, before the arbiter validates it: a retry shows as two. */
  answers: string[];
  /** What `resolved("structured")` returned: the gate `speakerArbiterFor` reads before any call. */
  resolvedAs: string | null;
}

/** The role bundle `speakerArbiterFor` receives, counting the structured calls it makes and keeping each failure. */
function counted(roles: RoleClientsWithSignal, log: CallLog): Pick<RoleClientsWithSignal, "resolved" | "structured"> {
  return {
    resolved: async (task): ReturnType<RoleClientsWithSignal["resolved"]> => {
      try {
        const view = await roles.resolved(task);
        log.resolvedAs = view === null ? "null (no servable binding)" : `${view.providerId} ${view.model} ${view.capability.kind}`;
        return view;
      } catch (error) {
        log.errors.push(`resolved(${task}): ${String(error)}`);
        throw error;
      }
    },
    structured: async (inputs, opts): ReturnType<RoleClientsWithSignal["structured"]> => {
      log.calls += 1;
      wire.body = null;
      wire.reply = undefined;
      try {
        const result = await roles.structured(inputs, opts);
        log.tokensIn = result.items[0]?.usage?.tokensIn ?? null;
        log.tokensOut = result.items[0]?.usage?.tokensOut ?? null;
        log.answers.push(result.items[0]?.text ?? "");
        return result;
      } catch (error) {
        log.errors.push(`structured: ${String(error)}`);
        throw error;
      } finally {
        if (wire.body !== null) {
          log.bodies.push(wire.body);
        }
        if (wire.reply !== undefined) {
          log.replies.push(wire.reply);
        }
      }
    },
  };
}

/** What the compose root's `resolveSpeakerReranker` builds from the funder's bundle (`entry/compose/chat.ts`). */
async function speakerRerankerFor(roles: RoleClientsWithSignal, ranked: { order: string[] }): Promise<SpeakerReranker | null> {
  const view = await roles.resolved("rerank");
  if (view === null) {
    return null;
  }
  const capability = view.capability.kind === "rerank" ? view.capability.rerank : RERANK_FLOOR;
  return {
    capability,
    rerank: async (query, documents, opts): ReturnType<SpeakerReranker["rerank"]> => {
      const result = await roles.rerank(query, documents, opts);
      // Each document reads `Name: line`, so its head names the candidate.
      const nameOf = (id: string): string => (documents.find((d) => d.id === id)?.text ?? id).split(":")[0] ?? id;
      ranked.order = result.hits.toSorted((a, b) => b.score - a.score).map((h) => `${nameOf(h.id)} ${h.score.toFixed(SCORE_DIGITS)}`);
      return result;
    },
  };
}

function bindConnection(cell: Cell, model: string, task: "summarize" | "rerank"): void {
  let credentialId: UserCredentialId | null = null;
  if (cell.keyEnv !== undefined) {
    const key = readEnvKey(cell.keyEnv);
    if (key.length === 0) {
      throw new Error(`${cell.keyEnv} is not set`);
    }
    credentialId = mintTypeId(ID_PREFIX.userCredential);
    secrets.set(credentialId, fakeApiKeySecret(key));
  }
  // `allowBackground`: the Utility and rerank slots are background tasks, and the app's bind slot refuses a row
  // without that consent, so every row a user can bind there carries it.
  const connection = fakeConnection({
    providerId: cell.providerId,
    model,
    ownerId: OWNER,
    credentialId,
    baseUrl: cell.baseUrl ?? null,
    allowBackground: true,
    declared: cell.declared ?? null,
  });
  deps.stores.connections.rows.set(connection.id, connection);
  deps.stores.bindings.bind({ actorKind: "user", actorId: OWNER, task, connectionId: connection.id });
}

function unbind(task: "summarize" | "rerank"): void {
  deps.stores.bindings.bind({ actorKind: "user", actorId: OWNER, task, connectionId: null });
}

/** A result is a valid pick when it names at least one eligible candidate, none twice, and no banned self-response. */
function validity(scene: Scene, staged: Staged, result: SmartArbitrationResult): string | null {
  if (result.aborted) {
    return "aborted";
  }
  if (result.speakers.length === 0) {
    return "no speaker";
  }
  const keys = keysOf(staged, result.speakers);
  if (keys.includes("?")) {
    return `off-roster ref ${keys.join(",")}`;
  }
  if (new Set(keys).size !== keys.length) {
    return `duplicate ${keys.join(",")}`;
  }
  if (scene.banLast && staged.lastSpeaker !== null && scene.lines.at(-1)?.who === keys[0] && keys.length === 1) {
    return `self-response ${keys[0]}`;
  }
  return null;
}

/** One scene run on one cell; `control` names a degrade control, null for a model scene. */
interface SceneRun {
  readonly cellName: string;
  readonly cell: Cell;
  readonly model: string;
  readonly scene: Scene;
  readonly control: string | null;
}

/** Whether the model was called exactly when the scene needs it: never on a clear name, always otherwise. */
function callShapeOf(scene: Scene, calls: number): string | null {
  if (scene.expectCall) {
    return calls >= 1 ? null : "expected a model call";
  }
  return calls === 0 ? null : "unexpected model call";
}

/** A control must degrade. A model scene must give a valid pick without degrading, and the call shape must hold. */
function failureOf(run: SceneRun, result: SmartArbitrationResult, invalid: string | null, callShape: string | null): string | null {
  if (run.control !== null) {
    return result.degraded ? null : "control did not degrade";
  }
  if (invalid !== null) {
    return invalid;
  }
  return result.degraded ? "degraded" : callShape;
}

function hitOf(scene: Scene, picks: readonly string[]): boolean | null {
  return scene.accept === null ? null : picks.length > 0 && picks.every((p) => scene.accept?.includes(p) === true);
}

function verdictLine(failure: string | null): string {
  return failure === null ? "PASS" : `FAIL (${failure})`;
}

async function arbiterScene(run: SceneRun): Promise<void> {
  const { cellName, cell, model, scene, control } = run;
  const staged = stage(scene);
  const log: CallLog = { calls: 0, errors: [], tokensIn: null, tokensOut: null, bodies: [], replies: [], answers: [], resolvedAs: null };
  const roles = runtime.roleClientsFor(owner);
  const started = performance.now();
  const result = await smartArbitrate({
    arbiter: () => speakerArbiterFor(counted(roles, log)),
    candidates: staged.candidates,
    speakerCandidates: staged.speakerCandidates,
    characterLines: staged.characterLines,
    transcript: staged.transcript,
    humanNames: staged.humanNames,
    room: {},
    lastSpeaker: staged.lastSpeaker,
    banLast: scene.banLast,
    rng: seededRng(RNG_SEED),
    prose: {},
    sampling: resolveSideGenSampling(SIDE_GEN_POSTURES.arbiter, undefined),
  });
  const ms = Math.round(performance.now() - started);
  const picks = keysOf(staged, result.speakers);
  const invalid = validity(scene, staged, result);
  const body = log.bodies.at(-1) ?? null;
  const failure = failureOf(run, result, invalid, callShapeOf(scene, log.calls));
  row({
    kind: "arbiter",
    cell: cellName,
    providerId: cell.providerId,
    model,
    control,
    scene: scene.id,
    sceneKind: scene.kind,
    pass: failure === null,
    failure,
    picks,
    hit: hitOf(scene, picks),
    accept: scene.accept,
    degraded: result.degraded,
    calls: log.calls,
    ms,
    tokensIn: log.tokensIn,
    tokensOut: log.tokensOut,
    vehicle: vehicleOf(body),
    // The request minus its prompt: every knob the wire sent beside the messages.
    bodyKnobs: body === null ? null : Object.fromEntries(Object.entries(body).filter(([k]) => k !== "messages" && k !== "contents")),
    enums: enumsIn(body),
    answers: log.answers,
    resolvedAs: log.resolvedAs,
    reply: log.replies.at(-1)?.slice(0, REPLY_CHARS) ?? null,
    errors: log.errors.map((e) => e.slice(0, ERROR_CHARS)),
  });
  console.log(`${cellName} ${control ?? scene.id}: ${verdictLine(failure)} picks=${picks.join(",")} degraded=${result.degraded} calls=${log.calls} ${ms}ms`);
  if (cell.echoUpstream === true && control === null && body !== null && scene.expectCall) {
    await echoUpstream(cellName, scene, body, cell);
  }
}

/** OpenRouter's own record of what it forwarded: the app's body re-sent as a streaming call with the upstream echo. */
async function echoUpstream(cellName: string, scene: Scene, body: Record<string, unknown>, cell: Cell): Promise<void> {
  const response = await fetch(OPENROUTER_CHAT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${readEnvKey(cell.keyEnv ?? "")}` },
    body: JSON.stringify({ ...body, stream: true, debug: { echo_upstream_body: true } }),
  });
  const text = await response.text();
  const frames = text
    .split(/\r?\n/u)
    .filter((l) => l.startsWith("data: ") && l !== "data: [DONE]")
    .map((l) => JSON.parse(l.slice("data: ".length)) as Record<string, unknown>);
  const upstream = frames.map((f) => (f["debug"] as { echo_upstream_body?: unknown } | undefined)?.echo_upstream_body).find((u) => u !== undefined) ?? null;
  const content = frames.map((f) => (f["choices"] as { delta?: { content?: string } }[] | undefined)?.[0]?.delta?.content ?? "").join("");
  row({ kind: "or-echo", cell: cellName, scene: scene.id, status: response.status, appBody: body, upstreamBody: upstream, streamedContent: content });
  console.log(`${cellName} or-echo ${scene.id}: status ${response.status}, upstream body ${upstream === null ? "absent" : "captured"}`);
}

async function rerankScene(run: SceneRun): Promise<void> {
  const { cellName, cell, model, scene, control } = run;
  const staged = stage(scene);
  const roles = runtime.roleClientsFor(owner);
  const ranked = { order: [] as string[] };
  const errors: string[] = [];
  const started = performance.now();
  const result = await rerankPick({
    reranker: async () => {
      try {
        return await speakerRerankerFor(roles, ranked);
      } catch (error) {
        errors.push(String(error).slice(0, ERROR_CHARS));
        throw error;
      }
    },
    candidates: staged.candidates,
    speakerCandidates: staged.speakerCandidates,
    characterLines: staged.characterLines,
    lastLine: staged.transcript.at(-1) ?? null,
    humanNames: staged.humanNames,
    lastSpeaker: staged.lastSpeaker,
    banLast: scene.banLast,
    rng: seededRng(RNG_SEED),
  });
  const ms = Math.round(performance.now() - started);
  const picks = keysOf(staged, result.speakers);
  const invalid = validity(scene, staged, result);
  const failure = failureOf(run, result, invalid, null);
  row({
    kind: "rerank",
    cell: cellName,
    providerId: cell.providerId,
    model,
    control,
    scene: scene.id,
    sceneKind: scene.kind,
    pass: failure === null,
    failure,
    picks,
    hit: hitOf(scene, picks),
    accept: scene.accept,
    degraded: result.degraded,
    ranking: ranked.order,
    ms,
    errors,
  });
  console.log(`${cellName} ${control ?? scene.id}: ${verdictLine(failure)} picks=${picks.join(",")} ranking=[${ranked.order.join("; ")}] ${ms}ms`);
}

const CONTROL_SCENE = "open-floor";

/** The capability facts the pickers gate on: structured output and tools for the arbiter, the window for both. */
function capabilityFacts(capability: Capability | undefined): unknown {
  if (capability?.kind === "generation") {
    const { generation } = capability;
    return {
      structured: generation.output.structured ?? null,
      tools: generation.tools ?? null,
      window: generation.context.window,
      windowEstimated: generation.context.windowEstimated ?? null,
    };
  }
  return capability?.kind === "rerank" ? capability.rerank : (capability ?? null);
}

/** What the runtime resolved for the bound row: the served model and the capability facts the pickers gate on. */
async function recordResolution(cellName: string, task: "structured" | "rerank"): Promise<void> {
  const roles = runtime.roleClientsFor(owner);
  try {
    // The bare resolve first: `resolved()` folds a NoConnectionError to null and so hides why.
    await runtime.resolve({ task, principal: owner }).catch((error: unknown) => {
      row({ kind: "resolution", cell: cellName, task, resolveError: String(error).slice(0, ERROR_CHARS) });
      console.log(`${cellName} resolve ${task}: ${String(error)}`);
    });
    const view = await roles.resolved(task);
    const capability = view?.capability;
    const facts = capabilityFacts(capability);
    row({
      kind: "resolution",
      cell: cellName,
      task,
      providerId: view?.providerId ?? null,
      model: view?.model ?? null,
      capabilityKind: capability?.kind ?? null,
      facts,
    });
    console.log(`${cellName} resolved ${task}: ${view?.providerId ?? "-"} ${view?.model ?? "-"} ${JSON.stringify(facts)}`);
  } catch (error) {
    row({ kind: "resolution", cell: cellName, task, error: String(error).slice(0, ERROR_CHARS) });
    console.log(`${cellName} resolved ${task}: threw ${String(error)}`);
  }
}

async function runCell(cellName: string): Promise<void> {
  const cell = CELLS[cellName];
  if (cell === undefined) {
    throw new Error(`unknown cell ${cellName}; cells: ${Object.keys(CELLS).join(", ")}`);
  }
  const task = cell.kind === "arbiter" ? "summarize" : "rerank";
  const sceneRun = cell.kind === "arbiter" ? arbiterScene : rerankScene;
  const control = SCENES.find((s) => s.id === CONTROL_SCENE);
  if (control === undefined) {
    throw new Error(`no ${CONTROL_SCENE} scene`);
  }
  bindConnection(cell, cell.model, task);
  await recordResolution(cellName, cell.kind === "arbiter" ? "structured" : "rerank");
  for (const scene of SCENES) {
    await sceneRun({ cellName, cell, model: cell.model, scene, control: null });
  }
  // The degrade controls: the same provider and credential naming a model it does not serve, then nothing bound.
  bindConnection(cell, cell.kind === "arbiter" ? MISSING_MODEL : MISSING_RERANK_MODEL, task);
  await recordResolution(`${cellName} (missing-model)`, cell.kind === "arbiter" ? "structured" : "rerank");
  await sceneRun({ cellName, cell, model: cell.kind === "arbiter" ? MISSING_MODEL : MISSING_RERANK_MODEL, scene: control, control: "missing-model" });
  unbind(task);
  await sceneRun({ cellName, cell, model: "(unbound)", scene: control, control: "unbound" });
}

interface ResultRow {
  readonly run: string;
  readonly kind: string;
  readonly cell: string;
  readonly model: string;
  readonly control: string | null;
  readonly scene: string;
  readonly pass: boolean;
  readonly failure: string | null;
  readonly hit: boolean | null;
  readonly ms: number;
  readonly calls?: number;
  readonly vehicle?: string;
}

/** The latest run of each cell: pass counts, quality hits (a degraded pick never counts, even when the fallback
 *  happened to land on an accepted name), median and max latency, the vehicle, the controls. */
function report(): void {
  const rows = readFileSync(RESULTS, "utf8")
    .split(/\r?\n/u)
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as ResultRow)
    .filter((r) => r.kind === "arbiter" || r.kind === "rerank");
  const latestRun = new Map<string, string>();
  for (const r of rows) {
    latestRun.set(r.cell, r.run);
  }
  console.log("| cell | model | scenes pass | quality hits | model calls | latency median / max ms | vehicle | missing-model degrades | unbound degrades |");
  console.log("| - | - | - | - | - | - | - | - | - |");
  for (const [cell, run] of latestRun) {
    const mine = rows.filter((r) => r.cell === cell && r.run === run);
    const scenes = mine.filter((r) => r.control === null);
    const judged = scenes.filter((r) => r.hit !== null);
    const called = scenes.filter((r) => (r.calls ?? 0) > 0);
    const ms = called.length > 0 ? called.map((r) => r.ms).toSorted((a, b) => a - b) : scenes.map((r) => r.ms).toSorted((a, b) => a - b);
    const vehicles = [...new Set(scenes.map((r) => r.vehicle).filter((v) => v !== undefined && v !== "none"))].join(", ") || "-";
    const control = (name: string): string => {
      const c = mine.find((r) => r.control === name);
      if (c === undefined) {
        return "-";
      }
      return c.pass ? "pass" : `FAIL (${c.failure})`;
    };
    const fails = scenes.filter((r) => !r.pass).map((r) => `${r.scene}: ${r.failure}`);
    console.log(
      `| ${cell} | ${scenes[0]?.model ?? "-"} | ${scenes.length - fails.length}/${scenes.length}${fails.length > 0 ? ` (${fails.join("; ")})` : ""} | ${judged.filter((r) => r.hit === true && r.pass).length}/${judged.length} | ${called.length} | ${ms[Math.floor(ms.length / 2)] ?? "-"} / ${ms.at(-1) ?? "-"} | ${vehicles} | ${control("missing-model")} | ${control("unbound")} |`,
    );
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log(`usage: run.ts <cell>... | report\ncells: ${Object.keys(CELLS).join(", ")}`);
  process.exitCode = EXIT_MISUSE;
} else if (args[0] === "report") {
  report();
} else {
  for (const name of args) {
    await runCell(name);
  }
}
await runtime.localLight.close();
