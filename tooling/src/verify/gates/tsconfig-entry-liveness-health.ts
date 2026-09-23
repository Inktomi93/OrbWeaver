// Policy: tsconfig-entry-liveness-health — the §4.6 BLINDNESS TRIPWIRES for the tsconfig half of the
// `grant-liveness` family. THREE arms, each a REFUSAL rather than a violation:
//
//   UNREADABLE — a `tsconfig*.json` the tracked corpus carries could not be READ at all: the
//   `authored-text` door refused it (empty · unresolved · malformed · unacquired · the #1947 symlink
//   class). Nothing was parsed and nothing can be, and the member is ABSENT from the roster unless this
//   arm says so.
//
//   UNPARSEABLE — a `tsconfig*.json` in the roster did not parse. Fail LOUD, never fall back to a default:
//   a silently-defaulted type config typechecks a program nobody declared, and every verdict downstream of
//   it — including `pnpm typecheck`'s own program list — becomes a lie.
//
//   NO-ROWS — the roster parsed but ZERO file-exact entries were derived from an anchor-sized candidate
//   set, so the exact/glob classifier has rotted past every row and `tsconfig-entry-liveness`'s ✓ means
//   nothing.
//
// WHY IT IS A SEPARATE POLICY, AND WHY IT IS `hard` (#2021): its sibling is `reviewed-grant`, so its
// findings are licensable by an exact central row. These two are refusals — "I could not measure" — and a
// refusal that can itself be suppressed is the accuser silenced by the thing it accuses. One authority per
// descriptor (§12.1), so the arms that differ on that axis are two policies under the IDENTICAL family.
// §12.3's "do not invent a `-health` sibling for a resource policy" is about a BROKEN resource, which no
// policy can observe because `resolveRuns` withholds its owner one phase earlier; both arms here are
// derived from fully READY resources, which this policy observes normally.
//
// TWO LEGACY TRIPWIRE ARMS ARE NOT HERE, and in both cases the runtime is stricter than the finding it
// replaced. An empty tracked corpus (legacy CORPUS-BLIND) is a non-ready `tracked-files` resource, and
// `resolveResourceDeclarations` throws on it — a population-phase TOOL ERROR, exit 2, "not a verdict".
// Legacy MISSING-CONFIG (`tsconfig.json` absent from the repo root) has no successor as written, because
// its premise died with the conversion: the legacy gate keyed its whole scan on that ONE filename, so the
// name resolving to nothing meant the gate scanned nothing. The roster is now DERIVED from the tracked
// corpus, so a vanished root config leaves the other thirteen fully judged. The honest successor is the
// EMPTY ROSTER — no `tsconfig*.json` tracked anywhere — and it lives in the shared reader
// (`lib/config-grant-rows.ts` `tsconfigRosterPaths`) as a THROW, because it must refuse for BOTH siblings
// and because there is nothing left to anchor a finding on. §4.5b's proof runtime has no "expect a tool
// error" arm, so both refusals are pinned in
// `tests/tooling/verify/gates/tsconfig-entry-liveness.int.test.ts`.
//
// THE UNREADABLE ARM EXISTS BECAUSE THIS HEADER'S PREVIOUS CLAIM WAS FALSE, and the correction is worth
// keeping (#2120, REFUTED by the config-liveness verifier review L1). It read: *"A ROSTER PATH THE TEXT DOOR
// REFUSES is deliberately not an arm — `authored-text` serves exactly the paths some other declaration
// admitted, and this policy's roster is DERIVED from `tracked-files`' own path set, so the two cannot
// disagree. There is no fixture that reaches such a branch."* **GIT MEMBERSHIP AND TEXT READABILITY ARE
// DIFFERENT PREDICATES.** A tracked but EMPTY config is `status: "empty"` at the reader, so it arrives in
// `AuthoredTextCorpus.refusals`, and the shared reader discarded that half — the member vanished from the
// roster and this tripwire printed a clean ✓ over it. The fixture took one line. §4.1's fourth outcome is
// for a property whose counterexample is structurally unconstructible, and *"UNFALSIFIABLE is a claim you
// owe a constructed fixture attempt, not an argument"* — writing the row is what settles it.
//
// POPULATION PORT + LEGACY SHA (#2123). This module is NOT a port of its own descriptor — it has none. It
// is the ARMS carved out of `tsconfig-entry-liveness`'s legacy descriptor at
// `git show c97de9d2f:tooling/src/verify/gates/tsconfig-entry-liveness.ts` (the parent of the conversion
// commit `97e68be91`), where UNPARSEABLE and NO-ROWS were that descriptor's `MSG_UNPARSEABLE` and
// `MSG_NO_ROWS` arms. Its population is IDENTICAL to its sibling's — `{ of: "none" }` plus `tracked-files`
// and `authored-text` — because both halves must judge the SAME roster or the tripwire would be measuring
// a different subject set than the ✓ it is guarding. The UNREADABLE arm has no legacy ancestor and is a
// STRENGTHENING, measured rather than assumed: the legacy reader `readFileSync`'d each config and handed the
// text to `ts.parseConfigFileTextToJson`, which returns `{ config: {}, error: undefined }` for an EMPTY or
// whitespace-only file — so a tracked empty tsconfig was SILENTLY CLEAN under the descriptor, deriving zero
// entries and reporting nothing. (A file that existed but could not be read did throw out of the pass.) The
// converted reader distinguishes the case, and this arm is what carries the distinction to a reader.
//
// FAMILY: `grant-liveness`. Readers: `lib/config-grant-rows.ts` (`tsconfigRosterPaths`, `tsconfigRosterFrom`, `tsconfigGrantRows`)
// and, through it, `lib/policy-program-membership.ts` — the SAME classifier its sibling reports through,
// which is the point: a tripwire re-implementing the classifier would be measuring its own copy rather than
// the one that produced the ✓.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `tsconfig-entry-liveness` descriptor at c97de9d2faeebb319b6195017905c1ccd91a8de0, the parent of the conversion
// `97e68be91`; this module did not exist there, so it is measured against the module it was carved from,
// `tsconfig-entry-liveness` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`).
// Over the 7,495 harness candidates at that tree the legacy `scanRoot: () => false` admits 0 and the final
// `population: { of: "none" }` admits 0, both by declaration: legacy − final = ∅, final − legacy = ∅. That equality
// is VACUOUS BY CONSTRUCTION — neither side ever had a TypeScript subject — and the subject comparison is the
// resource paragraph above (`tracked-files` + `authored-text`); no inside control exists to plant.
import { defineGate } from "../contract/policy.ts";
import { subjectAnchor } from "../lib/absent-subject-anchor.ts";
import { tsconfigGrantRows, tsconfigRosterFrom, tsconfigRosterPaths } from "../lib/config-grant-rows.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const PRIMARY_REL = "tsconfig.json";

/** §4.5 real-tree ANCHOR in its rename-proof COUNT form: the real tsconfig set carries ~106 include/exclude
 *  entries across 14 configs, a proof fixture plants a handful. Counted over ALL entries, never over the
 *  exact ones, so it can guard the very arm that judges the exact/glob classifier. */
const REAL_CONFIG_MIN_CANDIDATES = 30;

/** DISJOINT from `MSG_UNPARSEABLE` by construction, and it has to be: the two arms produce the same finding
 *  COUNT and differ only in message, so a `messageIncludes` row is the only thing that can tell them apart
 *  (the #1990 fail-closed-third-answer rule). Neither string is a substring of the other. */
const MSG_UNREADABLE =
  "a tsconfig*.json the tracked corpus carries could not be READ at all — the authored-text door refused " +
  "it, so nothing was parsed and nothing can be. A refused member is silently ABSENT from the roster " +
  "unless it is reported here, and a roster whose members all refuse is indistinguishable from a clean " +
  "one (tooling/src/verify/gates/GATE-AUTHORING.md §4.6). Restore the file, or untrack it.";

const MSG_UNPARSEABLE =
  "a tsconfig*.json did not parse. Fail LOUD, never fall back to a default: a silently-defaulted type " +
  "config typechecks a program nobody declared, and `pnpm typecheck` derives its program list from the " +
  "same reader. Fix the JSON.";

const MSG_NO_ROWS =
  "the tsconfig roster parsed but ZERO file-exact include/exclude entries were derived from an " +
  "anchor-sized candidate set — the glob/exact classifier has rotted past every row, so " +
  "tsconfig-entry-liveness is BLIND and its ✓ means nothing " +
  "(tooling/src/verify/gates/GATE-AUTHORING.md §4.6). Re-derive the classifier in " +
  "tooling/src/verify/lib/config-grant-rows.ts.";

/** `count` distinct glob entries — filler that clears the anchor while deriving zero exact rows. */
function globFiller(count: number): readonly string[] {
  return Array.from({ length: count }, (_, index) => `"packages/p${String(index)}/**"`);
}

function includeJson(entries: readonly string[]): string {
  return `{\n  "include": [${entries.join(", ")}]\n}\n`;
}

export const gate = defineGate({
  id: "tsconfig-entry-liveness-health",
  family: "grant-liveness",
  authority: "hard",
  severity: "error",
  population: {
    of: "none",
    why: "the type configs and the tracked corpus are closed ResourceHost facts read through the shared compiler reader; this policy judges no TypeScript source",
  },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "tracked-files" }, { kind: "authored-text" }],
  message: MSG_NO_ROWS,
  create: (ctx) => ({
    evaluate: () => {
      const repoPaths = readyResourceValue(ctx.resources.trackedFiles()).repoPaths;
      // THE DOOR IS READ HERE (#2148) — see the sibling's note. The empty-roster refusal still fires before
      // the demand, because `tsconfigRosterPaths` is what produces the demand's subject.
      const corpus = readyResourceValue(ctx.resources.authoredText(tsconfigRosterPaths(repoPaths)));
      const { configs, unreadable } = tsconfigRosterFrom(corpus);
      // UNREADABLE FIRST, and it is a separate arm from UNPARSEABLE on purpose (#2120): the door could not
      // serve the bytes at all, so nothing was parsed and nothing CAN be. Reporting it is what stops a
      // refused member from shrinking the subject set in silence — at the limit every member refuses, the
      // empty-roster throw never fires because the roster is non-empty, and both siblings print a clean ✓.
      for (const refusal of unreadable) {
        ctx.report.file(refusal.path, {
          line: 1,
          column: 1,
          token: refusal.path,
          message: `${MSG_UNREADABLE} (${refusal.status}: ${refusal.reason}) See tooling/src/verify/lib/config-grant-rows.ts.`,
        });
      }
      for (const config of configs) {
        if (config.status === "unparseable") {
          // The POINTER goes last: `diagnostic-legibility` reads the TAIL, and the parser's own reason is
          // not a home an agent can go read.
          ctx.report.file(config.config, {
            line: 1,
            column: 1,
            token: config.config,
            message: `${MSG_UNPARSEABLE} (${config.reason}) See tooling/src/verify/lib/policy-program-membership.ts.`,
          });
        }
      }
      const rows = tsconfigGrantRows(configs);
      if (rows.candidates >= REAL_CONFIG_MIN_CANDIDATES && rows.exact.length === 0) {
        // An absence verdict cannot anchor on a subject that may itself be gone: `report.file` refuses a
        // path outside the effective population, so the anchor falls back through the named subject to the
        // lowest admitted path (`lib/absent-subject-anchor.ts`).
        ctx.report.file(subjectAnchor(new Set(ctx.resourcePaths), [PRIMARY_REL])(PRIMARY_REL), { line: 1, column: 1, message: MSG_NO_ROWS });
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: { "tsconfig.json": '{\n  "include": [ \n}\n' },
      expect: { count: 1, messageIncludes: "did not parse" },
      why: "a malformed tsconfig must FAIL LOUD, never fall back to a default that would typecheck a program nobody declared — carried verbatim from the legacy descriptor's fourth arm",
    },
    {
      mode: "resource",
      files: { "tsconfig.json": "", "packages/client/src/live.ts": "export const live = 1;\n" },
      expect: { count: 1, token: "tsconfig.json", messageIncludes: "could not be READ" },
      why: 'L1 (#2120) — a roster member the text door REFUSES. A tracked but EMPTY config is `status: "empty"`, so it arrives in `AuthoredTextCorpus.refusals` rather than in `files`, and the reader that discarded refusals dropped it from the subject set of BOTH siblings while this tripwire printed a clean ✓. RED-FIRST RECEIPT in the landing commit: against the discarding reader this row reported 0 findings.',
    },
    {
      mode: "resource",
      files: { "tsconfig.json": includeJson(globFiller(REAL_CONFIG_MIN_CANDIDATES)) },
      expect: { count: 1, messageIncludes: "ZERO file-exact" },
      why: "zero derived rows on an anchor-sized candidate set is 'I could not measure', never 'clean' — the classifier-rot tripwire, carried from the legacy descriptor's fifth arm",
    },
    {
      mode: "resource",
      files: {
        "packages/client/tsconfig.json": '{\n  "include": [ \n}\n',
        "tsconfig.json": '{\n  "include": ["packages/client/src"]\n}\n',
        "packages/client/src/live.ts": "export const live = 1;\n",
      },
      expect: { count: 1, token: "packages/client/tsconfig.json", messageIncludes: "did not parse" },
      why: "INVENTED ROW (§4.7) — the unparseable arm judges the WHOLE ROSTER, not the root config. The legacy reader walked three fixed directories and would have reported this one too, but only because it happened to look in `packages/*`; the derived roster reaches any tracked config. Planted-break receipt in the landing commit: scoping the loop to the root config leaves this row silent.",
    },
  ],
  // Every `mustPass` below is a NARROWING row: each one is silent at tip and reds under a stated cut.
  // `mustPass[0]` is the other direction of L1 (#2120) and it is not decoration — a fail-open repaired
  // without a name prefilter turns every member of the population into an accusation, and for THIS arm the
  // population is every tracked tsconfig. The row is what stops the repair over-shooting.
  mustPass: [
    {
      mode: "resource",
      files: {
        "tsconfig.json": '{\n  "include": ["packages/client/src"]\n}\n',
        "packages/client/tsconfig.json": '{\n  "include": ["src"]\n}\n',
        "packages/client/src/live.ts": "export const live = 1;\n",
      },
      why: "L1's OTHER DIRECTION (#2120) — a genuinely clean roster, TWO readable members including a non-root one, is silent on the UNREADABLE arm. Without it the repair has no upper bound: reporting every roster member (or keying the arm on membership rather than on the door's own refusal list) passes every `mustFlag` above while accusing all fourteen real configs.",
    },
    {
      mode: "resource",
      files: { "tsconfig.json": includeJson(globFiller(REAL_CONFIG_MIN_CANDIDATES - 1)) },
      why: "§4.1 NARROWING — the ANCHOR. A roster BELOW real-tree size derives zero exact rows too, and judging it would red every small fixture in the corpus; drop the `>= REAL_CONFIG_MIN_CANDIDATES` test and this row reds.",
    },
    {
      mode: "resource",
      files: {
        "tsconfig.json": includeJson([...globFiller(REAL_CONFIG_MIN_CANDIDATES - 1), '"packages/client/src/live.ts"']),
        "packages/client/src/live.ts": "export const live = 1;\n",
      },
      why: "the other direction — an anchor-sized roster that DOES derive an exact row is silent, so the arm discriminates on the classifier's output rather than on the roster's size. Note the exact row is DEAD-free here on purpose: liveness is the sibling's verdict, never this one's.",
    },
    {
      mode: "resource",
      files: { "tsconfig.json": '{\n  "include": ["packages/client/src/gone.ts"]\n}\n' },
      why: "§4.1 NARROWING — the AUTHORITY fence between the siblings. A DEAD entry is the `reviewed-grant` sibling's finding; this `hard` policy must stay silent on it, or a licensable verdict would acquire an unsuppressible twin.",
    },
  ],
});
