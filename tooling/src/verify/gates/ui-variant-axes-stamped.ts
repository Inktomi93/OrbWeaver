// Policy: ui-variant-axes-stamped (docs/law/Core-Enforcement-Active-Gates.md) — an @orb/ui
// `tv()` recipe that declares a STAMPED axis (variant/size/intent/tone) must reach the DOM through the
// stamp seam, so the rendered element says which authored ARM it is (#1080, owner ruling 2026-09-02).
// A1 unstamped recipe · A2 unreadable `tv()` config (FAIL-CLOSED) · A3 duplicate recipe NAME (the
// consumption key is the name).
//
// WHY. `packages/ui` expressed its axes as CLASS STRINGS only, so two authored arms of one primitive in
// one home were indistinguishable in the DOM and the ui-audit walker folded them into ONE authored
// decision — one repair row where two decisions exist (F8,
// 2026-09-02). Stamping is only half a fix: the
// next primitive to grow a `size` axis would silently rebuild the collapse, which is what this gate
// makes impossible.
//
// FAMILY `ui-variant-axes-stamped` — the shared reader is `lib/variant-axis-stamp.ts` (`declaredAxes`,
// `stampDoorRecipeName`, `readStampedAxes`, `stampDoorPresent`, `recipeKey`). Arm A5 of the legacy
// descriptor — the axis-VOCABULARY blindness tripwire — SPLIT OUT to `ui-variant-axes-stamped-health`
// (#1950), because its population differs: the tripwire's subject is EXACTLY the axis home,
// while the three arms here need the whole `@ui` corpus (consumption lives in a SIBLING file). The ruled
// row said "hard recipe/duplicate/blindness POLICIES"; A1, A2 and A3 differ on NO axis — same authority,
// severity, execution and population — so §3's smallest-complete-contract rule and the same lane's §3.3
// ruling ("a split is owed only where an axis differs") make them one policy with three messages. A3 in
// particular CANNOT live in the `-health` sibling: a duplicate NAME is a cross-file verdict over the whole
// package, and that sibling's population is one file.
//
// A4 — THE STALE-RATCHET ARM — IS DELETED WITH ITS BASELINE (guide §5: `*.baseline.json` debt RETIRES,
// it does not convert). `ui-variant-axes-stamped.baseline.json` held 11 rows at mint (`da01f7eb9`, tranche
// 1 = the seam + four pilots) and was DRAINED TO `{}` by #1097 (`fc5f99e4c`, tranche 2 — all 15
// stamped-axis recipes reach the seam). It was 3 bytes on conversion day, so ZERO rows were carried:
// nothing became a reviewed grant and nothing became warning debt, which is why this policy declares
// `severity: "error"` and no `workItem` despite the ruled row naming warning debt. The ledger, its
// generator (`ops/gen/ui-variant-axes-stamped.ts`), the `baseline` verb row, the `verify/index.ts` export
// and the `ops/debt.ts` row were deleted in the same commit; the per-row accounting is in the lane report.
//
// POPULATION PORT: byte-identical. The legacy `scanRoot` was `p.includes("packages/ui/src/")`; the final
// population is `@ui` (`packages/ui/src/`), the same prefix. `entire-population` because a per-file verdict
// would be a lie: a recipe declared in `variants.ts` is stamped in its sibling `thing.tsx`.
//
// AUTHORITY: `hard`, exactly as the ruled row says and as the legacy behaved — none of the three arms had
// a suppression door, and the retired ratchet was a BUDGET, not a waiver. Marker census: ZERO live
// `@orb-gate-ignore ui-variant-axes-stamped` markers anywhere in the tree (positive control: 4
// `@orb-gate-ignore` in `lib/gate-ignore.ts`), so the reconciliation closes 0 = 0 = 0.
//
// COMMENT POSTURE: comment-SAFE — every read is node-kind subscription through lib/ast-read.ts; nothing
// here matches a literal against file TEXT.
//
// Legacy descriptor: `da01f7eb9` (`tooling/src/verify/gates/ui-variant-axes-stamped.ts`).
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `ui-variant-axes-stamped` descriptor at ccd404f6feb0cdb84adce3d978522f138baadaab, the parent of the conversion
// `aebf416fc` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The `da01f7eb9`
// cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both citations
// resolve to this source. Over the SAME 7,461 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 366 and final `population` admits 366.
// legacy − final = ∅. final − legacy = ∅. Controls: inside `packages/ui/src/art/art-bleed/__cbbhr_in_art-bleed.tsx`
// (virtual) admitted by both; outside `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by
// both.
import type { Node, VariableDeclaration } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { AXIS_HOME_REL, declaredAxes, readStampedAxes, recipeKey, stampDoorRecipeName, UI_SRC } from "../lib/variant-axis-stamp.ts";

const MESSAGE =
  "@orb/ui variant-axis stamp (#1080): a `tv()` recipe declaring a stamped axis (variant/size/intent/tone) " +
  "must emit that axis as a `data-*` attribute, or two different authored arms of one primitive in one home " +
  "collapse into ONE ui-audit authored decision — one repair row where two decisions exist. Also RED: a " +
  "`tv()` config this gate cannot read (its axes are unknowable, so its compliance is too), and two recipes " +
  "sharing an exported NAME (the consumption key is the name).";

const FIX =
  "Route the recipe through the seam: `{...variantProps(xVariants, { intent, size }, className)}` on the " +
  "element (it returns the className AND the stamp from one selection object), or `variantAttrs(xVariants, " +
  "{ … })` when the primitive composes its own className (a slot recipe). Both live in " +
  "packages/ui/src/lib/variant-attrs.ts. Keep the `tv({ … })` config an inline object literal; rename one of " +
  "two same-named recipes.";

/** The three arm discriminators. DISJOINT by construction (guide §6: a `${MESSAGE} …` prefix shared by two
 *  arms makes neither pinnable), and each is what its `mustFlag` row's `messageIncludes` names. */
const UNSTAMPED = "A1 unstamped:";
const UNREADABLE = "A2 unreadable:";
const DUPLICATE = "A3 duplicate name:";

/** One `tv()` recipe that declares at least one stamped axis — the policy's judged member. */
interface StampedRecipe {
  readonly key: string;
  readonly name: string;
  readonly rel: string;
  readonly declaration: VariableDeclaration;
  readonly axes: readonly string[];
}

/** A candidate gathered by the walk, classified in `evaluate` once the axis vocabulary has been read —
 *  walk order is file order, so the axis home may be the LAST file visited. */
interface Candidate {
  readonly rel: string;
  readonly declaration: VariableDeclaration;
  /** `undefined` = a `tv()` whose config the shared reader could not resolve (the A2 fail-closed arm). */
  readonly declared: readonly string[] | undefined;
}

export const gate = defineGate({
  id: "ui-variant-axes-stamped",
  family: "ui-variant-axes-stamped",
  authority: "hard",
  severity: "error",
  population: "@ui",
  analysis: "syntax",
  // Consumption lives in a SIBLING file, so a per-file verdict would be a lie (the legacy
  // `scopeSafety: "whole-project"`), and a narrowed request DEFERS this policy rather than answering wrong.
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const candidates: Candidate[] = [];
    const stamped = new Set<string>();
    const report = (node: Node, token: string, detail: string): void => {
      ctx.report.node(node, { token, offset: 0, message: `${MESSAGE} ${detail}`, fix: FIX });
    };

    /** Classify the walk's candidates once the axis vocabulary has been read, reporting A2 in passing. */
    const classify = (axes: readonly string[]): readonly StampedRecipe[] => {
      const recipes: StampedRecipe[] = [];
      for (const candidate of candidates) {
        if (!candidate.rel.startsWith(UI_SRC)) {
          continue;
        }
        const name = candidate.declaration.getName();
        if (candidate.declared === undefined) {
          // A2 — never a silent skip: its axes are unknowable, so its compliance is unknowable
          // (the #944 fail-closed third answer).
          report(
            candidate.declaration.getNameNode(),
            name,
            `${UNREADABLE} the \`tv()\` config of \`${name}\` is not an authored object literal, so this policy cannot tell which axes it declares.`,
          );
          continue;
        }
        const stampedAxes = candidate.declared.filter((axis) => axes.includes(axis));
        if (stampedAxes.length > 0) {
          recipes.push({ key: recipeKey(candidate.rel, name), name, rel: candidate.rel, declaration: candidate.declaration, axes: stampedAxes });
        }
      }
      return recipes;
    };

    /** A1 — the recipe never reaches a stamp door. Born sealed: the transition ratchet drained to `{}`
     *  (#1097) and was deleted with the conversion, so there is no budget and no admission. */
    const reportUnstamped = (recipes: readonly StampedRecipe[]): void => {
      for (const recipe of recipes) {
        if (!stamped.has(recipe.name)) {
          report(
            recipe.declaration.getNameNode(),
            recipe.name,
            `${UNSTAMPED} \`${recipe.name}\` declares the stamped ${recipe.axes.length === 1 ? "axis" : "axes"} \`${recipe.axes.join("`, `")}\` and reaches no \`variantProps\`/\`variantAttrs\` door.`,
          );
        }
      }
    };

    /** A3 — two stamped recipes exporting the same NAME make the consumption key ambiguous: a stamp on
     *  either one would silently vouch for both. Born sealed. */
    const reportDuplicateNames = (recipes: readonly StampedRecipe[]): void => {
      const byName = new Map<string, StampedRecipe[]>();
      for (const recipe of recipes) {
        byName.set(recipe.name, [...(byName.get(recipe.name) ?? []), recipe]);
      }
      for (const [name, sharing] of byName) {
        if (sharing.length < 2) {
          continue;
        }
        for (const recipe of sharing) {
          const others = sharing.filter((other) => other.key !== recipe.key).map((other) => other.rel);
          report(
            recipe.declaration.getNameNode(),
            name,
            `${DUPLICATE} \`${name}\` is also exported from ${others.join(", ")}, so a stamp on one would vouch for the other.`,
          );
        }
      }
    };

    return {
      visitors: [
        {
          kinds: [SyntaxKind.VariableDeclaration],
          visit: (node, sourceFile) => {
            const declaration = node.asKindOrThrow(SyntaxKind.VariableDeclaration);
            candidates.push({ rel: ctx.relativePath(sourceFile), declaration, declared: declaredAxes(declaration) });
          },
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile) => {
            // The axis home is EXCLUDED: `variantProps` calls `variantAttrs(recipe, selection)` internally,
            // so the seam would otherwise credit a recipe named after that parameter — a gate crediting
            // itself is the permissive direction, the one that reports OK forever.
            if (ctx.relativePath(sourceFile) === AXIS_HOME_REL) {
              return;
            }
            const name = stampDoorRecipeName(node.asKindOrThrow(SyntaxKind.CallExpression));
            if (name !== undefined) {
              stamped.add(name);
            }
          },
        },
      ],
      evaluate: () => {
        // The MEASURED denominator, never the census (§12.3): the authored files this policy walked. A
        // receipt of `recipes.size` would make a fixture with no recipe a receipt TOOL ERROR, and a receipt
        // of `unreadable.length` would turn the A2 arm's own finding into one.
        ctx.receipt({ kind: "population", source: "ui-variant-axes-stamped-corpus", members: ctx.files.length, unresolved: 0 });
        // The vocabulary is DERIVED from its emitter, so a fifth axis is policed the day it is added. An
        // ABSENT home (a fileset that does not carry it) leaves the vocabulary empty and nothing is judged;
        // an emptied home ON THE REAL TREE is `ui-variant-axes-stamped-health`'s verdict, not a silent OK.
        const home = ctx.files.find((sf) => ctx.relativePath(sf) === AXIS_HOME_REL);
        const axes = home === undefined ? [] : readStampedAxes(home);

        const recipes = classify(axes);
        reportUnstamped(recipes);
        reportDuplicateNames(recipes);
      },
    };
  },

  mustFlag: [
    {
      mode: "source",
      files: {
        [AXIS_HOME_REL]:
          'export const STAMPED_VARIANT_AXES = ["variant", "size", "intent", "tone"] as const;\nexport function variantProps(): string {\n  return "";\n}\n',
        "packages/ui/src/primitives/thing/variants.ts":
          'export const thingVariants = tv({ base: "inline-flex", variants: { size: { sm: "h-control-sm", md: "h-control-md" } } });\n',
        "packages/ui/src/primitives/thing/thing.tsx":
          'export const Thing = (): unknown => <div className={cn(thingVariants({ size: "sm" }))} />;\nexport const registered = register(thingVariants);\n',
      },
      expect: { token: "thingVariants", count: 1, messageIncludes: "A1 unstamped:" },
      why: "A1, the founding shape: a size-axis recipe whose classes reach the DOM with no stamp — the F8 collapse rebuilt. It also carries the DOOR-SET fence in the falsifying direction: `register(thingVariants)` hands the recipe to a NON-door call whose first argument IS the recipe identifier, so opening `STAMP_DOORS` to accept any callee credits it and turns this row GREEN. Nothing else in the set discriminates that fence — `cn(thingVariants({ … }))` passes a CALL, not an identifier, so it can never credit whatever the door set is",
    },
    {
      mode: "source",
      files: {
        [AXIS_HOME_REL]:
          'export const STAMPED_VARIANT_AXES = ["variant", "size", "intent", "tone"] as const;\nexport function variantProps(): string {\n  return "";\n}\n',
        "packages/ui/src/primitives/thing/variants.ts": "export const thingVariants = tv(SHARED_CONFIG);\n",
      },
      expect: { token: "thingVariants", count: 1, messageIncludes: "A2 unreadable:" },
      why: "A2 FAIL-CLOSED, the #944 third answer: a `tv()` config this reader cannot resolve — its axes are unknowable, so silence would be a guess. The `messageIncludes` is what makes this row DISCRIMINATE: the arm produces the same finding COUNT as A1 and differs only in message, so a bare `{ count: 1 }` would pass identically whether the arm fires or is unreachable (guide §6.1, #1990). Probed by replacing this branch's report with `throw`: the row FAILS, so the arm is reached",
    },
    {
      mode: "source",
      files: {
        [AXIS_HOME_REL]:
          'export const STAMPED_VARIANT_AXES = ["variant", "size", "intent", "tone"] as const;\nexport function variantProps(): string {\n  return "";\n}\n',
        "packages/ui/src/primitives/one/variants.ts": 'export const chipVariants = tv({ variants: { tone: { solid: "bg-accent" } } });\n',
        "packages/ui/src/primitives/two/variants.ts": 'export const chipVariants = tv({ variants: { tone: { soft: "bg-accent/15" } } });\n',
        "packages/ui/src/primitives/one/one.tsx": 'export const One = (): unknown => <span {...variantProps(chipVariants, { tone: "solid" })} />;\n',
      },
      expect: { token: "chipVariants", count: 2, messageIncludes: "A3 duplicate name:" },
      why: "A3: one stamped name, two recipes — the stamp on ONE of them would silently vouch for the other; both are named, and neither is reported by A1 because the single stamp already credits the NAME. That is the defect, stated as a count: the `sharing.length < 2` guard is what dies here",
    },
    {
      mode: "source",
      files: {
        [AXIS_HOME_REL]:
          'export const STAMPED_VARIANT_AXES = ["variant", "size", "intent", "tone"] as const;\nexport function variantProps(): string {\n  return variantAttrs(thingVariants, { size: "sm" });\n}\n',
        "packages/ui/src/primitives/thing/variants.ts": 'export const thingVariants = tv({ variants: { size: { sm: "h-control-sm" } } });\n',
      },
      expect: { token: "thingVariants", count: 1, messageIncludes: "A1 unstamped:" },
      why: "THE SELF-CREDIT FENCE — an INVENTED row (§4.7) with its planted-break receipt, and its cut direction is INVERTED because the fence ACQUITS. The ONLY stamp-door call in this fileset sits INSIDE the axis home (`variantProps` forwards to `variantAttrs(recipe, selection)` there), so the seam must NOT credit `thingVariants` and A1 must fire. Deleting the `ctx.relativePath(sourceFile) === AXIS_HOME_REL` guard in the CallExpression visitor turns this row GREEN — a gate crediting itself is the permissive direction, the one that reports OK forever. No other row in the set discriminates it",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        [AXIS_HOME_REL]:
          'export const STAMPED_VARIANT_AXES = ["variant", "size", "intent", "tone"] as const;\nexport function variantProps(): string {\n  return "";\n}\n',
        "packages/ui/src/primitives/thing/variants.ts": 'export const thingVariants = tv({ variants: { size: { sm: "h-control-sm" } } });\n',
        "packages/ui/src/primitives/thing/thing.tsx":
          'export const Thing = (): unknown => <div {...variantProps(thingVariants, { size: "sm" }, className)} />;\n',
      },
      why: "the preferred door — className and stamp from ONE selection object: passes",
    },
    {
      mode: "source",
      files: {
        [AXIS_HOME_REL]:
          'export const STAMPED_VARIANT_AXES = ["variant", "size", "intent", "tone"] as const;\nexport function variantProps(): string {\n  return "";\n}\n',
        "packages/ui/src/primitives/thing/variants.ts":
          'export const thingVariants = tv({ slots: { root: "flex", label: "truncate" }, variants: { tone: { solid: "bg-accent" } } });\n',
        "packages/ui/src/primitives/thing/thing.tsx":
          'export const Thing = (): unknown => <div {...variantAttrs(thingVariants, { tone: "solid" })} className={thingVariants({ tone: "solid" }).root()} />;\n',
      },
      why: "the SLOT-recipe door: a multi-slot recipe composes its own classNames and takes the attrs door — passes. Dropping `variantAttrs` from the door set reds this row",
    },
    {
      mode: "source",
      files: {
        [AXIS_HOME_REL]:
          'export const STAMPED_VARIANT_AXES = ["variant", "size", "intent", "tone"] as const;\nexport function variantProps(): string {\n  return "";\n}\n',
        "packages/ui/src/primitives/thing/variants.ts":
          'export const thingVariants = tv({ variants: { shape: { pill: "rounded-full" }, density: { tight: "gap-tight" } } });\n',
      },
      why: "a recipe with NO stamped axis: `shape`/`density` are not part of the walker's identity vocabulary — passes, and stays out of the DOM. Opening the axis intersection (judge every declared variant) reds this row, which is what proves the vocabulary is DERIVED from the emitter rather than 'any variant'",
    },
    {
      mode: "source",
      files: {
        [AXIS_HOME_REL]:
          'export const STAMPED_VARIANT_AXES = ["variant", "size", "intent", "tone"] as const;\nexport function variantProps(): string {\n  return "";\n}\n',
        "packages/ui/src/lib/other.ts": 'export const helper = someOtherCall({ variants: { size: { sm: "x" } } });\n',
      },
      why: "DECLARED LIMIT: only a `tv()` initializer is a recipe — an unrelated call carrying a `variants` key is not one. Opening the `tv` mint check admits this declaration, and since `someOtherCall({…})`'s config IS readable it lands as an A1 finding, so this row reds",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/primitives/thing/variants.ts": 'export const thingVariants = tv({ variants: { size: { sm: "h-control-sm" } } });\n',
      },
      why: "DECLARED LIMIT: with no axis vocabulary in the fileset the policy judges nothing — the blindness arm is the `-health` SIBLING, whose population is exactly the axis home, so an emptied home on the REAL tree is RED there rather than silently green here",
    },
  ],
});
