// The E2E TARGET GUARD — the harness refuses to seed/drive a stack it does not own.
//
// WHY (the incident, 2026-08-01): `global-setup.ts` seeds KNOWN state over the target's tRPC API, and its
// `pinChatConnection` step is UNCONDITIONAL — it authors a `user_connections` row and re-points the `chat`
// (and `summarize`) Model roles at it. The single-user project used to sit on the DEV ports (8788/5173) with
// NO isolated `DATABASE_URL`, so a local `pnpm e2e` / `pnpm e2e:smoke` (the `verify --push` browser lane)
// reused the operator's running dev stack and wrote the seed into the LIVE dev DB — the owner's model routing
// was found flipped to the seed's local-engine pins verbatim. (The step spelled that pin as a
// `routing.roleDefaults` settings patch back then; the settings section is gone, the exposure is identical.)
// A seed that cannot AIM at your data cannot corrupt it, so the fix is a target check, not a gentler seed.
//
// THE CHECK, in two arms (both must pass before a single seed write):
//   1. THE STAMP — the target's `/healthz` must report `harness:true`. Only the Playwright webServer env sets
//      `E2E_HARNESS=on` (modes.ts), so a stack a HUMAN started can never carry it, whatever port it holds.
//   2. THE DEV PORTS — 8788/5173 are refused outright, even if something there answered with a stamp.
// `E2E_ALLOW_DEV_TARGET=1` is the ONE deliberate override (an operator-supervised live drive against their
// own configured stack); it waives BOTH arms, because "I accept a non-harness target" is one decision.

import { DEV_PORTS } from "@orb/tooling/_shared/ports";
import type { ModeProject } from "./modes.ts";

/** The canonical dev-stack ports, read from the ONE port registry (`tooling/src/_shared/ports.ts`; the
 *  same numbers the stack tool defaults to). A harness target holding either is refused — that stack is the
 *  operator's, and its DB is their real data. */
export const DEV_STACK_PORTS: readonly string[] = [String(DEV_PORTS.server), String(DEV_PORTS.vite)];

/** The one override env var: `1` waives both guard arms for a deliberate, supervised dev-stack drive. */
export const ALLOW_DEV_TARGET_ENV = "E2E_ALLOW_DEV_TARGET";

/** Is the dev-stack target explicitly allowed? Pure over a raw env bag so both modes.ts (which SHAPES the
 *  single-user project from it) and the guard read one rule. Only the literal `"1"` opts in. */
export function devTargetAllowed(rawEnv: Readonly<Record<string, string | undefined>>): boolean {
  return rawEnv[ALLOW_DEV_TARGET_ENV] === "1";
}

/** What a `/healthz` probe learned about an origin. `reachable:false` ⇒ nothing booted there (globalSetup
 *  skips that mode); `reachable:true, stamped:false` ⇒ SOMETHING answered but it is not ours (refuse). */
export interface TargetProbe {
  readonly reachable: boolean;
  readonly stamped: boolean;
}

/** The origins a mode-project would touch (vite front door + Hono backend) — both are checked for dev ports. */
type Target = Pick<ModeProject, "name" | "baseUrl" | "backendUrl">;

function devPortOf(target: Target): string | undefined {
  return [target.baseUrl, target.backendUrl].map((url) => new URL(url).port).find((port) => DEV_STACK_PORTS.includes(port));
}

const HOW_TO_FIX =
  "The e2e harness only seeds stacks IT booted (they carry E2E_HARNESS=on and an isolated DATABASE_URL). " +
  "If you really mean to drive the running dev stack — and accept that globalSetup will ADD a connection " +
  "row, RE-POINT its chat + summarize Model roles at the local engine, and may author a character/chat in " +
  `your real DB — re-run with ${ALLOW_DEV_TARGET_ENV}=1.`;

/** The pure verdict: a refusal message, or `undefined` when the target is safe to seed. Only ever called for a
 *  REACHABLE target — an unreachable origin means that mode's webServer never booted, which is a skip. */
export function targetRefusal(target: Target, probe: TargetProbe, allowDevTarget: boolean): string | undefined {
  if (allowDevTarget) {
    return;
  }
  const devPort = devPortOf(target);
  if (devPort !== undefined) {
    return `e2e target guard: REFUSING to seed project "${target.name}" — ${target.baseUrl} / ${target.backendUrl} holds the DEV stack port ${devPort}. ${HOW_TO_FIX}`;
  }
  if (probe.stamped) {
    return;
  }
  return `e2e target guard: REFUSING to seed project "${target.name}" at ${target.backendUrl} — /healthz did not report the E2E_HARNESS stamp, so this stack was NOT booted by the harness. ${HOW_TO_FIX}`;
}

/** Probe an origin's `/healthz` for liveness + the harness stamp. Any transport failure (nothing listening) is
 *  `reachable:false` — the mode simply did not boot in this run. */
export async function probeTarget(backendUrl: string): Promise<TargetProbe> {
  try {
    const res = await fetch(`${backendUrl}/healthz`);
    if (!res.ok) {
      return { reachable: false, stamped: false };
    }
    const body = (await res.json()) as { readonly harness?: unknown };
    return { reachable: true, stamped: body.harness === true };
  } catch {
    return { reachable: false, stamped: false };
  }
}
