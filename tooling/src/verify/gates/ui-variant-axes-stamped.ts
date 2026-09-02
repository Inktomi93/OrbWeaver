// Gate: ui-variant-axes-stamped (docs/architecture/core/Core-Enforcement-Active-Gates.md) — an @orb/ui
// `tv()` recipe that declares a STAMPED axis (variant/size/intent/tone) must reach the DOM through the
// stamp seam, so the rendered element says which authored ARM it is (#1080, owner ruling 2026-09-02).
// A1 unstamped recipe · A2 unreadable tv() config (fail-closed) · A3 duplicate recipe NAME (the
// consumption key is the name) · A4 stale baseline row · A5 the seam/axis-vocabulary blindness tripwire.
//
// WHY. `packages/ui` expressed its axes as CLASS STRINGS only, so two authored arms of one primitive in
// one home were indistinguishable in the DOM and the ui-audit walker folded them into ONE authored
// decision — one repair row where two decisions exist (F8,
// docs/reviews/stickler/2026-09-02-uiaudit-orbui-mechanism-audit.md). Stamping is only half a fix: the
// next primitive to grow a `size` axis would silently rebuild the collapse, which is what this gate
// makes impossible.
//
// TRANSITION RATCHET (GATE-AUTHORING.md §4.8). Tranche 1 stamped the seam + four pilots; the package-wide
// sweep is another lane's named work, so the REMAINDER is carried in ui-variant-axes-stamped.baseline.json
// — counted on the gate's own line, listed by `pnpm debt`, shrink-only, and two-sided (a row whose recipe
// is now stamped, or whose recipe no longer exists, is RED). Terminal state is `{}` plus this ledger and
// its generator deleted. Regenerate: `node tooling/src/verify/cli.ts baseline ui-variant-axes-stamped`.
//
// COMMENT POSTURE: comment-SAFE — every read is node-kind subscription through lib/ast-read.ts; nothing
// here matches a literal against file TEXT.
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { RatchetRow } from "../../_shared/ratchet-rows.ts";
import { admissionFor, classNote, readBudgetRows } from "../../_shared/ratchet-rows.ts";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { fileLoaded } from "../lib/pass.ts";
import type { StampedRecipe, UnreadableRecipe } from "../lib/variant-axis-stamp.ts";
import { AXIS_ANCHOR_REL, AXIS_HOME_REL, AXIS_TUPLE_NAME, readStampedAxes, repoRel, scanRecipes, stampedNames, UI_SRC } from "../lib/variant-axis-stamp.ts";

/** The ledger's ONE home — IMPORTED by ops/debt.ts and the generator, never re-spelled there. */
export const BASELINE_REL = "tooling/src/verify/gates/ui-variant-axes-stamped.baseline.json";
const GATE_SELF = "tooling/src/verify/gates/ui-variant-axes-stamped.ts";
const STAMP_DOOR = "variantProps";

const MESSAGE =
  "@orb/ui variant-axis stamp (#1080): a `tv()` recipe declaring a stamped axis (variant/size/intent/tone) " +
  "must emit that axis as a `data-*` attribute, or two different authored arms of one primitive in one home " +
  "collapse into ONE ui-audit authored decision — one repair row where two decisions exist. Also RED: a " +
  "`tv()` config this gate cannot read (its axes are unknowable, so its compliance is too), two recipes " +
  "sharing an exported NAME (the consumption key is the name), a stale ratchet row, and the vocabulary " +
  "itself going unreadable.";

const FIX =
  "Route the recipe through the seam: `{...variantProps(xVariants, { intent, size }, className)}` on the " +
  "element (it returns the className AND the stamp from one selection object), or `variantAttrs(xVariants, " +
  "{ … })` when the primitive composes its own className (a slot recipe). Both live in " +
  "packages/ui/src/lib/variant-attrs.ts. Keep the `tv({ … })` config an inline object literal; rename one of " +
  "two same-named recipes; regenerate the baseline after a fix and commit the shrink.";

/** The committed ledger, read through the ONE row reader so each row's DEBT/RATIFIED class travels. */
export function loadBaseline(root: string): ReadonlyMap<string, RatchetRow> {
  return readBudgetRows(root, BASELINE_REL);
}

let passAxes: readonly string[] = [];
let passBaseline: ReadonlyMap<string, RatchetRow> = new Map();
let passDoorPresent = false;
const passRecipes = new Map<string, StampedRecipe>();
const passByName = new Map<string, StampedRecipe[]>();
const passStamped = new Set<string>();
const passUnreadable: UnreadableRecipe[] = [];

/** A1 — the recipe never reaches a stamp door. Baseline-budgeted; everything else here is born sealed. */
function judgeRecipes(ctx: GateRunCtx): void {
  let admitted = 0;
  let ratified = 0;
  for (const [key, recipe] of passRecipes) {
    if (passStamped.has(recipe.name)) {
      continue;
    }
    const admission = admissionFor(passBaseline.get(key), 1);
    if (admission.admitted > 0) {
      admitted += admission.admitted;
      ratified += admission.ratified;
      continue;
    }
    ctx.report(recipe.declaration.getNameNode(), { token: recipe.name, offset: 0 });
  }
  ctx.scan({ admitted, admittedRatified: ratified });
}

/** A3 — two stamped recipes exporting the same NAME make the consumption key ambiguous: a stamp on either
 *  one would silently vouch for both. Born sealed. */
function judgeDuplicateNames(ctx: GateRunCtx): void {
  for (const [name, recipes] of passByName) {
    if (recipes.length < 2) {
      continue;
    }
    for (const recipe of recipes) {
      ctx.report(recipe.declaration.getNameNode(), { token: name, offset: 0 });
    }
  }
}

export const gate: GateDescriptor = {
  name: "ui-variant-axes-stamped",
  docRow: "docs/architecture/core/Core-Enforcement-Active-Gates.md (Layer 3 — ui-variant-axes-stamped)",
  status: "active",
  scopeSafety: "whole-project", // consumption lives in a SIBLING file; a per-file verdict would be a lie
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => p.includes(UI_SRC),
  begin: (ctx: GateRunCtx) => {
    passRecipes.clear();
    passByName.clear();
    passStamped.clear();
    passUnreadable.length = 0;
    passBaseline = existsSync(join(ctx.root, BASELINE_REL)) ? loadBaseline(ctx.root) : new Map();
    // The axis vocabulary is DERIVED from its emitter, so a fifth axis is policed the day it is added.
    const home = ctx.files.find((sf) => repoRel(sf.getFilePath()) === AXIS_HOME_REL);
    passAxes = home === undefined ? [] : readStampedAxes(home);
    passDoorPresent = home?.getFunction(STAMP_DOOR) !== undefined;
  },
  visitFile: (sf, _ctx) => {
    const rel = repoRel(sf.getFilePath());
    if (!rel.startsWith(UI_SRC)) {
      return;
    }
    const { recipes, unreadable } = scanRecipes(sf, passAxes);
    for (const recipe of recipes) {
      passRecipes.set(recipe.key, recipe);
      passByName.set(recipe.name, [...(passByName.get(recipe.name) ?? []), recipe]);
    }
    passUnreadable.push(...unreadable);
    for (const name of stampedNames(sf)) {
      passStamped.add(name);
    }
  },
  run: (ctx) => {
    // A5 — the BLINDNESS tripwire (GATE-AUTHORING §4 rule 6). Guarded on a real-tree anchor that is NOT
    // the axis home, so a mini-project's absent vocabulary is silence while a renamed/emptied tuple on the
    // real tree is RED instead of a permanently vacuous ✓.
    if (fileLoaded(ctx, AXIS_ANCHOR_REL) && (passAxes.length === 0 || !passDoorPresent)) {
      ctx.report({
        file: AXIS_HOME_REL,
        line: 1,
        column: 0,
        message: `${AXIS_HOME_REL} no longer yields a readable \`${AXIS_TUPLE_NAME}\` tuple and a \`${STAMP_DOOR}\` function — this gate's whole subject derivation is empty, so it would report ✓ over every unstamped recipe on the tree (GATE-AUTHORING.md §4 rule 6).`,
      });
    }
    // A2 — a `tv()` config this reader cannot resolve. Never a silent skip: its axes are unknowable, so
    // its compliance is unknowable (GATE-AUTHORING.md §5, the #944 fail-closed arm).
    for (const { declaration } of passUnreadable) {
      ctx.report(declaration.getNameNode(), { token: declaration.getName(), offset: 0 });
    }
    judgeRecipes(ctx);
    judgeDuplicateNames(ctx);
    ctx.scan({ population: [{ source: "tv() recipe (stamped axis)", members: passRecipes.size, unresolved: passUnreadable.length }] });
  },
  finalize: (ctx) => {
    // Stale rows only. Both modes in ONE test (GATE-AUTHORING §4.4a): a row is stale when the live
    // population no longer OWES it — whether because the recipe got stamped (mode A) or because the
    // recipe moved/vanished (mode B) — never gated on that row's own file having been loaded.
    if (!fileLoaded(ctx, AXIS_ANCHOR_REL)) {
      return;
    }
    for (const [key, row] of passBaseline) {
      const recipe = passRecipes.get(key);
      if (recipe !== undefined && !passStamped.has(recipe.name)) {
        continue;
      }
      const because =
        recipe === undefined
          ? "no stamped-axis recipe lives at that key any more (moved, renamed or deleted)"
          : "that recipe now routes through the stamp seam";
      ctx.report({
        file: GATE_SELF,
        line: 1,
        column: 0,
        message: `${BASELINE_REL} still budgets "${key}" but ${because} — the ratchet only goes down: regenerate it (node tooling/src/verify/cli.ts baseline ui-variant-axes-stamped) and commit the shrink.${classNote(row)}`,
      });
    }
  },

  mustFlag: [
    {
      files: {
        [AXIS_HOME_REL]:
          'export const STAMPED_VARIANT_AXES = ["variant", "size", "intent", "tone"] as const;\nexport function variantProps(): string {\n  return "";\n}\n',
        "packages/ui/src/primitives/thing/variants.ts":
          'export const thingVariants = tv({ base: "inline-flex", variants: { size: { sm: "h-control-sm", md: "h-control-md" } } });\n',
        "packages/ui/src/primitives/thing/thing.tsx": 'export const Thing = (): unknown => <div className={cn(thingVariants({ size: "sm" }))} />;\n',
      },
      expect: { token: "thingVariants", count: 1 },
      why: "A1, the founding shape: a size-axis recipe whose classes reach the DOM with no stamp — the F8 collapse rebuilt",
    },
    {
      files: {
        [AXIS_HOME_REL]:
          'export const STAMPED_VARIANT_AXES = ["variant", "size", "intent", "tone"] as const;\nexport function variantProps(): string {\n  return "";\n}\n',
        "packages/ui/src/primitives/thing/variants.ts": "export const thingVariants = tv(SHARED_CONFIG);\n",
      },
      expect: { token: "thingVariants", count: 1 },
      why: "A2 fail-closed: a `tv()` config this reader cannot resolve — its axes are unknowable, so silence would be a guess",
    },
    {
      files: {
        [AXIS_HOME_REL]:
          'export const STAMPED_VARIANT_AXES = ["variant", "size", "intent", "tone"] as const;\nexport function variantProps(): string {\n  return "";\n}\n',
        "packages/ui/src/primitives/one/variants.ts": 'export const chipVariants = tv({ variants: { tone: { solid: "bg-accent" } } });\n',
        "packages/ui/src/primitives/two/variants.ts": 'export const chipVariants = tv({ variants: { tone: { soft: "bg-accent/15" } } });\n',
        "packages/ui/src/primitives/one/one.tsx": 'export const One = (): unknown => <span {...variantProps(chipVariants, { tone: "solid" })} />;\n',
      },
      expect: { token: "chipVariants", count: 2 },
      why: "A3: one stamped name, two recipes — the stamp on ONE of them would silently vouch for the other; both are named",
    },
  ],
  mustPass: [
    {
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
      files: {
        [AXIS_HOME_REL]:
          'export const STAMPED_VARIANT_AXES = ["variant", "size", "intent", "tone"] as const;\nexport function variantProps(): string {\n  return "";\n}\n',
        "packages/ui/src/primitives/thing/variants.ts":
          'export const thingVariants = tv({ slots: { root: "flex", label: "truncate" }, variants: { tone: { solid: "bg-accent" } } });\n',
        "packages/ui/src/primitives/thing/thing.tsx":
          'export const Thing = (): unknown => <div {...variantAttrs(thingVariants, { tone: "solid" })} className={thingVariants({ tone: "solid" }).root()} />;\n',
      },
      why: "the SLOT-recipe door: a multi-slot recipe composes its own classNames and takes the attrs door — passes",
    },
    {
      files: {
        [AXIS_HOME_REL]:
          'export const STAMPED_VARIANT_AXES = ["variant", "size", "intent", "tone"] as const;\nexport function variantProps(): string {\n  return "";\n}\n',
        "packages/ui/src/primitives/thing/variants.ts":
          'export const thingVariants = tv({ variants: { shape: { pill: "rounded-full" }, density: { tight: "gap-tight" } } });\n',
      },
      why: "a recipe with NO stamped axis: `shape`/`density` are not part of the walker's identity vocabulary — passes, and stays out of the DOM",
    },
    {
      files: {
        [AXIS_HOME_REL]:
          'export const STAMPED_VARIANT_AXES = ["variant", "size", "intent", "tone"] as const;\nexport function variantProps(): string {\n  return "";\n}\n',
        "packages/ui/src/lib/other.ts": 'export const helper = someOtherCall({ variants: { size: { sm: "x" } } });\n',
      },
      why: "DECLARED LIMIT: only a `tv()` initializer is a recipe — an unrelated call carrying a `variants` key is not one",
    },
    {
      files: {
        "packages/ui/src/primitives/thing/variants.ts": 'export const thingVariants = tv({ variants: { size: { sm: "h-control-sm" } } });\n',
      },
      why: "DECLARED LIMIT: with no axis vocabulary in the fileset the gate judges nothing — the blindness arm is REAL-TREE only (anchor-guarded, GATE-AUTHORING §4 rule 5), and is proven by a planted probe instead",
    },
  ],
};
