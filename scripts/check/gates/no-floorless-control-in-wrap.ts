// Gate: no-floorless-control-in-wrap — a FLOORLESS-size Button (`inline`/`glyph-*`: no control box, the touch
// floor rides an OVERFLOWING ::after) repeated inside a `flex-wrap` container is a COLLISION GENERATOR: on a
// wrapped row pitch the pseudos overlap and the row BELOW wins hit-testing (weather picker, measured 320px:
// aiming `clear` committed `snow` — no boundingBox CT can see it, only elementFromPoint). Arms: MAPPED child or
// ≥2 literal floorless siblings · JUDGMENT_DEFERRED stale (both modes) · variants-vocabulary tripwire.
import type { JsxElement, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ExemptionRow, ExemptionTable, GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

/** The Button size arms whose box is BELOW the touch floor and whose hit area is the overflowing ::after —
 *  kept honest against the live source by the variants tripwire in `finalize`. */
const FLOORLESS = ["inline", "glyph-xs", "glyph-sm", "glyph-md", "glyph-lg"] as const;
const FLOORLESS_SET: ReadonlySet<string> = new Set(FLOORLESS);
/** The vocabulary's declaring source — if a key or the touch-target pseudo leaves this file, the gate REDS
 *  itself instead of going silently green (GATE-AUTHORING.md §4.6). */
const BUTTON_VARIANTS = "packages/ui/src/primitives/button/variants.ts";
const PSEUDO_TOKEN = "touch-target";
const GATE_SELF = "scripts/check/gates/no-floorless-control-in-wrap.ts";
/** Real-tree anchor guarding the JUDGMENT_DEFERRED stale sweep — never planted by an example except the one
 *  proving mode B (§4.4a/§4.5). */
const REAL_TREE_ANCHOR = "packages/db/src/schema/index.ts";

const FLEX_WRAP_RE = /\bflex-wrap\b/u;
const MAP_CALLEE_RE = /\.map$/u;

/**
 * THE TWO SITES ARE FIXED AND STILL LISTED — and that is the point, not an oversight (owner ruling
 * 2026-08-07). The name is retained: the `Core-Enforcement-Active-Gates.md` row cites this symbol, and that
 * doc is a concurrent lane's file this pass, so renaming it would dangle the cite (`dangling-refs`).
 *
 * WHAT CHANGED. These rows were a REPORT-THEN-DECIDE ledger for two live hits this gate found at landing —
 * rpg-pack-rows' `ItemIconPicker` grid and rpg-actor-trackers' per-chip remove ✕ — held because resizing a
 * live control is a design change. side-eye measured both at 430 coarse, and the owner ruled: FIX BOTH, by
 * the SPACING options, not by a boxed size. Both are fixed at source: `pointer-coarse:gap-block` makes the
 * icon grid's pitch exactly 44 (hit 37×37 → 43×43), and `pointer-coarse:min-h-touch-target` on the condition
 * Badge makes the 44px pseudo fit INSIDE its own chip (hit 43×35 → floor cleared on every wrapped row).
 *
 * ⚑ SO WHY DO THE ROWS SURVIVE THE FIX? Because this gate's ARM is STRUCTURAL and the ruled fix is
 * GEOMETRIC. The arm asks "is a floorless-size Button mapped inside a `flex-wrap` container", and after the
 * fix the answer is still yes — the sizes are deliberately unchanged. Its `FIX` text names exactly one
 * remedy, a boxed control size, and the owner priced that remedy and declined it at both sites (+188px of
 * popover at the grid; a 48px control bar where a 30px chip run belongs). MEASURED: with the rows deleted,
 * `check:structure` reds at both files on the fixed tree. So these are now what an allowlist is actually
 * for — PERMANENT, deliberate, reasoned exemptions — and the honest alternative (teaching the arm to
 * recognise a coarse spacing floor as a second sanctioned remedy) is a real gate feature, flagged to the
 * orchestrator rather than improvised here.
 *
 * ⚑ AND THE MEASUREMENT CORRECTED THIS GATE'S OWN STATED HARM. Both rows originally asserted the gate's
 * general mechanism — adjacent 44px pseudos overlapping so that "aiming at one control commits its
 * neighbour". That is **measured FALSE at both sites** (real touch emulation, `elementFromPoint`, not
 * bounding boxes): all 21 icon cells hit THEMSELVES at centre + top + bottom + right edge, and a cross-chip
 * sample lands in the 6px inter-chip gap, never over a sibling. The harm came from the ambient-strip weather
 * picker, whose controls were `size="inline"` — a full-width pseudo on an ~18px-tall text button. A `glyph-*`
 * box of 30-32px puts the overflow in the GAP instead. The arm was right at both sites; its stated reason was
 * not. What reproduces on a boxed glyph is a touch-FLOOR shortfall, because the pseudo the floor rides on is
 * clipped by the gap it shares with the next cell. `MESSAGE` still leads with the collision — the founding
 * weather-picker case is real — but a future site must be judged against BOTH failure modes.
 */
const JUDGMENT_DEFERRED: ExemptionTable<ExemptionRow> = {
  "packages/client/src/features/rpg/components/rpg-pack-rows.tsx": {
    why:
      'ItemIconPicker: a MAPPED size="glyph-lg" icon grid in a flex-wrap popover. FIXED, geometrically, ' +
      "not structurally (owner ruling 2026-08-07): `pointer-coarse:gap-block` raises the coarse pitch to " +
      "exactly 44, so the effective hit box goes 37×37 → 43×43 and the FINE picker is untouched. The size " +
      "arm stays `glyph-lg` deliberately — the boxed-size remedy this gate's `fix` names was priced " +
      '(`size="icon"` ⇒ 3×7 cells, +188px of popover, and it grows the fine box 32→34) and declined. ' +
      "PERMANENT: this arm cannot see spacing, so it will keep matching a correctly-floored site.",
  },
  "packages/client/src/features/rpg/components/rpg-actor-trackers.tsx": {
    why:
      "ConditionChips: the per-condition glyph-xs remove ✕ inside mapped Badge chips in the flex-wrap " +
      "conditions row. FIXED, geometrically (owner ruling 2026-08-07): `pointer-coarse:min-h-touch-target` " +
      "on the Badge floors the CHIP at 44, which is the only priced option that fixes the cause — a 44px " +
      "hit area hanging off a 30px chip — so the pseudo now fits inside its own chip and the ✕'s 43×35 " +
      "effective box clears the floor on every wrapped row. The measured collision claim did NOT " +
      "reproduce here (a cross-chip sample lands in the 6px gap). Size arm stays `glyph-xs`: the boxed " +
      "remedy turns a 30px chip run into a 48px control bar. PERMANENT, same reason as rpg-pack-rows.",
  },
};

const seenDeferred = new Set<string>();

const MESSAGE =
  "a floorless-size Button (`inline`/`glyph-*`) repeated inside a `flex-wrap` container — the size arm " +
  "carries its touch floor in an OVERFLOWING ::after (28px fine / 44px coarse), so on a wrapped run's row " +
  "pitch adjacent hit areas OVERLAP and the row BELOW wins hit-testing: aiming at one control commits its " +
  "neighbour (the ambient-strip weather picker, measured via elementFromPoint at 320px — " +
  "packages/client/src/components/tracker-blocks/ambient-strip.tsx records the fix). A wrapping RUN of " +
  "controls needs a size whose BOX is the target.";
const FIX =
  "use a control size (`sm`/`icon` — the box IS the target, nothing overflows to collide) for controls in a " +
  "wrapping run; `inline`/`glyph-*` stay correct for a lone datum/glyph riding inside a row.";

/** The nearest enclosing JsxElement whose OPENING tag carries `flex-wrap` (same-file JSX tree only). */
function wrapContainerOf(node: Node): JsxElement | undefined {
  // ONE return path (the pass.ts accumulator idiom) — biome and noImplicitReturns disagree otherwise.
  let found: JsxElement | undefined;
  let cur: Node | undefined = node.getParent();
  while (cur !== undefined && found === undefined) {
    if (cur.isKind(SyntaxKind.JsxElement) && FLEX_WRAP_RE.test(cur.getOpeningElement().getText())) {
      found = cur;
    }
    cur = cur.getParent();
  }
  return found;
}

/** Is the element produced inside a `.map(...)` callback that sits WITHIN the wrap container? One source
 *  element then renders N runtime siblings — the collision population. */
function isMappedWithin(el: Node, container: JsxElement): boolean {
  let cur: Node | undefined = el.getParent();
  while (cur !== undefined && cur !== container) {
    if (cur.isKind(SyntaxKind.ArrowFunction) || cur.isKind(SyntaxKind.FunctionExpression)) {
      const call = cur.getParent();
      if (call?.isKind(SyntaxKind.CallExpression) === true) {
        const callee = call.getExpression();
        if (callee.isKind(SyntaxKind.PropertyAccessExpression) && MAP_CALLEE_RE.test(callee.getText())) {
          return true;
        }
      }
    }
    cur = cur.getParent();
  }
  return false;
}

/** Source-level count of floorless-size Buttons in the container's subtree (literal siblings arm). */
function floorlessCountIn(container: JsxElement): number {
  let n = 0;
  for (const attr of container.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
    if (attr.getNameNode().getText() !== "size") {
      continue;
    }
    const init = attr.getInitializer();
    if (init?.isKind(SyntaxKind.StringLiteral) === true && FLOORLESS_SET.has(init.getLiteralText()) && ownerIsButton(attr)) {
      n += 1;
    }
  }
  return n;
}

function ownerIsButton(attr: Node): boolean {
  const owner = attr.getFirstAncestor((a) => a.isKind(SyntaxKind.JsxSelfClosingElement) || a.isKind(SyntaxKind.JsxOpeningElement));
  if (owner === undefined || !(owner.isKind(SyntaxKind.JsxSelfClosingElement) || owner.isKind(SyntaxKind.JsxOpeningElement))) {
    return false;
  }
  return owner.getTagNameNode().getText() === "Button";
}

export const gate: GateDescriptor = {
  name: "no-floorless-control-in-wrap",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => p.startsWith("packages/client/src/") || p.startsWith("packages/ui/src/"),
  kinds: [SyntaxKind.JsxAttribute],
  begin: () => {
    seenDeferred.clear();
  },
  visit: (node, sf, ctx) => {
    if (!node.isKind(SyntaxKind.JsxAttribute) || node.getNameNode().getText() !== "size") {
      return;
    }
    const init = node.getInitializer();
    // DECLARED LIMIT: a Button re-exported/wrapped under another tag name, and a size reached through a
    // variable, are invisible to this literal-shape reader.
    if (init?.isKind(SyntaxKind.StringLiteral) !== true || !FLOORLESS_SET.has(init.getLiteralText()) || !ownerIsButton(node)) {
      return;
    }
    const owner = node.getFirstAncestor((a) => a.isKind(SyntaxKind.JsxSelfClosingElement) || a.isKind(SyntaxKind.JsxOpeningElement));
    if (owner === undefined) {
      return;
    }
    const container = wrapContainerOf(owner);
    if (container === undefined) {
      return;
    }
    if (!isMappedWithin(owner, container) && floorlessCountIn(container) < 2) {
      return; // a LONE floorless datum in a wrapping strip is the sanctioned display-at-rest arm
    }
    const rel = ctx.root.length > 0 && sf.getFilePath().startsWith(ctx.root) ? sf.getFilePath().slice(ctx.root.length + 1) : sf.getFilePath();
    if (rel in JUDGMENT_DEFERRED) {
      seenDeferred.add(rel);
      return;
    }
    const value = init.getLiteralText();
    ctx.report(node, { token: value, offset: Math.max(node.getText().indexOf(value), 0) });
  },
  finalize: (ctx) => {
    // Vocabulary tripwire — only judged where the declaring source is present (mini-projects skip unless
    // an example plants it deliberately).
    const variants = ctx.project.getSourceFile(`${ctx.root}/${BUTTON_VARIANTS}`);
    if (variants !== undefined) {
      const text = variants.getFullText();
      for (const key of FLOORLESS) {
        if (!(text.includes(`${key}:`) || text.includes(`"${key}":`))) {
          ctx.report({
            file: GATE_SELF,
            line: 0,
            column: 0,
            message: `Button size arm \`${key}\` is no longer declared in ${BUTTON_VARIANTS} — the FLOORLESS vocabulary rotted; retarget it in scripts/check/gates/no-floorless-control-in-wrap.ts`,
          });
        }
      }
      if (!text.includes(PSEUDO_TOKEN)) {
        ctx.report({
          file: GATE_SELF,
          line: 0,
          column: 0,
          message: `${BUTTON_VARIANTS} no longer spells the \`${PSEUDO_TOKEN}\` overflow pseudo — the floorless arms may have gained real boxes; re-derive FLOORLESS in scripts/check/gates/no-floorless-control-in-wrap.ts`,
        });
      }
    }
    // JUDGMENT_DEFERRED stale sweep — anchor-guarded; covers BOTH staleness modes (file fixed / file gone)
    // because `seenDeferred` fills only on a live match (§4.4a).
    if (!fileLoaded(ctx, REAL_TREE_ANCHOR)) {
      return;
    }
    for (const rel of Object.keys(JUDGMENT_DEFERRED)) {
      if (!seenDeferred.has(rel)) {
        ctx.report({
          file: GATE_SELF,
          line: 0,
          column: 0,
          message: `JUDGMENT_DEFERRED row matching NO live violation (the site was fixed or the file moved) — delete the stale row (${rel}) in scripts/check/gates/no-floorless-control-in-wrap.ts`,
        });
      }
    }
  },
  mustFlag: [
    {
      files:
        "const ICONS = ['a', 'b', 'c'];\n" +
        "export function IconGrid() {\n" +
        '  return (\n    <div className="max-w-64 flex-wrap">\n' +
        "      {ICONS.map((name) => (\n" +
        '        <Button key={name} size="glyph-lg">{name}</Button>\n' +
        "      ))}\n    </div>\n  );\n}\n",
      at: "packages/client/src/features/rpg/components/icon-grid.tsx",
      expect: { count: 1, messageIncludes: "flex-wrap" },
      why: "the founding geometry: ONE mapped floorless Button = N runtime siblings in a wrapping grid (the weather-picker/ItemIconPicker shape)",
    },
    {
      files:
        "export function TwoVerbs() {\n" +
        '  return (\n    <div className="flex-wrap">\n' +
        '      <Button size="inline">a</Button>\n      <Button size="inline">b</Button>\n' +
        "    </div>\n  );\n}\n",
      at: "packages/client/src/features/preset/components/two-verbs.tsx",
      expect: { count: 2 },
      why: "the LITERAL-siblings arm: two floorless controls sharing one wrapping container collide without any map",
    },
    {
      files: {
        [BUTTON_VARIANTS]: "export const buttonVariants = { size: { sm: 'h-control-sm' } };\n",
      },
      expect: { count: 6, messageIncludes: "no longer" },
      why: "the §4.6 blindness tripwire: the declaring variants file lost every floorless key AND the touch-target pseudo — five key reds + one pseudo red, never silent green",
    },
    {
      files: {
        "packages/db/src/schema/index.ts": "export const anchor = 1;\n",
      },
      expect: { count: 2, messageIncludes: "JUDGMENT_DEFERRED" },
      why: "mode B (§4.4a): the real tree's anchor is present but neither exempted file carries a live hit — both rows red as stale",
    },
  ],
  mustPass: [
    {
      files:
        "const SKIES = ['clear', 'snow'];\n" +
        "export function Picker() {\n" +
        '  return (\n    <div className="flex-wrap">\n' +
        '      {SKIES.map((s) => (\n        <Button key={s} size="sm">{s}</Button>\n      ))}\n    </div>\n  );\n}\n',
      at: "packages/client/src/components/tracker-blocks/ambient-strip.tsx",
      why: "the RULED fix shape (side-eye 2026-08-07): a control size in the wrapping run — the box IS the target",
    },
    {
      files:
        "export function Strip() {\n" +
        '  return (\n    <div className="flex-wrap">\n' +
        '      <span>Label</span>\n      <Button size="inline">the datum</Button>\n' +
        "    </div>\n  );\n}\n",
      at: "packages/client/src/components/tracker-blocks/tracker-value.tsx",
      why: "a LONE display-at-rest datum inside a wrapping strip is the inline arm's sanctioned job — no collision population",
    },
    {
      files:
        "const CHIPS = ['a', 'b'];\n" +
        "export function Chips() {\n" +
        '  return (\n    <div className="flex-wrap">\n' +
        '      {CHIPS.map((c) => (\n        <Badge key={c} size="inline">{c}</Badge>\n      ))}\n    </div>\n  );\n}\n',
      at: "packages/client/src/features/databank/components/databank-library-row.tsx",
      why: "Badge's `inline` is the IN-FLOW prose chip — not a control, no touch pseudo; only Button's floorless arms are guarded",
    },
    {
      files:
        "const ICONS = ['a', 'b'];\n" +
        "export function Grid() {\n" +
        '  return (\n    <div className="grid">\n' +
        '      {ICONS.map((c) => (\n        <Button key={c} size="glyph-md">{c}</Button>\n      ))}\n    </div>\n  );\n}\n',
      at: "packages/client/src/features/rpg/components/no-wrap-grid.tsx",
      why: "no `flex-wrap` ancestor — a non-wrapping run cannot stack pseudos across a wrapped row pitch (CSS grid spacing is its own axis, out of scope)",
    },
  ],
};
