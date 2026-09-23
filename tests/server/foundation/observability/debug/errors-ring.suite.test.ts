// foundation/observability/debug/routes — THE LOG-LEVEL READ FILTER, end to end through a real Hono app.
//
// THE DEFECT THIS PINS (reproduced 3/3 on a live stack): a chat
// turn died with an ERROR-level `provider.error` pino line and an HTTP 500, and `/api/_debug/errors`
// returned `{"errors":[]}`. The WRITE was never missing — pino's multistream fed `logRing` correctly. The
// READ was structurally dead: `logger.ts` formats the level as its STRING LABEL (`"level":"error"`), and
// both readers did `Number(record["level"] ?? 0)`. `Number("error")` is NaN, every NaN comparison is false,
// so `collectErrors` (`>= 50`) returned `[]` for EVERY input and `collectLogs` (`< minLevel`) excluded
// NOTHING. One filter could never fire; the other never filtered. Both read as working.
//
// WHY THIS FILE IS A `.suite.`: the pins need REAL pino lines in the ring, and the vitest env pins
// `LOG_LEVEL: "silent"` (vitest.config.ts) so nothing is ever serialized. `vi.hoisted` runs before this
// file's imports, and `isolate: true` gives the file its own module graph, so the frozen `env` singleton
// parses `LOG_LEVEL=info` here and nowhere else. `info` (not `error`) on purpose: it puts BOTH severities in
// the ring, which is what makes the "errors excludes the info line" arm a real assertion rather than a
// tautology over an empty ring.

import process from "node:process";
import { getLog } from "@orb/server/foundation/observability";
import { registerDebugRoutes } from "@orb/server/foundation/observability/debug";
import { Hono } from "hono";
import { afterAll, describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

// `globalThis.process`, not the `node:process` import: a `vi.hoisted` body runs BEFORE this file's import
// bindings are initialized (that is the whole point of it), so touching the imported binding here throws
// `Cannot access '__vi_import_0__' before initialization`.
// biome-ignore-start lint/style/noProcessEnv: this file DRIVES the env parse by crafting process.env before the module graph loads — the same seam `wire-capture.suite.test.ts` uses.
// biome-ignore-start lint/correctness/noProcessGlobal: the `vi.hoisted` body below runs before this file's import bindings exist, so the `node:process` import is unreachable from it — `globalThis.process` is the only handle available at that point (the rest of the file uses the import).
const PREVIOUS_LOG_LEVEL = vi.hoisted((): string | undefined => {
  const previous = globalThis.process.env["LOG_LEVEL"];
  globalThis.process.env["LOG_LEVEL"] = "info";
  return previous;
});
// biome-ignore-end lint/correctness/noProcessGlobal: end of the block above

// `pool: "forks"` reuses a process across FILES, and process.env is process-wide even though the module
// graph is not — so hand the level back or the next file in this worker inherits an un-silenced logger.
afterAll(() => {
  if (PREVIOUS_LOG_LEVEL === undefined) {
    Reflect.deleteProperty(process.env, "LOG_LEVEL");
  } else {
    process.env["LOG_LEVEL"] = PREVIOUS_LOG_LEVEL;
  }
});
// biome-ignore-end lint/style/noProcessEnv: end of the block above

const TOKEN = "debug-secret-token";

function app(): Hono {
  const hono = new Hono();
  registerDebugRoutes(hono, { auth: TOKEN });
  return hono;
}

const authed = (path: string): Request => new Request(`http://x${path}`, { headers: { "x-debug-token": TOKEN } });

async function read(path: string): Promise<Record<string, unknown>[]> {
  const res = await app().fetch(authed(path));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { errors?: Record<string, unknown>[]; logs?: Record<string, unknown>[] };
  return body.errors ?? body.logs ?? [];
}

/** A marker unique within this file, so an assertion never depends on what else shares the module-singleton
 *  ring. A monotonic counter, not a random/time suffix: the ring is per-process and this file owns its own
 *  module graph, so uniqueness needs no entropy — and `test-determinism` bans the ambient kind outright. */
let markerSeq = 0;
function marker(name: string): string {
  markerSeq += 1;
  return `errors-ring-${name}-${String(markerSeq)}`;
}

describe("/api/_debug/errors — the level read filter", () => {
  test("CONTROL: the logger is live in this file and the ring receives the line (the WRITE half)", async () => {
    const tag = marker("control");
    getLog().error({ event: tag }, "provider.error");
    // `/logs` applies no level floor by default, so a hit here proves the line reached `logRing` — which is
    // what separates "the ring was never written" from "the reader cannot see it". Without this control the
    // assertion below could go green on a broken logger.
    expect((await read("/api/_debug/logs")).some((r) => r["event"] === tag)).toBe(true);
  });

  test("an ERROR-level line is REPORTED (the §7.5 blindness: this returned [] for every input)", async () => {
    const tag = marker("provider-fault");
    getLog().error({ event: tag, provider: true, backend: "agent-sdk", terminalReason: "api_error" }, "provider.error");
    const errors = await read("/api/_debug/errors");
    const row = errors.find((r) => r["event"] === tag);
    expect(row).toBeDefined();
    // The provenance an operator opens the panel FOR — the classification the provider layer already made.
    expect(row?.["terminalReason"]).toBe("api_error");
  });

  test("an INFO-level line is EXCLUDED — the filter filters, it does not merely pass everything", async () => {
    const infoTag = marker("chatter");
    getLog().info({ event: infoTag }, "provider.turn");
    expect((await read("/api/_debug/logs")).some((r) => r["event"] === infoTag)).toBe(true);
    expect((await read("/api/_debug/errors")).some((r) => r["event"] === infoTag)).toBe(false);
  });

  test("/api/_debug/logs?level= honors the floor (the same NaN bug's permissive half)", async () => {
    const infoTag = marker("floored");
    const errTag = marker("kept");
    getLog().info({ event: infoTag }, "provider.turn");
    getLog().error({ event: errTag }, "provider.error");
    const warnAndUp = await read("/api/_debug/logs?level=warn");
    expect(warnAndUp.some((r) => r["event"] === errTag)).toBe(true);
    expect(warnAndUp.some((r) => r["event"] === infoTag)).toBe(false);
  });
});
