// Policy: content-part-seam (Core-Path-Registry.md D51) — the multimodal content-part shape is threaded at
// the engine WIRE SEAM; content stays a `string` everywhere upstream. `ChatContentPart` is produced at one
// CONVERT step (`domain/chat/substrate/wire-history.ts`), assembled by the engine request seam, carried by
// the domain-side request DTO, and consumed only by the sealed runner tier. Everything else stays
// `content: string`, and a module that NAMES the symbol outside that set is reaching for parts too early.
//
// IDENTITY, NOT SPELLING: the legacy check was an `ImportSpecifier` named `ChatContentPart` whose module
// specifier matched `/^@orb\/contracts\/chat/`. A regex-on-specifier check is blind to an ALIASED import
// and to a re-export through any OTHER barrel, while a same-named type declared elsewhere would have red as
// the real one. The subject is now the reference whose CANONICAL DECLARATION lives in the contracts chat
// home, resolved through the shared sealed-origin reader, and the home's own existence is RECEIPTED: if the
// declaration moves out of `packages/contracts/src/chat/`, the receipt goes to zero members and the run
// REFUSES rather than rendering a clean pass over a rule that has quietly stopped having a subject.
//
// VISITOR SPACE MATCHES THE SUBJECT'S SPACE: `ChatContentPart` is `export type` — a TYPE-ONLY symbol, so
// direct imports arrive as `ImportSpecifier` and namespace-qualified references arrive as `QualifiedName`.
// The shared origin reader normalizes both value-member and type-qualified paths; this policy visits only
// the two node kinds its own type subject can occupy. `PropertyAccessExpression`/`ElementAccessExpression`
// remain structurally unreachable here and are not claimed as coverage.
//
// AUTHORITY IS reviewed-grant. The seam members are not per-occurrence mistakes; each is a recurring
// repository PERMISSION with its own reason, so each is one exact `(subject, operation)` row in the central
// reviewed-grant table. That is a row PER FILE, deliberately: the legacy `packages/server/src/infra/
// providers/` row was a DIRECTORY licence that admitted every future file under it, which the final law
// forbids — a new runner that needs parts is a reviewed row, not a silent inheritance. The legacy
// `packages/contracts/src/chat/` row is DELETED rather than translated: the home DECLARES the symbol and
// imports it from nobody, so that row licensed nothing at all and, as a grant, would be permanently STALE.
// Its liveness is the home receipt above, which is strictly stronger.
//
// FAMILY: SINGLETON (`content-part-seam`). The sealed-origin reader it consumes
// (`lib/sealed-origin.ts#readSealedOrigin`/`sealedOriginReports`) is a corpus-wide primitive shared across
// four families, not this policy's family computation; its SUBJECT — the D51 seam symbol plus the
// declaration-home RECEIPT that makes the rule's own liveness a tool error — has no sibling.
// POPULATION PORT: intentional correction, stated. The legacy descriptor filtered `PROD_SRC.test('/' + p)`
// where `PROD_SRC = /\/packages\/[^/]+\/src\//` (`9808b93c0^:72`) — ANY workspace package's `src`. The final
// population is `@packages`, which is the explicit SIX-root list (client · ui · server · db · contracts ·
// kit) and therefore does NOT admit `packages/showcase-plugins/src/`, added as the separate `@showcase` root
// on 2026-09-11. That is one directory narrower than the legacy predicate and it is the standing
// `@packages`-vs-`@authored` boundary question (contract/population.ts, #1980), not a decision taken here:
// widening it is a behaviour change across every policy declaring `@packages` and is measured and ruled, not
// done in passing.
//
// `@inference` ADDED 2026-09-20 (lane cb-gate-reach, the §12 EXTRACTION AUDIT) — and note that this is NOT a
// widening of `@packages`, which stays the untouched six-root list for the reason above. It is the second-ref
// pattern `contract/population.ts` prescribes. It is owed because the extraction moved the seam's ONLY
// sanctioned consumer — the sealed runner tier — out of `packages/server/src/infra/providers/` and out of every
// declared root, taking SIX of this policy's reviewed grants stale with it and leaving the D51 seam's actual
// consumers judged by nothing. Those six became three live rows (`inference-contract-chat`,
// `inference-backend-kit-history`, `inference-v4-prompt`); four of the old runner subjects no longer exist at
// all, their backends collapsed into `openai-compat` or deleted with the vLLM fleet.
//
// RE-SPELLED 2026-09-20 (lane cb-population-truth, #2488): `{ in: ["@packages", "@inference"] }`
// → `"@product"`. SET-IDENTICAL — population 3,427 and 6 consumed grants, before and after (`pnpm
// check:structure --check content-part-seam`, whole tree). This policy was the in-tree PRECEDENT for the
// #2488 defect: it had already discovered that `@packages` does not mean "the authored product code" and
// paid for the discovery per-policy, which is the cost `@product` removes.
// CURRENT 2026-09-21: `@product` also includes shipped showcase/default-content sources. The widened
// real-tree run is the authority for their current reach; the 3,427 figure remains the dated #2488 receipt.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { SealedHome } from "../lib/sealed-origin.ts";
import { readSealedOrigin, sealedOriginReports } from "../lib/sealed-origin.ts";

const SYMBOL = "ChatContentPart";
const OPERATION = "chat-content-part-reference";
const HOME_RECEIPT = "ChatContentPart declaration home";

/** The declaration home is the chat NAMESPACE, not one file: the declaration and its barrel move together. */
const CONTENT_PART_HOME: SealedHome = { pathInfix: "/packages/contracts/src/chat/", exportedNames: new Set([SYMBOL]) };

const MESSAGE =
  "`ChatContentPart` is named outside the D51 seam set (the CONVERT producer domain/chat/substrate/" +
  "wire-history.ts · the engine request seam domain/chat/engine/pipeline.ts · the request DTO " +
  "domain/chat/contract/results.ts · the sealed infra/providers consumers) — content-parts are produced ONCE " +
  "at the request seam's conversion and everything upstream stays `content: string` (Core-Path-Registry.md D51).";
const FIX =
  "keep `content: string` upstream; ChatContentPart is produced ONCE at the request seam's CONVERT step (domain/chat/substrate/wire-history.ts) and consumed only by the sealed runner tier.";

/** THE CANDIDATE PREFILTER: an `ImportSpecifier`'s `getName()` is the ORIGINAL exported name even under an
 *  alias, and a namespace-qualified type's right side is the exported name. Gating on the sealed NAME loses
 *  only a re-export under a DIFFERENT name — a declared limit with its own row, and one the legacy reader
 *  carried as well. Every candidate still pays full origin resolution. */
function candidate(node: MorphNode): MorphNode | undefined {
  return (Node.isImportSpecifier(node) && node.getName() === SYMBOL) || (Node.isQualifiedName(node) && node.getRight().getText() === SYMBOL) ? node : undefined;
}

export const gate = defineGate({
  id: "content-part-seam",
  family: "content-part-seam",
  authority: "reviewed-grant",
  severity: "error",
  // `@packages` + `@inference`: the second ref is the documented pattern for a workspace package that is
  // deliberately NOT folded into `@packages` (contract/population.ts — "a policy that needs the package
  // TODAY declares both refs"). It is owed here because the D51 seam's ONLY legitimate consumers, the
  // sealed runner tier, ALL moved into `packages/inference/src/` with the `@orb/inference` extraction.
  population: "@product",
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const references = new Map<string, MorphNode>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.QualifiedName],
          visit: (node, sourceFile: SourceFile) => {
            const anchor = candidate(node);
            if (anchor === undefined) {
              return;
            }
            // FAIL-CLOSED at the DECLARED DOOR: an unreadable import door reports, an import that provably
            // binds something else is not a subject (lib/sealed-origin.ts::sealedOriginReports).
            if (!sealedOriginReports(readSealedOrigin(anchor, CONTENT_PART_HOME), anchor)) {
              return;
            }
            const subject = ctx.relativePath(sourceFile);
            if (!references.has(subject)) {
              references.set(subject, anchor);
            }
          },
        },
      ],
      evaluate: () => {
        // THE RENAME TRIPWIRE, as a receipt: the home must still DECLARE the symbol this seam is about.
        const home = ctx.files.filter(
          (file) => file.getFilePath().replaceAll("\\", "/").includes(CONTENT_PART_HOME.pathInfix) && file.getExportedDeclarations().has(SYMBOL),
        );
        ctx.receipt({ kind: "population", source: HOME_RECEIPT, members: home.length, unresolved: 0 });
        for (const [subject, anchor] of [...references].toSorted(([left], [right]) => left.localeCompare(right))) {
          ctx.report.node(anchor, { subject, operation: OPERATION, message: `${MESSAGE} Importer: ${subject}.`, fix: FIX });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      grant: { subject: "packages/server/src/domain/chat/verbs/assemble.ts", operation: "chat-content-part-reference" },
      files: {
        "packages/contracts/src/chat/bus.ts": "export type ChatContentPart = { readonly type: string };\n",
        "packages/server/src/domain/chat/verbs/assemble.ts":
          'import type { ChatContentPart } from "../../../../../contracts/src/chat/bus.ts";\nexport type T = ChatContentPart;\n',
      },
      expect: { count: 1, messageIncludes: "packages/server/src/domain/chat/verbs/assemble.ts" },
      why: "the founding shape — an upstream verb reaching for parts before the engine seam, with the exact grant SUBJECT in the message",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/bus.ts": "export type ChatContentPart = { readonly type: string };\n",
        "packages/server/src/domain/chat/verbs/alias.ts":
          'import type { ChatContentPart as Part } from "../../../../../contracts/src/chat/bus.ts";\nexport type T = Part;\n',
      },
      expect: { count: 1 },
      why: "AN IMPORT ALIAS is the same declaration — the seam is a claim about where the type LIVES, not about what a consumer called it",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/bus.ts": "export type ChatContentPart = { readonly type: string };\n",
        "packages/contracts/src/chat/index.ts": 'export type { ChatContentPart } from "./bus.ts";\n',
        "packages/server/src/domain/chat/verbs/reexport.ts":
          'import type { ChatContentPart } from "../../../../../contracts/src/chat/index.ts";\nexport type T = ChatContentPart;\n',
      },
      expect: { count: 1, messageIncludes: "reexport.ts" },
      why: "A RE-EXPORT through the chat barrel is the same declaration — the legacy specifier regex only recognised one door",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/bus.ts": "export type ChatContentPart = { readonly type: string };\n",
        "packages/server/src/domain/chat/verbs/twice.ts":
          'import type { ChatContentPart } from "../../../../../contracts/src/chat/bus.ts";\nexport type A = ChatContentPart;\nexport type B = readonly ChatContentPart[];\n',
      },
      expect: { count: 1 },
      why: "GRANT GRANULARITY: one finding per carrier, because a reviewed grant licenses one `(subject, operation)` and a second matching finding would make the row OVER-BROAD and license neither",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/bus.ts": "export type ChatContentPart = { readonly type: string };\n",
        "packages/server/src/domain/chat/verbs/unreadable.ts":
          'import type { ChatContentPart } from "./missing-barrel.ts";\nexport type T = ChatContentPart;\n',
      },
      expect: { count: 1 },
      why: "FAIL-CLOSED — a `ChatContentPart` door that resolves to nothing is reported; a seam an unreadable module can walk through is not one",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/bus.ts": "export type ChatContentPart = { readonly type: string };\n",
        "packages/server/src/domain/chat/verbs/ns.ts":
          'import type * as chat from "../../../../../contracts/src/chat/bus.ts";\nexport type T = chat.ChatContentPart;\n',
      },
      expect: { count: 1, messageIncludes: "ns.ts" },
      why: "A namespace-qualified TYPE reference resolves through the shared origin reader to the same canonical ChatContentPart declaration",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/bus.ts": "export type ChatContentPart = { readonly type: string };\n",
        "packages/server/src/domain/chat/verbs/quiet.ts": "export const quiet = 1;\n",
      },
      why: "the home DECLARES the symbol and imports it from nobody, which is why the legacy contracts row licensed nothing — and the home receipt is non-zero, so the rename tripwire is armed and silent",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/bus.ts": "export type ChatContentPart = { readonly type: string };\n",
        "packages/server/src/domain/chat/lib/local.ts": "export type ChatContentPart = { readonly other: number };\nexport type T = ChatContentPart;\n",
      },
      why: "A PURELY LOCAL declaration of the same name is not a CANDIDATE at all: there is no import specifier and no member read, so no node is ever offered to the identity reader. This row proves the prefilter, NOT the home comparison — the row below is the one that proves the comparison",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/bus.ts": "export type ChatContentPart = { readonly type: string };\n",
        "packages/server/src/domain/chat/lib/wire.ts": "export type ChatContentPart = { readonly other: number };\n",
        "packages/server/src/domain/chat/verbs/foreign.ts": 'import type { ChatContentPart } from "../lib/wire.ts";\nexport type T = ChatContentPart;\n',
      },
      why: "THE HOME COUNTERFACTUAL, and the row that actually exercises the comparison: a GENUINE import specifier named `ChatContentPart` — a candidate by every test the prefilter makes — that resolves cleanly to a declaration OUTSIDE the chat contracts home. Replacing the home comparison with a name comparison turns this row RED, which is what proves the identity was resolved rather than spelled",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/bus.ts": "export type ChatContentPart = { readonly type: string };\nexport type MessageView = { readonly id: string };\n",
        "packages/server/src/domain/chat/verbs/sibling.ts":
          'import type { MessageView } from "../../../../../contracts/src/chat/bus.ts";\nexport type T = MessageView;\n',
      },
      why: "a DIFFERENT export from the same chat home passes — the seam is about one symbol, not about the module",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/bus.ts": "export type ChatContentPart = { readonly type: string };\n",
        "packages/contracts/src/chat/barrel.ts": 'export type { ChatContentPart as WirePart } from "./bus.ts";\n',
        "packages/server/src/domain/chat/verbs/renamed.ts":
          'import type { WirePart } from "../../../../../contracts/src/chat/barrel.ts";\nexport type T = WirePart;\n',
      },
      why: "DECLARED LIMIT — a barrel that RE-EXPORTS the seam symbol under a DIFFERENT name is outside the candidate prefilter. The legacy name reader missed it too, so this is a written baseline rather than a regression; closing it means resolving an origin on every identifier in a 3,367-file population, which does not finish",
    },
  ],
});
