// Gate: density-tier (docs/design/density-pass-spec.md §5.1) — the assignment law the token SCALES never
// had. Four rules, each a measured defect from the 2026-07-31 audit:
//   A1 radius-by-class — `rounded-card` is the ELEVATED/floating step only (D6). 45 of 51 non-pill radius
//      choices in client/ were the largest step, which is what makes every surface read as boxes-in-boxes.
//   A2 box-in-box     — a border+radius+background triple nested inside another one (chrome diet CD2).
//   A3 text-voice     — a feature passing `size`/`weight`/`tone`/`transform` to <Text>/<Heading>: those are
//      the @orb/ui-INTERNAL axes the four voices are built from (§2.3). 336 taste combinations is the
//      mechanism by which nothing on a surface recedes; features pass `voice`.
//   A4 tier writer    — `data-surface-tier` outside `packages/ui/src/layout/surface.tsx`. Born sealed: NO
//      baseline, zero tolerance (two writers = two disagreeing density maps).
//   A5 stale entry    — a baseline row whose file no longer violates (ratchet down, both ways).
//
// TRANSITION RATCHET (§5.2, the `no-test-fabrication` idiom): A1–A3 are budgeted per file by
// density-tier.baseline.json — a file violates only when its LIVE count EXCEEDS its committed budget, and
// only the EXCESS is reported. Landing at the current baseline is therefore zero-new and blocks nothing;
// every sweep stage regenerates the baseline DOWNWARD (`pnpm tsx scripts/check/gen-density-baseline.ts`)
// in the same commit. A baseline that GROWS in a diff is a review-blocking defect. Terminal state: `{}`,
// the file deleted, this gate flipped to born-compliant.
//
// DECLARED BLIND SPOT — this is a LITERAL-SHAPE reader. It sees string literals, template parts, and
// `tv()`/`cva()` object literals inside `className=` / `cn`/`clsx`/`cva`/`tv` calls. A className assembled
// from a variable, a conditional, or `cn(cond && STYLES)` where the classes live in another module is
// INVISIBLE to it, and an AST reader blind to computed shapes reports a silent GREEN. That is why the
// computed-value CTs (tests/ui/density-tier.suite.ct.tsx, spec §5.3) are the REQUIRED second lens, not a
// nice-to-have: they read back what the browser resolved.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { JsxOpeningElement, JsxSelfClosingElement, Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { Finding, GateDescriptor, GateRunCtx } from "../contract.ts";

const BASELINE_REL = "scripts/check/gates/density-tier.baseline.json";
const GATE_SELF = "scripts/check/gates/density-tier.ts";
const TIER_WRITER = "packages/ui/src/layout/surface.tsx";
const FEATURES_DIR = "packages/client/src/features/";

/** Files where `rounded-card` is CORRECT: the elevated/floating families (§2.1 — modal, popover, drawer,
 *  toast, composer, the chat bubble, the `elevated` opt-in itself). Everything else ratchets. */
const ELEVATED_ALLOW: readonly string[] = [
  "packages/ui/src/lib/popup-surface.ts",
  "packages/ui/src/primitives/card/",
  "packages/ui/src/primitives/command/",
  "packages/ui/src/primitives/macro-textarea/",
  "packages/ui/src/primitives/menu/",
  "packages/ui/src/primitives/popover/",
  "packages/ui/src/primitives/selection-bar/",
  "packages/ui/src/primitives/toast/",
  "packages/ui/src/content/immersive-card/",
  "packages/client/src/features/chat/components/composer.tsx",
  "packages/client/src/features/chat/lib/message-row-variants.ts",
  "packages/client/src/features/chat/lib/message-row-backing.ts",
  "packages/client/src/features/chat/surfaces/command-palette-surface.tsx",
];

const MESSAGE =
  "density-tier violation (docs/design/density-pass-spec.md §3/§5.1): `rounded-card` outside the ELEVATED " +
  "family (D6 — it is the floating-island step: modal/popover/drawer/toast/composer/chat bubble), a " +
  "border+radius+background box nested inside another one (CD2 — one box deep, maximum), a feature passing " +
  "the @orb/ui-internal type axes instead of `voice` (§2.3), or a second writer of `data-surface-tier`.";

const FIX =
  "rounded-card → rounded-base (grouped content inside a surface) / rounded-control (anything you operate) / " +
  "rounded-inset (a sub-control mark), or wrap the surface in <Surface tier> and let tiers.css resolve it; " +
  "un-nest the inner box (hairlines + gaps separate INSIDE a box, never a nested card); <Text size=… weight=…> " +
  '→ <Text voice="kicker|label|datum|gloss">; write data-surface-tier ONLY via <Surface>.';

const A1_TOKEN = "rounded-card";
const CLASS_STRING_CALLEES: ReadonlySet<string> = new Set(["cn", "clsx", "cva", "tv"]);
const INTERNAL_TEXT_PROPS: ReadonlySet<string> = new Set(["size", "weight", "tone", "transform"]);
const TEXT_TAGS: ReadonlySet<string> = new Set(["Text", "Heading"]);
const WHITESPACE_RE = /\s+/u;
const BORDER_RE = /(?:^|\s|:)border(?:-|$|\s)/u;
const RADIUS_RE = /(?:^|\s|:)rounded(?:-|$|\s)/u;
const BG_RE = /(?:^|\s|:)bg-/u;

function repoRel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/** Is this literal/template part a class-string carrier — a `className=` attribute value, or a string arg
 *  (at any depth, e.g. inside a `tv({slots:{…}})` object) of `cn`/`clsx`/`cva`/`tv`? Same scoping as
 *  `no-off-token-radius-shadow`: `rounded-card` is only a class where classes live. */
function isClassStringSite(node: Node): boolean {
  const jsxAttr = node.getFirstAncestorByKind(SyntaxKind.JsxAttribute);
  if (jsxAttr !== undefined && jsxAttr.getNameNode().getText() === "className") {
    return true;
  }
  const call = node.getFirstAncestorByKind(SyntaxKind.CallExpression);
  return call !== undefined && CLASS_STRING_CALLEES.has(call.getExpression().getText());
}

/** The offset of `rounded-card` inside a class-carrier node's text (one past the stripped delimiter), for
 *  each occurrence — so the caret lands on the token, not the line start. */
function radiusHits(nodeText: string): number[] {
  const stripped = nodeText.slice(1, -1);
  const out: number[] = [];
  let cursor = 0;
  for (const part of stripped.split(WHITESPACE_RE)) {
    const at = stripped.indexOf(part, cursor);
    cursor = at + part.length;
    if ((part.split(":").at(-1) ?? part) === A1_TOKEN) {
      out.push(at + 1);
    }
  }
  return out;
}

type JsxTag = JsxOpeningElement | JsxSelfClosingElement;

/** Every class string LITERALLY visible on one JSX element's own `className` (its attribute value plus any
 *  literal inside a `cn(...)` in that attribute) — the box-in-box reader's input. */
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
function jsxElements(sf: SourceFile): JsxTag[] {
  return [...sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement), ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)];
}

/** A1 — `rounded-card` outside the elevated allowlist. */
function radiusFindings(sf: SourceFile, rel: string): Finding[] {
  if (ELEVATED_ALLOW.some((allowed) => rel.startsWith(allowed))) {
    return [];
  }
  const out: Finding[] = [];
  const kinds = [
    SyntaxKind.StringLiteral,
    SyntaxKind.NoSubstitutionTemplateLiteral,
    SyntaxKind.TemplateHead,
    SyntaxKind.TemplateMiddle,
    SyntaxKind.TemplateTail,
  ];
  for (const kind of kinds) {
    for (const node of sf.getDescendantsOfKind(kind)) {
      if (!isClassStringSite(node)) {
        continue;
      }
      for (const _offset of radiusHits(node.getText())) {
        out.push({ file: rel, line: node.getStartLineNumber(), column: node.getStart() - node.getStartLinePos() + 1, token: A1_TOKEN });
      }
    }
  }
  return out;
}

/** A2 — a box whose JSX ancestor in the same file is also a box. */
function boxInBoxFindings(sf: SourceFile, rel: string): Finding[] {
  const out: Finding[] = [];
  for (const element of jsxElements(sf)) {
    if (!isBox(ownClassText(element))) {
      continue;
    }
    let ancestor: Node | undefined = element.getParent();
    let nested = false;
    while (ancestor !== undefined && !nested) {
      const jsxElement = ancestor.asKind(SyntaxKind.JsxElement);
      const opening = jsxElement?.getOpeningElement();
      nested = opening !== undefined && isBox(ownClassText(opening));
      ancestor = ancestor.getParent();
    }
    if (nested) {
      out.push({ file: rel, line: element.getStartLineNumber(), column: element.getStart() - element.getStartLinePos() + 1, token: "box-in-box" });
    }
  }
  return out;
}

/** A3 — a FEATURE passing an @orb/ui-internal type axis to <Text>/<Heading>. */
function textVoiceFindings(sf: SourceFile, rel: string): Finding[] {
  if (!rel.startsWith(FEATURES_DIR)) {
    return [];
  }
  const out: Finding[] = [];
  for (const element of jsxElements(sf)) {
    if (!TEXT_TAGS.has(element.getTagNameNode().getText())) {
      continue;
    }
    for (const attr of element.getAttributes()) {
      const jsxAttr = attr.asKind(SyntaxKind.JsxAttribute);
      const name = jsxAttr?.getNameNode().getText() ?? "";
      if (jsxAttr !== undefined && INTERNAL_TEXT_PROPS.has(name)) {
        out.push({ file: rel, line: jsxAttr.getStartLineNumber(), column: jsxAttr.getStart() - jsxAttr.getStartLinePos() + 1, token: name });
      }
    }
  }
  return out;
}

/** A4 — the tier attribute, written anywhere but the Surface primitive. NOT budgeted: born sealed. */
function tierWriterFindings(sf: SourceFile, rel: string): Finding[] {
  if (rel === TIER_WRITER) {
    return [];
  }
  const out: Finding[] = [];
  for (const attr of sf.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
    if (attr.getNameNode().getText() === "data-surface-tier") {
      out.push({
        file: rel,
        line: attr.getStartLineNumber(),
        column: attr.getStart() - attr.getStartLinePos() + 1,
        token: "data-surface-tier",
        message: `data-surface-tier is written outside ${TIER_WRITER} — the tier attribute has exactly ONE writer (<Surface tier>), or two surfaces disagree about the density map (density-pass-spec.md §4.1).`,
      });
    }
  }
  return out;
}

/** The BUDGETED arms (A1–A3) of one file, in a deterministic order so `slice(budget)` reports the same
 *  excess on every run. */
export function densityFindings(sf: SourceFile, rel: string): Finding[] {
  return [...radiusFindings(sf, rel), ...boxInBoxFindings(sf, rel), ...textVoiceFindings(sf, rel)].sort((a, b) => a.line - b.line || a.column - b.column);
}

export function loadBaseline(root: string): Record<string, number> {
  const path = join(root, BASELINE_REL);
  if (!existsSync(path)) {
    return {};
  }
  return JSON.parse(readFileSync(path, "utf-8")) as Record<string, number>;
}

let passBaseline: Record<string, number> = {};
const passSeenViolating = new Set<string>();

export const gate: GateDescriptor = {
  name: "density-tier",
  docRow: "docs/design/density-pass-spec.md §5.1 (the density pass)",
  status: "active",
  scopeSafety: "whole-project", // the baseline budget is a per-file whole-tree count
  message: MESSAGE,
  fix: FIX,
  // The `no-off-token-radius-shadow` form — it makes NO assumption about a leading slash (the two existing
  // gates disagree on that, and a wrong path format is a SILENT GREEN, not a red).
  scanRoot: (p) => p.includes("packages/client/src/") || p.includes("packages/ui/src/"),
  begin: (ctx: GateRunCtx) => {
    passBaseline = loadBaseline(ctx.root);
    passSeenViolating.clear();
  },
  visitFile: (sf, ctx) => {
    const rel = repoRel(sf.getFilePath());
    for (const finding of tierWriterFindings(sf, rel)) {
      ctx.report(finding);
    }
    const findings = densityFindings(sf, rel);
    if (findings.length > 0) {
      passSeenViolating.add(rel);
    }
    const budget = passBaseline[rel] ?? 0;
    for (const finding of findings.slice(budget)) {
      ctx.report(finding);
    }
  },
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project") {
      return; // a stale-entry claim is whole-tree — never fire it below project scope
    }
    for (const rel of Object.keys(passBaseline)) {
      if (!passSeenViolating.has(rel)) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${BASELINE_REL} budgets "${rel}" but that file no longer violates — the ratchet only goes down: regenerate it (pnpm tsx scripts/check/gen-density-baseline.ts) and commit the shrink.`,
        });
      }
    }
  },

  mustFlag: [
    {
      files: `export const G = <div className="rounded-card border border-border bg-card" />;\n`,
      at: "packages/client/src/x.tsx",
      // A SHALLOW path — with A1 (rounded-card) firing; the box-in-box arm needs an ancestor box, so one finding.
      expect: { count: 1 },
      why: "A1 at a shallow path: `rounded-card` outside the elevated family, with no baseline budget",
    },
    {
      files: `export const G = <div className="rounded-base border border-border bg-card"><span className="rounded-base border border-border bg-muted" /></div>;\n`,
      at: "packages/client/src/features/deep/nested/components/inner/box.tsx",
      expect: { messageIncludes: "nested inside another" },
      why: "A2 at a DEEPLY NESTED path (proves the matcher, §5.1): a box inside a box — chrome diet CD2",
    },
    {
      files: `export const G = <Text size="micro" tone="muted">x</Text>;\n`,
      at: "packages/client/src/features/rpg/components/thing.tsx",
      expect: { count: 2 },
      why: "A3: a feature passing two @orb/ui-internal type axes — one finding per axis, `voice` is the feature API",
    },
    {
      files: `export const G = <div data-surface-tier="instrument" />;\n`,
      at: "packages/client/src/features/x/rogue.tsx",
      expect: { messageIncludes: "exactly ONE writer" },
      why: "A4: a second writer of the tier attribute — born sealed, no baseline, zero tolerance",
    },
    {
      files: `export const v = tv({ base: "rounded-card border border-border bg-card" });\n`,
      at: "packages/ui/src/primitives/thing/variants.ts",
      why: "A1 inside a tv() object literal — the variants-file shape a className-only scan misses",
    },
  ],
  mustPass: [
    {
      files: `export const G = <div className="rounded-base border border-border bg-card" />;\n`,
      at: "packages/client/src/x.tsx",
      why: "the grouped-content step at a shallow path — one box, correct radius: passes",
    },
    {
      files: `export const v = tv({ base: "rounded-card border border-border bg-popover" });\n`,
      at: "packages/ui/src/primitives/popover/variants.ts",
      why: "an ELEVATED family member (popover) — `rounded-card` is exactly right there: allowlisted, passes",
    },
    {
      files: `export const G = <Text voice="datum">42</Text>;\n`,
      at: "packages/client/src/features/deep/nested/components/inner/stat.tsx",
      why: "the four-voice API at a deeply nested feature path — what A3 exists to push callers onto: passes",
    },
    {
      files: `export const G = <Text size="micro">x</Text>;\n`,
      at: "packages/client/src/components/shared-thing.tsx",
      why: "A3 is FEATURES-scoped (client/src/features/**) — a client-shared composite is not a feature call site: passes",
    },
    {
      files: `export const Surface = (): unknown => <div data-surface-tier="instrument" />;\n`,
      at: "packages/ui/src/layout/surface.tsx",
      why: "the ONE sanctioned tier writer — the Surface primitive itself: passes",
    },
    {
      files: `export const label = "rounded-card is the elevated step";\n`,
      at: "packages/client/src/features/x/copy.ts",
      why: "the token as prose OUTSIDE a class-string site — the false positive the class-site scoping guards",
    },
  ],
};
