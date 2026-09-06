// Policy: no-raw-clock (Spine-Testing.md §3) — production reads time from the INJECTED clock
// (`@orb/kit/time`), never the ambient one, because the injected seam is the same one tests pin. Reading
// `new Date(ms)` to parse a known timestamp is fine; what is banned is asking the runtime what time it is.
//
// IDENTITY, NOT SPELLING: the legacy check compared the callee's TEXT to `"Date.now"` / `"Date"`, so a local
// `Date` shadow false-red and an alias (`const clock = Date; clock.now()`), a computed-literal member
// (`Date["now"]()`) or a destructured global walked straight past. The subject is now the ambient `Date`
// the checker resolved from TypeScript's own lib declarations, read through the shared
// `readAmbientInvocation` reader this policy shares with `no-raw-random`.
//
// AUTHORITY IS reviewed-grant. The two homes that may read the ambient clock are not per-occurrence
// mistakes: the kit time engine IS the clock seam (it reads the ambient clock exactly once so nothing else
// has to) and the composition root CONSTRUCTS the clock it injects into every tier — both recurring
// repository PERMISSIONS, each one exact `(subject, operation)` row in the central reviewed-grant table.
// Findings are deduped PER CARRIER because a home that reads the clock twice would make its own row
// OVER-BROAD and license neither read. The legacy rename tripwire is now the central STALE alarm: the day
// either home moves or stops reading the ambient clock, its row is consumed zero times and says so.
// The test/dev-tool ZONES stay a population decision, which is what they are.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { AmbientSource } from "../lib/ambient-determinism.ts";
import { readAmbientInvocation } from "../lib/ambient-determinism.ts";
import { referenceNamesExport } from "../lib/origin-verdict.ts";
import { readMemberReference } from "../lib/reference-fact.ts";

const OPERATION = "ambient-clock-read";
const NOW_MEMBER = "now";
const DATE_GLOBAL = "Date";

/** `Date.now()` — the ambient reading of the current instant. */
const AMBIENT_NOW: readonly AmbientSource[] = [{ globalName: DATE_GLOBAL, memberPath: [NOW_MEMBER], token: "Date.now" }];
/** `new Date()` with NO arguments — the same question asked through the constructor. */
const AMBIENT_DATE: readonly AmbientSource[] = [{ globalName: DATE_GLOBAL, memberPath: [], token: "new Date" }];

const MESSAGE =
  "raw Date.now() / new Date() — production reads time from the injected clock (@orb/kit/time), never the " +
  "ambient one (determinism: the same seam tests pin). `new Date(ms)` to parse a known timestamp is fine. " +
  "(Spine-Testing.md §3)";
const FIX = "take the injected clock (`@orb/kit/time`'s `nowMs`/`createClock`, threaded from the composition root) instead of reading the ambient clock.";

/** THE CANDIDATE PREFILTER (perf): resolving an origin on every call in a 3,367-file population does not
 *  finish. A `now` MEMBER read normalizes every dotted/optional/computed spelling of `Date.now`, and a
 *  zero-argument `new` is the whole constructor arm. A call through a bare local alias
 *  (`const now = Date.now; now()`) is outside the prefilter — a declared limit with its own row. */
function clockCandidate(node: MorphNode): { readonly sources: readonly AmbientSource[] } | undefined {
  if (Node.isNewExpression(node)) {
    // The constructor arm is prefiltered on the NAME as well as on the argument count — fail-closure's
    // mandatory companion. Without it every zero-argument `new X()` whose class the reader cannot name
    // (`new AsyncLocalStorage()`, `new Hono()`, `new EventEmitter()`, a domain error) is accused of being
    // the ambient clock: fourteen such sites on the live tree, measured.
    const named = node.getArguments().length === 0 && referenceNamesExport(node.getExpression(), DATE_GLOBAL);
    return named ? { sources: AMBIENT_DATE } : undefined;
  }
  if (!Node.isCallExpression(node)) {
    return;
  }
  const callee = node.getExpression();
  if (!(Node.isPropertyAccessExpression(callee) || Node.isElementAccessExpression(callee))) {
    return;
  }
  const member = readMemberReference(callee);
  return member.kind === "resolved" && member.value.name === NOW_MEMBER ? { sources: AMBIENT_NOW } : undefined;
}

export const gate = defineGate({
  id: "no-raw-clock",
  family: "ambient-determinism",
  authority: "reviewed-grant",
  severity: "error",
  population: { in: ["@packages"], notNamed: ["*.test.*"], ext: ["ts", "tsx"] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const readers = new Map<string, MorphNode>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression, SyntaxKind.NewExpression],
          visit: (node, sourceFile: SourceFile) => {
            const candidate = clockCandidate(node);
            if (candidate === undefined) {
              return;
            }
            // FAIL-CLOSED on an unreadable callee; a callee that PROVABLY binds an injected clock passes.
            if (readAmbientInvocation(node, candidate.sources).kind === "other") {
              return;
            }
            const subject = ctx.relativePath(sourceFile);
            if (!readers.has(subject)) {
              readers.set(subject, node);
            }
          },
        },
      ],
      evaluate: () => {
        for (const [subject, node] of [...readers].toSorted(([left], [right]) => left.localeCompare(right))) {
          ctx.report.node(node, { subject, operation: OPERATION, message: `${MESSAGE} Reader: ${subject}.`, fix: FIX });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: { "packages/server/src/domain/feature/logic.ts": "export function doThing(): number {\n  return Date.now();\n}\n" },
      expect: { count: 1, messageIncludes: "packages/server/src/domain/feature/logic.ts" },
      why: "the founding shape — an ambient `Date.now()` on a production path, with the exact grant SUBJECT in the message",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/feature/ctor.ts": "export function doThing(): Date {\n  return new Date();\n}\n" },
      expect: { count: 1 },
      why: "the CONSTRUCTOR arm — `new Date()` with no arguments asks the runtime the same question",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/feature/alias.ts": "const clock = Date;\nexport function doThing(): number {\n  return clock.now();\n}\n" },
      expect: { count: 1 },
      why: 'AN IMMUTABLE ALIAS of the global is the same clock — the legacy `getText() === "Date.now"` comparison read `clock.now` and passed it',
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/feature/bracket.ts": 'export function doThing(): number {\n  return Date["now"]();\n}\n' },
      expect: { count: 1 },
      why: "the COMPUTED-LITERAL spelling of the same member — a respelling the text comparison could not see at all",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/feature/twice.ts":
          "export function a(): number {\n  return Date.now();\n}\nexport function b(): number {\n  return Date.now();\n}\n",
      },
      expect: { count: 1 },
      why: "GRANT GRANULARITY: two ambient reads in one carrier are ONE finding, because a reviewed grant licenses one `(subject, operation)` and two matching findings make the row OVER-BROAD and license neither",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/server/src/domain/feature/other-ctor.ts": "export class Session {}\nexport function make(): Session {\n  return new Session();\n}\n",
      },
      why: "THE PREFILTER CONTROL: a zero-argument `new` of another class is not a clock candidate at all, so it is never resolved and never fail-closed. Deleting the name prefilter accuses fourteen live sites — `new AsyncLocalStorage()`, `new Hono()`, `new EventEmitter()` — of reading the ambient clock",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/feature/parse.ts": "export function parse(ms: number): Date {\n  return new Date(ms);\n}\n" },
      why: "`new Date(ms)` PARSES a known timestamp rather than asking for the current one — the argument count is the whole distinction and it is deliberate",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/feature/injected.ts":
          "export function elapsed(deps: { readonly now: () => number }, since: number): number {\n  return deps.now() - since;\n}\n",
      },
      why: "THE SANCTIONED SHAPE — the injected clock is a `now` member read too, and it PROVABLY binds a project property declaration, so it is not a subject rather than being excused",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/feature/shadow.ts": "class Date {\n  static now(): number {\n    return 0;\n  }\n}\nexport const t = Date.now();\n",
      },
      why: "THE COUNTERFACTUAL — a LOCAL class named `Date` shadows the global entirely, so its `now()` is a different clock. The legacy text comparison red it; deleting the origin resolution turns this row red again",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/feature/other-global.ts": "export function mark(): number {\n  return performance.now();\n}\n" },
      why: "another ambient global with a `now` member resolves cleanly to a DIFFERENT global, so the reader abstains — the arm keys on the `Date` identity, not on the member name",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/feature/const-alias.ts": "const now = Date.now;\nexport function doThing(): number {\n  return now();\n}\n" },
      why: "DECLARED LIMIT — a bare local alias of the METHOD is outside the candidate prefilter, which is a `now` MEMBER read or a zero-argument `new`. Widening it to every bare `now()` call means resolving an origin on ~700 injected-clock call sites per pass; the legacy text comparison missed this shape too, so it is a written baseline rather than a regression",
    },
  ],
});
