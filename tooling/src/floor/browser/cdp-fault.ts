// The TEST-ONLY CDP fault seam, installed on every context a probe builds (`buildProbeContext`) and on an attached
// one, so a context opened in an already-running browser is faulted exactly as a launched one.
import type { BrowserContext, CDPSession } from "@playwright/test";
import { warn } from "../cli/log.ts";
import { processEnvValue } from "../process/process-env.ts";

// WHY IT LIVES AT THE BROWSER SEAM. Several instruments own a protocol-failure arm whose behaviour is
// a real verdict — ui-audit's forced-state pass demotes a failed `CSS.forcePseudoState` to a per-group
// WITHHOLDING (so the run is NO VERDICT rather than clean), snap's navigation and motion arms have their
// own — and NONE of them was pinnable, because no static document makes CDP throw on cue. The recorded
// alternative was a fault hook inside the instrument, which ops/hover.ts refused by name as "exactly the
// class of change that makes a tool lie about itself". A PROTOCOL-level injector at the shared browser
// seam has neither problem: it is instrument-agnostic, and no instrument can see it — every consumer
// still calls `page.context().newCDPSession(page)` and gets back a session that refuses the named
// methods.
//
// TEST-ONLY IS ENFORCED, NOT DOCUMENTED (the `ORB_SNAP_TEST_FILMSTRIP_FRAME_LIMIT` precedent,
// snap/ops/arms/filmstrip.ts): the seam REFUSES outside vitest, and it REFUSES a spec it cannot parse
// rather than declining to inject — an injector that silently does nothing turns the failure-arm pin it
// exists for green, which is the lying-instrument class it was built to close. It also announces itself
// on stderr, so a run taken under injected faults can never be mistaken for a measurement.
const CDP_FAULT_ENV = "ORB_PROBE_TEST_CDP_FAULT";
/** `<Domain.method>` — every call — or `<Domain.method>@<nth>` for one occurrence. The occurrence form is
 *  what tells a PARTIAL failure (one bad node, the rest measured — the demotion ruling) apart from a
 *  whole-instrument abort; a boolean injector can only produce the second. */
const CDP_FAULT_ROW_RE = /^([A-Z]\w*\.\w+)(?:@([1-9]\d*))?$/u;

interface CdpFaultRow {
  readonly method: string;
  /** 1-based call index within the run; null faults every call of the method. */
  readonly occurrence: number | null;
}

/** Parse the fault spec. Exported for its own both-directions unit proof — a parser that accepts garbage
 *  by ignoring it is the same silence as an injector that never injects. */
export function parseCdpFaultSpec(spec: string): readonly CdpFaultRow[] {
  const rows: CdpFaultRow[] = [];
  for (const entry of spec.split(",")) {
    const text = entry.trim();
    if (text === "") {
      continue;
    }
    const match = CDP_FAULT_ROW_RE.exec(text);
    if (match === null) {
      throw new Error(`CDP FAULT REFUSED: ${CDP_FAULT_ENV} entry "${text}" is not <Domain.method> or <Domain.method>@<nth call>`);
    }
    rows.push({ method: String(match[1]), occurrence: match[2] === undefined ? null : Number(match[2]) });
  }
  if (rows.length === 0) {
    throw new Error(`CDP FAULT REFUSED: ${CDP_FAULT_ENV} was set but names no protocol method`);
  }
  return rows;
}

function cdpFaultRows(): readonly CdpFaultRow[] | null {
  const spec = processEnvValue(CDP_FAULT_ENV);
  if (spec === undefined) {
    return null;
  }
  if (processEnvValue("VITEST") !== "true") {
    throw new Error(`CDP FAULT REFUSED: ${CDP_FAULT_ENV} is a test-only seam`);
  }
  return parseCdpFaultSpec(spec);
}

/** The per-context tally that gives `@N` its meaning: the Nth call of that method on this context. */
function cdpFaultGate(rows: readonly CdpFaultRow[]): (method: string) => void {
  const calls = new Map<string, number>();
  return (method) => {
    const nth = (calls.get(method) ?? 0) + 1;
    calls.set(method, nth);
    const hit = rows.find((row) => row.method === method && (row.occurrence === null || row.occurrence === nth));
    if (hit !== undefined) {
      throw new Error(`planted CDP fault: ${method} call #${String(nth)} refused by ${CDP_FAULT_ENV}`);
    }
  };
}

/** A session whose `send` consults the gate first; every other member is the real one, bound. */
function faultInjectedSession(session: CDPSession, gate: (method: string) => void): CDPSession {
  return new Proxy(session, {
    get(target, property) {
      if (property === "send") {
        return async (method: string, params?: unknown): Promise<unknown> => {
          gate(method);
          return await Reflect.apply(target.send, target, params === undefined ? [method] : [method, params]);
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      if (typeof value !== "function") {
        return value;
      }
      const bound: unknown = value.bind(target);
      return bound;
    },
  });
}

export function installCdpFaultInjector(context: BrowserContext): void {
  const rows = cdpFaultRows();
  if (rows === null) {
    return;
  }
  warn(
    `CDP FAULT INJECTION ACTIVE (${CDP_FAULT_ENV}) — this run is a FIXTURE, not a measurement: ${rows.map((row) => `${row.method}${row.occurrence === null ? "" : `@${String(row.occurrence)}`}`).join(", ")}`,
  );
  const gate = cdpFaultGate(rows);
  const openSession = context.newCDPSession.bind(context);
  context.newCDPSession = async (target): Promise<CDPSession> => faultInjectedSession(await openSession(target), gate);
}
