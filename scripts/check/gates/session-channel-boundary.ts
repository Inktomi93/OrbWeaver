// Gate: session-channel-boundary (Core-Enforcement-Active-Gates.md — staleness-and-session-freshness.md
// §4.3) — the client twin of G10's rogue-EventEmitter rule: `new BroadcastChannel` has ONE home, and a
// second channel is a second cross-tab protocol nobody versions (and the seam a server-truth payload would
// leak through, forking the ONE invalidation router).
// TWO ARMS: (A) a construction outside the home is RED; (B) the BLINDNESS TRIPWIRE (§4.6) — the home
// loaded and constructing NOTHING means this fence names a home that moved, and would report ✓ forever.
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const CLIENT_SRC = "packages/client/src/";
/** The ONE sanctioned home. SCANNED, not scanRoot-excluded (GATE-AUTHORING §3): a home that is merely
 *  un-scanned carries its exemption silently through a rename; this one goes RED at its new path via arm B. */
const HOME = `${CLIENT_SRC}lib/session-channel.ts`;
/** Real-tree anchor (§4.5): the lib barrel, present on every real run and needed by no example that must
 *  keep arm B silent. */
const ANCHOR = `${CLIENT_SRC}lib/index.ts`;
const GATE_SELF = "scripts/check/gates/session-channel-boundary.ts";
const CTOR = "BroadcastChannel";

const MESSAGE =
  "a BroadcastChannel constructed outside packages/client/src/lib/session-channel.ts. Cross-tab messaging " +
  "has ONE typed home (docs/design/staleness-and-session-freshness.md §4.3): the channel carries SESSION LIFECYCLE and " +
  "durable-local write pokes only, never server truth — a second channel is a second unversioned protocol " +
  "and the seam a data payload would use to fork the ONE invalidation router (§13). Add your message kind " +
  "to `SessionMessage` and post it through `postSessionMessage`.";

const BLIND_MESSAGE =
  `session-channel-boundary is BLIND: its home "${HOME}" constructs no ${CTOR}. Either the channel moved ` +
  "(re-point HOME) or it was deleted (delete this gate) — as written the fence would report clean forever. " +
  "See scripts/check/gates/session-channel-boundary.ts and docs/design/staleness-and-session-freshness.md §4.3.";

let homeConstructs = false;

export const gate: GateDescriptor = {
  name: "session-channel-boundary",
  docRow: "Core-Enforcement-Active-Gates.md",
  status: "active",
  // Arm B is a whole-tree claim about ONE file the changed set may not include.
  scopeSafety: "whole-project",
  message: MESSAGE,
  fix: "Import postSessionMessage / onSessionMessage from #lib instead of constructing a channel.",
  scanRoot: (p) => p.includes(CLIENT_SRC),
  kinds: [SyntaxKind.NewExpression],
  begin: () => {
    homeConstructs = false;
  },
  visit: (node, sf, ctx) => {
    if (!Node.isNewExpression(node) || node.getExpression().getText() !== CTOR) {
      return;
    }
    if (sf.getFilePath().endsWith(`/${HOME}`)) {
      homeConstructs = true;
      return;
    }
    ctx.report(node, { token: `new ${CTOR}`, offset: 0 });
  },
  // `run`, never `finalize`: every gate's `run` precedes every `finalize`, so a marker consumed here cannot
  // be miscounted as stale by `gate-ignore-inventory`'s finalize-phase sweep (GATE-AUTHORING §1).
  run: (ctx) => {
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, ANCHOR) || homeConstructs) {
      return;
    }
    // The blindness tripwire is PERMANENTLY non-suppressible — a fence that can be silenced once it has gone
    // blind is worse than no fence. Genuinely file-level (anchored on the gate file, column 0, no source node).
    ctx.report({ file: GATE_SELF, line: 1, column: 0, message: BLIND_MESSAGE });
  },
  mustFlag: [
    {
      files: {
        [ANCHOR]: "export const lib = {};\n",
        [HOME]: `export const c = new ${CTOR}("orb:session");\n`,
        [`${CLIENT_SRC}features/chat/lib/sync.ts`]: `export const rogue = new ${CTOR}("chat:sync");\n`,
      },
      expect: { count: 1, messageIncludes: "ONE typed home" },
      why: "THE founding shape — a feature growing its own cross-tab channel beside the sanctioned one",
    },
    {
      files: {
        [ANCHOR]: "export const lib = {};\n",
        [HOME]: "export function postSessionMessage(): void {}\n",
      },
      expect: { count: 1, messageIncludes: "is BLIND" },
      why: "ARM B: the home no longer constructs a channel (it moved or died), so the fence would be a permanent false green",
    },
    {
      files: `export const c = new ${CTOR}("rogue");\n`,
      at: `${CLIENT_SRC}features/chat/lib/sync.ts`,
      expect: { count: 1, messageIncludes: "ONE typed home" },
      why: "THE ANCHOR GUARD as a written baseline: with no real-tree anchor in the project, arm B stays silent — exactly ONE finding, so a synthetic mini-project (and gate-conformance itself) can never red the blindness tripwire",
    },
  ],
  mustPass: [
    {
      files: {
        [ANCHOR]: "export const lib = {};\n",
        [HOME]: `export const c = new ${CTOR}("orb:session");\n`,
      },
      why: "the sanctioned home constructing the one channel — arm A skips it, arm B is satisfied",
    },
    {
      files: `export const c = new ${CTOR}("orb:session");\n`,
      at: "packages/server/src/entry/app.ts",
      why: "DECLARED LIMIT: server code is out of scope entirely (no browser, no tabs) — the fence is a client-tier rule",
    },
  ],
};
