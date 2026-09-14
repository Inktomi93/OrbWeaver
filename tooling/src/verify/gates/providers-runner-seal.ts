// Tier-3b-Providers.md invariant #3: the runner derivation + vocabulary (`deriveRunner`,
// `backendForSource`, `BackendKey`, `BACKEND_KEYS`) are SEALED inside `infra/providers` and never leave it.
// A domain/transport/entry module that names one routes around the sealed (api,source)→backend derivation.
// The seal is the DECLARATION HOME, read through the shared module-origin reader: an alias, a namespace
// member and a name-preserving re-export are the same sealed symbol, while a same-named export of another
// module is not. DECLARED LIMITS live in the mustPass rows.
//
// FAMILY `providers-runner-seal` — a declared SINGLETON. `lib/sealed-origin.ts` is a shared READER used by
// five policies that seal five different homes under five different laws; a reader is not a family
// (guide §2). Nothing else judges the infra/providers boundary.
//
// POPULATION PORT: byte-identical, legacy at `e5a7a8a8c^` (`scanRoot: (p) => CONSUMER.test(\`/\${p}\`)`, the
// `domain|transport|entry` alternation); the final `CONSUMER_POPULATION` admits exactly that set. Both halves
// of the candidate prefilter — the import arm and the member arm — carry their own DECLARED LIMIT row.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `providers-runner-seal` descriptor at 509671ae2e013b6d07fe6f7e9e744e0d7cbac946, the parent of the conversion
// `e5a7a8a8c` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,183 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot`
// admits 1,287 and final `population` admits 1,287. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/server/src/domain/admin/__cbbhr_in_context.ts` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
import { Node, SyntaxKind } from "ts-morph";
import { readMemberReference } from "../../_shared/reference-fact.ts";
import { defineGate } from "../contract/policy.ts";
import type { SealedHome } from "../lib/sealed-origin.ts";
import { readSealedOrigin, sealedOriginReports } from "../lib/sealed-origin.ts";

const PROVIDERS_HOME: SealedHome = {
  pathInfix: "/packages/server/src/infra/providers/",
  exportedNames: new Set(["deriveRunner", "backendForSource", "BackendKey", "BACKEND_KEYS"]),
};

const MESSAGE =
  "a sealed runner symbol (deriveRunner / backendForSource / BackendKey / BACKEND_KEYS) is named by a " +
  "production consumer ABOVE infra — a domain/transport/entry module must route through the providers role " +
  "surface, never the runner key (core/Tier-3b-Providers.md inv #3).";

const FIX =
  "route through the providers role surface — never import the runner derivation/vocabulary into " +
  "domain/transport/entry. A deliberate site is waived with `@orb-waive providers-runner-seal(<position>): " +
  "<reason>` on the line above, where <position> is the sealed runner symbol's own name " +
  "(`deriveRunner`/`backendForSource`/`BackendKey`/`BACKEND_KEYS`) at its occurrence.";

/** The legacy `scanRoot` was `/packages/server/src/(?:domain|transport|entry)/` tested against a
 *  slash-prefixed repo path; the `@server` root plus these three `under` globs admit exactly that set. */
const CONSUMER_POPULATION = {
  in: ["@server"],
  under: ["packages/server/src/domain/**", "packages/server/src/transport/**", "packages/server/src/entry/**"],
} as const;

/** THE CANDIDATE PREFILTER (the id-brand lane's measured lesson): resolving a canonical origin on every
 *  identifier in a ~900-file population does not finish. An `ImportSpecifier`'s `getName()` is the ORIGINAL
 *  exported name even when aliased, and a namespace member is spelled with the exported name too, so gating
 *  on the sealed NAME loses nothing but a re-export under a DIFFERENT name — a DECLARED LIMIT with its row,
 *  and the same one the legacy direct-name reader carried. The expensive origin resolution still runs on
 *  every candidate, so a same-named import from elsewhere is refused exactly as before. */
function candidateName(node: Node): { readonly name: string; readonly anchor: Node } | null {
  if (Node.isImportSpecifier(node)) {
    const name = node.getName();
    return PROVIDERS_HOME.exportedNames.has(name) ? { name, anchor: node } : null;
  }
  if (!(Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node))) {
    return null;
  }
  const member = readMemberReference(node);
  return member.kind === "resolved" && PROVIDERS_HOME.exportedNames.has(member.value.name) ? { name: member.value.name, anchor: node } : null;
}

export const gate = defineGate({
  id: "providers-runner-seal",
  family: "providers-runner-seal",
  authority: "ordinary",
  severity: "error",
  population: CONSUMER_POPULATION,
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
        visit: (node) => {
          const candidate = candidateName(node);
          if (candidate === null) {
            return;
          }
          const verdict = readSealedOrigin(candidate.anchor, PROVIDERS_HOME);
          // FAIL-CLOSED THROUGH THE SHARED DECISION: a candidate whose IMPORT DOOR cannot be read is not
          // evidence of innocence (a seal an unreadable barrel could walk through is not a seal), while a
          // candidate that provably binds a non-module declaration is not a subject. `readSealedOrigin`
          // returns the VERDICT; `sealedOriginReports` is the decision.
          if (sealedOriginReports(verdict, candidate.anchor)) {
            ctx.report.node(candidate.anchor, { token: candidate.name, offset: candidate.anchor.getText().indexOf(candidate.name) });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/server/src/infra/providers/roles/dispatch.ts":
          "export function deriveRunner(api: string, source: string): string {\n  return `${api}:${source}`;\n}\n",
        "packages/server/src/domain/chat/x.ts": 'import { deriveRunner } from "../../infra/providers/roles/dispatch.ts";\nexport const r = deriveRunner;\n',
      },
      expect: { count: 1, token: "deriveRunner" },
      why: "the founding shape — a domain module importing the sealed derivation, which escapes the (api,source)→backend firewall",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/providers/roles/dispatch.ts":
          "export function deriveRunner(api: string, source: string): string {\n  return `${api}:${source}`;\n}\n",
        "packages/server/src/transport/trpc/routers/chat.ts":
          'import { deriveRunner as pick } from "../../../infra/providers/roles/dispatch.ts";\nexport const r = pick;\n',
      },
      expect: { count: 1, token: "deriveRunner" },
      why: "AN IMPORT ALIAS is the same sealed symbol — the legacy reader keyed on the written name and an alias-preserving `getName()` happened to survive, but the SEAL is the declaration home and now says so",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/providers/contract/backend.ts": 'export const BACKEND_KEYS = ["vllm"] as const;\n',
        "packages/server/src/infra/providers/index.ts": 'export { BACKEND_KEYS } from "./contract/backend.ts";\n',
        "packages/server/src/entry/compose/x.ts": 'import { BACKEND_KEYS } from "../../infra/providers/index.ts";\nexport const k = BACKEND_KEYS;\n',
      },
      expect: { count: 1, token: "BACKEND_KEYS" },
      why: "A NAME-PRESERVING RE-EXPORT through the providers barrel is the SAME sealed vocabulary — the canonical declaration is still inside the home, so the barrel is not a laundry",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/providers/roles/dispatch.ts": "export function backendForSource(source: string): string {\n  return source;\n}\n",
        "packages/server/src/domain/chat/ns.ts":
          'import * as providers from "../../infra/providers/roles/dispatch.ts";\nexport const b = providers.backendForSource("x");\n',
      },
      expect: { count: 1, token: "backendForSource" },
      why: "A NAMESPACE IMPORT produces NO ImportSpecifier at all — the legacy import-keyed detector was offered no node whatsoever and this bypass was a silent green (#1506)",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/providers/roles/dispatch.ts": "export function backendForSource(source: string): string {\n  return source;\n}\n",
        "packages/server/src/domain/chat/bracket.ts":
          'import * as providers from "../../infra/providers/roles/dispatch.ts";\nexport const b = providers["backendForSource"]("x");\n',
      },
      expect: { count: 1, token: "backendForSource" },
      why: "the BRACKET spelling of the namespace member names the same export — an ElementAccessExpression is not a PropertyAccessExpression, the exact respelling class #1506 closed",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/unreadable.ts": 'import { deriveRunner } from "./missing-barrel.ts";\nexport const r = deriveRunner;\n',
      },
      expect: { count: 1, token: "deriveRunner" },
      why: "FAIL-CLOSED: a sealed NAME whose door does not resolve is reported rather than silently admitted — a seal an unreadable barrel can walk through is not a seal",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/local-bag.ts": "const bag = { deriveRunner: (a: string): string => a };\nexport const n = bag.deriveRunner;\n",
      },
      why: 'THE LOCAL-OBJECT COUNTERFACTUAL — a plain object whose KEY is spelled like the sealed export binds a property, not a module member, so it is NOT A SUBJECT. `readSealedOrigin` returns `unresolved` here and the shared decision function scopes that refusal (lib/sealed-origin.ts): reading the VERDICT as the DECISION (`kind !== "foreign"`) accuses this row on unmodified source (#2006)',
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/providers/roles/dispatch.ts":
          "export function deriveRunner(api: string, source: string): string {\n  return `${api}:${source}`;\n}\n",
        "packages/server/src/infra/providers/roles/chat.ts": 'import { deriveRunner } from "./dispatch.ts";\nexport const r = deriveRunner;\n',
        // The population refuses a fixture that admits ZERO paths, so a scope row needs one in-population
        // file: this is the CONSUMER that abstains, beside the intra-providers importer that must not bite.
        "packages/server/src/domain/chat/quiet.ts": "export const quiet = 1;\n",
      },
      why: "INTRA-PROVIDERS consumption of the sealed symbol is the whole point of sealing it — infra/providers is outside this policy's population",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/local.ts":
          'export function deriveRunner(api: string): string {\n  return api;\n}\nexport const r = deriveRunner("x");\n',
      },
      why: "a LOCAL function of the same name is not the sealed export — it has no import door at all, so no candidate node is offered and nothing is claimed about it",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/util/runner.ts": "export function deriveRunner(api: string): string {\n  return api;\n}\n",
        "packages/server/src/domain/chat/foreign.ts": 'import { deriveRunner } from "./util/runner.ts";\nexport const r = deriveRunner;\n',
      },
      why: "THE HOME COUNTERFACTUAL — a GENUINE module export that resolves cleanly, same name, same shape, everything the detector keys on except the one thing that matters: its declaration home. Deleting the path comparison turns this row red",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/providers/contract/backend.ts": 'export const BACKEND_KEYS = ["vllm"] as const;\n',
        "packages/server/src/domain/chat/waived.ts":
          '// @orb-waive providers-runner-seal(BACKEND_KEYS): a one-off migration read of the sealed vocabulary; ends when the role surface exposes the key set.\nimport { BACKEND_KEYS } from "../../infra/providers/contract/backend.ts";\nexport const k = BACKEND_KEYS;\n',
      },
      why: "the ONE central positioned waiver naming the exact reported token — malformed, stale and over-broad markers are proven CENTRALLY, once, never re-proved per policy",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/providers/roles/dispatch.ts": "export function deriveRunner(api: string): string {\n  return api;\n}\n",
        "packages/server/src/infra/providers/barrel.ts": 'export { deriveRunner as resolveRunnerKey } from "./roles/dispatch.ts";\n',
        "packages/server/src/domain/chat/renamed.ts":
          'import { resolveRunnerKey } from "../../infra/providers/barrel.ts";\nexport const r = resolveRunnerKey;\n',
      },
      why: "DECLARED LIMIT — a barrel that RE-EXPORTS a sealed symbol under a DIFFERENT name is outside the candidate prefilter. The legacy name reader missed it too, so this is a written baseline rather than a regression; closing it means resolving an origin on every identifier in the population, which does not finish",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/unreadable-member.ts": 'import * as providers from "./missing-barrel.ts";\nexport const r = providers.resolveChat;\n',
      },
      why: "DECLARED LIMIT — the MEMBER arm of the same candidate prefilter, and the receipt the import arm's `renamed.ts` row gives for its half (w9 :262, #2046). A namespace member read through an UNREADABLE door, whose name is NOT one of the four sealed symbols, is not a subject: the fail-closure is about a door that could have carried a SEALED symbol, not about every unreadable member read above infra. Widening the member gate to any resolved member reds this row, because the unreadable door then reports under `resolveChat`",
    },
  ],
});
