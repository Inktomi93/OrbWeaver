// Gate: ui-size-via-variant (Core-Enforcement-Active-Gates.md Layer 3; ui-package-design.md — sizes are
// VARIANT axes on the primitive, never call-site utilities). A `className` on a JSX element whose
// component is imported from `@orb/ui` must not carry a SIZE/HEIGHT box utility (`h-*`, `min-h-*`,
// `size-*`, `w-*` with a numeric / custom-token / `auto` value): tailwind-merge cannot classify the
// custom-token utilities the primitives are built from (`h-control`, `size-icon`, …), so a call-site
// override neither reliably wins nor reliably loses — it resolves by stylesheet order. Three real
// incidents behind this gate: `size-auto` on Button (pre-F2), `h-auto` on TabsTab (pre-layout-variant),
// and the general custom-token-override class. The fix is a variant on the primitive, not a stronger
// class at the call site.
//
// Deliberately OUT of scope (the false-positive fence): `max-w-*` / `min-w-*` / `max-h-*` layout
// CONSTRAINTS; `min-h-0` (the flex-child overflow release, the height twin of `min-w-0`);
// keyword/proportional values (`full`/`fit`/`min`/`max`/`screen`/viewport units/fractions — layout
// decisions, not box sizes); arbitrary `[...]` values (already `no-arbitrary-tw-values`' beat); any
// class on a NON-@orb/ui element (raw HTML / feature-local components are other gates' jurisdiction);
// and the UNSIZED-BOX modules (`UNSIZED_BOX_SPECIFIERS` — layout kit / Skeleton / ThemeScope /
// CrossfadeImage), whose geometry is the call site's datum by design.
//
// Survivor mechanism (2026-08-01 founding sweep — 14 hits triaged): `ALLOWLIST` holds the SANCTIONED
// files (reason-cited, both-ways stale ratchet); `DEBT_BASELINE` holds the incident-class debt under a
// per-file count ratchet (over budget RED, under budget stale RED — terminal state `{}`, REACHED
// 2026-08-01 when the two choice-button sites moved onto Button's `size="wrap"`).
//
// DECLARED BLIND SPOT (literal-shape): only a literal `className="…"` / `className={"…"}` /
// no-substitution template is read — a computed/conditional className (cn(...), a template with
// substitutions, a spread) is invisible to this gate, as is a dotted (`Ns.Member`) or
// namespace-imported (`import * as UI`) tag. Same class as the other className gates.
import type { JsxOpeningElement, JsxSelfClosingElement, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

/** UNSIZED-BOX @orb/ui modules — components with NO size of their own, whose geometry IS the call
 *  site's datum, so a call-site box utility cannot fight a variant (there is none) and is the intended
 *  API: the layout kit (`Stack`/`Row`/… — the ONLY box a feature may size, since raw-HTML className is
 *  banned in features), `Skeleton` (mimics the content it stands in for), `ThemeScope` (a token-scope
 *  wrapper box), `CrossfadeImage` (media geometry — aspectRatio prop + call-site box, the D44 media
 *  primitive). A SIZED control primitive (button/tabs/select/input/badge/…) is never exempt. */
const UNSIZED_BOX_SPECIFIERS = new Set(["@orb/ui/layout", "@orb/ui/skeleton", "@orb/ui/theme-scope", "@orb/ui/crossfade-image"]);

/** Sanctioned survivors: file → reason a call-site size utility on a @orb/ui element is CORRECT there
 *  (not debt). Both-directions ratchet — a stale row (no scoped hit left in the file) is itself RED
 *  (the no-arbitrary-tw-values ALLOWLIST contract). */
const ALLOWLIST: Record<string, string> = {
  "packages/client/src/features/character/components/character-library-toolbar.tsx":
    "`w-auto` on Select — the measured 2026-08-01 F1 content-width ruling (see the site comment); `auto` vs FIELD_CONTROL's `w-full` are both STANDARD width utilities, so tailwind-merge classifies them and the override is deterministic (no stylesheet-order hazard).",
  "packages/client/src/features/credentials/components/role-slot-row.tsx":
    "`w-auto min-w-32` on Select — the same content-width-Select pattern as character-library-toolbar (deterministic: auto vs w-full are tailwind-merge-classifiable).",
  "packages/client/src/features/tag/components/tag-settings-row.tsx":
    "`w-auto min-w-32` on Select — the same content-width-Select pattern as character-library-toolbar (deterministic: auto vs w-full are tailwind-merge-classifiable).",
  "packages/client/src/features/rpg/components/rpg-hud.tsx":
    "`size-1.5` on a CHILDLESS Badge dot — Badge declares no h/w/size of its own (padding-sized), so there is no variant to fight; a features-tier surface can't paint a raw <span>, so the dot is a Badge sized at the call site (see the site comment).",
};

/** Incident-class DEBT under ratchet: file → the count of banned size tokens it may still carry. Over
 *  budget = RED; UNDER budget = stale RED (ratchet the row down / delete it).
 *
 *  TERMINAL — the founding sweep's two rows (the `h-auto min-h-touch-target py-field` choice buttons in
 *  chat/message-choices-block + rpg/rpg-choice-echo) were PAID 2026-08-01: they now ride Button's
 *  `size="wrap"` (packages/ui/src/primitives/button/variants.ts — the `media`/F2 precedent). The map
 *  stays as the ratchet mechanism; it must never grow again — a new hit is a variant to add, not a row. */
const DEBT_BASELINE: Record<string, number> = {};

const MESSAGE =
  "sizes come from variants — tailwind-merge can't classify custom-token utilities, so a call-site " +
  "override wins or loses by stylesheet order; add a variant to the primitive (packages/ui/src — " +
  "ui-package-design.md).";

const STALE_ENTRY_MESSAGE_PREFIX =
  "ALLOWLIST entry has NO scoped size utility on a @orb/ui element any more — the survivor was reworked " +
  "onto a variant (ratchet down): delete the stale row in ui-size-via-variant.ts: ";

const UI_SPECIFIER_RE = /^@orb\/ui(?:\/|$)/u;
/** The scoped box utilities (terminal segment): h / min-h / size / w with a plain (non-bracket) value. */
const SIZE_UTILITY_RE = /^(?<util>h|min-h|size|w)-(?<val>[a-z0-9./]+)$/u;
/** Values that are LAYOUT decisions, not box sizes — never flagged. Viewport units + intrinsic keywords. */
const KEYWORD_VALUE_RE = /^(?:full|fit|min|max|screen|[sld]v[hw])$/u;
const FRACTION_VALUE_RE = /^\d+\/\d+$/u;
const NUMERIC_VALUE_RE = /^(?:\d+(?:\.\d+)?|px)$/u;
const CUSTOM_TOKEN_VALUE_RE = /^[a-z][a-z0-9-]*$/u;
const WHITESPACE_RE = /\s+/u;

/** Is this whitespace-split class token a banned size utility (terminal segment)? */
function isBannedSizeToken(token: string): boolean {
  const terminal = token.split(":").at(-1) ?? token;
  const match = SIZE_UTILITY_RE.exec(terminal);
  if (match?.groups === undefined) {
    return false;
  }
  const { util, val } = match.groups;
  if (util === undefined || val === undefined) {
    return false;
  }
  if (KEYWORD_VALUE_RE.test(val) || FRACTION_VALUE_RE.test(val)) {
    return false;
  }
  // `min-h-0` is the flex-overflow constraint RELEASE (the `min-w-0` twin), not a size — legitimate.
  if (util === "min-h" && val === "0") {
    return false;
  }
  return val === "auto" || NUMERIC_VALUE_RE.test(val) || CUSTOM_TOKEN_VALUE_RE.test(val);
}

/** A banned size token + its 0-based offset into the class-string node's `getText()`. */
type BannedToken = { readonly token: string; readonly offset: number };

/** Every banned size token in a class-string node's text (quotes/backticks at [0] and [-1]). */
function bannedSizeTokens(nodeText: string): BannedToken[] {
  const stripped = nodeText.slice(1, -1);
  const out: BannedToken[] = [];
  const parts = stripped.split(WHITESPACE_RE);
  let cursor = 0;
  for (const part of parts) {
    const at = stripped.indexOf(part, cursor);
    cursor = at + part.length;
    if (part.length > 0 && isBannedSizeToken(part)) {
      out.push({ token: part, offset: at + 1 });
    }
  }
  return out;
}

/** Per-file cache: the set of LOCAL names imported from `@orb/ui` / `@orb/ui/*` (named imports, alias
 *  local). Rebuilt each pass (begin clears). */
const uiImportCache = new Map<string, ReadonlySet<string>>();

function uiImportedNames(sf: SourceFile): ReadonlySet<string> {
  const key = sf.getFilePath();
  const cached = uiImportCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const names = new Set<string>();
  for (const decl of sf.getImportDeclarations()) {
    const specifier = decl.getModuleSpecifierValue();
    if (!UI_SPECIFIER_RE.test(specifier) || UNSIZED_BOX_SPECIFIERS.has(specifier)) {
      continue;
    }
    for (const named of decl.getNamedImports()) {
      names.add((named.getAliasNode() ?? named.getNameNode()).getText());
    }
  }
  uiImportCache.set(key, names);
  return names;
}

/** The literal class-string node of this element's `className`, or undefined (computed → blind spot). */
function classNameLiteral(el: JsxOpeningElement | JsxSelfClosingElement): Node | undefined {
  const attr = el.getAttribute("className");
  if (attr === undefined || !Node.isJsxAttribute(attr)) {
    return;
  }
  const init = attr.getInitializer();
  if (init === undefined) {
    return;
  }
  if (Node.isStringLiteral(init)) {
    return init;
  }
  if (!Node.isJsxExpression(init)) {
    return;
  }
  const expr = init.getExpression();
  return expr !== undefined && (Node.isStringLiteral(expr) || Node.isNoSubstitutionTemplateLiteral(expr)) ? expr : undefined;
}

function clientRel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

const GATE_SELF = "scripts/check/gates/ui-size-via-variant.ts";
const passSeenAllowlisted = new Set<string>();

/** Over-budget arm (per-file, scope-independent — incremental-safe): a file's hits beyond its
 *  DEBT_BASELINE budget (0 for an unlisted file) are reported; in-document-order excess. */
function reportOverBudget(ctx: GateRunCtx): void {
  for (const [rel, hits] of passHitsByFile) {
    const budget = DEBT_BASELINE[rel] ?? 0;
    for (const hit of hits.slice(budget)) {
      ctx.report(hit.node, { token: hit.token, offset: hit.offset });
    }
  }
}

/** ALLOWLIST stale arm: a sanctioned row with no scoped hit left in the (loaded) file — ratchet down. */
function reportStaleAllowlist(ctx: GateRunCtx): void {
  for (const rel of Object.keys(ALLOWLIST)) {
    if (!fileLoaded(ctx, rel) || passSeenAllowlisted.has(rel)) {
      continue;
    }
    ctx.report({
      file: GATE_SELF,
      line: 1,
      column: 0,
      message: `${STALE_ENTRY_MESSAGE_PREFIX}"${rel}" — scripts/check/gates/ui-size-via-variant.ts`,
    });
  }
}

/** DEBT ratchet-down arm: a baseline row whose live count fell UNDER budget is stale — shrink or
 *  delete the row in DEBT_BASELINE (ui-size-via-variant.ts) so the debt can only go down. */
function reportStaleBaseline(ctx: GateRunCtx): void {
  for (const [rel, budget] of Object.entries(DEBT_BASELINE)) {
    if (!fileLoaded(ctx, rel)) {
      continue;
    }
    const live = passHitsByFile.get(rel)?.length ?? 0;
    if (live < budget) {
      ctx.report({
        file: GATE_SELF,
        line: 1,
        column: 0,
        message:
          `DEBT_BASELINE row for "${rel}" budgets ${budget} but the live count is ${live} — ratchet the ` +
          "row down (or delete it) in scripts/check/gates/ui-size-via-variant.ts.",
      });
    }
  }
}

/** One deferred hit: the class-string node + the token/offset to anchor the finding on. Accumulated per
 *  file so the DEBT_BASELINE budget can be applied in finalize (only the EXCESS is reported). */
type DeferredHit = { readonly node: Node; readonly token: string; readonly offset: number };
const passHitsByFile = new Map<string, DeferredHit[]>();

export const gate: GateDescriptor = {
  name: "ui-size-via-variant",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3) · ui-package-design.md",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "add a size/layout variant to the @orb/ui primitive (packages/ui/src/<primitive>/variants.ts) and use it; never a call-site h-*/min-h-*/size-*/w-* utility.",
  scanRoot: (p) => p.includes("packages/client/src/") || p.includes("packages/ui/src/"),
  kinds: [SyntaxKind.JsxOpeningElement, SyntaxKind.JsxSelfClosingElement],
  begin: () => {
    uiImportCache.clear();
    passSeenAllowlisted.clear();
    passHitsByFile.clear();
  },
  visit: (node, sf, _ctx) => {
    const el = node as JsxOpeningElement | JsxSelfClosingElement;
    const tag = el.getTagNameNode();
    if (!Node.isIdentifier(tag)) {
      return;
    }
    if (!uiImportedNames(sf).has(tag.getText())) {
      return;
    }
    const literal = classNameLiteral(el);
    if (literal === undefined) {
      return;
    }
    const hits = bannedSizeTokens(literal.getText());
    if (hits.length === 0) {
      return;
    }
    const rel = clientRel(sf.getFilePath());
    if (rel in ALLOWLIST) {
      passSeenAllowlisted.add(rel);
      return;
    }
    const bucket = passHitsByFile.get(rel);
    const deferred = hits.map((h) => ({ node: literal, token: h.token, offset: h.offset }));
    if (bucket === undefined) {
      passHitsByFile.set(rel, deferred);
    } else {
      bucket.push(...deferred);
    }
  },
  finalize: (ctx) => {
    reportOverBudget(ctx);
    if (ctx.scope.kind !== "project") {
      return;
    }
    reportStaleAllowlist(ctx);
    reportStaleBaseline(ctx);
  },
  mustFlag: [
    {
      files: 'import { Button } from "@orb/ui/button";\nexport const G = <Button className="size-auto">x</Button>;\n',
      at: "packages/client/src/features/x/x.tsx",
      why: "the F2 incident shape — `size-auto` on Button; auto is a size verdict the variant owns",
    },
    {
      files: 'import { TabsTab } from "@orb/ui/tabs";\nexport const G = <TabsTab className="h-auto" />;\n',
      at: "packages/client/src/features/x/tabs.tsx",
      why: "the pre-layout-variant incident shape — `h-auto` on TabsTab",
    },
    {
      files: 'import { Button } from "@orb/ui/button";\nexport const G = <Button className="h-control w-40">x</Button>;\n',
      at: "packages/client/src/features/x/two.tsx",
      // PER-TOKEN: a custom-token height + a numeric width → two findings.
      expect: { count: 2 },
      why: "a custom-token (`h-control`) and a numeric (`w-40`) size utility — tailwind-merge can't classify the custom token, so the override resolves by stylesheet order",
    },
    {
      files: 'import { Input } from "@orb/ui/input";\nexport const G = <Input className="focus:h-9" />;\n',
      at: "packages/client/src/features/x/variantpfx.tsx",
      why: "a variant-prefixed size utility (focus:h-9) — the terminal segment still flags",
    },
  ],
  mustPass: [
    {
      files: 'export const G = <div className="h-auto size-auto w-40" />;\n',
      at: "packages/client/src/features/x/rawdiv.tsx",
      why: "a raw HTML element — not a @orb/ui component; other gates own raw-element classes",
    },
    {
      files: 'const Button = (p: { className: string }) => <div />;\nexport const G = <Button className="size-auto" />;\n',
      at: "packages/client/src/features/x/localcomp.tsx",
      why: "a LOCAL component named Button — not imported from @orb/ui, out of scope",
    },
    {
      files: 'import { Button } from "@orb/ui/button";\nexport const G = <Button className="w-full max-w-md min-w-0 shrink-0">x</Button>;\n',
      at: "packages/client/src/features/x/layoutok.tsx",
      why: "layout constraints/proportions (w-full, max-w-*, min-w-0) are legitimate call-site decisions — passes",
    },
    {
      files: 'import { Stack } from "@orb/ui/layout";\nexport const G = <Stack className="min-h-0" />;\n',
      at: "packages/client/src/features/x/minh0.tsx",
      why: "min-h-0 is the flex-child overflow release (the min-w-0 twin), not a size — passes",
    },
    {
      files: 'import { Row } from "@orb/ui/layout";\nexport const G = <Row className="h-full w-fit" />;\n',
      at: "packages/client/src/features/x/keywords.tsx",
      why: "keyword values (full/fit) are proportional layout, not box sizes — passes",
    },
    {
      files:
        'import { Skeleton } from "@orb/ui/skeleton";\nimport { Stack } from "@orb/ui/layout";\nexport const G = <Stack className="size-9"><Skeleton className="h-3 w-40" /></Stack>;\n',
      at: "packages/client/src/features/x/unsized.tsx",
      why: "UNSIZED-BOX modules (layout kit, Skeleton) — no size of their own, geometry IS the call site's datum, exempt",
    },
  ],
};
