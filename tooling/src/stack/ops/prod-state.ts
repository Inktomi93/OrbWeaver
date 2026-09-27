// The prod launcher's OBSERVATION half: where its state lives on disk, what env/port it resolves, and
// what it can prove about whoever holds the port right now. Nothing here spawns or kills.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { budget } from "@orb/tooling/_shared/load-budget";
import { print, REPO_ROOT } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { listeningPids, socketTableOrThrow } from "../../_shared/platform.ts";
import { DEV_PORTS } from "../../_shared/ports.ts";
import type { DebugPosture, InstanceClassification, ObservedInstance, ProdRecord } from "../contract/types.ts";
import { envFilePath, parseEnvText, readEnvText } from "../lib/env-file.ts";
import { classifyInstance } from "../lib/identity.ts";
import { parseProdRecord } from "../lib/prod-record.ts";
import { RUN_DIR_ENV, stackRunDir } from "../lib/stack-plan.ts";
import { classifyDebugPosture } from "../lib/verdicts.ts";

refuseDirectInvocation(import.meta.url, "pnpm stack <verb> prod");

const DEFAULT_PORT = DEV_PORTS.server;
// A CEILING, load-scaled through the one policy (#1232): the literal is the QUIET-BOX base.
const PROBE_TIMEOUT_MS_BASE = 2000;
const PROBE_TIMEOUT_MS = budget(PROBE_TIMEOUT_MS_BASE);
export const POLL_INTERVAL_MS = 500;
export const MS_PER_SECOND = 1000;

function errnoIs(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

// biome-ignore lint/style/noProcessEnv: a launcher's whole job is reading the ambient env it will pass on.
export const AMBIENT = process.env;

export function runDir(): string {
  return stackRunDir(REPO_ROOT, AMBIENT[RUN_DIR_ENV]);
}

export const PIDFILE = (): string => join(runDir(), "prod.json");
export const LOG_PATH = (): string => join(runDir(), "prod.log");
export const TOKEN_PATH = (): string => join(runDir(), "debug-token");
export const LOCK_PATH = (): string => join(runDir(), "prod.spawn.lock");

export function log(msg: string): void {
  print(`stack[prod]: ${msg}`);
}

/** The final `RESULT stack …` machine line (probe convention: the LAST line is the parseable one). */
export function result(line: string): void {
  print(`\nRESULT stack ${line}`);
}

// ── env + port resolution (must MATCH foundation/env, which loads .env with override:true) ───────────

/** The app's `.env`: the file foundation/env loads from the repo root, where every launcher starts the server. */
export const ENV_FILE_PATH = (): string => envFilePath(REPO_ROOT);

export function readEnvFile(): Readonly<Record<string, string | undefined>> {
  return parseEnvText(readEnvText(ENV_FILE_PATH()) ?? "");
}

/** The port the server will ACTUALLY bind. `.env` wins over the shell — the same precedence
 *  foundation/env applies — so probing the shell's PORT alone would watch the wrong socket. */
export function resolvePort(fileEnv: Readonly<Record<string, string | undefined>>): number {
  const raw = fileEnv["PORT"] ?? AMBIENT["PORT"];
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

// ── probes ───────────────────────────────────────────────────────────────────────────────────────────

async function probeHealthz(port: number): Promise<{ healthy: boolean; harness: boolean | null }> {
  // @orb-waive caught-failure-ownership(catch): health fetch failure is the explicit unhealthy observation consumed by identity classification. Ends if unhealthy can authorize ownership.
  try {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!res.ok) {
      return { healthy: false, harness: null };
    }
    const body = (await res.json()) as { harness?: unknown };
    return { healthy: true, harness: typeof body.harness === "boolean" ? body.harness : null };
  } catch {
    return { healthy: false, harness: null };
  }
}

/** Read the operator debug token WITHOUT minting one — the minting path mints on miss, which a probe must
 *  never do. Returns null when no token is on disk (debug not armed). */
function readDebugToken(): string | null {
  try {
    const token = readFileSync(TOKEN_PATH(), "utf8").trim();
    return token.length > 0 ? token : null;
  } catch (error) {
    if (errnoIs(error, "ENOENT")) {
      return null;
    }
    throw error;
  }
}

/** Credential-free posture classification — never presents the token (see probeDebug #1). */
async function probeDebugPosture(port: number): Promise<DebugPosture> {
  // @orb-waive caught-failure-ownership(catch): credential-free debug probe failure returns unknown posture, which prevents token-bearing identity claims. Ends if unknown can authorize control.
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/_debug/info`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    return classifyDebugPosture(res.status);
  } catch {
    return "unknown";
  }
}

/** The token-bearing pid read (see probeDebug #2). Null when no token is on disk or the gate refuses it. */
async function probeDebugPid(port: number): Promise<number | null> {
  const token = readDebugToken();
  if (token === null) {
    return null;
  }
  const res = await fetch(`http://127.0.0.1:${port}/api/_debug/info`, {
    headers: { "x-debug-token": token },
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  if (!res.ok) {
    return null;
  }
  const body = (await res.json()) as { pid?: unknown };
  return typeof body.pid === "number" ? body.pid : null;
}

/** TWO questions, TWO requests, because they are different questions:
 *
 *  1. POSTURE — is the surface reachable WITHOUT a credential? A credential-free GET: 404 = off, 401 = the
 *     token gate is armed (normal), 200 = reachable un-credentialed (post-AUTHFIX-2 an anomaly to
 *     investigate). This request MUST stay credential-free — presenting a token would turn every armed
 *     stack into a 200 and destroy the question.
 *  2. PID — what process is serving? The pid body sits BEHIND the gate, so the un-credentialed posture
 *     fetch cannot read it. Present `x-debug-token` and, on 200, the body carries the SERVING PROCESS'S
 *     OWN `pid` — the strongest instance identity available (it comes from inside the process on the port,
 *     not the `ss` socket table). Skipped when the surface is off or no token is on disk. */
export async function probeDebug(port: number): Promise<{ posture: DebugPosture; pid: number | null }> {
  const posture = await probeDebugPosture(port);
  if (posture === "off" || posture === "unknown") {
    return { posture, pid: null };
  }
  return { posture, pid: await probeDebugPid(port) };
}

/** The socket table's owner of `port`. An unreadable table throws: a null here reads as "not bound", and the
 *  identity verdict built on it would be a guess. */
function listenerPid(port: number): number | null {
  return socketTableOrThrow(listeningPids()).get(port) ?? null;
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (errnoIs(error, "ESRCH")) {
      return false;
    }
    if (errnoIs(error, "EPERM")) {
      return true;
    }
    throw error;
  }
}

export async function observe(port: number): Promise<ObservedInstance & { readonly posture: DebugPosture }> {
  const health = await probeHealthz(port);
  const debug = await probeDebug(port);
  // Prefer the pid the SERVING PROCESS reports about itself; fall back to the socket table's owner.
  return {
    healthy: health.healthy,
    harness: health.harness,
    listenerPid: debug.pid ?? listenerPid(port),
    posture: debug.posture,
  };
}

export function readRecord(): ProdRecord | null {
  try {
    return parseProdRecord(readFileSync(PIDFILE(), "utf8"));
  } catch (error) {
    if (errnoIs(error, "ENOENT")) {
      return null;
    }
    throw error;
  }
}

export async function classify(
  port: number,
): Promise<{ record: ProdRecord | null; observed: ObservedInstance & { readonly posture: DebugPosture }; classification: InstanceClassification }> {
  const record = readRecord();
  const observed = await observe(port);
  return { record, observed, classification: classifyInstance({ record, observed, recordProcessAlive: record !== null && processAlive(record.pid) }) };
}
