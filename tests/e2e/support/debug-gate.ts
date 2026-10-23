// The /api/_debug gate read over a booted stack, which runs with its operator DEBUG_TOKEN configured. Refusals are
// told apart by status and by the gate's own arm-naming reason, never by its sentence text.
import { isPlainObject } from "@orb/kit/guards";
import { expect, test } from "@playwright/test";
import { E2E_DEBUG_TOKEN } from "./modes.ts";

/** The principal-blind whole-db reads the gate is the whole boundary for, plus the db-free info control. */
const DEBUG_PROBE_PATHS = ["/api/_debug/info", "/api/_debug/db/chats", "/api/_debug/config/user"] as const;
/** A relay tell: the loopback socket speaks for a third party, so the operator's own fallback session never mints. */
export const RELAYED = { "x-forwarded-for": "203.0.113.9" } as const;
const TOKEN_HEADER = "x-debug-token";
const BUG_REPORT = "/api/_debug/bug-report";

export interface DebugOutcome {
  readonly path: string;
  readonly status: number;
  readonly reason: string | null;
}

/** Every probe path's status and the gate's reason, if the gate itself answered. */
export async function debugOutcomes(origin: string, headers: Readonly<Record<string, string>>): Promise<DebugOutcome[]> {
  return await Promise.all(
    DEBUG_PROBE_PATHS.map(async (path): Promise<DebugOutcome> => {
      const response = await fetch(`${origin}${path}`, { headers });
      const body: unknown = await response.json();
      const reason = isPlainObject(body) && typeof body["reason"] === "string" ? body["reason"] : null;
      return { path, status: response.status, reason };
    }),
  );
}

/** The gate's one shared refusal reason when every probe is its own 401, else null. */
export async function gateRefusalReason(origin: string, headers: Readonly<Record<string, string>>): Promise<string | null> {
  const outcomes = await debugOutcomes(origin, headers);
  const reason = outcomes[0]?.reason ?? null;
  return outcomes.every((outcome) => outcome.status === 401 && outcome.reason === reason) ? reason : null;
}

/** Every probe path admitted to its handler. */
export const ALL_ADMITTED: readonly DebugOutcome[] = DEBUG_PROBE_PATHS.map((path) => ({ path, status: 200, reason: null }));

export function operatorToken(token: string = E2E_DEBUG_TOKEN): Readonly<Record<string, string>> {
  return { [TOKEN_HEADER]: token };
}

/** POST an empty note to the bug-report writer: past the gate, the schema refuses it with 400 and writes nothing. */
export async function bugReportStatus(origin: string, headers: Readonly<Record<string, string>>): Promise<number> {
  const response = await fetch(`${origin}${BUG_REPORT}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ note: "   ", windowMinutes: null }),
  });
  await response.arrayBuffer();
  return response.status;
}

/** The token states every auth mode's stack owes: an un-credentialed caller is refused with or without a wrong
 *  token, the operator token opens every probe, and the operator's own loopback session needs no token. */
export function describeDebugTokenStates(mode: string): void {
  test.describe(`the /api/_debug token states (${mode})`, () => {
    test(`${mode}: token configured, no token sent → 401, never a handler`, async ({ baseURL }) => {
      expect(await gateRefusalReason(baseURL ?? "", RELAYED)).toEqual(expect.any(String));
    });

    test(`${mode}: token configured, WRONG token sent → 401`, async ({ baseURL }) => {
      const origin = baseURL ?? "";
      const absent = await gateRefusalReason(origin, RELAYED);
      const mismatch = await gateRefusalReason(origin, { ...RELAYED, ...operatorToken("not-the-token") });
      expect([typeof absent, typeof mismatch]).toEqual(["string", "string"]);
      expect(mismatch).not.toBe(absent);
    });

    test(`${mode}: the operator's x-debug-token authorizes (the headless credential is untouched)`, async ({ baseURL }) => {
      expect(await debugOutcomes(baseURL ?? "", { ...RELAYED, ...operatorToken() })).toEqual(ALL_ADMITTED);
    });

    test(`${mode}: …and NOT with a token configured either — the operator never needs the secret on their own box`, async ({ baseURL }) => {
      expect(await debugOutcomes(baseURL ?? "", {})).toEqual(ALL_ADMITTED);
    });

    test(`${mode}: bug-report WRITE, token configured, none sent → 401, and NOTHING is written`, async ({ baseURL }) => {
      expect(await bugReportStatus(baseURL ?? "", RELAYED)).toBe(401);
    });

    test(`${mode}: the operator's token reaches the bug-report handler (400 from the schema, not 401/404 from the gate)`, async ({ baseURL }) => {
      expect(await bugReportStatus(baseURL ?? "", { ...RELAYED, ...operatorToken() })).toBe(400);
    });
  });
}
