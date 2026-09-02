// Gate: sub-floor-disclosure (#884 C2; docs/design/885-884-boundary-reservation-and-touch-floor.md §2).
// The collapsible trigger's default is `control` (the pointer-conditional `--spacing-control-sm` floor);
// `size="text"` is the SUB-FLOOR opt-out for a disclosure in running content, and every mount of it owes a
// line-adjacent `// @sub-floor-ok: <reason>` on the line above the element — the recurring defect this
// closes was the floor arm silently not taken (the this-chat 411×40 collapsible; #850's class). Arms:
// A) `size="text"` on a `CollapsibleTrigger` with no reasoned marker above it is RED;
// B) the marker is two-sided — reason-less MALFORMED, absolving nothing STALE, absolving >1 OVER-EXEMPTING;
// C) blindness tripwire — collapsible/variants.ts no longer declaring the `text`/`control` size keys REDs
//    the gate instead of letting it judge a dead vocabulary.
// COMMENT POSTURE: comments-INTENDED for the marker arm (the marker IS a comment; occurrences are fenced
// to comment spans via blankTsComments, so the grammar inside a string is an inert mention).
// DECLARED LIMITS (mustPass rows): a size reached through a VARIABLE is invisible (the literal-shape
// class every size gate shares); a re-exported/wrapped trigger under another tag name is invisible;
// `tests/` is scope, not exemption (a story pins the arm the product uses).
import type { JsxAttribute, JsxOpeningElement, JsxSelfClosingElement } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { blankTsComments } from "../lib/comment-spans.ts";
import { repoRel } from "../lib/pass.ts";

const TRIGGER = "CollapsibleTrigger";
const MARKER = "@sub-floor-ok";
/** The marker must OPEN its comment (the mention fence): a line whose first non-space run is a comment
 *  opener immediately followed by the marker. Reason after the colon is REQUIRED (house grammar §4.3). */
const MARKER_LINE_RE = /^\s*\{?\s*(?:\/\/|\/\*+)\s*@sub-floor-ok(?<colon>:\s*\S)?/u;
const VARIANTS_HOME = "packages/ui/src/primitives/collapsible/variants.ts";
const GATE_SELF = "tooling/src/verify/gates/sub-floor-disclosure.ts";

const MESSAGE =
  'a `size="text"` CollapsibleTrigger with no `// @sub-floor-ok: <reason>` on the line above it — `text` is ' +
  "the SUB-FLOOR opt-out (no control box, no hit pseudo at all: pointer-variants.ts measured a 406×16 " +
  "trigger whose centre elementFromPoint could not resolve to it), and the defect class this gate closes is " +
  "exactly the floor arm silently not taken (#884 C2 inverted the default to `control`). A text-height " +
  "disclosure is legitimate IN RUNNING CONTENT — say so, at the site, in the marker's reason.";
const FIX =
  "take the default (`control` — drop the size prop), or justify the sub-floor box with a line-adjacent " +
  "`// @sub-floor-ok: <reason>` above the element (packages/ui/src/primitives/collapsible/variants.ts).";

interface MarkerSite {
  readonly file: string;
  readonly line: number; // 1-based
  readonly wellFormed: boolean;
  consumed: number;
}

/** file → line → marker. Rebuilt each pass (`begin`). */
const markersByFile = new Map<string, Map<number, MarkerSite>>();

function sizeTextAttr(el: JsxOpeningElement | JsxSelfClosingElement): JsxAttribute | undefined {
  const attr = el.getAttribute("size");
  if (attr === undefined || !Node.isJsxAttribute(attr)) {
    return;
  }
  const init = attr.getInitializer();
  return init !== undefined && Node.isStringLiteral(init) && init.getLiteralText() === "text" ? attr : undefined;
}

/** Arm B — the marker vocabulary is two-sided from birth: malformed, stale, over-exempting all RED. */
function markerVerdict(marker: MarkerSite): string | undefined {
  if (!marker.wellFormed) {
    return `malformed ${MARKER} marker — the reason is required (\`${MARKER}: <why this disclosure lives in running content>\`); a bare marker exempts NOTHING and must not sit there looking like protection (tooling/src/verify/gates/sub-floor-disclosure.ts).`;
  }
  if (marker.consumed === 0) {
    return `stale ${MARKER} marker — no \`size="text"\` CollapsibleTrigger on the line below it. The site took the control default, moved, or was never guarded; delete the marker — a stale exemption is a loaded gun (tooling/src/verify/gates/sub-floor-disclosure.ts).`;
  }
  return marker.consumed > 1
    ? `over-exempting ${MARKER} marker — it absolved ${marker.consumed} triggers at once. One marker, one trigger: put each element on its own line with its own marker (tooling/src/verify/gates/sub-floor-disclosure.ts).`
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

/** Arm C — blindness tripwire (§4.6): the size vocabulary must still be declared at its home. */
function reportVocabularyTripwire(ctx: GateRunCtx): void {
  const variants = ctx.project.getSourceFile(`${ctx.root}/${VARIANTS_HOME}`);
  if (variants === undefined) {
    return; // conformance mini-projects legitimately omit it; the real tree always loads it
  }
  const code = blankTsComments(variants);
  for (const key of ["text", "control"]) {
    if (!new RegExp(`\\b${key}\\b\\s*:`, "u").test(code)) {
      ctx.report({
        file: GATE_SELF,
        line: 1,
        column: 0,
        message: `collapsible size arm \`${key}\` is no longer declared in ${VARIANTS_HOME} — the vocabulary this gate guards rotted; re-derive it in tooling/src/verify/gates/sub-floor-disclosure.ts`,
      });
    }
  }
}

export const gate: GateDescriptor = {
  name: "sub-floor-disclosure",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3) · docs/design/885-884-boundary-reservation-and-touch-floor.md §2",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => p.startsWith("packages/client/src/") || p.startsWith("packages/ui/src/"),
  kinds: [SyntaxKind.JsxOpeningElement, SyntaxKind.JsxSelfClosingElement],
  begin: () => {
    markersByFile.clear();
  },
  visitFile: (sf, ctx) => {
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
    if (!(Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node)) || node.getTagNameNode().getText() !== TRIGGER) {
      return;
    }
    const attr = sizeTextAttr(node);
    if (attr === undefined) {
      return;
    }
    const rel = repoRel(ctx.root, sf.getFilePath());
    const elementLine = sf.getLineAndColumnAtPos(node.getStart()).line;
    const marker = markersByFile.get(rel)?.get(elementLine - 1);
    if (marker !== undefined && marker.wellFormed) {
      marker.consumed += 1;
      return;
    }
    ctx.report(attr, { token: "text", offset: Math.max(attr.getText().indexOf("text"), 0) });
  },
  run: (ctx) => {
    reportMarkerVerdicts(ctx);
    reportVocabularyTripwire(ctx);
  },
  mustFlag: [
    {
      files: 'export const G = <CollapsibleTrigger size="text">Advanced</CollapsibleTrigger>;\n',
      at: "packages/client/src/features/a/unmarked.tsx",
      expect: { count: 1, token: "text" },
      why: "the founding shape — a sub-floor disclosure with no reasoned marker: the floor arm silently not taken",
    },
    {
      files: '// @sub-floor-ok\nexport const G = <CollapsibleTrigger size="text">Advanced</CollapsibleTrigger>;\n',
      at: "packages/client/src/features/a/bare.tsx",
      expect: { count: 2, messageIncludes: "malformed" },
      why: "arm B: a reason-less marker is MALFORMED (its own red) and exempts nothing (the violation still reds) — two findings",
    },
    {
      files: "// @sub-floor-ok: this row took the control default in #884\nexport const x = 1;\n",
      at: "packages/client/src/features/a/stale.tsx",
      expect: { count: 1, messageIncludes: "stale" },
      why: "arm B: a marker absolving no adjacent guarded trigger is a loaded gun — RED, never silence",
    },
    {
      files: {
        [VARIANTS_HOME]: "// the text and control size arms used to be spelled here\nexport const collapsibleVariants = { size: { big: {} } };\n",
      },
      expect: { count: 2, messageIncludes: "no longer declared" },
      why: "arm C (§4.6): the declaring variants file lost BOTH size keys — two reds, never silent green; a comment listing the deleted arms cannot keep it healthy (blankTsComments)",
    },
  ],
  mustPass: [
    {
      files: "export const G = <CollapsibleTrigger>Advanced</CollapsibleTrigger>;\n",
      at: "packages/client/src/features/a/default.tsx",
      why: "the inverted default — a bare trigger takes the control floor; nothing to justify",
    },
    {
      files:
        '// @sub-floor-ok: sits mid-paragraph in running prose — a control box would shear it off its copy\nexport const G = <CollapsibleTrigger size="text">show more</CollapsibleTrigger>;\n',
      at: "packages/client/src/features/a/marked.tsx",
      why: "the sanctioned escape: a reasoned line-adjacent marker",
    },
    {
      files: 'export const G = <CollapsibleTrigger size="control">Advanced</CollapsibleTrigger>;\n',
      at: "packages/client/src/features/a/explicit.tsx",
      why: "an explicit control arm (now redundant with the default) is not sub-floor — passes",
    },
    {
      files: 'const s = "the @sub-floor-ok: grammar lives in sub-floor-disclosure.ts";\nexport const x = s;\n',
      at: "packages/client/src/features/a/mention.tsx",
      why: "the mention fence: the grammar inside a STRING is inert — neither an exemption nor a stale red",
    },
    {
      files: 'const arm = "text";\nexport const G = <CollapsibleTrigger size={arm}>Advanced</CollapsibleTrigger>;\n',
      at: "packages/client/src/features/a/variable.tsx",
      why: "DECLARED LIMIT: a size reached through a variable is invisible to the literal-shape reader (the class every size gate shares)",
    },
  ],
};
