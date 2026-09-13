// Gate: server-layout (Core-0-Architecture-and-Structure.md §3). The server source root is the closed
// six-tier architecture plus index.ts. This is a semantic vocabulary, not an exemption or count ratchet;
// ResourceHost derives the live entries and package metadata anchors missing-tier findings.
// The resource-policy contract this module is the worked example of — what a closed-ResourceHost policy
// owes, and why it owns no not-ready branch — is docs/design/resource-policy-contract.md.
// FAMILY: singleton. The rule is one package's root vocabulary read off one authored tree; the nearest
// sibling (`ui-exports-map-complete`) judges a DIFFERENT package against its manifest exports, and the two
// share the `readyResourceValue` declaration reader (`lib/resource-declaration.ts`) rather than a family
// identity reader.
// POPULATION PORT: an INTENTIONAL CORRECTION, legacy at 05e595f33 (the parent of d59803f7f). The legacy
// descriptor `readdirSync`-listed `packages/server/src` at depth 1 and gated its MISSING-tier arm on a
// real-tree anchor (`pnpm-workspace.yaml`), because a conformance fixture could not be told from a gutted
// tree; it also reported that arm at the gate's OWN source file. The final walks `authored-tree:server`
// and takes the depth-1 entries (`topEntry`). Three deltas, each deliberate: (1) the anchor guard is
// RETIRED — a resource fixture supplies its whole tree, so "is this the real tree" is no longer a question;
// an EMPTY tree is a population-phase refusal rather than a verdict, and ONE file is a tree that is missing
// every tier (`mustFlag[2]`); (2) the missing-tier anchor moved from the gate's own file (outside any
// resource population — the runtime refuses such an anchor) to the server manifest, which is declared for
// exactly that purpose; (3) non-authored names at the root (`node_modules`, `dist`, `.git`, `.cache`) were
// legacy-RED and are invisible to the authored reader (none is authored), and a symlink at the root, which
// the legacy listing reported by name, now makes the tree `unresolved` — a refusal.
// WHERE A BROKEN RESOURCE REFUSES — not here. A declared resource that is missing/empty/unresolved/
// malformed makes `resolveResourceDeclarations` (`lib/resource-declaration.ts`) THROW during the
// POPULATION phase, and the receipt phase withholds every consumer, both before `create`/`evaluate` run
// (guide §3's acquisition-refusal rule). This module therefore owns no not-ready branch: it reads through
// `readyResourceValue`, whose throw is an assertion that the runtime's own refusal held. An in-module
// `if (fact.status !== "ready") return;` here would be unreachable code AND would teach the next resource
// conversion that a silent return is the correct answer to a broken resource. It is not. Every reachable
// refusal (tree missing, tree empty, manifest missing, manifest malformed) and the complete run's receipt
// pair are pinned through `runPolicyPass` in resource-layout-wave-1.test.ts, because no proof row can
// express a refusal (guide §6.3).
// DECLARED LIMITS: none beyond the vocabulary itself — `mustPass[0]` is the complete legal root, and every
// arm is pinned by a row whose count the §4.1 cut moves.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `server-layout` descriptor at 05e595f33a483879860210e24a1b88231c3bae7f, the parent of the conversion `d59803f7f`
// (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME 7,047 harness
// candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), the legacy harness — no
// `scanRoot` — dispatched 7,047, and the final `population` admits 0; the subject is the declared
// `authored-tree:server`. legacy − final = all 7,047 harness candidates — dispatched to the legacy `run`, which read
// none of them (its subject came off disk through `readdirSync(packages/server/src)`); retired with that read.
// final − legacy = ∅. Controls: the legacy side is non-empty and the final side is empty by declaration, so equality
// cannot pass vacuously; outside `docs/__cbbhr_out_control.ts` rejected by both.
// OUTSIDE-CONTROL CAVEAT (verifier cb-v-header-residue): `docs/__cbbhr_out_control.ts` is rejected by `harnessGlobs`,
// not by the legacy descriptor — which has no path predicate of its own and admits it — so it proves only that
// neither side reaches outside the harness corpus, not that the legacy filter discriminates.
import { defineGate } from "../contract/policy.ts";
import type { ResourceTreeEntry } from "../contract/resource.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const SERVER_SOURCE = "packages/server/src";
const SERVER_MANIFEST = "packages/server/package.json";
const REQUIRED_TIERS = ["entry", "transport", "domain", "infra", "foundation", "kit"] as const;
const LEGAL_ENTRIES = new Set<string>([...REQUIRED_TIERS, "index.ts"]);
const MESSAGE =
  "an illegal or missing top-level entry at packages/server/src/ — the server root is exactly entry/transport/domain/infra/foundation/kit plus index.ts (Core-0-Architecture-and-Structure.md §3).";

/** ONE falsifiable fence, and the §4.1 cut proves it (cutting it kills `mustFlag[0,1]` + `mustPass[0]`).
 *  Two companions were deleted rather than left as decoration, because no fixture could ever cross them:
 *  the declared `server` tree is rooted AT `packages/server/src` (`contract/resource-tree.ts`) and the
 *  walk emits CHILDREN only, never the root itself (`ops/resource-reader.ts` `walk`/`addDirectory`), so a
 *  `startsWith` prefix test is always true and `relative` is never empty. Cutting either killed no row —
 *  which is the tell for a fence that reads like a guarantee and enforces nothing. What remains is the
 *  real claim: a ROOT entry has no `/` left after the slice, a nested one does. */
function topEntry(entry: ResourceTreeEntry): string | undefined {
  const relative = entry.path.slice(SERVER_SOURCE.length + 1);
  return relative.includes("/") ? undefined : relative;
}

export const gate = defineGate({
  id: "server-layout",
  family: "server-layout",
  authority: "hard",
  severity: "error",
  population: { of: "none", why: "server root structure is a closed ResourceHost tree fact" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [
    { kind: "authored-tree", id: "server" },
    { kind: "package-metadata", id: "server" },
  ],
  message: MESSAGE,
  fix: "move an illegal entry into its tier, or amend the architecture and this closed tier vocabulary together when a tier is deliberately added or removed.",
  create: (ctx) => ({
    evaluate: () => {
      // The manifest is declared and READ for its PATH, not its content: it is the anchor a missing-tier
      // finding reports at, and an anchor must sit inside the policy's own resource population. The read
      // is what consumes the declaration (`lib/resource-policy.ts` refuses an unconsumed one), and
      // `readyResourceValue` is what makes a broken manifest a loud tool error rather than a silent skip.
      readyResourceValue(ctx.resources.packageMetadata("server"));
      const entries = readyResourceValue(ctx.resources.authoredTree("server"))
        .map(topEntry)
        .filter((value): value is string => value !== undefined)
        .toSorted();
      const present = new Set(entries);
      for (const entry of entries) {
        if (!LEGAL_ENTRIES.has(entry)) {
          ctx.report.file(`${SERVER_SOURCE}/${entry}`, {
            line: 1,
            column: 1,
            message: `illegal top-level entry ${JSON.stringify(entry)} — the server root is exactly the six tiers plus index.ts (Core-0-Architecture-and-Structure.md §3).`,
          });
        }
      }
      for (const entry of LEGAL_ENTRIES) {
        if (!present.has(entry)) {
          ctx.report.file(SERVER_MANIFEST, {
            line: 1,
            column: 1,
            message: `${JSON.stringify(entry)} is required by the closed server-root architecture but is missing (Core-0-Architecture-and-Structure.md §3).`,
          });
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        "packages/server/package.json": '{"name":"@orb/server","private":true}',
        "packages/server/src/index.ts": "export const x = 1;\n",
        "packages/server/src/entry/x.ts": "export const x = 1;\n",
        "packages/server/src/transport/x.ts": "export const x = 1;\n",
        "packages/server/src/domain/x.ts": "export const x = 1;\n",
        "packages/server/src/infra/x.ts": "export const x = 1;\n",
        "packages/server/src/foundation/x.ts": "export const x = 1;\n",
        "packages/server/src/kit/x.ts": "export const x = 1;\n",
        "packages/server/src/stray.ts": "export const x = 1;\n",
      },
      // The fixture supplies the COMPLETE legal root beside the stray so the count isolates the arm this
      // `why` names. Without the tiers the missing-tier loop fires seven more times and `count` would be
      // ratifying eight findings from two arms under a one-finding claim.
      expect: { count: 1, messageIncludes: "illegal top-level entry" },
      why: "a stray server-root file is outside the six tiers plus index.ts",
    },
    {
      mode: "resource",
      files: {
        "packages/server/package.json": '{"name":"@orb/server","private":true}',
        "packages/server/src/index.ts": "export const x = 1;\n",
        "packages/server/src/entry/x.ts": "export const x = 1;\n",
        "packages/server/src/transport/x.ts": "export const x = 1;\n",
        "packages/server/src/domain/x.ts": "export const x = 1;\n",
        "packages/server/src/infra/x.ts": "export const x = 1;\n",
        "packages/server/src/foundation/x.ts": "export const x = 1;\n",
      },
      expect: { count: 1, messageIncludes: '"kit" is required' },
      why: "a named tier missing from the live tree is a structural mismatch",
    },
    {
      mode: "resource",
      files: {
        "packages/server/package.json": '{"name":"@orb/server","private":true}',
        "packages/server/src/index.ts": "export const x = 1;\n",
      },
      // The boundary between a REFUSAL and a VERDICT. An EMPTY server tree is a population-phase tool error
      // (pinned in resource-layout-wave-1.test.ts); ONE file is a tree, and a tree missing every tier is six
      // findings, one per tier, all anchored at the manifest. `count: 6` pins that the missing-tier loop
      // counts every member of the closed vocabulary rather than stopping at the first. It shares
      // `mustFlag[1]`'s arm and message shape — the count is what carries it.
      expect: { count: 6, messageIncludes: "is required" },
      why: "a server tree holding only index.ts is missing all six tiers — one finding per tier, never a collapsed one",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "packages/server/package.json": '{"name":"@orb/server","private":true}',
        "packages/server/src/index.ts": "export const x = 1;\n",
        "packages/server/src/entry/x.ts": "export const x = 1;\n",
        "packages/server/src/transport/x.ts": "export const x = 1;\n",
        "packages/server/src/domain/x.ts": "export const x = 1;\n",
        "packages/server/src/infra/x.ts": "export const x = 1;\n",
        "packages/server/src/foundation/x.ts": "export const x = 1;\n",
        "packages/server/src/kit/x.ts": "export const x = 1;\n",
      },
      why: "every required tier and index.ts is present with no extra root entry",
    },
  ],
});
