// Gate: query-boundary-reservation (#885; docs/design/885-884-boundary-reservation-and-touch-floor.md).
// A `QueryBoundary` whose fallback is a `SkeletonRows` with a STATIC count reserves a guess, not the box
// the surface settles at — the boot-CLS class home paid for (F14) and #885 sealed as `reserveKey`. Arms:
// A) static-count SkeletonRows fallback with no `reserveKey` is RED unless the line above the element
//    carries `// @first-boot-only: <reason>` (a boundary that genuinely never re-mounts);
// B) a repeated LITERAL `reserveKey` is RED at every site (two mounts sharing one box is the copy-paste
//    keying failure; a deliberately shared surface routes through ONE exported const, which this literal
//    census deliberately cannot see);
// C) the marker is two-sided: reason-less is MALFORMED, and one absolving no adjacent violation is STALE;
// D) blindness tripwire — the boundary's own source no longer spelling `reserveKey` REDs the gate.
// COMMENT POSTURE: comments-INTENDED for the marker arm (the marker IS a comment; the reader fences to
// comment spans via blankTsComments so a prose mention in a string cannot absolve or red anything).
// DECLARED LIMITS (mustPass rows): a DYNAMIC count (prop/call/ternary) passes — it is usually already
// box-aware; a SkeletonRows reached through a wrapper component or nested inside another element is
// invisible; `tests/` is scope, not exemption (a story's fallback reserves nothing durable).
import type { JsxAttribute, JsxOpeningElement, JsxSelfClosingElement, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { unwrapExpression } from "../lib/ast-read.ts";
import { blankTsComments } from "../lib/comment-spans.ts";
import { fileLoaded, repoRel } from "../lib/pass.ts";

const CLIENT_SRC = "packages/client/src/";
const BOUNDARY = "QueryBoundary";
const SKELETON = "SkeletonRows";
const RESERVE_ATTR = "reserveKey";
const MARKER = "@first-boot-only";
/** The marker must OPEN its comment (the mention fence): a line whose first non-space run is a comment
 *  opener immediately followed by the marker. Reason after the colon is REQUIRED (house grammar §4.3). */
const MARKER_LINE_RE = /^\s*\{?\s*(?:\/\/|\/\*+)\s*@first-boot-only(?<colon>:\s*\S)?/u;
const BOUNDARY_HOME = `${CLIENT_SRC}components/query-boundary.tsx`;
const GATE_SELF = "tooling/src/verify/gates/query-boundary-reservation.ts";

const MESSAGE =
  "a QueryBoundary whose fallback is a SkeletonRows with a STATIC count and no `reserveKey` — the surface " +
  "reserves a guessed box and shifts everything below it when the read lands (the F14 boot-CLS class). " +
  "`reserveKey` opts the boundary into measure-then-remember: the remembered box reserves, the count " +
  "re-fills it, the settled child re-measures (#885, query-boundary.tsx).";
const FIX =
  'add `reserveKey="<feature>.<surface>"` (the literal count stays as the first-boot guess), or — only for ' +
  "a boundary that genuinely never re-mounts — a `// @first-boot-only: <reason>` on the line above the element.";

interface MarkerSite {
  readonly file: string; // repo-relative
  readonly line: number; // 1-based line the marker comment sits on
  readonly wellFormed: boolean; // carries `:` + a reason
  consumed: number;
}

/** file → line → marker. Rebuilt each pass (`begin`). */
const markersByFile = new Map<string, Map<number, MarkerSite>>();
/** literal reserveKey value → sites. `col` deliberately NOT `column`: a `{file, line, column}` record is
 *  Finding-shaped and `finding-overload-provenance` would (rightly) interrogate a collector row. */
const keySites = new Map<string, { readonly file: string; readonly line: number; readonly col: number }[]>();

function attrNamed(el: JsxOpeningElement | JsxSelfClosingElement, name: string): JsxAttribute | undefined {
  const attr = el.getAttribute(name);
  return attr !== undefined && Node.isJsxAttribute(attr) ? attr : undefined;
}

/** The fallback attr's DIRECT `<SkeletonRows …/>` element, or undefined (wrappers/nesting are out of
 *  reach — declared limit). */
function skeletonFallback(el: JsxOpeningElement): JsxSelfClosingElement | undefined {
  const attr = attrNamed(el, "fallback");
  const init = attr?.getInitializer();
  if (init === undefined || !Node.isJsxExpression(init)) {
    return;
  }
  const expr = init.getExpression();
  const un = expr === undefined ? undefined : unwrapExpression(expr);
  return un !== undefined && Node.isJsxSelfClosingElement(un) && un.getTagNameNode().getText() === SKELETON ? un : undefined;
}

/** Is the SkeletonRows `count` STATIC — a numeric literal, or an identifier resolving to a same-file
 *  const numeric initializer (the trivial dodge)? Anything else is dynamic and passes. */
function hasStaticCount(skeleton: JsxSelfClosingElement, sf: SourceFile): boolean {
  const attr = attrNamed(skeleton, "count");
  const init = attr?.getInitializer();
  if (init === undefined || !Node.isJsxExpression(init)) {
    return false;
  }
  const expr = init.getExpression();
  if (expr === undefined) {
    return false;
  }
  const un = unwrapExpression(expr);
  if (Node.isNumericLiteral(un)) {
    return true;
  }
  if (Node.isIdentifier(un)) {
    const decl = sf.getVariableDeclaration(un.getText());
    const declInit = decl?.getInitializer();
    return declInit !== undefined && Node.isNumericLiteral(unwrapExpression(declInit));
  }
  return false;
}

/** Arm B — duplicate literal keys, reported at every site so both authors see the collision. */
function reportDuplicateKeys(ctx: GateRunCtx): void {
  for (const [value, sites] of keySites) {
    if (sites.length < 2) {
      continue;
    }
    for (const site of sites) {
      const others = sites
        .filter((s) => s !== site)
        .map((s) => `${s.file}:${s.line}`)
        .join(", ");
      // @finding-overload-ok: a CROSS-FILE verdict — each site is only wrong because of the OTHER file, so a line-adjacent marker at one site could never speak for the pair; deliberately non-suppressible. Ends if the arm moves to a table with its own stale sweep
      ctx.report({
        file: site.file,
        line: site.line,
        column: site.col,
        token: value,
        message: `duplicate reserveKey "${value}" — also minted at ${others}. Two mounts sharing one box overwrite each other's memory; mint one key per surface, or hoist a deliberately shared surface's key into ONE exported const (packages/client/src/components/query-boundary.tsx).`,
      });
    }
  }
}

/** Arm C — the marker vocabulary is two-sided from birth: malformed, stale, and over-exempting all RED. */
function markerVerdict(marker: MarkerSite): string | undefined {
  if (!marker.wellFormed) {
    return `malformed ${MARKER} marker — the reason is required (\`${MARKER}: <why this boundary never re-mounts>\`); a bare marker exempts NOTHING and must not sit there looking like protection (tooling/src/verify/gates/query-boundary-reservation.ts).`;
  }
  if (marker.consumed === 0) {
    return `stale ${MARKER} marker — no static-count SkeletonRows QueryBoundary on the line below it. The site was keyed, moved, or never guarded; delete the marker — a stale exemption is a loaded gun (tooling/src/verify/gates/query-boundary-reservation.ts).`;
  }
  return marker.consumed > 1
    ? `over-exempting ${MARKER} marker — it absolved ${marker.consumed} boundaries at once. One marker, one boundary: put each element on its own line with its own marker (tooling/src/verify/gates/query-boundary-reservation.ts).`
    : undefined;
}

function reportMarkerVerdicts(ctx: GateRunCtx): void {
  for (const perLine of markersByFile.values()) {
    for (const marker of perLine.values()) {
      const message = markerVerdict(marker);
      if (message !== undefined) {
        // @finding-overload-ok: a marker-vocabulary verdict (the §4.3 stale/malformed class) — the finding IS a comment, so there is no node to anchor, and a marker absolving the report that indicts a marker is the one exemption two-sidedness can never grant. Ends if the marker inventory ever resolves to nodes
        ctx.report({ file: marker.file, line: marker.line, column: 1, message });
      }
    }
  }
}

/** Arm D — blindness tripwire, judged only where the boundary's own source is in the fileset. */
function reportSeamTripwire(ctx: GateRunCtx): void {
  if (!fileLoaded(ctx, BOUNDARY_HOME)) {
    return;
  }
  const home = ctx.project.getSourceFile(`${ctx.root}/${BOUNDARY_HOME}`);
  if (home !== undefined && !blankTsComments(home).includes(RESERVE_ATTR)) {
    ctx.report({
      file: GATE_SELF,
      line: 1,
      column: 0,
      message: `${BOUNDARY_HOME} no longer spells \`${RESERVE_ATTR}\` in code — the reservation seam this gate points every violation at is gone; re-derive the gate in tooling/src/verify/gates/query-boundary-reservation.ts`,
    });
  }
}

export const gate: GateDescriptor = {
  name: "query-boundary-reservation",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3) · docs/design/885-884-boundary-reservation-and-touch-floor.md",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => p.startsWith(CLIENT_SRC),
  kinds: [SyntaxKind.JsxOpeningElement],
  begin: () => {
    markersByFile.clear();
    keySites.clear();
  },
  visitFile: (sf, ctx) => {
    // Marker inventory (comments-INTENDED): only spans blankTsComments blanks count — a string literal
    // spelling the grammar is an inert mention. Line numbers are 1-based.
    const raw = sf.getFullText();
    if (!raw.includes(MARKER)) {
      return;
    }
    const blanked = blankTsComments(sf);
    const rel = repoRel(ctx.root, sf.getFilePath());
    const perLine = new Map<number, MarkerSite>();
    const lines = raw.split("\n");
    let offset = 0;
    for (const [i, lineText] of lines.entries()) {
      const m = MARKER_LINE_RE.exec(lineText);
      if (m !== null) {
        const at = offset + lineText.indexOf(MARKER);
        // In-comment fence: the marker's span must be BLANKED in the comment-stripped text.
        if (blanked.slice(at, at + MARKER.length) !== MARKER) {
          perLine.set(i + 1, { file: rel, line: i + 1, wellFormed: m.groups?.["colon"] !== undefined, consumed: 0 });
        }
      }
      offset += lineText.length + 1;
    }
    if (perLine.size > 0) {
      markersByFile.set(rel, perLine);
    }
  },
  visit: (node, sf, ctx) => {
    if (!Node.isJsxOpeningElement(node) || node.getTagNameNode().getText() !== BOUNDARY) {
      return;
    }
    const rel = repoRel(ctx.root, sf.getFilePath());
    const keyAttr = attrNamed(node, RESERVE_ATTR);
    if (keyAttr !== undefined) {
      const init = keyAttr.getInitializer();
      if (init !== undefined && Node.isStringLiteral(init)) {
        const value = init.getLiteralText();
        const pos = sf.getLineAndColumnAtPos(keyAttr.getStart());
        const sites = keySites.get(value) ?? [];
        sites.push({ file: rel, line: pos.line, col: pos.column });
        keySites.set(value, sites);
      }
      return; // keyed — arm A satisfied whatever the fallback is
    }
    const skeleton = skeletonFallback(node);
    if (skeleton === undefined || !hasStaticCount(skeleton, sf)) {
      return;
    }
    const elementLine = sf.getLineAndColumnAtPos(node.getStart()).line;
    const marker = markersByFile.get(rel)?.get(elementLine - 1);
    if (marker !== undefined && marker.wellFormed) {
      marker.consumed += 1;
      return;
    }
    const fallbackAttr = attrNamed(node, "fallback");
    ctx.report(fallbackAttr ?? node, { token: "fallback", offset: 0 });
  },
  run: (ctx) => {
    reportDuplicateKeys(ctx);
    reportMarkerVerdicts(ctx);
    reportSeamTripwire(ctx);
  },
  mustFlag: [
    {
      files: 'export const G = <QueryBoundary fallback={<SkeletonRows count={3} shape="line" />}>{"b"}</QueryBoundary>;\n',
      at: "packages/client/src/features/a/unkeyed.tsx",
      expect: { count: 1, token: "fallback" },
      why: "the founding shape — a static-count skeleton fallback with no reserveKey reserves a guess (F14)",
    },
    {
      files: 'const ROWS = 4;\nexport const G = <QueryBoundary fallback={<SkeletonRows count={ROWS} />}>{"b"}</QueryBoundary>;\n',
      at: "packages/client/src/features/a/constcount.tsx",
      expect: { count: 1 },
      why: "the trivial dodge: a same-file const numeric count is still a static guess",
    },
    {
      files: {
        "packages/client/src/features/a/dup1.tsx": 'export const G = <QueryBoundary fallback={null} reserveKey="chat.dup">{"b"}</QueryBoundary>;\n',
        "packages/client/src/features/a/dup2.tsx": 'export const H = <QueryBoundary fallback={null} reserveKey="chat.dup">{"b"}</QueryBoundary>;\n',
      },
      expect: { count: 2, messageIncludes: "duplicate reserveKey" },
      why: "arm B: a copy-pasted literal key makes two surfaces overwrite one remembered box — RED at both sites",
    },
    {
      files: '// @first-boot-only\nexport const G = <QueryBoundary fallback={<SkeletonRows count={3} />}>{"b"}</QueryBoundary>;\n',
      at: "packages/client/src/features/a/bare.tsx",
      expect: { count: 2, messageIncludes: "malformed" },
      why: "arm C: a reason-less marker is MALFORMED (its own red) and exempts nothing (the violation still reds) — two findings",
    },
    {
      files: "// @first-boot-only: this component unmounted in #000\nexport const x = 1;\n",
      at: "packages/client/src/features/a/stale.tsx",
      expect: { count: 1, messageIncludes: "stale" },
      why: "arm C: a marker absolving no adjacent guarded boundary is a loaded gun — RED, never silence",
    },
    {
      files: {
        [BOUNDARY_HOME]: "// reserveKey lived here once\nexport const QueryBoundary = null;\n",
      },
      expect: { count: 1, messageIncludes: "no longer spells" },
      why: "arm D (§4.6): the seam's own source lost `reserveKey` — the vocabulary rotted; a comment mention cannot keep it green (blankTsComments)",
    },
  ],
  mustPass: [
    {
      files: 'export const G = <QueryBoundary fallback={<SkeletonRows count={3} />} reserveKey="a.b">{"c"}</QueryBoundary>;\n',
      at: "packages/client/src/features/a/keyed.tsx",
      why: "the sealed shape: keyed, the literal count survives as the first-boot guess",
    },
    {
      files:
        '// @first-boot-only: mounts once at app boot and never again — nothing to remember between mounts\nexport const G = <QueryBoundary fallback={<SkeletonRows count={3} />}>{"b"}</QueryBoundary>;\n',
      at: "packages/client/src/features/a/marked.tsx",
      why: "the sanctioned escape: a reasoned line-adjacent marker for a boundary that never re-mounts",
    },
    {
      files: 'export const G = (p: { n?: number }) => <QueryBoundary fallback={<SkeletonRows count={p.n ?? 4} />}>{"b"}</QueryBoundary>;\n',
      at: "packages/client/src/features/a/dynamic.tsx",
      why: "DECLARED LIMIT: a dynamic count (prop-driven) is not a static guess — the caller owns the number",
    },
    {
      files: 'export const G = <QueryBoundary fallback={<Text>Loading…</Text>}>{"b"}</QueryBoundary>;\n',
      at: "packages/client/src/features/a/textfallback.tsx",
      why: "a non-SkeletonRows fallback is outside arm A (the counted tail — design doc §5), not a violation",
    },
    {
      files: 'const s = "see @first-boot-only: in the docs";\nexport const x = s;\n',
      at: "packages/client/src/features/a/mention.tsx",
      why: "the mention fence: the grammar inside a STRING is inert — neither an exemption nor a stale red",
    },
    {
      files: 'export const G = <QueryBoundary fallback={<Stack><SkeletonRows count={3} /></Stack>}>{"b"}</QueryBoundary>;\n',
      at: "packages/client/src/features/a/wrapped.tsx",
      why: "DECLARED LIMIT: a SkeletonRows nested under a wrapper element is invisible to the direct-fallback reader",
    },
  ],
};
