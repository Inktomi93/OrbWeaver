import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { closeSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, join, resolve, sep } from "node:path";
import process, { env } from "node:process";
import { fileURLToPath } from "node:url";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { pnpmInvocation } from "@orb/tooling/_shared/platform";
import { killPidGroup } from "@orb/tooling/_shared/proc";
import type { ProviderRequestReceipt, ScriptedProvider } from "./scripted-provider.ts";
import { startScriptedProvider } from "./scripted-provider.ts";

const SERVER_PORT = 8896;
const VITE_PORT = 5281;
const PROVIDER_PORT = 8897;
const PRODUCT_ORIGIN = `http://localhost:${String(VITE_PORT)}`;
const BACKEND_ORIGIN = `http://127.0.0.1:${String(SERVER_PORT)}`;
const DEBUG_TOKEN = "orbweaver-rpg-0078-debug-token-insecure";
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CACHE_ROOT = join(REPO_ROOT, ".cache", "prelaunch-rpg-0078");
const RECEIPT_ROOT = join(REPO_ROOT, "reports", "prelaunch-closeout-2026-09-28");
const READY_TIMEOUT_MS = 120_000;
const STOP_TIMEOUT_MS = 10_000;
const HTTP_PROBE_TIMEOUT_MS = 2000;
const HTTP_POLL_INTERVAL_MS = 250;
const TRPC_REQUEST_TIMEOUT_MS = 60_000;
const DEBUG_REQUEST_TIMEOUT_MS = 10_000;
const FLUSH_TIMEOUT_MS = 30_000;
const FLUSH_POLL_INTERVAL_MS = 100;
const PROVIDER_REQUEST_COUNT = 3;
const INTERRUPTED_EXIT_CODE = 130;
const TERMINATED_EXIT_CODE = 143;

interface ConnectionView {
  readonly id: string;
}

interface CharacterView {
  readonly id: string;
}

interface StartedChat {
  readonly chat: { readonly id: string };
}

interface MessageView {
  readonly id: string;
  readonly role: string;
  readonly content: string;
  readonly selectedVariantId: string;
  readonly selectedVariantIdx: number;
  readonly variantCount: number;
}

interface MessagesPage {
  readonly messages: readonly MessageView[];
}

interface MessageVariantSummary {
  readonly variantId: string;
  readonly idx: number;
}

interface TrackerView {
  readonly ambient: { readonly location: string } | null;
  readonly trackersReadOnly: boolean;
}

interface ToolCallDisclosure {
  readonly name: string;
  readonly args: string;
  readonly verdict: string;
  readonly issues: readonly string[];
  readonly withheld: string | null;
}

interface TurnToolCallsView {
  readonly variantId: string;
  readonly messageId: string;
  readonly calls: readonly ToolCallDisclosure[];
  readonly failure: string | null;
  readonly createdAt: number;
}

interface InspectedMessage {
  readonly id: string;
  readonly role: string;
  readonly selectedVariantId: string | null;
  readonly content: string | null;
}

interface ChatInspection {
  readonly found: boolean;
  readonly messages: readonly InspectedMessage[];
}

interface TrackerReceipt {
  readonly moment: "after-ford" | "after-quiet" | "after-keep";
  readonly location: string;
  readonly view: TrackerView;
}

interface RpgTraceRecord {
  readonly seq: number;
  readonly at: number;
  readonly event: {
    readonly phase: string;
    readonly outcome?: string;
    readonly droppedReason?: string | null;
  };
}

function fail(message: string): never {
  throw new Error(`rpg-0078 setup: ${message}`);
}

function requireValue<T>(value: T | null | undefined, message: string): T {
  return value ?? fail(message);
}

function requireEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function requireInside(parent: string, child: string, label: string): void {
  const normalizedParent = resolve(parent);
  const normalizedChild = resolve(child);
  if (!normalizedChild.startsWith(`${normalizedParent}${sep}`)) {
    fail(`${label} escaped the private root: ${normalizedChild}`);
  }
}

function defaultRunId(): string {
  return new Date().toISOString().replaceAll("-", "").replaceAll(":", "").replace(".", "-");
}

function runIdFromArgv(): string {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    return defaultRunId();
  }
  if (args.length !== 1 || !args[0]?.startsWith("--run-id=")) {
    fail("usage: node scripts/probes/prelaunch-rpg/setup.ts [--run-id=<unique-safe-id>]");
  }
  const runId = args[0].slice("--run-id=".length);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(runId)) {
    fail("--run-id must be 1-80 ASCII letters, digits, dots, underscores, or hyphens and start alphanumeric");
  }
  return runId;
}

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

async function requireFreePorts(): Promise<void> {
  const ports = [SERVER_PORT, VITE_PORT, PROVIDER_PORT] as const;
  const occupied = (await Promise.all(ports.map(async (port) => ((await portIsOpen(port)) ? port : null)))).filter((port) => port !== null);
  if (occupied.length > 0) {
    fail(`private port(s) already occupied: ${occupied.join(", ")}`);
  }
}

const delay = (milliseconds: number): Promise<void> => new Promise((done) => setTimeout(done, milliseconds));

async function waitForHttp<T>(url: string, accept: (value: T) => boolean, stack: ChildProcess): Promise<T> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (stack.exitCode !== null || stack.signalCode !== null) {
      fail(`private stack exited before ${url} became ready (exit=${String(stack.exitCode)}, signal=${String(stack.signalCode)})`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(HTTP_PROBE_TIMEOUT_MS) });
      if (response.ok) {
        const value = (url.endsWith("/healthz") ? await response.json() : ({ ok: true } as T)) as T;
        if (accept(value)) {
          return value;
        }
      }
    } catch {
      // Readiness is a bounded poll; the terminal timeout below owns the verdict.
    }
    await delay(HTTP_POLL_INTERVAL_MS);
  }
  fail(`timed out after ${String(READY_TIMEOUT_MS)}ms waiting for ${url}`);
}

const encodeInput = (value: unknown): string => encodeURIComponent(JSON.stringify({ 0: value }));

async function trpc<T>(kind: "query" | "mutation", procedure: string, input: unknown): Promise<T> {
  const querySuffix = kind === "query" ? `&input=${encodeInput(input)}` : "";
  const response = await fetch(`${PRODUCT_ORIGIN}/api/trpc/${procedure}?batch=1${querySuffix}`, {
    ...(kind === "mutation" ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ 0: input }) } : {}),
    signal: AbortSignal.timeout(TRPC_REQUEST_TIMEOUT_MS),
  });
  const body = (await response.json()) as readonly { readonly result?: { readonly data?: T }; readonly error?: unknown }[];
  const entry = body[0];
  if (!response.ok || entry?.error !== undefined || entry?.result === undefined) {
    fail(`${procedure} ${kind} failed (${String(response.status)}): ${JSON.stringify(body)}`);
  }
  return entry.result.data as T;
}

async function query<T>(procedure: string, input: unknown): Promise<T> {
  return await trpc<T>("query", procedure, input);
}

async function mutate<T>(procedure: string, input: unknown): Promise<T> {
  return await trpc<T>("mutation", procedure, input);
}

function tailAssistant(page: MessagesPage, label: string): MessageView {
  const row = [...page.messages].reverse().find((message) => message.role === "assistant");
  return requireValue(row, `${label}: no assistant message in chat.listMessages`);
}

async function readTracker(chatId: string, moment: TrackerReceipt["moment"], expectedLocation: string): Promise<TrackerReceipt> {
  const view = await query<TrackerView>("rpg.getTrackerView", { chatId });
  requireEqual(view.trackersReadOnly, false, `${moment} trackersReadOnly`);
  const location = requireValue(view.ambient, `${moment}: tracker ambient is null`).location;
  requireEqual(location, expectedLocation, `${moment} tracker location`);
  return { moment, location, view };
}

function parseLocation(call: ToolCallDisclosure, label: string): string {
  if (call.withheld !== null) {
    fail(`${label}: call args were withheld (${call.withheld})`);
  }
  const args = JSON.parse(call.args) as { readonly location?: string };
  return requireValue(args.location, `${label}: update_scene args have no location`);
}

function requireAppliedScene(rows: readonly TurnToolCallsView[], variantId: string, expectedLocation: string, label: string): TurnToolCallsView {
  const row = requireValue(
    rows.find((candidate) => candidate.variantId === variantId),
    `${label}: no tool-call row for variant ${variantId}`,
  );
  requireEqual(row.failure, null, `${label} failure`);
  const calls = row.calls.filter((candidate) => candidate.name === "update_scene");
  requireEqual(calls.length, 1, `${label} update_scene call count`);
  const call = requireValue(calls[0], `${label}: missing update_scene call`);
  requireEqual(call.verdict, "applied", `${label} update_scene verdict`);
  requireEqual(call.issues.length, 0, `${label} update_scene issue count`);
  requireEqual(parseLocation(call, label), expectedLocation, `${label} update_scene location`);
  return row;
}

async function inspectChat(chatId: string): Promise<ChatInspection> {
  const response = await fetch(`${BACKEND_ORIGIN}/api/_debug/db/chat/${encodeURIComponent(chatId)}`, {
    headers: { "x-debug-token": DEBUG_TOKEN },
    signal: AbortSignal.timeout(DEBUG_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    fail(`debug chat inspection failed (${String(response.status)}): ${await response.text()}`);
  }
  return (await response.json()) as ChatInspection;
}

async function readRpgTraces(chatId: string): Promise<readonly RpgTraceRecord[]> {
  const response = await fetch(`${BACKEND_ORIGIN}/api/_debug/rpg/traces?chatId=${encodeURIComponent(chatId)}`, {
    headers: { "x-debug-token": DEBUG_TOKEN },
    signal: AbortSignal.timeout(DEBUG_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    fail(`rpg trace read failed (${String(response.status)}): ${await response.text()}`);
  }
  const body = (await response.json()) as { readonly events?: readonly RpgTraceRecord[] };
  return body.events ?? fail("rpg trace route returned no events array");
}

async function waitForNextFlush(chatId: string, priorCount: number, expectedOutcome: "wrote" | "no-writes", label: string): Promise<RpgTraceRecord> {
  const deadline = Date.now() + FLUSH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const flushed = (await readRpgTraces(chatId)).filter((record) => record.event.phase === "flushed");
    if (flushed.length > priorCount) {
      const settled = requireValue(flushed.at(-1), `${label}: flushed trace disappeared`);
      requireEqual(settled.event.outcome, expectedOutcome, `${label} RPG flush outcome (${String(settled.event.droppedReason)})`);
      return settled;
    }
    await delay(FLUSH_POLL_INTERVAL_MS);
  }
  fail(`${label}: timed out waiting for the post-commit RPG flushed trace`);
}

async function seedAndProve(provider: ScriptedProvider): Promise<{
  readonly chatId: string;
  readonly beatBMessageId: string;
  readonly fordVariantId: string;
  readonly quietVariantId: string;
  readonly keepVariantId: string;
  readonly trackerReads: readonly TrackerReceipt[];
  readonly variants: readonly MessageVariantSummary[];
  readonly turnToolCalls: readonly TurnToolCallsView[];
  readonly debugInspection: ChatInspection;
  readonly providerRequests: readonly ProviderRequestReceipt[];
  readonly flushReceipts: readonly RpgTraceRecord[];
}> {
  const connection = await mutate<ConnectionView>("connection.create", {
    label: "rpg-0078-scripted",
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: provider.baseUrl,
    model: "rpg-0078-scripted",
    declared: { generation: { tools: { parallel: false, silencesProse: false } } },
  });
  await mutate("connection.setBinding", { task: "chat", connectionId: connection.id });

  const character = await mutate<CharacterView>("character.create", {
    input: {
      handle: "rpg-0078-lineage",
      name: "Lineage Guide",
      description: "0078 private-stack probe",
      greetings: [{ text: "The road waits." }],
    },
  });
  const started = await mutate<StartedChat>("chat.startChat", { characterIds: [character.id] });
  const chatId = started.chat.id;
  const game = await mutate<{ readonly gameId: string; readonly trackersReadOnly: boolean }>("rpg.createGame", { chatId, mode: "lite" });
  requireEqual(game.trackersReadOnly, false, "rpg.createGame trackersReadOnly");

  let flushCount = 0;
  await mutate("chat.send", { chatId, content: "Cross the ford.", intent: { maxOutputTokens: 64 }, timeZone: UTC_TIME_ZONE });
  const fordFlush = await waitForNextFlush(chatId, flushCount, "wrote", "ford turn");
  flushCount += 1;
  const afterFordMessages = await query<MessagesPage>("chat.listMessages", { chatId });
  const ford = tailAssistant(afterFordMessages, "after ford");
  requireEqual(ford.content, "The current catches at their knees as they cross.", "ford assistant content");
  const fordVariantId = ford.selectedVariantId;
  const afterFord = await readTracker(chatId, "after-ford", "the ford");

  await mutate("chat.send", { chatId, content: "Wait and say nothing about our position.", intent: { maxOutputTokens: 64 }, timeZone: UTC_TIME_ZONE });
  const quietFlush = await waitForNextFlush(chatId, flushCount, "no-writes", "quiet turn");
  flushCount += 1;
  const afterQuietMessages = await query<MessagesPage>("chat.listMessages", { chatId });
  const quiet = tailAssistant(afterQuietMessages, "after quiet");
  requireEqual(quiet.content, "She says nothing of the keep.", "quiet assistant content");
  requireEqual(quiet.selectedVariantIdx, 0, "quiet selectedVariantIdx");
  requireEqual(quiet.variantCount, 1, "quiet variantCount");
  const beatBMessageId = quiet.id;
  const quietVariantId = quiet.selectedVariantId;
  const afterQuiet = await readTracker(chatId, "after-quiet", "the ford");

  await mutate("chat.swipe", { chatId, messageId: beatBMessageId, intent: { maxOutputTokens: 64 }, timeZone: UTC_TIME_ZONE });
  const keepFlush = await waitForNextFlush(chatId, flushCount, "wrote", "keep swipe");
  const variants = await query<readonly MessageVariantSummary[]>("chat.listMessageVariants", { chatId, messageId: beatBMessageId });
  requireEqual(variants.length, 2, "beat B variant count");
  requireEqual(variants[0]?.idx, 0, "quiet variant idx");
  requireEqual(variants[0]?.variantId, quietVariantId, "quiet variant id");
  requireEqual(variants[1]?.idx, 1, "keep variant idx");
  const keepVariantId = requireValue(variants[1]?.variantId, "missing beat B index-1 variant");

  const afterKeepMessages = await query<MessagesPage>("chat.listMessages", { chatId });
  const keep = tailAssistant(afterKeepMessages, "after keep");
  requireEqual(keep.id, beatBMessageId, "beat B message id after swipe");
  requireEqual(keep.content, "The keep rises through the river mist.", "keep assistant content");
  requireEqual(keep.selectedVariantIdx, 1, "keep selectedVariantIdx");
  requireEqual(keep.selectedVariantId, keepVariantId, "keep selectedVariantId");
  requireEqual(keep.variantCount, 2, "keep variantCount");
  const afterKeep = await readTracker(chatId, "after-keep", "the keep");

  const turnToolCalls = await query<readonly TurnToolCallsView[]>("rpg.listTurnToolCalls", { chatId, turnLimit: 50 });
  requireAppliedScene(turnToolCalls, fordVariantId, "the ford", "ford variant");
  requireAppliedScene(turnToolCalls, keepVariantId, "the keep", "keep variant");
  const quietCalls = requireValue(
    turnToolCalls.find((row) => row.variantId === quietVariantId),
    "quiet variant has no disclosure row",
  );
  requireEqual(quietCalls.failure, null, "quiet variant failure");
  requireEqual(quietCalls.calls.length, 1, "quiet variant call count");
  const noChanges = requireValue(quietCalls.calls[0], "quiet variant omitted no_changes");
  requireEqual(noChanges.name, "no_changes", "quiet variant call name");
  requireEqual(noChanges.verdict, "applied", "quiet variant call verdict");
  requireEqual(noChanges.issues.length, 0, "quiet variant issues");

  const debugInspection = await inspectChat(chatId);
  requireEqual(debugInspection.found, true, "debug inspection found");
  const inspectedBeatB = requireValue(
    debugInspection.messages.find((message) => message.id === beatBMessageId),
    "debug inspection omitted beat B",
  );
  requireEqual(inspectedBeatB.selectedVariantId, keepVariantId, "debug beat B selectedVariantId");

  const providerRequests = provider.requests();
  requireEqual(providerRequests.length, PROVIDER_REQUEST_COUNT, "provider request count");
  requireEqual(providerRequests.map((request) => request.responseKind).join(","), "ford-tool,quiet,keep-tool", "provider response order");

  return {
    chatId,
    beatBMessageId,
    fordVariantId,
    quietVariantId,
    keepVariantId,
    trackerReads: [afterFord, afterQuiet, afterKeep],
    variants,
    turnToolCalls,
    debugInspection,
    providerRequests,
    flushReceipts: [fordFlush, quietFlush, keepFlush],
  };
}

function startStack(runRoot: string, stackLogPath: string): ChildProcess {
  const dataDir = join(runRoot, "data");
  const databasePath = join(dataDir, "orb.db");
  const assetsDir = join(runRoot, "assets");
  const stackRunDir = join(runRoot, "stack");
  for (const [label, path] of [
    ["data dir", dataDir],
    ["database", databasePath],
    ["assets dir", assetsDir],
    ["stack run dir", stackRunDir],
  ] as const) {
    requireInside(runRoot, path, label);
  }
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(assetsDir, { recursive: true });
  mkdirSync(stackRunDir, { recursive: true });
  const logFd = openSync(stackLogPath, "wx");
  const pnpm = pnpmInvocation({ ambient: env, platform: process.platform, nodePath: process.execPath, args: ["stack", "up-fg"] });
  if (pnpm.kind === "refused") {
    closeSync(logFd);
    fail(pnpm.reason);
  }
  const child = spawn(pnpm.command, [...pnpm.args], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...env,
      AUTH_MODE: "single-user",
      SESSION_SECRET: "orbweaver-rpg-0078-session-secret-insecure",
      CREDENTIALS_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      LOCAL_INITIAL_PASSWORD: "orbweaver-dev-password",
      AUTH_FALLBACK: "owner",
      DEV_SEED: "off",
      WIRE_CAPTURE: "on",
      RPG_TRACE: "on",
      DEBUG_TOKEN,
      E2E_HARNESS: "on",
      PORT: String(SERVER_PORT),
      VITE_PORT: String(VITE_PORT),
      VITE_API_TARGET: BACKEND_ORIGIN,
      DATA_DIR: dataDir,
      DATABASE_URL: `file:${databasePath}`,
      ASSETS_DIR: assetsDir,
      STACK_RUN_DIR: stackRunDir,
      OWNER_HANDLES: "owner",
      PRIVATE_ENDPOINT_ALLOWLIST: "127.0.0.1",
      ORB_ENV_NO_FILE: "1",
    },
  });
  closeSync(logFd);
  return child;
}

async function stopStack(child: ChildProcess | null): Promise<void> {
  if (child === null || child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  const exited = once(child, "exit").then(() => true);
  killPidGroup(child.pid, "SIGTERM");
  if (await Promise.race([exited, delay(STOP_TIMEOUT_MS).then(() => false)])) {
    return;
  }
  killPidGroup(child.pid, "SIGKILL");
  await exited;
}

function writeReceipt(path: string, value: object): string {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(path, bytes, { encoding: "utf8", flag: "wx" });
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(`${path}.sha256`, `${sha256}  ${path.split(sep).at(-1)}\n`, { encoding: "utf8", flag: "wx" });
  return sha256;
}

async function holdUntilStopped(stack: ChildProcess): Promise<number> {
  return await new Promise((resolveHold, rejectHold) => {
    process.once("SIGINT", () => resolveHold(INTERRUPTED_EXIT_CODE));
    process.once("SIGTERM", () => resolveHold(TERMINATED_EXIT_CODE));
    stack.once("exit", (code, signal) =>
      rejectHold(new Error(`private stack exited while proof environment was held (exit=${String(code)}, signal=${String(signal)})`)),
    );
  });
}

async function main(): Promise<void> {
  const runId = runIdFromArgv();
  const runRoot = join(CACHE_ROOT, runId);
  const receiptPath = join(RECEIPT_ROOT, `rpg-0078-setup-${runId}.json`);
  const stackLogPath = join(runRoot, "stack-process.log");
  requireInside(CACHE_ROOT, runRoot, "run root");
  requireInside(RECEIPT_ROOT, receiptPath, "receipt path");
  await requireFreePorts();
  mkdirSync(CACHE_ROOT, { recursive: true });
  mkdirSync(runRoot, { recursive: false });
  mkdirSync(dirname(receiptPath), { recursive: true });

  let provider: ScriptedProvider | null = null;
  let stack: ChildProcess | null = null;
  try {
    provider = await startScriptedProvider(PROVIDER_PORT);
    stack = startStack(runRoot, stackLogPath);
    await waitForHttp<{ readonly harness?: boolean }>(`${BACKEND_ORIGIN}/healthz`, (health) => health.harness === true, stack);
    await waitForHttp<{ readonly ok: true }>(PRODUCT_ORIGIN, (ready) => ready.ok, stack);
    const proof = await seedAndProve(provider);
    const receipt = {
      schema: "orbweaver.prelaunch.rpg-0078.setup.v1",
      runId,
      createdAt: new Date().toISOString(),
      safety: {
        productOrigin: PRODUCT_ORIGIN,
        backendOrigin: BACKEND_ORIGIN,
        providerBaseUrl: provider.baseUrl,
        dataRoot: runRoot,
        databaseUrl: `file:${join(runRoot, "data", "orb.db")}`,
        ownerDevDatabaseUsed: false,
        realModelCredentialUsed: false,
        seededThroughPublicProductApiOnly: true,
      },
      expectedSelectedState: {
        chatId: proof.chatId,
        beatBMessageId: proof.beatBMessageId,
        quietVariantId: proof.quietVariantId,
        keepVariantId: proof.keepVariantId,
      },
      fordVariantId: proof.fordVariantId,
      trackerReads: proof.trackerReads,
      variants: proof.variants,
      turnToolCalls: proof.turnToolCalls,
      debugInspection: proof.debugInspection,
      providerRequests: proof.providerRequests,
      flushReceipts: proof.flushReceipts,
      retainedPaths: { stackLog: stackLogPath, dataRoot: runRoot },
      cleanup: {
        normal: "send SIGINT to this setup process",
        stackProcessGroup: stack.pid,
        orphanRecovery: `kill -TERM -- -${String(stack.pid)}`,
      },
    };
    const sha256 = writeReceipt(receiptPath, receipt);
    const readyLines = [
      "RPG 0078 private proof environment is ready.",
      `RECEIPT=${receiptPath}`,
      `RECEIPT_SHA256=${sha256}`,
      `CHAT_ID=${proof.chatId}`,
      `BEAT_B_MESSAGE_ID=${proof.beatBMessageId}`,
      `QUIET_VARIANT_ID=${proof.quietVariantId}`,
      `KEEP_VARIANT_ID=${proof.keepVariantId}`,
      `STACK_LOG=${stackLogPath}`,
      `ORPHAN_RECOVERY=kill -TERM -- -${String(stack.pid)}`,
      "Keep this process open during the snap drive. Press Ctrl-C after retaining the live receipts; cleanup stops only this process's private stack group and scripted provider.",
    ];
    process.stdout.write(`${readyLines.join("\n")}\n`);
    process.exitCode = await holdUntilStopped(stack);
  } finally {
    const cleanup = await Promise.allSettled([provider?.close() ?? Promise.resolve(), stopStack(stack)]);
    for (const result of cleanup) {
      if (result.status === "rejected") {
        process.stderr.write(`rpg-0078 cleanup failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}\n`);
        process.exitCode = 1;
      }
    }
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
