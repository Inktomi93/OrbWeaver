// Gate: ui-size-via-variant (Core-Enforcement-Active-Gates.md Layer 3; ui-package-design.md — sizes are
// VARIANT axes on the primitive, never call-site utilities). A `className` on a JSX element whose
// component is imported from `@orb/ui` must not carry a SIZE/HEIGHT box utility (`h-*`, `min-h-*`,
// `size-*`, `w-*` with a numeric / custom-token / `auto` value). Three real incidents behind this gate:
// `size-auto` on Button (pre-F2), `h-auto` on TabsTab (pre-layout-variant), and the general
// custom-token-override class. The fix is a variant on the primitive, not a stronger class at the call
// site.
//
// THE MECHANISM INVERTED AT #146 — the gate is unchanged, its rationale is not. It used to be that
// tailwind-merge could not classify the custom-token utilities the primitives are built from
// (`h-control`, `size-icon`, …), so a call-site override neither reliably won nor reliably lost: it
// resolved by stylesheet order. `packages/ui/src/lib/class-merge.ts` now registers the whole `--spacing-*`
// scale in the merger's THEME, so a call-site size resolves LAST-WINS and reliably DEFEATS the sealed box.
// Unresolvable then, silently overriding now — the ruling ("sizes are variant axes") holds in both regimes,
// and this gate is now the only thing standing between a feature and a broken seal.
//   THE HYPHEN HOLE, closed at #169 (the widening lane, and the bigger half of what it found). This gate's
// `SIZE_UTILITY_RE` value class was `[a-z0-9./]+` — with NO hyphen — so it only ever matched a SINGLE-SEGMENT
// value. Every multi-segment sealed token in this repo therefore walked straight past it: `h-control-sm`,
// `size-avatar-md`, `size-glyph-lg`, `min-h-touch-target`, `min-h-control-md`. Probed live before the fix
// (a scratch file under `packages/client/src/features/`, `pnpm check`'s scoped runner): `<Button
// className="h-control">` FLAGGED, `<Button className="h-control-sm">` and `<Button className="size-avatar-md">`
// did NOT. That is essentially every sealed control size the primitives are built from, invisible to the one
// gate standing between a feature and a broken seal, while `CUSTOM_TOKEN_VALUE_RE` (which DOES allow hyphens,
// two lines down) made the code read as though the case were handled. Adding `-` to the value class surfaced
// SEVEN live hits in `packages/client` — including the `face-strip.tsx` `min-h-control-md` that LIMIT 1 below
// already named as a known live hit — all of them fixed in the same commit per FIX-AT-LANDING.
//
//   STILL OPEN — the `min-w-*`/`max-w-*`/`max-h-*` fence, RE-MEASURED at #169 and deliberately NOT widened.
// The follow-up premise was that this exclusion is now wholly wrong, because a call-site `min-w-0` can defeat
// a seal under the #146 merge regime (`rpg-hud-rail.tsx`'s cell vs `TabsTab`'s `min-w-touch-target` — measured
// 39.09px against a 44px floor, fixed in the #146 lane). The receipt is real; the blanket widening is not the
// fix. MEASURED, `node tooling/src/verify/ops/scoped.ts --scope 'packages/client/src/**'`:
//   · blanket widen (add the three axes to `SIZE_UTILITY_RE`) → 85 hits, ~70 of them `min-w-0` and ~10
//     `max-h-40|48|64|96` — the standard flex-truncation release and scroll-box ceiling, on primitives that
//     seal nothing on that axis. "Fix at landing" there means inventing a max-height variant on Text.
//   · axis-aware widen (in scope only where the target's own `@orb/ui` source DIRECTORY declares that axis)
//     → 24 hits, and hand-review found ZERO demonstrable seal defeats among them: `TabsList` inherits the
//     seal `TabsTab` declares (directory granularity, not slot); `Button`'s only `min-w-touch-target` is on
//     an `after:` PSEUDO-ELEMENT (`variants.ts` `inline` arm), which a root `min-w-0` cannot touch; `Field`'s
//     is on its `labelBlock` SLOT, not the root the className lands on.
// So a precise predicate needs BOTH slot-awareness (tag → the variants slot its className composes) and
// variant-prefix awareness (`after:`/`hover:` classes are not root seals). That is a gate-MECHANISM project,
// not a regex widening, and it was escalated rather than half-shipped — an allowlist of 24 reason-less rows
// is exactly the "red is negotiable" debt parking GATE-AUTHORING.md §4.8 forbids.
//
// Deliberately OUT of scope (the false-positive fence): `max-w-*` / `min-w-*` / `max-h-*` layout
// CONSTRAINTS; `min-h-0` (the flex-child overflow release, the height twin of `min-w-0`);
// keyword/proportional values (`full`/`fit`/`min`/`max`/`screen`/viewport units/fractions — layout
// decisions, not box sizes); arbitrary `[...]` values (already `no-arbitrary-tw-values`' beat); any
// class on a NON-@orb/ui element (raw HTML / feature-local components are other gates' jurisdiction);
// and the UNSIZED-BOX modules (`UNSIZED_BOX_SPECIFIERS` — layout kit / Skeleton / ThemeScope /
// CrossfadeImage), whose geometry is the call site's datum by design.
//
// IN SCOPE since 2026-08-02: the Tailwind IMPORTANT modifier, BOTH spellings (`!size-6` and `size-6!`) —
// see `IMPORTANT_MODIFIER_RE`. It was the gate's one live escape hatch, and the escape is the worse form of
// the incident (an `!important` override wins by force instead of by stylesheet order).
//
// Survivor mechanism: `ALLOWLIST` holds the SANCTIONED files only (reason-cited, both-ways stale ratchet).
// There is NO debt baseline — the gate is at terminal zero on a FIXED tree, not a parked one.
//   The DEBT_BASELINE ratchet is GONE (2026-08-03), together with its over-budget/stale-ratchet arms and
//   the deferred-hit accumulation they needed (GATE-AUTHORING.md §4.8: "terminal state is `{}` + delete the
//   baseline and its generator" — this one was inline, so there is no generator file). Its 14 rows were the
//   `!important` icon-button debt the 2026-08-02 `!` arm exposed: 13 × `<Button intent="ghost" size="sm"
//   className="!size-N !p-0">` at four scales plus one `!w-block` TrackBar, all in features/rpg. They were
//   PAID, not re-ratcheted: Button grew the four-step `glyph-*` square-box ramp (packages/ui/src/primitives/
//   button/variants.ts, on the new `--spacing-glyph-*` display tokens + the `inline` arm's hit-area ::after)
//   and TrackBar grew a `width` variant (`full` | `swatch`). Geometry is pinned SITE-BY-SITE against the
//   retired class strings by COMPUTED box in tests/ui/primitives/button/button.ct.tsx +
//   tests/ui/charts/meter/track-bar.ct.tsx. Hits are now reported at visit time; a NEW hit is a variant to
//   add, never a row to re-open.
//
// ─── DECLARED LIMITS — READ THESE BEFORE YOU TRUST A ZERO FROM THIS GATE ────────────────────────────
// Re-derived 2026-08-03 when the debt baseline reached terminal `{}` (GATE-AUTHORING.md §4.8: "when a
// ratchet reaches zero, RE-DERIVE the matcher's blind spots before trusting the zero" — a rule this gate
// itself paid for, having declared a FALSE terminal in 2026-08-01 while 14 `!`-modified hits sat invisible).
// A green here means "zero of the SHAPES BELOW ARE EXCLUDED", never "zero size-via-className on the tree".
//
// LIMIT 1 — LITERAL-SHAPE (the reader's own honest limit). Only a literal `className="…"` /
//   `className={"…"}` / no-substitution template is read. A COMPUTED className — `cn(…)`, a template WITH
//   substitutions (`` `w-12 ${x}` ``), a spread — is structurally invisible, as is a dotted (`Ns.Member`)
//   or namespace-imported (`import * as UI`) tag. Same class as the other className gates. This is not
//   theoretical: the 2026-08-03 re-derivation found FOUR live in-scope hits hiding in exactly this shape
//   (`features/preset/…/section-row.tsx` `<Text className={`w-12 …`}>`; `features/credentials/
//   role-status-dot.tsx` `<Text className={`size-2 …`}>`; `components/face-strip.tsx` `<Button
//   className={`min-h-control-md …`}>`; `features/chat/…/message-row-parts.tsx` `<Avatar className={cn(…
//   "h-auto w-(--…)")}>`), plus the whole `TrackerValue` family, which forwards a caller's `!w-avatar-md`
//   into an @orb/ui `Button` through a substituted template. Widening the reader is a real gate change
//   whose landing owes those fixes (FIX-AT-LANDING); it was escalated rather than half-done.
//
// LIMIT 2 — THE `(--var)` HOLE, OWNED BY NEITHER GATE. Tailwind v4's CSS-VARIABLE SHORTHAND — `w-(--foo)`,
//   `size-(--foo)`, `h-(--foo)` — is matched by NOTHING here (`SIZE_UTILITY_RE`'s value class is
//   `[a-z0-9./-]+`; a paren value never matches) AND is deliberately PASSED by the sibling gate
//   `no-arbitrary-tw-values` (its `TOKEN_DRIVEN_RE` exempts `var(`/`--`/`calc(` bodies as token-driven).
//   So it is a size utility on a sealed primitive that BOTH gates believe the other one holds — the exact
//   shape that makes a rule look enforced while being unenforceable. Do NOT read this gate's green as
//   covering it, and if you close it, close it HERE (the value is a box size, not an arbitrary literal —
//   `no-arbitrary-tw-values` is right to pass it).
import type { JsxOpeningElement, JsxSelfClosingElement, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { fileLoaded } from "../lib/pass.ts";

/** UNSIZED-BOX `@orb/ui` modules — components with NO size of their own, whose geometry IS the call
 *  site's datum, so a call-site box utility cannot fight a variant (there is none) and is the intended
 *  API: the layout kit (`Stack`/`Row`/… — the ONLY box a feature may size, since raw-HTML className is
 *  banned in features), `Skeleton` (mimics the content it stands in for), `ThemeScope` (a token-scope
 *  wrapper box), `CrossfadeImage` (media geometry — aspectRatio prop + call-site box, the D44 media
 *  primitive). A SIZED control primitive (button/tabs/select/input/badge/…) is never exempt. */
// `background-video` joined 2026-08-19 (#317): its variants base is literally `h-full w-full object-cover`
// ("fills its positioned parent") — geometry is the call site's datum by design, the same rationale as
// CrossfadeImage (its sibling in the composer's attachment-preview thumbs).
const UNSIZED_BOX_SPECIFIERS = new Set(["@orb/ui/layout", "@orb/ui/skeleton", "@orb/ui/theme-scope", "@orb/ui/crossfade-image", "@orb/ui/background-video"]);

/** Sanctioned survivors: file → reason a call-site size utility on a `@orb/ui` element is CORRECT there
 *  (not debt). Both-directions ratchet — a stale row (no scoped hit left in the file) is itself RED
 *  (the no-arbitrary-tw-values ALLOWLIST contract). */
const ALLOWLIST: ExemptionTable = {
  "packages/client/src/features/character/components/character-library-toolbar.tsx": {
    why: "`w-auto` on Select — the measured 2026-08-01 F1 content-width ruling (see the site comment); `auto` vs FIELD_CONTROL's `w-full` are both STANDARD width utilities, so tailwind-merge classifies them and the override is deterministic (no stylesheet-order hazard).",
  },
  // Re-pointed 2026-09-05 (#1725: the owner moved every collection's chrome out of the LIST, so the tag
  // library's sort Select is the config host's control row now — `tag-collection-rows.tsx` → the landing
  // that draws it). Same control, same reason, new path; the ratchet's stale-row arm is what caught the
  // move, exactly as the `context-rail.tsx` re-point below did.
  "packages/client/src/features/config/components/config-collection-landing.tsx": {
    why: "`w-auto` on the library's sort Select — the same content-width-Select pattern as character-library-toolbar (deterministic: `auto` vs FIELD_CONTROL's `w-full` are both tailwind-merge-classifiable standard width utilities). Without it the trigger claims the control row for a three-word label, and the filter is what should take the slack.",
  },
  // RETIRED 2026-09-06 (#1799), and it retired the way the ratchet says a survivor should: by the
  // exemption's own premise being PAID. The row read "`size-1.5` on a CHILDLESS Badge dot — Badge declares
  // no h/w/size of its own (padding-sized), so there is no variant to fight" — true when it was written and
  // false the moment Badge grew `size="dot"` (#1798, packages/ui/src/primitives/badge/variants.ts). There
  // IS a variant to fight now, `context-rail.tsx` uses it, and the fix at both ends of the ratchet is the
  // same one: the primitive learned the shape. Do not re-add the row for a new dot — add a consumer of the
  // arm. (Kept as a comment, not deleted outright: the next reader of this table meets the ONE worked
  // example of a survivor being paid off rather than re-pointed.)
};

const MESSAGE =
  "sizes come from variants — tailwind-merge can't classify custom-token utilities, so a call-site " +
  "override wins or loses by stylesheet order; add a variant to the primitive (packages/ui/src — " +
  "ui-package-design.md).";

const STALE_ENTRY_MESSAGE_PREFIX =
  "ALLOWLIST entry has NO scoped size utility on a @orb/ui element any more — the survivor was reworked " +
  "onto a variant (ratchet down): delete the stale row in ui-size-via-variant.ts: ";

/** Real-tree anchor (GATE-AUTHORING.md §4.5, the `no-hover-display-swap` precedent):
 *  `ctx.scope.kind === "project"` is TRUE inside gate-conformance's synthetic mini-projects too, so
 *  scope alone cannot gate the stale arms. A permanent file that no example ever declares proves this
 *  is a REAL project run.
 *  Deliberately NOT any ALLOWLIST/DEBT_BASELINE row's own path — gating a row's staleness on THAT row's
 *  own file being loaded is exactly the mode-(B) blind spot this anchor exists to close: a deleted
 *  survivor is never loaded, so a self-referential guard would skip it forever instead of flagging it. */
const STALE_ARM_ANCHOR = "packages/ui/src/tokens/index.ts";

const UI_SPECIFIER_RE = /^@orb\/ui(?:\/|$)/u;
/** The Tailwind IMPORTANT modifier, stripped before classification. BOTH spellings the v4.3 engine actually
 *  registers — probed, not assumed (`compile('@import "tailwindcss"').build([...])`: `!size-6`, `size-6!`,
 *  `!h-auto` and `h-auto!` all emit a rule, all with `!important`): the v3-era PREFIX and v4's canonical
 *  SUFFIX. Untaught, this was the gate's live escape hatch — the 13 `!h-auto min-h-0 !py-0` inline-button
 *  sites (`packages/ui/src/primitives/button/variants.ts`, the `inline` arm) and the `!h-auto !px-field`
 *  inline-input sites walked straight past it. An `!important` size utility is not a lesser version of the
 *  incident, it is the WORSE one: the plain form resolves by stylesheet order (a coin flip), the `!` form
 *  wins by force and makes the primitive's variant unreachable. */
const IMPORTANT_MODIFIER_RE = /^!|!$/gu;
/** The scoped box utilities (terminal segment): h / min-h / size / w with a plain (non-bracket) value.
 *  The value class carries `-` since #169 — see the HYPHEN HOLE note in the header; without it every
 *  multi-segment sealed token (`h-control-sm`, `size-avatar-md`, `min-h-touch-target`) walked past. */
const SIZE_UTILITY_RE = /^(?<util>h|min-h|size|w)-(?<val>[a-z0-9./-]+)$/u;
/** Values that are LAYOUT decisions, not box sizes — never flagged. Viewport units + intrinsic keywords. */
const KEYWORD_VALUE_RE = /^(?:full|fit|min|max|screen|[sld]v[hw])$/u;
const FRACTION_VALUE_RE = /^\d+\/\d+$/u;
const NUMERIC_VALUE_RE = /^(?:\d+(?:\.\d+)?|px)$/u;
const CUSTOM_TOKEN_VALUE_RE = /^[a-z][a-z0-9-]*$/u;
const WHITESPACE_RE = /\s+/u;

/** Is this whitespace-split class token a banned size utility (terminal segment)? The variant chain is
 *  dropped first (`focus:h-9` → `h-9`), then the important modifier on whichever side it sits
 *  (`focus:!h-9` / `focus:h-9!` → `h-9`) — Tailwind puts `!` on the UTILITY, never before the variants. */
function isBannedSizeToken(token: string): boolean {
  const terminal = (token.split(":").at(-1) ?? token).replace(IMPORTANT_MODIFIER_RE, "");
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
interface BannedToken {
  readonly token: string;
  readonly offset: number;
}

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

const GATE_SELF = "tooling/src/verify/gates/ui-size-via-variant.ts";
const passSeenAllowlisted = new Set<string>();

/** ALLOWLIST stale arm: a sanctioned row with no scoped hit left this pass — either (A) the file still
 *  exists but was reworked onto a variant, or (B) the file is GONE (deleted/moved/renamed) and so was
 *  never visited at all. Both modes collapse to the same test: `passSeenAllowlisted` is only ever set
 *  from a live `visit` hit, so an absent file is indistinguishable from a fixed one here — as it should
 *  be, since both mean "nothing justifies this row any more." */
function reportStaleAllowlist(ctx: GateRunCtx): void {
  for (const rel of Object.keys(ALLOWLIST)) {
    if (passSeenAllowlisted.has(rel)) {
      continue;
    }
    ctx.report({
      file: GATE_SELF,
      line: 1,
      column: 0,
      message: `${STALE_ENTRY_MESSAGE_PREFIX}"${rel}" — tooling/src/verify/gates/ui-size-via-variant.ts`,
    });
  }
}

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
  },
  visit: (node, sf, ctx) => {
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
    for (const hit of hits) {
      ctx.report(literal, { token: hit.token, offset: hit.offset });
    }
  },
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, STALE_ARM_ANCHOR)) {
      return; // the stale arm is a whole-tree claim — never fire below project scope or off the anchor (§4.5)
    }
    reportStaleAllowlist(ctx);
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
      // The HYPHEN arm (#169): a MULTI-SEGMENT custom token. `h-control` flagged for two years while
      // `h-control-sm` — the actual spelling of every sealed control height — did not.
      files: 'import { Button } from "@orb/ui/button";\nexport const G = <Button className="h-control-sm">x</Button>;\n',
      at: "packages/client/src/features/x/hyphen.tsx",
      expect: { token: "h-control-sm" },
      why: "a multi-segment sealed token (`h-control-sm`) — the value class carries `-` since #169; without it every real seal spelling was invisible",
    },
    {
      files: 'import { Avatar } from "@orb/ui/avatar";\nexport const G = <Avatar className="size-avatar-md" />;\n',
      at: "packages/client/src/features/x/hyphensize.tsx",
      expect: { token: "size-avatar-md" },
      why: "the `size` shorthand with a multi-segment token — the same hole, on the axis the F2 incident used",
    },
    {
      files: 'import { Input } from "@orb/ui/input";\nexport const G = <Input className="focus:h-9" />;\n',
      at: "packages/client/src/features/x/variantpfx.tsx",
      why: "a variant-prefixed size utility (focus:h-9) — the terminal segment still flags",
    },
    {
      files: 'import { Button } from "@orb/ui/button";\nexport const G = <Button className="!size-6 !p-0">x</Button>;\n',
      at: "packages/client/src/features/x/bangpfx.tsx",
      why: "the v3-era `!` PREFIX (`!size-6`) — the escape hatch the 13 inline-button sites used; `!p-0` is out of scope (padding), so exactly ONE finding",
    },
    {
      files: 'import { Button } from "@orb/ui/button";\nexport const G = <Button className="h-auto!">x</Button>;\n',
      at: "packages/client/src/features/x/bangsfx.tsx",
      why: "v4's canonical `!` SUFFIX (`h-auto!`) — the same important modifier on the other side, equally registered by the v4.3 engine",
    },
    {
      files: 'import { Input } from "@orb/ui/input";\nexport const G = <Input className="focus:!h-9" />;\n',
      at: "packages/client/src/features/x/bangvariant.tsx",
      why: "important + a variant chain (focus:!h-9) — Tailwind puts `!` on the utility, so stripping happens AFTER the `:` split",
    },
    {
      // Mode-(B) proof (GATE-AUTHORING.md §4.3b): a project that loads the real-tree anchor but NONE of
      // the ALLOWLIST paths — exactly what a deleted/renamed survivor looks like from this gate's vantage.
      // Before the fix the stale arm was gated on the row's OWN file being loaded, so a project like this
      // one (which never loads any exempted path) silently reported nothing — `tag-settings-row.tsx`
      // rotted this way for a full day after F-11 deleted it.
      files: { [STALE_ARM_ANCHOR]: "export const x = 1;\n" },
      expect: { messageIncludes: "ALLOWLIST entry has NO scoped size utility" },
      why: "the real-tree anchor loads but no ALLOWLIST row's file does (the mode-B shape: gone from the tree) — every row must RED, not silently pass",
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
      // The hyphen widening must not swallow the min/max fence (#169 re-measured it and left it in place —
      // see the header): a hyphenated CONSTRAINT token is still out of scope, on any axis.
      files: 'import { Button } from "@orb/ui/button";\nexport const G = <Button className="min-w-touch-target max-w-cq-md max-h-control-sm">x</Button>;\n',
      at: "packages/client/src/features/x/hyphenfence.tsx",
      why: "min-w/max-w/max-h stay OUT of scope after the #169 hyphen widening — the fence is an axis fence, not a value-shape one",
    },
    {
      files:
        'import { Skeleton } from "@orb/ui/skeleton";\nimport { Stack } from "@orb/ui/layout";\nexport const G = <Stack className="size-9"><Skeleton className="h-3 w-40" /></Stack>;\n',
      at: "packages/client/src/features/x/unsized.tsx",
      why: "UNSIZED-BOX modules (layout kit, Skeleton) — no size of their own, geometry IS the call site's datum, exempt",
    },
    {
      files: 'import { Button } from "@orb/ui/button";\nexport const G = <Button className="!w-full !min-h-0 !p-0 !shrink-0">x</Button>;\n',
      at: "packages/client/src/features/x/bangfence.tsx",
      why: "the `!` strip does NOT widen the fence — an important keyword/proportional value (!w-full), the min-h-0 release and non-size utilities all still pass",
    },
  ],
};
