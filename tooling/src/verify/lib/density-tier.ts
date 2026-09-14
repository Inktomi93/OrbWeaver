// The SHARED module for the `density-tier` family (GATE-AUTHORING.md §2): the readers and canonical
// vocabulary the two final density policies judge. It holds NO permission of any kind.
//
// WHY THERE IS NO SANCTIONED-HOME TABLE HERE, and the precedent that misled this conversion. The legacy
// descriptor carried two path tables — `ELEVATED_ALLOW` (11 rows, the D6 floating-island family) and a
// single hardcoded `data-surface-tier` writer. The obvious port was an `ExemptionTable` in
// `lib/<family>.ts` read by an occurrence policy plus a `-health` rename tripwire, which
// `lib/raw-typography-tier.ts`'s own header presents as the owner-ruled shape (#2096). THAT SHAPE IS
// REJECTED BY A LIVE POLICY: `policy-legacy-imports` reds "a FINAL policy module receives a binding typed
// to carry canonical exemption data through an import door (#2320)" wherever the imported binding's data
// graph reaches `contract/gate.ts`'s `ExemptionTable`/`ExemptionRow` — eight live findings across four
// families on this tree, including BOTH halves of that precedent. So both tables became exact reviewed
// grants instead, which is what standing law §5 says in the first place, and the family is TWO policies:
// `density-tier` and `density-tier-slot-map`, sharing the `jsxAttributeLiterals` callable and the
// `UI_SOURCE_ROOT` declaration through their production hooks.
//
// COMMENT POSTURE: AST-safe on the source side (ts-morph nodes and JSX attribute literals, never file
// text). The CSS side is comment-BLIND through the shared reader: `parseCssStylesheet` blanks comments
// before it parses, so a `[data-slot="…"]` selector written inside a CSS comment is not a rule and never
// enters the mapped vocabulary. The legacy gate blanked comments itself for exactly that reason; the
// guarantee now rides the `product-css` resource and its proof row still pins it.
import type { JsxOpeningElement, JsxSelfClosingElement, Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { TIERS } from "../contract/css-family.ts";
import type { CssFacts } from "../contract/resource-css.ts";

/** The `@orb/ui` source root — the primitive tier the slot-map arms fence on, and the family declaration
 *
 *  IT IS A LITERAL, NOT AN ALIAS, AND THAT IS FORCED (#2320). Writing it as
 *  `POPULATION_ROOTS["@ui"][0]` makes it an export aliasing another binding, and
 *  `policy-legacy-imports` fail-closes on exactly that shape — "export UI_SOURCE_ROOT aliases another
 *  binding whose canonical origin is not proven" — which WITHHOLDS that policy for the whole corpus rather
 *  than reporting a finding (measured on this tree at conversion). The two-sided guard is instead a family
 *  arm asserting this literal EQUALS `POPULATION_ROOTS["@ui"][0]`, so a root respelling reds in a test
 *  naming both sides rather than silently un-fencing the primitive tier. */
export const UI_SOURCE_ROOT = "packages/ui/src/";

/** The feature call-site tier the internal-type-axis rule (A3) is scoped to. It is a SEMANTIC boundary, not
 *  an exemption: `<Text voice>` is the feature API and `size`/`weight`/`tone`/`transform` are the internal
 *  axes the voices are built from, so a client-shared composite one level up is not a feature call site
 *  (UI-Density-Law.md §2.3). It is not expressible as a population root — `@client` has no sub-root — and
 *  it subtracts nothing from the population, which is what keeps the other three arms judging those files. */
const FEATURES_TIER = "packages/client/src/features/";

/** ONE candidate occurrence of the density law, carrying the reviewed-grant identity central reconciliation
 *  matches on. `subject` is the repo-relative file; `operation` is the licensed ACT, which is what makes a
 *  NEW KIND of density violation in an already-granted file fire instead of being consumed silently. */
export interface DensityOccurrence {
  readonly node: Node;
  readonly subject: string;
  readonly operation: string;
  /** The EXACT authored slice at the reported coordinate, with its offset inside the carrier's own text.
   *  Carried only by A1, and it is not decoration: a `rounded-card` inside a TEMPLATE PART has no derivable
   *  identity token, so the sink's scanner throws "cannot derive a nonempty authored position token from
   *  TemplateHead" and WITHHOLDS the whole policy. Measured on this tree the day the elevated-family path
   *  skip was replaced by grants, which is what first let a template carrier reach the reporter. */
  readonly token?: string;
  readonly offset?: number;
}

const A1_TOKEN = "rounded-card";
const CLASS_STRING_CALLEES: ReadonlySet<string> = new Set(["cn", "clsx", "cva", "tv"]);
const INTERNAL_TEXT_PROPS: ReadonlySet<string> = new Set(["size", "weight", "tone", "transform"]);
const TEXT_TAGS: ReadonlySet<string> = new Set(["Text", "Heading"]);
const WHITESPACE_RE = /\s+/u;
const BORDER_RE = /(?:^|\s|:)border(?:-|$|\s)/u;
const RADIUS_RE = /(?:^|\s|:)rounded(?:-|$|\s)/u;
const BG_RE = /(?:^|\s|:)bg-/u;

const CLASS_STRING_KINDS = [
  SyntaxKind.StringLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateHead,
  SyntaxKind.TemplateMiddle,
  SyntaxKind.TemplateTail,
];

/** THE CARRIER FENCE: `rounded-card` is only a class where classes live — a `className=` attribute value,
 *  or a string argument at any depth of a `cn`/`clsx`/`cva`/`tv` call (so a `tv({slots:{…}})` variant map is
 *  INSIDE the fence). The same scoping `no-off-token-radius-shadow` uses. */
function isClassStringSite(node: Node): boolean {
  const jsxAttr = node.getFirstAncestorByKind(SyntaxKind.JsxAttribute);
  if (jsxAttr !== undefined && jsxAttr.getNameNode().getText() === "className") {
    return true;
  }
  const call = node.getFirstAncestorByKind(SyntaxKind.CallExpression);
  return call !== undefined && CLASS_STRING_CALLEES.has(call.getExpression().getText());
}

/** The offset of every `rounded-card` class TOKEN inside one carrier node's own text, variant prefixes
 *  stripped. The offset is what lets the finding name an exact authored slice instead of asking the sink to
 *  scan a token out of the carrier — which it cannot do for a template part. `+ 1` because the search runs
 *  over the node text minus its opening delimiter. */
function radiusHitOffsets(nodeText: string): readonly number[] {
  const stripped = nodeText.slice(1, -1);
  const out: number[] = [];
  let cursor = 0;
  for (const part of stripped.split(WHITESPACE_RE)) {
    const at = stripped.indexOf(part, cursor);
    cursor = at + part.length;
    if ((part.split(":").at(-1) ?? part) === A1_TOKEN) {
      out.push(at + 1 + (part.length - A1_TOKEN.length));
    }
  }
  return out;
}

type JsxTag = JsxOpeningElement | JsxSelfClosingElement;

/** Every class string LITERALLY visible on one JSX element's own `className` — the box-in-box reader's
 *  input. A className assembled elsewhere is the module header's declared blind spot. */
function ownClassText(element: JsxTag): string {
  const attr = element
    .getAttributes()
    .filter((a) => a.getKind() === SyntaxKind.JsxAttribute)
    .map((a) => a.asKindOrThrow(SyntaxKind.JsxAttribute))
    .find((a) => a.getNameNode().getText() === "className");
  if (attr === undefined) {
    return "";
  }
  const literals = [...attr.getDescendantsOfKind(SyntaxKind.StringLiteral), ...attr.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral)];
  return literals.map((l) => l.getLiteralText()).join(" ");
}

/** border + radius + background all present — "this element is a BOX". */
function isBox(classText: string): boolean {
  return BORDER_RE.test(classText) && RADIUS_RE.test(classText) && BG_RE.test(classText);
}

/** Every JSX tag (opening + self-closing) of one file. */
function jsxElements(sf: SourceFile): readonly JsxTag[] {
  return [...sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement), ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)];
}

/** A1 — `rounded-card` at a class-string site. EVERY site is a candidate, including the ELEVATED/floating
 *  family D6 rules it correct for: that family is now twelve exact reviewed grants rather than a path
 *  subtraction, so the permission is visible, cited, and STALE the day its last site disappears — the
 *  mode-A liveness the legacy `ELEVATED_ALLOW` sweep hand-rolled. */
function radiusOccurrences(sf: SourceFile, rel: string): readonly DensityOccurrence[] {
  const out: DensityOccurrence[] = [];
  for (const kind of CLASS_STRING_KINDS) {
    for (const node of sf.getDescendantsOfKind(kind)) {
      if (!isClassStringSite(node)) {
        continue;
      }
      for (const offset of radiusHitOffsets(node.getText())) {
        out.push({ node, subject: rel, operation: "elevated-radius", token: A1_TOKEN, offset });
      }
    }
  }
  return out;
}

/** A2 — a box whose JSX ancestor in the same file is also a box (chrome diet CD2).
 *
 *  The walk starts ABOVE the element's own `JsxElement` wrapper: a non-self-closing tag's `getParent()` IS
 *  the `JsxElement` whose `getOpeningElement()` is that same tag, so walking from there made every paired
 *  box report ITSELF as its own ancestor. Fixed 2026-08-01 (S2); the paired-tag `mustPass` row pins it. */
function boxInBoxOccurrences(sf: SourceFile, rel: string): readonly DensityOccurrence[] {
  const out: DensityOccurrence[] = [];
  for (const element of jsxElements(sf)) {
    if (!isBox(ownClassText(element))) {
      continue;
    }
    const self: Node = element.getKind() === SyntaxKind.JsxOpeningElement ? element.getParent() : element;
    let ancestor: Node | undefined = self.getParent();
    let nested = false;
    while (ancestor !== undefined && !nested) {
      const jsxElement = ancestor.asKind(SyntaxKind.JsxElement);
      const opening = jsxElement?.getOpeningElement();
      nested = opening !== undefined && isBox(ownClassText(opening));
      ancestor = ancestor.getParent();
    }
    if (nested) {
      out.push({ node: element, subject: rel, operation: "box-in-box" });
    }
  }
  return out;
}

/** A3 — a FEATURE call site passing an `@orb/ui`-internal type axis to `<Text>`/`<Heading>`. One occurrence
 *  per AXIS, and the axis is the grant OPERATION: a file ruled for its `size` choice is not thereby ruled
 *  for a `transform` someone adds later. */
function textVoiceOccurrences(sf: SourceFile, rel: string): readonly DensityOccurrence[] {
  if (!rel.startsWith(FEATURES_TIER)) {
    return [];
  }
  const out: DensityOccurrence[] = [];
  for (const element of jsxElements(sf)) {
    if (!TEXT_TAGS.has(element.getTagNameNode().getText())) {
      continue;
    }
    for (const attr of element.getAttributes()) {
      const jsxAttr = attr.asKind(SyntaxKind.JsxAttribute);
      const name = jsxAttr?.getNameNode().getText() ?? "";
      if (jsxAttr !== undefined && INTERNAL_TEXT_PROPS.has(name)) {
        out.push({ node: jsxAttr, subject: rel, operation: `text-axis:${name}` });
      }
    }
  }
  return out;
}

/** Every `<attr>="literal"` JSX attribute of one file, as (value → the attribute node). The callable the
 *  tier-writer arm and the rogue-slot arm share: both ask "which files stamp this data attribute, and with
 *  what literal value". */
export function jsxAttributeLiterals(sf: SourceFile, attributeName: string): readonly { readonly value: string; readonly node: Node }[] {
  const out: { value: string; node: Node }[] = [];
  for (const attr of sf.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
    if (attr.getNameNode().getText() !== attributeName) {
      continue;
    }
    const literal = attr.getInitializer()?.asKind(SyntaxKind.StringLiteral);
    out.push({ value: literal?.getLiteralText() ?? "", node: attr });
  }
  return out;
}

/** A4 — the tier attribute, wherever it is written. The ONE sanctioned writer is a reviewed grant, not a
 *  hardcoded path skip: born sealed means a second writer is a REVIEW event, and a review event is exactly
 *  what an exact `(subject, operation)` row is. */
function tierWriterOccurrences(sf: SourceFile, rel: string): readonly DensityOccurrence[] {
  return jsxAttributeLiterals(sf, "data-surface-tier").map(({ node }) => ({ node, subject: rel, operation: "surface-tier-write" }));
}

/** Every density occurrence of one file, in a deterministic order. The four arms the occurrence policy
 *  reports; the slot-map arms are whole-population questions and live in the sibling. */
export function densityOccurrences(sf: SourceFile, rel: string): readonly DensityOccurrence[] {
  return [...radiusOccurrences(sf, rel), ...boxInBoxOccurrences(sf, rel), ...textVoiceOccurrences(sf, rel), ...tierWriterOccurrences(sf, rel)];
}

/** ONE tier-mapped slot name and the coordinate of the first selector that maps it. */
export interface MappedSlot {
  readonly slot: string;
  readonly file: string;
  readonly line: number;
}

/** The slot names the LIVE tier map keys on, read from the parsed `product-css` inventory rather than a
 *  hand-listed copy: a hand-listed copy is a second map that drifts, and a drifted copy would police slots
 *  the stylesheet stopped mapping. Fenced to `tiers.css`, the sheet that IS the map — a `data-slot` hook in
 *  another product home is that home's business. */
export function mappedSlots(css: CssFacts): readonly MappedSlot[] {
  const seen = new Map<string, MappedSlot>();
  for (const hook of css.selectorHooks) {
    if (hook.file !== TIERS || hook.kind !== "data" || hook.name !== "data-slot" || hook.operator !== "=" || hook.value === undefined) {
      continue;
    }
    if (!seen.has(hook.value)) {
      seen.set(hook.value, { slot: hook.value, file: hook.file, line: hook.line });
    }
  }
  return [...seen.values()];
}
