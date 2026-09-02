// Gate: no-floorless-control-in-wrap — a FLOORLESS-size Button (`inline`/`glyph-*`: no control box, the touch
// floor rides an OVERFLOWING ::after) repeated inside a `flex-wrap` container is a COLLISION GENERATOR: on a
// wrapped row pitch the pseudos overlap and the row BELOW wins hit-testing (weather picker, measured 320px:
// aiming `clear` committed `snow` — no boundingBox CT can see it, only elementFromPoint). Arms: MAPPED child or
// ≥2 literal floorless siblings · JUDGMENT_DEFERRED stale (both modes) · variants-vocabulary tripwire ·
// the VERTICAL-PITCH arm (#884 C3, #850's class — 28 P1s): a `Stack` whose direct children resolve to ≥2
// rows each carrying a floorless Button (a `.map` child counts as 2; one level of SAME-FILE component
// indirection is resolved) stacks sub-floor rows — every GAP token is below the coarse touch floor (max
// `gutter` = 32px < 44px, tokens.json), so the gap attr is deliberately not read; if a ≥floor gap token is
// ever minted, re-derive this arm. Escapes: `rows="control"` on the Stack (layout/variants.ts — the
// one-token fix) or every counted row carrying its own `min-h-touch-target`/`min-h-control-*`/
// `pointer-coarse:min-h-*`. DECLARED LIMITS: cross-file row components are invisible (the live
// rpg-stat-profile-editor rows are TrackerValue/HintEditor imports — the founding shape is proven by the
// same-file fixture); className via variable is invisible (LIMIT-1's class).
import type { JsxElement, Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ExemptionRow, ExemptionTable, GateDescriptor } from "../contract/gate.ts";
import { blankTsComments } from "../lib/comment-spans.ts";
import { fileLoaded } from "../lib/pass.ts";

/** The Button size arms whose box is BELOW the touch floor and whose hit area is the overflowing ::after —
 *  kept honest against the live source by the variants tripwire in `finalize`. */
const FLOORLESS = ["inline", "glyph-xs", "glyph-sm", "glyph-md", "glyph-lg"] as const;
const FLOORLESS_SET: ReadonlySet<string> = new Set(FLOORLESS);
/** The vocabulary's declaring source — if a key or the touch-target pseudo leaves this file, the gate REDS
 *  itself instead of going silently green (GATE-AUTHORING.md §4.6). */
const BUTTON_VARIANTS = "packages/ui/src/primitives/button/variants.ts";
const PSEUDO_TOKEN = "touch-target";
const GATE_SELF = "tooling/src/verify/gates/no-floorless-control-in-wrap.ts";
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
  "a floorless-size Button (`inline`/`glyph-*`) repeated at a SUB-FLOOR PITCH — the size arm carries its " +
  "touch floor in an OVERFLOWING ::after (28px fine / 44px coarse), so stacked/wrapped neighbours contest " +
  "the same pixels and the pseudo LOSES hit-testing to whatever flow content it lands on. Token `Stack` = " +
  "the vertical-pitch arm (#850's class: rows of inline-edit affordances in a Stack, each hit box its bare " +
  "text height because the pseudo lands on the neighbour row's text); a size-value token = the flex-wrap " +
  "arm (the ambient-strip weather picker, measured via elementFromPoint at 320px: aiming `clear` committed " +
  "`snow` — packages/client/src/components/tracker-blocks/ambient-strip.tsx records the fix).";
const FIX =
  'vertical pitch: `rows="control"` on the Stack (one token — floors every direct row, layout/variants.ts) ' +
  "or a per-row `min-h-touch-target`/`pointer-coarse:min-h-*`; a wrapping run: a control size (`sm`/`icon` " +
  "— the box IS the target). `inline`/`glyph-*` stay correct for a lone datum/glyph riding inside a row.";

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
      if (call.isKind(SyntaxKind.CallExpression)) {
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

// ─── the VERTICAL-PITCH arm (#884 C3) ───────────────────────────────────────────────────────────────

/** Does this subtree hold a floorless-size Button (literal size attr, Button tag)? */
function floorlessButtonIn(root: Node): boolean {
  return root.getDescendantsOfKind(SyntaxKind.JsxAttribute).some((attr) => {
    if (attr.getNameNode().getText() !== "size") {
      return false;
    }
    const init = attr.getInitializer();
    return init?.isKind(SyntaxKind.StringLiteral) === true && FLOORLESS_SET.has(init.getLiteralText()) && ownerIsButton(attr);
  });
}

/** One level of SAME-FILE component indirection: `<AttributeRow/>` → the body of a same-file
 *  `function AttributeRow(...)` or `const AttributeRow = (...) => …`. Cross-file tags resolve to nothing
 *  (declared limit). */
function sameFileComponentBody(sf: SourceFile, tagName: string): Node | undefined {
  const fn = sf.getFunction(tagName);
  if (fn !== undefined) {
    return fn.getBody();
  }
  const decl = sf.getVariableDeclaration(tagName);
  const init = decl?.getInitializer();
  return init !== undefined && (init.isKind(SyntaxKind.ArrowFunction) || init.isKind(SyntaxKind.FunctionExpression)) ? init.getBody() : undefined;
}

const ROW_FLOOR_RE = /\bmin-h-touch-target\b|\bmin-h-control-[a-z]+\b|pointer-coarse:min-h-[a-z-]+/u;

/** The row's OWN literal className carries a floor fence. Only the direct child's opening tag is read —
 *  a resolved component's root cannot be fenced from here (its escape is the Stack's `rows="control"`). */
function rowCarriesFloor(el: Node): boolean {
  const opening = el.isKind(SyntaxKind.JsxElement) ? el.getOpeningElement() : el;
  if (!(opening.isKind(SyntaxKind.JsxOpeningElement) || opening.isKind(SyntaxKind.JsxSelfClosingElement))) {
    return false;
  }
  const attr = opening.getAttribute("className");
  if (attr === undefined || !attr.isKind(SyntaxKind.JsxAttribute)) {
    return false;
  }
  return ROW_FLOOR_RE.test(attr.getText());
}

/** A direct JsxExpression child that is `{xs.map((x) => <El …/>)}` → the produced element, or undefined. */
function mappedElementOf(child: Node): Node | undefined {
  if (!child.isKind(SyntaxKind.JsxExpression)) {
    return;
  }
  const call = child.getExpression();
  if (call === undefined || !call.isKind(SyntaxKind.CallExpression)) {
    return;
  }
  const callee = call.getExpression();
  if (!(callee.isKind(SyntaxKind.PropertyAccessExpression) && MAP_CALLEE_RE.test(callee.getText()))) {
    return;
  }
  const cb = call.getArguments()[0];
  if (cb === undefined || !(cb.isKind(SyntaxKind.ArrowFunction) || cb.isKind(SyntaxKind.FunctionExpression))) {
    return;
  }
  const body = cb.getBody();
  const produced = body.isKind(SyntaxKind.ParenthesizedExpression) ? body.getExpression() : body;
  return produced.isKind(SyntaxKind.JsxElement) || produced.isKind(SyntaxKind.JsxSelfClosingElement) ? produced : undefined;
}

/** Does this row element (or its same-file component resolution) hold a floorless Button, unfenced? */
function countsAsFloorlessRow(sf: SourceFile, el: Node): boolean {
  if (rowCarriesFloor(el)) {
    return false;
  }
  if (floorlessButtonIn(el)) {
    return true;
  }
  const opening = el.isKind(SyntaxKind.JsxElement) ? el.getOpeningElement() : el;
  if (!(opening.isKind(SyntaxKind.JsxOpeningElement) || opening.isKind(SyntaxKind.JsxSelfClosingElement))) {
    return false;
  }
  const body = sameFileComponentBody(sf, opening.getTagNameNode().getText());
  return body !== undefined && floorlessButtonIn(body);
}

/** The pitch weight of one Stack: literal element children count 1, a `.map` child counts 2 (N runtime
 *  rows). ≥2 unfenced floorless rows = a sub-floor pitch population. */
function floorlessRowWeight(sf: SourceFile, stack: JsxElement): number {
  let weight = 0;
  for (const child of stack.getJsxChildren()) {
    if (child.isKind(SyntaxKind.JsxElement) || child.isKind(SyntaxKind.JsxSelfClosingElement)) {
      weight += countsAsFloorlessRow(sf, child) ? 1 : 0;
      continue;
    }
    const produced = mappedElementOf(child);
    if (produced !== undefined && countsAsFloorlessRow(sf, produced)) {
      weight += 2;
    }
  }
  return weight;
}

const STACK_ROWS_CONTROL_RE = /rows\s*=\s*(?:\{\s*)?["']control["']/u;

export const gate: GateDescriptor = {
  name: "no-floorless-control-in-wrap",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => p.startsWith("packages/client/src/") || p.startsWith("packages/ui/src/"),
  kinds: [SyntaxKind.JsxAttribute],
  // The VERTICAL-PITCH arm (#884 C3) — judged per Stack element, so it rides the per-file hook rather
  // than the size-attr subscription (the founding rows reach their Buttons through same-file components,
  // which no ancestor walk from the attr can see).
  visitFile: (sf, ctx) => {
    if (!sf.getFullText().includes("<Stack")) {
      return;
    }
    for (const el of sf.getDescendantsOfKind(SyntaxKind.JsxElement)) {
      const opening = el.getOpeningElement();
      if (opening.getTagNameNode().getText() !== "Stack" || STACK_ROWS_CONTROL_RE.test(opening.getText())) {
        continue;
      }
      if (floorlessRowWeight(sf, el) >= 2) {
        ctx.report(opening, { token: "Stack", offset: Math.max(opening.getText().indexOf("Stack"), 0) });
      }
    }
  },
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
      // CODE, not file text (issue #117/#132): this is a ROT tripwire, so a comment in variants.ts
      // naming a removed size arm would keep it reporting healthy while the vocabulary is dead.
      const text = blankTsComments(variants);
      for (const key of FLOORLESS) {
        if (!(text.includes(`${key}:`) || text.includes(`"${key}":`))) {
          ctx.report({
            file: GATE_SELF,
            line: 0,
            column: 0,
            message: `Button size arm \`${key}\` is no longer declared in ${BUTTON_VARIANTS} — the FLOORLESS vocabulary rotted; retarget it in tooling/src/verify/gates/no-floorless-control-in-wrap.ts`,
          });
        }
      }
      if (!text.includes(PSEUDO_TOKEN)) {
        ctx.report({
          file: GATE_SELF,
          line: 0,
          column: 0,
          message: `${BUTTON_VARIANTS} no longer spells the \`${PSEUDO_TOKEN}\` overflow pseudo — the floorless arms may have gained real boxes; re-derive FLOORLESS in tooling/src/verify/gates/no-floorless-control-in-wrap.ts`,
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
          message: `JUDGMENT_DEFERRED row matching NO live violation (the site was fixed or the file moved) — delete the stale row (${rel}) in tooling/src/verify/gates/no-floorless-control-in-wrap.ts`,
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
        [BUTTON_VARIANTS]:
          "// The floorless arms — inline, glyph-xs, glyph-sm, glyph-md, glyph-lg — rode the ::after touch-target.\nexport const buttonVariants = { size: { sm: 'h-control-sm' } };\n",
      },
      expect: { count: 6, messageIncludes: "no longer" },
      why: "COMMENT POSTURE (issue #117/#132): the tripwire reads CODE, so a HISTORY comment listing the deleted arms (the most natural thing to leave behind when you delete them) cannot report the vocabulary healthy. A rot tripwire satisfied by prose is worse than no tripwire — it reports ✓ over a dead gate",
    },
    {
      files: {
        "packages/db/src/schema/index.ts": "export const anchor = 1;\n",
      },
      expect: { count: 2, messageIncludes: "JUDGMENT_DEFERRED" },
      why: "mode B (§4.4a): the real tree's anchor is present but neither exempted file carries a live hit — both rows red as stale",
    },
    {
      // The VERTICAL-PITCH founding shape (#884 C3 — rpg-stat-profile-editor.tsx's geometry, spelled
      // same-file so the one-level component resolution can prove it): a Stack mapping a row component
      // whose body holds a floorless inline-edit Button — N runtime rows at a sub-floor pitch.
      files:
        "const ATTRS = ['a', 'b'];\n" +
        "function AttributeRow({ k }: { k: string }) {\n" +
        '  return (\n    <Row gap="field">\n      <span>{k}</span>\n      <Button size="inline">edit</Button>\n    </Row>\n  );\n}\n' +
        "export function Editor() {\n" +
        '  return (\n    <Stack gap="field">\n      {ATTRS.map((k) => (\n        <AttributeRow key={k} k={k} />\n      ))}\n    </Stack>\n  );\n}\n',
      at: "packages/client/src/features/rpg/components/pitch-editor.tsx",
      expect: { count: 1, token: "Stack" },
      why: "the vertical-pitch founding shape: a mapped same-file row component carrying an inline Button — #850's 28 P1s (rows of 18px hit boxes whose 28px pseudo lands on the neighbour row's text)",
    },
    {
      files:
        "export function TwoRows() {\n" +
        '  return (\n    <Stack gap="field">\n' +
        '      <Row><Button size="inline">a</Button></Row>\n      <Row><Button size="inline">b</Button></Row>\n' +
        "    </Stack>\n  );\n}\n",
      at: "packages/client/src/features/preset/components/two-rows.tsx",
      expect: { count: 1, token: "Stack" },
      why: "the LITERAL-rows spelling of the pitch arm: two direct rows each holding a floorless Button, no map needed",
    },
  ],
  mustPass: [
    {
      files:
        "export function TwoRows() {\n" +
        '  return (\n    <Stack gap="field" rows="control">\n' +
        '      <Row><Button size="inline">a</Button></Row>\n      <Row><Button size="inline">b</Button></Row>\n' +
        "    </Stack>\n  );\n}\n",
      at: "packages/client/src/features/preset/components/floored-stack.tsx",
      why: 'the pitch arm\'s ONE-TOKEN fix: `rows="control"` floors every direct row at the pointer-conditional control height (layout/variants.ts)',
    },
    {
      files:
        "export function FencedRows() {\n" +
        '  return (\n    <Stack gap="field">\n' +
        '      <Row className="pointer-coarse:min-h-touch-target"><Button size="inline">a</Button></Row>\n' +
        '      <Row className="min-h-control-sm"><Button size="inline">b</Button></Row>\n' +
        "    </Stack>\n  );\n}\n",
      at: "packages/client/src/features/preset/components/fenced-rows.tsx",
      why: "every counted row carries its OWN floor — the per-row spelling of the same fact passes",
    },
    {
      files:
        "export function OneRow() {\n" +
        '  return (\n    <Stack gap="field">\n' +
        '      <Row><Button size="inline">a</Button></Row>\n      <Row><span>plain text row</span></Row>\n' +
        "    </Stack>\n  );\n}\n",
      at: "packages/client/src/features/preset/components/one-row.tsx",
      why: "a SINGLE floorless row has no sub-floor neighbour to lend its pseudo to — no pitch population",
    },
    {
      files:
        'import { TrackerValue } from "#components/tracker-blocks";\n' +
        "const XS = ['a', 'b'];\n" +
        "export function CrossFile() {\n" +
        '  return (\n    <Stack gap="field">\n      {XS.map((x) => (\n        <TrackerValue key={x} />\n      ))}\n    </Stack>\n  );\n}\n',
      at: "packages/client/src/features/rpg/components/cross-file-rows.tsx",
      why: "DECLARED LIMIT: a CROSS-FILE row component (the live rpg-stat-profile-editor shape — TrackerValue/HintEditor imports) is invisible to the same-file resolution; the founding geometry is proven by the same-file fixture",
    },
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
