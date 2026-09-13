// Policy: selection-store-via-factory (derive-modernization-audit.md §W3, G27 — the drill-selection factory
// sealed). The per-section selection stores share ONE shape; `createDrillSelectionStore` IS that shape. A
// `state/*-selection-store.ts` that mints the raw `createGatedStore` door itself re-grows the byte-identical
// store that drifts (D72: a machine ships WITH its seal).
//
// AUTHORITY IS reviewed-grant. The two FACTORIES compose the door on purpose and the one non-drill bulk
// store (message-selection, a presence-in-a-Set multi-select the drill factory does not model) mints it
// directly — three recurring repository PERMISSIONS, now exact `(subject, operation)` rows in
// `lib/reviewed-grants.ts` instead of a local `SANCTIONED_HOMES` table plus the module's own two-sided
// staleness sweep. The central row subsumes BOTH legacy modes: a row whose file left the project and a row
// whose file stopped minting the door are the same thing to reconciliation — zero consumption, STALE.
//
// IDENTITY, NOT SPELLING. The legacy check was an Identifier callee whose TEXT was `createGatedStore`, so a
// namespace/aliased/computed spelling walked past it and a same-named local helper red. The subject is the
// symbol declared by `state/create-gated-store.ts`, located in the population and receipted so its rename
// REFUSES the run rather than silently sealing nothing.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { ProjectHomeDeclaration } from "../lib/project-home-origin.ts";
import { classifyProjectHomeOrigin, locateProjectHome } from "../lib/project-home-origin.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";

const DOOR = "createGatedStore";
const OPERATION = "raw-gated-store-mint";
const DOOR_HOME: ProjectHomeDeclaration = { path: "packages/client/src/state/create-gated-store.ts", names: [DOOR] };

const MESSAGE =
  "a `*-selection-store.ts` mints the raw `createGatedStore` door directly — the per-section drill stores are " +
  "ONE shape. Mint it with `createDrillSelectionStore(name, { secondary? })` instead " +
  "(derive-modernization-audit.md §W3 G27; D72 — a machine ships WITH its seal).";
const UNREADABLE =
  "this selection store calls something spelled `createGatedStore` whose binding the shared readers cannot place, so whether it is the raw store door CANNOT be established. Reported rather than passed: the spelling alone is not the identity. Give the binding a readable import origin; the three-answer rule is tooling/src/verify/lib/origin-verdict.ts (#944).";
const FIX =
  "replace the raw `createGatedStore(...)` plus its hand actions/selectors with a `createDrillSelectionStore(name, { secondary? })` mint; a factory or a genuinely non-drill store is licensed by an exact reviewed grant.";

/** The callee's leaf name across bare, member and computed-literal spellings. */
function calleeName(callee: MorphNode): string | null {
  let name: string | null = null;
  if (Node.isIdentifier(callee)) {
    name = callee.getText();
  }
  if (Node.isPropertyAccessExpression(callee)) {
    name = callee.getName();
  }
  if (Node.isElementAccessExpression(callee)) {
    const argument = callee.getArgumentExpression();
    const literal = argument !== undefined && (Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument));
    name = literal ? argument.getLiteralText() : null;
  }
  return name;
}

const DOOR_PROOF = {
  "packages/client/src/state/create-gated-store.ts": "export declare function createGatedStore<T>(name: string, initial: () => T): () => T;\n",
};

export const gate = defineGate({
  id: "selection-store-via-factory",
  family: "selection-store-via-factory",
  authority: "reviewed-grant",
  severity: "error",
  // Location-keyed exactly as the legacy predicate was (`state/` + `*-selection-store.ts`), PLUS the door's
  // own home — which is not a subject (it declares the door, it does not call it) but must be inside the
  // population for the liveness receipt to locate it. That one extra path is the classified population
  // delta this conversion records.
  population: {
    in: ["@client"],
    under: ["packages/client/src/state/*-selection-store.ts", "packages/client/src/state/create-gated-store.ts"],
  },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const candidates: { readonly node: MorphNode; readonly subject: string; readonly spelling: string }[] = [];
    // The alias index: an ImportSpecifier's `getName()` is the EXPORT name even when aliased, so a local
    // rename of the door still enters the candidate set without resolving every call in the population.
    const aliasesBySource = new Map<string, Set<string>>();
    const aliasesOf = (sourceFile: SourceFile): Set<string> => {
      const path = sourceFile.getFilePath();
      let names = aliasesBySource.get(path);
      if (names === undefined) {
        names = new Set<string>();
        aliasesBySource.set(path, names);
      }
      return names;
    };
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportSpecifier],
          visit: (node, sourceFile): void => {
            if (Node.isImportSpecifier(node) && node.getName() === DOOR) {
              aliasesOf(sourceFile).add(node.getAliasNode()?.getText() ?? DOOR);
            }
          },
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile): void => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            const callee = node.getExpression();
            const name = calleeName(callee);
            if (name === null || !(name === DOOR || aliasesOf(sourceFile).has(name))) {
              return;
            }
            candidates.push({ node: callee, subject: ctx.relativePath(sourceFile), spelling: name });
          },
        },
      ],
      evaluate: (): void => {
        const home = locateProjectHome(ctx.files, ctx.relativePath, DOOR_HOME);
        // ZERO members is a REFUSAL: the raw door this policy seals was renamed or moved, so "who mints it"
        // is a question with no honest answer.
        ctx.receipt({ kind: "population", source: DOOR_HOME.path, members: home.members, unresolved: home.unresolved });
        if (home.sourceFile === undefined) {
          return;
        }
        const findings: ReviewedGrantCandidate[] = [];
        for (const { node, subject, spelling } of candidates) {
          const verdict = classifyProjectHomeOrigin(node, home);
          if (verdict !== "other") {
            findings.push({
              node,
              subject,
              operation: OPERATION,
              unreadable: verdict === "unreadable",
              // The waiver/report position is the SPELLING at the site — an aliased mint is anchored on the
              // alias, because that is the text a reader (and the position engine) finds there.
              token: spelling,
              offset: Math.max(node.getText().lastIndexOf(spelling), 0),
            });
          }
        }
        reportReviewedGrantCandidates(ctx.report, findings, { message: MESSAGE, fix: FIX, unreadableMessage: UNREADABLE });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      grant: { subject: "packages/client/src/state/x-selection-store.ts", operation: "raw-gated-store-mint" },
      files: {
        ...DOOR_PROOF,
        "packages/client/src/state/x-selection-store.ts":
          'import { createGatedStore } from "./create-gated-store.ts";\nexport const useX = createGatedStore<{ id: string | null }>("x-selection", () => ({ id: null }));\n',
      },
      expect: { count: 1, token: DOOR },
      why: "the founding shape — a per-section selection store minting the raw door instead of the drill factory",
    },
    {
      mode: "types",
      files: {
        ...DOOR_PROOF,
        "packages/client/src/state/create-drill-selection-store.ts":
          'import { createGatedStore } from "./create-gated-store.ts";\nexport const make = (name: string): unknown => createGatedStore(name, () => ({ primaryId: null }));\n',
      },
      expect: { count: 1 },
      why: "THE PERMISSION IS NOT A CARVE-OUT IN THE RULE: the factory home composes the door on purpose, reds like any other file, and is licensed by an exact grant row — a THIRD `create-*-selection-store.ts` is judged rather than inheriting an exemption from its filename, which the legacy `/create-` pattern handed out for free",
    },
    {
      mode: "types",
      files: {
        ...DOOR_PROOF,
        "packages/client/src/state/y-selection-store.ts":
          'import { createGatedStore as mint } from "./create-gated-store.ts";\nexport const useY = mint<{ id: string | null }>("y-selection", () => ({ id: null }));\n',
      },
      expect: { count: 1 },
      why: "THE ALIAS RED: the door under another local name is the same mint, and the legacy Identifier-TEXT check was offered `mint`",
    },
    {
      mode: "types",
      files: {
        ...DOOR_PROOF,
        "packages/client/src/state/z-selection-store.ts":
          'import * as store from "./create-gated-store.ts";\nexport const useZ = store.createGatedStore<{ id: string | null }>("z-selection", () => ({ id: null }));\n',
      },
      expect: { count: 1 },
      why: "THE NAMESPACE RED: a member callee is not an Identifier, so the legacy check answered 'not my subject'",
    },
    {
      mode: "types",
      files: {
        ...DOOR_PROOF,
        "packages/client/src/state/o-selection-store.ts":
          'declare function opaque(): any;\nexport const useO = opaque().createGatedStore("o-selection", () => ({ id: null }));\n',
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "THE FAIL-CLOSED THIRD ANSWER (#944), reached by no row before #2014: a `createGatedStore` callee read off an OPAQUE receiver binds no declaration, so `classifyOriginRefusal` answers case (b) and the mint is REPORTED rather than passed on the strength of its spelling. The `messageIncludes` is what holds the arm — it produces the same ONE finding the ordinary verdict does, so a `{ count: 1 }` row passes identically whether the branch fires or is unreachable",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        ...DOOR_PROOF,
        "packages/client/src/state/create-drill-selection-store.ts":
          "export declare function createDrillSelectionStore<P extends string>(name: string): unknown;\n",
        "packages/client/src/state/x-selection-store.ts":
          'import { createDrillSelectionStore } from "./create-drill-selection-store.ts";\nexport const useX = createDrillSelectionStore<string>("x-selection");\n',
      },
      why: "the fix: a selection store minted through the factory calls no raw door. The factory's own door is planted so the specifier resolves — an unresolvable import would make this row pass by fail-closure",
    },
    {
      mode: "types",
      files: {
        ...DOOR_PROOF,
        "packages/client/src/state/w-selection-store.ts":
          'import { createGatedStore } from "./local-store.ts";\nexport const useW = createGatedStore("w", () => ({}));\n',
        "packages/client/src/state/local-store.ts": "export declare function createGatedStore<T>(name: string, initial: () => T): () => T;\n",
      },
      why: "SAME NAME, DIFFERENT MODULE: a same-named helper declared elsewhere is not the sanctioned door — the legacy TEXT check red it, and only the canonical declaring file separates them",
    },
    {
      mode: "types",
      files: {
        ...DOOR_PROOF,
        "packages/client/src/state/shell-store.ts":
          'import { createGatedStore } from "./create-gated-store.ts";\nexport const useShell = createGatedStore("shell", () => ({ open: false }));\n',
        "packages/client/src/state/x-selection-store.ts": "export const useX = null;\n",
      },
      why: "THE SCOPE COUNTERFACTUAL: a NON-selection state store may mint the raw door freely — only `*-selection-store.ts` is keyed, which is the population, not a permission",
    },
  ],
});
