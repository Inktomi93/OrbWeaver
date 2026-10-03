// Records the exact request the app sends a local server on a folded RPG turn. A private single-user stack plays
// the probe's scene against a loopback recorder that answers every turn with the scene's scripted game master
// reply and one `update_scene` call, so the history and state are fixed and the recorded bodies replay cleanly.
//
//   node scripts/probes/prose-with-tools/capture-app-requests.ts --provider=<vllm|llama-cpp> --out=<dir>
//
// Writes `<out>/<provider>/turn-NN.json` (the folded turn bodies) and `<out>/<provider>/other-NN.json` (any other
// model call the app made). Ports are the constants below; the run refuses an occupied one.

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { closeSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { createConnection } from "node:net";
import { join } from "node:path";
import process, { env } from "node:process";
import { fileURLToPath } from "node:url";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { pnpmInvocation } from "@orb/tooling/_shared/platform";
import { killPidGroup } from "@orb/tooling/_shared/proc";
import { BEATS, PERSONA } from "./scene.ts";

const SERVER_PORT = 28_140;
const VITE_PORT = 28_141;
const RECORDER_PORT = 28_142;
const MODEL = "qwen3.8-27b";
const PRODUCT_ORIGIN = `http://localhost:${String(VITE_PORT)}`;
const BACKEND_ORIGIN = `http://127.0.0.1:${String(SERVER_PORT)}`;
const DEBUG_TOKEN = "orbweaver-prose-probe-debug-token-insecure";
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const READY_TIMEOUT_MS = 180_000;
const POLL_MS = 250;
const FLUSH_TIMEOUT_MS = 60_000;
const STOP_TIMEOUT_MS = 10_000;
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const SCRIPTED_TOKENS = 50;
const PROVIDERS = ["vllm", "llama-cpp"] as const;
type Provider = (typeof PROVIDERS)[number];

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const PROVIDER = (arg("provider") ?? "vllm") as Provider;
if (!(PROVIDERS as readonly string[]).includes(PROVIDER)) {
  throw new Error(`--provider must be one of ${PROVIDERS.join(", ")}`);
}
const OUT = join(arg("out") ?? join(REPO_ROOT, ".cache", "prose-probe-capture"), PROVIDER);
const RUN_ROOT = join(REPO_ROOT, ".cache", "prose-probe-capture", `${PROVIDER}-${String(Date.now())}`);

const delay = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

// ── the recorder ────────────────────────────────────────────────────────────────────────────────────────────

interface RecordedBody {
  readonly model?: string;
  readonly stream?: boolean;
  readonly tools?: readonly unknown[];
  readonly messages?: readonly unknown[];
}

let beatIndex = 0;
let otherIndex = 0;

function scriptedReply(): { prose: string; args: string } {
  const beat = BEATS[beatIndex] ?? BEATS[0];
  if (beat === undefined) {
    throw new Error("the scene has no beats");
  }
  return { prose: beat.gm, args: JSON.stringify({ location: beat.location }) };
}

function sse(res: ServerResponse, prose: string, args: string): void {
  const frame = (delta: Record<string, unknown>, finish: string | null = null, usage?: unknown): string =>
    `data: ${JSON.stringify({ id: "rec", object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: finish }], ...(usage === undefined ? {} : { usage }) })}\n\n`;
  res.writeHead(HTTP_OK, { "content-type": "text/event-stream" });
  res.write(frame({ role: "assistant" }));
  res.write(frame({ content: prose }));
  res.write(frame({ tool_calls: [{ index: 0, id: "call_scene", type: "function", function: { name: "update_scene", arguments: args } }] }));
  res.write(frame({}, "tool_calls", { prompt_tokens: SCRIPTED_TOKENS, completion_tokens: SCRIPTED_TOKENS }));
  res.end("data: [DONE]\n\n");
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<RecordedBody> {
  const chunks: Buffer[] = [];
  for await (const part of req) {
    chunks.push(Buffer.isBuffer(part) ? part : Buffer.from(part));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as RecordedBody;
}

const isFoldedTurn = (body: RecordedBody): boolean =>
  JSON.stringify(body.tools ?? []).includes("update_scene") && !JSON.stringify(body).includes('"tool_choice":"required"');

async function serve(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === "GET" && req.url === "/v1/models") {
    json(res, HTTP_OK, { object: "list", data: [{ id: MODEL, object: "model", max_model_len: 16_384 }] });
    return;
  }
  if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
    json(res, HTTP_NOT_FOUND, { error: { message: `not served: ${String(req.method)} ${String(req.url)}` } });
    return;
  }
  const body = await readBody(req);
  const folded = isFoldedTurn(body);
  const name = folded ? `turn-${String(beatIndex + 1).padStart(2, "0")}.json` : `other-${String(++otherIndex).padStart(2, "0")}.json`;
  writeFileSync(join(OUT, name), `${JSON.stringify(body, null, 2)}\n`);
  const { prose, args } = scriptedReply();
  if (body.stream === true) {
    sse(res, prose, args);
    return;
  }
  json(res, HTTP_OK, {
    id: "rec",
    object: "chat.completion",
    choices: [
      {
        index: 0,
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: prose,
          tool_calls: [{ id: "call_scene", type: "function", function: { name: "update_scene", arguments: args } }],
        },
      },
    ],
    usage: { prompt_tokens: SCRIPTED_TOKENS, completion_tokens: SCRIPTED_TOKENS },
  });
}

// ── the private stack (the `prelaunch-rpg/setup.ts` shape) ──────────────────────────────────────────────────

async function portIsOpen(port: number): Promise<boolean> {
  return await new Promise((done) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      done(true);
    });
    socket.once("error", () => done(false));
  });
}

function startStack(): ChildProcess {
  const dataDir = join(RUN_ROOT, "data");
  for (const dir of [dataDir, join(RUN_ROOT, "assets"), join(RUN_ROOT, "stack")]) {
    mkdirSync(dir, { recursive: true });
  }
  const logFd = openSync(join(RUN_ROOT, "stack.log"), "wx");
  const pnpm = pnpmInvocation({ ambient: env, platform: process.platform, nodePath: process.execPath, args: ["stack", "up-fg"] });
  if (pnpm.kind === "refused") {
    throw new Error(pnpm.reason);
  }
  const child = spawn(pnpm.command, [...pnpm.args], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...env,
      AUTH_MODE: "single-user",
      SESSION_SECRET: "orbweaver-prose-probe-session-secret-insecure",
      CREDENTIALS_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      LOCAL_INITIAL_PASSWORD: "orbweaver-dev-password",
      AUTH_FALLBACK: "owner",
      DEV_SEED: "off",
      RPG_TRACE: "on",
      DEBUG_TOKEN,
      E2E_HARNESS: "on",
      PORT: String(SERVER_PORT),
      VITE_PORT: String(VITE_PORT),
      VITE_API_TARGET: BACKEND_ORIGIN,
      DATA_DIR: dataDir,
      DATABASE_URL: `file:${join(dataDir, "orb.db")}`,
      ASSETS_DIR: join(RUN_ROOT, "assets"),
      STACK_RUN_DIR: join(RUN_ROOT, "stack"),
      OWNER_HANDLES: "owner",
      PRIVATE_ENDPOINT_ALLOWLIST: "127.0.0.1",
      ORB_ENV_NO_FILE: "1",
    },
  });
  closeSync(logFd);
  return child;
}

async function waitFor(url: string, stack: ChildProcess): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (stack.exitCode !== null) {
      throw new Error(`the stack exited before ${url} answered; see ${join(RUN_ROOT, "stack.log")}`);
    }
    try {
      if ((await fetch(url)).ok) {
        return;
      }
    } catch {
      // Readiness is a bounded poll; the deadline owns the verdict.
    }
    await delay(POLL_MS);
  }
  throw new Error(`timed out waiting for ${url}`);
}

async function trpc<T>(kind: "query" | "mutation", procedure: string, input: unknown): Promise<T> {
  const encoded = encodeURIComponent(JSON.stringify({ 0: input }));
  const response = await fetch(`${PRODUCT_ORIGIN}/api/trpc/${procedure}?batch=1${kind === "query" ? `&input=${encoded}` : ""}`, {
    ...(kind === "mutation" ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ 0: input }) } : {}),
  });
  const body = (await response.json()) as readonly { readonly result?: { readonly data?: T }; readonly error?: unknown }[];
  const entry = body[0];
  if (!response.ok || entry?.result === undefined) {
    throw new Error(`${procedure} failed (${String(response.status)}): ${JSON.stringify(body)}`);
  }
  return entry.result.data as T;
}

async function flushCount(chatId: string): Promise<number> {
  const response = await fetch(`${BACKEND_ORIGIN}/api/_debug/rpg/traces?chatId=${encodeURIComponent(chatId)}`, { headers: { "x-debug-token": DEBUG_TOKEN } });
  const body = (await response.json()) as { readonly events?: readonly { readonly event: { readonly phase: string } }[] };
  return (body.events ?? []).filter((record) => record.event.phase === "flushed").length;
}

async function waitForFlush(chatId: string, prior: number): Promise<void> {
  const deadline = Date.now() + FLUSH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if ((await flushCount(chatId)) > prior) {
      return;
    }
    await delay(POLL_MS);
  }
  throw new Error("timed out waiting for the RPG flush");
}

async function playScene(): Promise<void> {
  const connection = await trpc<{ readonly id: string }>("mutation", "connection.create", {
    label: `prose-probe-${PROVIDER}`,
    providerId: PROVIDER,
    credentialId: null,
    baseUrl: `http://127.0.0.1:${String(RECORDER_PORT)}/v1`,
    model: MODEL,
    // The fold only mounts where the capability says the wire co-emits; this capture is about what it sends.
    declared: { generation: { tools: { parallel: true, silencesProse: false } } },
  });
  await trpc("mutation", "connection.setBinding", { task: "chat", connectionId: connection.id });
  const character = await trpc<{ readonly id: string }>("mutation", "character.create", {
    input: { handle: "saltmere-gm", name: "Saltmere", description: PERSONA, greetings: [{ text: "Rain hammers the cobbles of Saltmere's harbor district." }] },
  });
  const chatId = (await trpc<{ readonly chat: { readonly id: string } }>("mutation", "chat.startChat", { characterIds: [character.id] })).chat.id;
  await trpc("mutation", "rpg.createGame", { chatId, mode: "lite" });
  await trpc("mutation", "rpg.updateConfig", {
    chatId,
    patch: {
      trackers: [
        { key: "stamina", label: "Stamina", shape: "meter", write: "delta", subject: "actor", max: 14, hint: "wind you spend pushing on" },
        { key: "heat", label: "Heat", shape: "meter", write: "set", subject: "game", max: 100, hint: "how hard the city watch is looking" },
      ],
    },
  });
  for (const [index, beat] of BEATS.entries()) {
    beatIndex = index;
    const prior = await flushCount(chatId);
    await trpc("mutation", "chat.send", { chatId, content: beat.player, timeZone: UTC_TIME_ZONE });
    await waitForFlush(chatId, prior);
    process.stdout.write(`captured beat ${String(index + 1)}\n`);
  }
}

async function main(): Promise<void> {
  for (const port of [SERVER_PORT, VITE_PORT, RECORDER_PORT]) {
    if (await portIsOpen(port)) {
      throw new Error(`port ${String(port)} is in use`);
    }
  }
  mkdirSync(OUT, { recursive: true });
  mkdirSync(RUN_ROOT, { recursive: true });
  const recorder = createServer((req, res) => {
    serve(req, res).catch((err: unknown) => json(res, HTTP_NOT_FOUND, { error: { message: String(err) } }));
  });
  await new Promise<void>((done) => recorder.listen(RECORDER_PORT, "127.0.0.1", done));
  let stack: ChildProcess | null = null;
  try {
    stack = startStack();
    await waitFor(`${BACKEND_ORIGIN}/healthz`, stack);
    await waitFor(PRODUCT_ORIGIN, stack);
    await playScene();
  } finally {
    recorder.closeAllConnections();
    recorder.close();
    if (stack?.pid !== undefined && stack.exitCode === null) {
      const exited = once(stack, "exit");
      killPidGroup(stack.pid, "SIGTERM");
      await Promise.race([exited, delay(STOP_TIMEOUT_MS)]);
      if (stack.exitCode === null) {
        killPidGroup(stack.pid, "SIGKILL");
      }
    }
  }
  process.stdout.write(`wrote ${OUT}\n`);
}

await main();
