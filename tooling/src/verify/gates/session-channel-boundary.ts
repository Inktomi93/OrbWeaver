// Policy: session-channel-boundary (Core-Enforcement-Active-Gates.md)
// — the client twin of G10's rogue-EventEmitter rule: `new BroadcastChannel` has ONE home, and a
// second channel is a second cross-tab protocol nobody versions (and the seam a server-truth payload would
// leak through, forking the ONE invalidation router).
//
// THE SPLIT (#1950): the legacy descriptor carried two arms of different authority — (A) a
// construction outside the home, a per-file occurrence an author may waive with a reason, and (B) the
// blindness tripwire, a whole-tree HARD verdict that the home still constructs the channel. One `execution`
// and one authority cannot serve both, so arm B is `session-channel-boundary-health` (same family) and this
// policy is arm A alone: `selected-files`, ordinary, judged per file.
//
// FAMILY `session-channel` — the shared reader is `lib/broadcast-channel-origin.ts`
// (`classifyBroadcastChannelConstruction`), consumed identically by both siblings. IDENTITY, NOT SPELLING:
// the legacy check was `getExpression().getText() === "BroadcastChannel"`; the subject is now the AMBIENT
// GLOBAL resolved through the shared readers behind a name prefilter — a local class of that name is `other`
// and passes (mustPass[2]), an immutable const alias is the same construction and flags (mustFlag[2]), the
// `globalThis.`/`self.`/`window.` receiver spelling flags (mustFlag[4], a catch the legacy text check lacked),
// and a binding the readers cannot place is REPORTED under the disjoint UNREADABLE text (mustFlag[3], #944).
// The comparison and the prefilter are each pinned by a row that reds when it is cut (mustPass[4], [5]).
//
// POPULATION PORT: byte-identical — the legacy `scanRoot: p.includes("packages/client/src/")` is `@client`.
// The sanctioned home is SKIPPED by exact path inside the visitor, never subtracted from the population
// (§12.4); its liveness is the sibling's whole job. The legacy server-file declared-limit row carries an
// added in-population file because a fixture admitting nothing is a population tool error, not a pass.
//
// THE REPORTED POSITION is the CALLEE expression — `BroadcastChannel`, or the alias it was spelled with —
// so a waiver names the class the author wrote. This is an ANCHOR MOVE from the legacy
// `new BroadcastChannel` at offset 0 (§4.6 category 6): zero live markers existed, so nothing re-binds.
//
// Legacy descriptor: `774231540` (`tooling/src/verify/gates/session-channel-boundary.ts`). No private marker
// grammar; zero live `@orb-gate-ignore session-channel-boundary` markers at conversion (rg over packages/,
// tests/, tooling/, scripts/), so no translation was owed.
//
// LEGACY SHA, made precise rather than replaced: `774231540` above is a tree where the legacy descriptor is
// readable (`git show 774231540:<this file>` has `defineGate` count 0), but it is NOT this module's
// conversion parent — it is an unrelated docs-retirement commit from 2026-08-30. The canonical form is
// **`f1bbc34e7^`** (= `011233309`): `git log -S 'defineGate({' --reverse -- <this file>` gives the
// introducing commit `f1bbc34e7`, and the cited parent carries the legacy descriptor by construction. Both
// are true; the second is the one a §4.6 differential can replay against, which is what the field is for.
// TWO CENSUS TRAPS IN ONE LINE, recorded because this field has now under-reported four distinct ways: a
// `[0-9a-f]{7,40}` pattern with a "contains a digit AND a letter" filter — the filter that correctly
// rejects `defaced` — DROPS `774231540`, which is all digits, so a census reads this header as carrying no
// sha at all; and a census that found it would have counted a NON-PORT citation as satisfying the field.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `session-channel-boundary` descriptor at 01123330987d1f22a088bcf5a57ef280942d30e7, the parent of the conversion
// `f1bbc34e7` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,441 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot`
// admits 1,319 and final `population` admits 1,319. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `packages/contracts/src/assets/__cbbhr_out_index.ts` (virtual) rejected by both.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyBroadcastChannelConstruction, SESSION_CHANNEL_HOME } from "../lib/broadcast-channel-origin.ts";

const MESSAGE =
  "a BroadcastChannel constructed outside packages/client/src/lib/session-channel.ts. Cross-tab messaging " +
  "has ONE typed home: the channel carries SESSION LIFECYCLE and " +
  "durable-local write pokes only, never server truth — a second channel is a second unversioned protocol " +
  "and the seam a data payload would use to fork the ONE invalidation router (§13). Add your message kind " +
  "to `SessionMessage` and post it through `postSessionMessage`.";

const UNREADABLE =
  "this `new` is spelled like the BroadcastChannel global but the shared readers cannot place its binding, so whether it opens a second cross-tab channel CANNOT be established. Reported rather than passed: the spelling alone is not the identity. Give the constructor a readable binding, or route through packages/client/src/lib/session-channel.ts.";

const FIX =
  "Import postSessionMessage / onSessionMessage from #lib instead of constructing a channel. A deliberate " +
  "second channel is waived with `// @orb-waive session-channel-boundary(<callee>): <reason>` on the line " +
  "above the statement, where <callee> is the constructed class exactly as written — `BroadcastChannel`, " +
  "or the alias it was spelled with. One construction is one finding, so one marker suffices.";

export const gate = defineGate({
  id: "session-channel-boundary",
  family: "session-channel",
  authority: "ordinary",
  severity: "error",
  population: "@client",
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.NewExpression],
        visit: (node, sourceFile) => {
          if (!Node.isNewExpression(node)) {
            return;
          }
          const verdict = classifyBroadcastChannelConstruction(node);
          if (verdict === "other" || ctx.relativePath(sourceFile) === SESSION_CHANNEL_HOME) {
            return;
          }
          const callee = node.getExpression();
          ctx.report.node(node, {
            token: callee.getText(),
            offset: callee.getStart() - node.getStart(),
            ...(verdict === "unreadable" ? { message: UNREADABLE } : {}),
          });
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/client/src/lib/index.ts": "export const lib = {};\n",
        "packages/client/src/lib/session-channel.ts": 'export const c = new BroadcastChannel("orb:session");\n',
        "packages/client/src/features/chat/lib/sync.ts": 'export const rogue = new BroadcastChannel("chat:sync");\n',
      },
      expect: { count: 1, token: "BroadcastChannel", messageIncludes: "ONE typed home" },
      why: "THE founding shape — a feature growing its own cross-tab channel beside the sanctioned one; the home's own construction is not a finding",
    },
    {
      mode: "types",
      files: { "packages/client/src/features/chat/lib/sync.ts": 'export const c = new BroadcastChannel("rogue");\n' },
      expect: { count: 1, token: "BroadcastChannel" },
      why: "the rogue construction ALONE, with neither the home nor the real-tree anchor in the project — exactly ONE finding, because the blindness tripwire is the sibling policy's and this one never reports it",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/chat/lib/alias.ts": 'const BC = BroadcastChannel;\nexport const c = new BC("chat:sync");\n',
      },
      expect: { count: 1, token: "BC" },
      why: 'AN IMMUTABLE CONST ALIAS constructs the same global — the legacy `getText() === "BroadcastChannel"` check saw `BC` and passed it; the reported position is the alias as written, which is what a waiver must name',
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/chat/lib/written.ts":
          'let BroadcastChannel = globalThis.BroadcastChannel;\nBroadcastChannel = globalThis.BroadcastChannel;\nexport const c = new BroadcastChannel("x");\n',
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "THE FAIL-CLOSED THIRD ANSWER (#944): a WRITTEN local binding of that name might still hold the api, so the readers refuse it as ambiguous and the policy reports under the disjoint UNREADABLE text instead of passing. `messageIncludes` names text only that branch emits",
    },
    {
      mode: "types",
      files: { "packages/client/src/features/chat/lib/receiver.ts": 'export const c = new globalThis.BroadcastChannel("chat:sync");\n' },
      expect: { count: 1, token: "globalThis.BroadcastChannel" },
      why: "THE AMBIENT-RECEIVER SPELLING: `globalThis.BroadcastChannel` (also `self.`/`window.`) is the same global. The legacy text check compared the whole callee to `BroadcastChannel` and passed this — a catch the conversion ADDED; the waiver position is the callee as written",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/client/src/lib/index.ts": "export const lib = {};\n",
        "packages/client/src/lib/session-channel.ts": 'export const c = new BroadcastChannel("orb:session");\n',
      },
      why: "the sanctioned home constructing the one channel — skipped by exact path. Deleting the home skip reds this row",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/chat/lib/clean.ts": "export const clean = true;\n",
        "packages/server/src/entry/app.ts": 'export const c = new BroadcastChannel("orb:session");\n',
      },
      why: "DECLARED LIMIT: server code is out of population entirely (no browser, no tabs) — the fence is a client-tier rule. The clean client file keeps the fixture admitted; a fixture admitting nothing is a population tool error",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/chat/lib/polyfill.ts":
          'export class BroadcastChannel {\n  constructor(public readonly name: string) {}\n}\nexport const c = new BroadcastChannel("shim");\n',
      },
      why: "THE IDENTITY COUNTERFACTUAL: a PROJECT class that merely shares the global's name resolves to its own declaration and is a different class — the readers refuse it as a proven non-module binding, which is `other`",
    },
    {
      mode: "types",
      files: { "packages/client/src/features/chat/lib/shadow.ts": "const BroadcastChannel = Map;\nexport const c = new BroadcastChannel<string, number>();\n" },
      why: "THE GLOBAL-NAME COMPARISON, pinned: a const NAMED BroadcastChannel that aliases ANOTHER global passes the name prefilter and resolves to that other global (`Map`). Replacing the `globalName === BROADCAST_CHANNEL` comparison with a bare `constructs` reds this row — the only fixture that reaches the comparison with a different answer",
    },
    {
      mode: "types",
      files: { "packages/client/src/features/chat/lib/unrelated.ts": 'import { Thing } from "./missing.ts";\nexport const t = new Thing();\n' },
      why: "THE PREFILTER'S JOB: a `new` of an UNRELATED class the readers cannot place is not a candidate, so fail-closure never accuses it. Deleting the name prefilter reds this row (the unreadable arm would report every unresolvable `new` in the client tree — the `new TRPCError(…)` lesson from the sanctioned-home conversion)",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/chat/lib/port.ts":
          'export function open(deps: { BroadcastChannel: new (name: string) => unknown }): unknown {\n  return new deps.BroadcastChannel("chat:sync");\n}\n',
      },
      why: "THE INJECTED PORT: a member NAMED BroadcastChannel read off a non-ambient receiver is that object's property — the testable injected shape — not the global. Replacing the ambient-receiver check with a bare `constructs` reds this row",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/chat/lib/sync.ts":
          '// @orb-waive session-channel-boundary(BroadcastChannel): a stand-in reason and its end condition.\nexport const rogue = new BroadcastChannel("chat:sync");\n',
      },
      why: "THE ORDINARY IDENTITY ARM (§4.2): the correct central marker at the reported position — the callee `BroadcastChannel` — suppresses the twin of mustFlag[1]. One finding, one marker, zero effective findings and zero authority alarms; a wrong position, a foreign policy id or an over-broad match each fail this row through `toolFailure`",
    },
  ],
});
