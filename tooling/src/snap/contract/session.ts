// The session substrate's shapes: the
// repo-keyed registry ROW a daemon writes, the NDJSON request/event protocol on its unix socket, and the
// pure verdict vocabularies lib/session-plan.ts derives. Shapes only — the readers that validate a line
// off the wire (`readSessionRequest` / `readSessionRow`) live beside the other pure derivations in
// lib/session-plan.ts, so the daemon and the client parse ONE grammar.
import type { Viewport } from "../../_shared/argv.ts";
import type { ProbeAttachOptions } from "../../_shared/browser-contract.ts";
import type { OrbConsoleCompletenessSummary } from "../../_shared/browser-diagnostics.ts";
import type { SnapRunFactBatch } from "./run-facts.ts";

export const SESSION_PROTOCOL_VERSION = 1;

/** What a session is bound to. Phase 1 binds a base URL, a local file, or today's single stage through
 *  the unchanged `ensureStage`; per-lane bands are phase 2 (§3.6). */
export interface SessionBinding {
  readonly kind: "base" | "file" | "stage";
  readonly url: string;
}

/** The exact session evidence interval an adopted client run belongs to. The daemon owns these counters
 * and sends this snapshot on the typed done event; the client never reconstructs it from prose. */
export interface SessionRunProvenance {
  readonly name: string;
  readonly call: number;
  readonly evidenceWindow: number;
  readonly binding: SessionBinding;
  /** Optional only for protocol-v1 daemons predating full run-index provenance. Current daemons emit it. */
  readonly stage?: {
    readonly state: "bound" | "not-applicable" | "unavailable";
    readonly ownerCheckout: string | null;
    readonly band: number | null;
    readonly ref: string | null;
    readonly binding: SessionBinding;
    readonly failure: string | null;
  };
}

/** The browser environment the daemon launched with — what `attachProbeSession` DECLARES so an attached
 *  sibling's environment contract is the session's, never a guess, and what `--session-status` prints. */
interface SessionEnvironment {
  readonly viewport: Viewport;
  /** Whether that viewport was an explicit `--viewport` ask (#1668). A session BOOTS a context from this
   *  row, so without the marker `--session-start --mobile --viewport 320x740` would hand every later call
   *  the device's own size and silently drop the override — the same lie one layer down. Optional: rows
   *  written before this field simply have no override. */
  readonly viewportExplicit?: boolean;
  readonly device: string | null;
  readonly colorScheme: "light" | "dark" | null;
  readonly reducedMotion: boolean;
  readonly contrast: "more" | "no-preference" | null;
  readonly reducedTransparency: boolean;
  readonly deviceScaleFactor: number | null;
}

export interface SessionStageState {
  readonly band: number;
  readonly status: "live" | "dead";
  readonly detectedAt: string | null;
  readonly op: string | null;
  /** Current rows retain the exact StageRow identity; optional only for protocol-v1 rows already on disk. */
  readonly ownerCheckout?: string;
  readonly ref?: string;
  readonly binding?: SessionBinding;
}

/** `<main>/.cache/snap-session/<name>.json` — everything a caller on ANY checkout needs to find, judge
 *  and reap a session (the registry is repo-keyed exactly like the stage marker, #108). Written by the
 *  daemon at boot and re-written at every call boundary; the daemon pid's liveness is the verdict, the
 *  row is the evidence. */
export interface SessionRow {
  readonly v: typeof SESSION_PROTOCOL_VERSION;
  readonly name: string;
  /** The repo root the booting checkout ran from — the OWNER (F4: a foreign caller is refused). */
  readonly ownerCheckout: string;
  readonly daemonPid: number;
  /** = the daemon pid: `spawnFullPriorityChild` is `detached`, so the daemon leads its own process group and
   *  this is what `--session-sweep`/`--session-close` signal to take the browser tree with it. */
  readonly pgid: number;
  readonly socket: string;
  /** The daemon's debugging endpoint (`http://127.0.0.1:<port>`) — the sibling attach door (§3.4). */
  readonly cdpEndpoint: string | null;
  /** The session's run slot (instrument `snap-session`, `reports/runs/snap-session/<runId>/`). Its
   *  `.inflight` marker carries the daemon pid, so `abandonedRuns(root, "snap-session")` lists exactly the
   *  sessions whose daemon died (§3.8) with zero new marker machinery. */
  readonly slotDir: string;
  readonly binding: SessionBinding;
  /** Null for base/file sessions. A stage death is sticky until this session closes and reboots. */
  readonly stage?: SessionStageState | null;
  readonly environment: SessionEnvironment;
  readonly bootArgv: readonly string[];
  readonly createdAt: string;
  readonly lastUsedAt: string;
  /** The argv of the call in flight, or null between calls — the `mid-<op>` half of a SESSION DEAD line. */
  readonly inflightOp: string | null;
  readonly lastOp: string | null;
  readonly ttlMs: number;
  readonly headless: boolean;
  readonly calls: number;
}

export const SESSION_REQUEST_KINDS = ["call", "status", "close", "export", "ping"] as const;
export type SessionRequestKind = (typeof SESSION_REQUEST_KINDS)[number];

/** One NDJSON line from the client; the daemon answers with `SessionEvent` lines and closes. */
export interface SessionRequest {
  readonly v: typeof SESSION_PROTOCOL_VERSION;
  readonly kind: SessionRequestKind;
  /** The CLIENT's run id — the daemon writes into the client's slot (§3.7: one slot per call). */
  readonly runId: string;
  /** Absolute `reports/runs/snap/<runId>/` — the slot the daemon ADOPTS for the call's artifacts. */
  readonly slotDir: string;
  /** Raw argv, re-parsed in the daemon by `parseSnapArgs` — validation has ONE home. */
  readonly argv: readonly string[];
  /** The caller's cwd — where a path-shaped `--out`/`--file` resolves. */
  readonly cwd: string;
  /** The caller's repo root — the ownership check (F4). */
  readonly checkout: string;
  /** True on the boot call: its argv IS the boot argv, so the session-only-flag refusal does not apply. */
  readonly boot: boolean;
  /** `--session-close --force` from a foreign checkout (the #447 teardown-consent rule). */
  readonly force: boolean;
  /** Explicit export destination from `--session-export <name> --out <base>`; null for every other
   * request. It crosses the typed boundary rather than being rediscovered from daemon process argv. */
  readonly exportOut: string | null;
}

export interface SessionPageInfo {
  readonly index: number;
  readonly url: string;
  readonly title: string;
}

/** The daemon's answer stream. `line`/`warn` are printed VERBATIM by the client in arrival order, so the
 *  RESULT line stays last and `tail -1` / `grep ^RESULT` keep working; `done.exit` becomes the client's
 *  exit through `runTool` (the never-downgrade lattice is unchanged). */
export type SessionEvent =
  | { readonly kind: "line"; readonly text: string }
  | { readonly kind: "warn"; readonly text: string }
  | {
      readonly kind: "status";
      readonly row: SessionRow;
      readonly pages: readonly SessionPageInfo[];
      /** The in-flight op's argv when the daemon is busy, else null. */
      readonly busy: string | null;
      readonly idleMs: number;
    }
  | {
      readonly kind: "done";
      readonly exit: number;
      readonly pairs: readonly (readonly [string, string])[];
      /** Typed machine facts; present on rendered calls, absent on administrative protocol events. */
      readonly facts?: readonly SnapRunFactBatch[];
      /** Present only for a rendered call. Administrative events never invent a diagnostic population. */
      readonly diagnosticCompleteness?: OrbConsoleCompletenessSummary;
      /** Present for rendered calls and exports whose artifacts are adopted into the client's run slot. */
      readonly sessionProvenance?: SessionRunProvenance;
    };

/** How the CALLING checkout may use a session (§3.5's table): `absent` — no row, boot it; `ours` — live
 *  and owned by this checkout, drive it; `refuse` — live and owned by ANOTHER checkout (F4: name the
 *  owner, pid and idle age); `reclaim` — the row names a daemon that is gone, whoever owned it. */
const SESSION_ACCESS = ["absent", "ours", "refuse", "reclaim"] as const;
export type SessionAccess = (typeof SESSION_ACCESS)[number];

/** What `--session-sweep` may do to a row: `live` — under the TTL, reported and never touched; `idle` —
 *  alive past its TTL (a wedged timer), reaped; `dead` — the daemon is gone, reaped and the marker settled. */
const SESSION_SWEEP_VERDICTS = ["live", "idle", "dead"] as const;
export type SessionSweepVerdict = (typeof SESSION_SWEEP_VERDICTS)[number];

export interface SessionLimits {
  /** Idle TTL — never load-scaled (§7.1's IDLE class: idle is not load). */
  readonly ttlMs: number;
  /** Live sessions per box, across every checkout of the repo. */
  readonly cap: number;
}

/** Where a session call navigates. `live` = no route and no `--file`: the call drives the page as it
 *  stands (`navigatePage: false`, the scenario's `keepLivePage` shape). */
const SESSION_CALL_TARGETS = ["file", "route", "live"] as const;
export type SessionCallTarget = (typeof SESSION_CALL_TARGETS)[number];

/** What a sibling instrument's `--session <name>` resolved to: an attach target, or a printable refusal
 *  (#1285, §3.4/§5). The verdict itself has ONE home in lib/session-plan.ts; these are the shapes
 *  ops/session-attach.ts converts it into, homed here because a type outside a type home is gate-RED. */
export interface SessionAttachTarget {
  readonly ok: true;
  readonly endpoint: string;
  readonly environment: ProbeAttachOptions;
  readonly row: SessionRow;
  readonly lease: SessionAttachLease;
}

export interface SessionAttachLease {
  /** Stop heartbeating and throw if the daemon stopped acknowledging the attach while it was live. */
  readonly close: () => Promise<void>;
}

export interface SessionAttachRefusal {
  readonly ok: false;
  /** Print VERBATIM and exit 2 — never a silently-resolving pointer (§3.8). */
  readonly message: string;
}

export type SessionAttachResolution = SessionAttachTarget | SessionAttachRefusal;
