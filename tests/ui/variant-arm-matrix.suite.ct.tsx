// CT: the VARIANT-ARM MATRIX — every storied tv() arm rendered under every shipped theme and judged
// with design-audit's own pure check kernels. Full design record: variant-arm-matrix.def.ts (scope
// split, rejected alternatives, environment axes, rule scope, accounting law). The one-line version:
// this suite answers "does this arm fail INTRINSICALLY" (a bad colour pair, an off-ramp text step, a
// collapsed silhouette) so the arm is caught BEFORE any surface adopts it; the live audit answers "on
// this surface" and keeps the composition-dependent rules (text-over-art).
//
// GATHER here, JUDGE there: the in-page pass below collects RAW computed facts only (canvas-resolved
// ink + backdrop layer stack + geometry). Every threshold, exemption, composite and verdict is imported
// from @orb/tooling — checkContrast / checkGrayOnColor / checkTextStyle / checkControlAspect and the
// wcag kernel — never re-derived (two drift incidents made that module the one home; this suite must
// not mint a third algorithm). The inactive classifier runs as the VERBATIM shared expression in a
// string script (snap ops/contrast.ts's pattern — the expr is a string constant precisely so every
// instrument can inline it unmodified), joined to pass-1 samples by a stamped data-vam-ref.
//
// EXPECTED RESULT: zero findings — the tokens were designed as a system. The suite proves it CAN fail
// via the planted probe arm (fg == bg token), and proves each theme arm actually LANDED via the
// wrapper-polarity liveness read (a data-theme typo silently falls through to :root — #875 F2).
// A REAL arm failing is a product finding: report it with the receipt; do not tune the kernel.

import type { InactiveKind, Rgb } from "@orb/tooling/_shared/wcag";
import { compositeForeground, INACTIVE_KIND_EXPR, relativeLuminance } from "@orb/tooling/_shared/wcag";
import type { ContrastInput, Finding, TextStyleInput } from "@orb/tooling/ui-audit";
import { checkContrast, checkControlAspect, checkGrayOnColor, checkTextStyle, isAtOrAboveSeverity } from "@orb/tooling/ui-audit";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { ExpectedFinding, ThemeArm, VariantArmStoryDef } from "./variant-arm-matrix.def.ts";
import { EXPECTED_FINDINGS, JUDGED_RULES, THEME_ARMS, VARIANT_ARM_STORY_DEFS } from "./variant-arm-matrix.def.ts";
import { inactiveClassification } from "./variant-arm-matrix.gather.ts";
import type { ArmPlan } from "./variant-arm-matrix.plan.ts";
import { armPlanFor } from "./variant-arm-matrix.plan.ts";
import { VariantArmCells, VariantArmContrastProbe } from "./variant-arm-matrix.stories.tsx";

// ── Raw fact shapes (in-page gather output — plain data, no verdicts) ─────────────────────────────

interface RawLayer {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
  readonly image: boolean;
}

interface RawText {
  /** The pass-2 join key, stamped on the element as data-vam-ref. */
  readonly ref: string;
  readonly label: string;
  readonly ink: { readonly r: number; readonly g: number; readonly b: number; readonly a: number };
  /** Accumulated ancestor `opacity` product (the group dimmer — pixel-contrast's second dimmer). */
  readonly ancestorOpacity: number;
  /** Ancestor background layers, NEAREST FIRST, ending at the first opaque one when reached. */
  readonly layers: readonly RawLayer[];
  readonly reachedOpaque: boolean;
  readonly fontSizePx: number;
  readonly fontWeight: number;
  readonly tag: string;
  readonly directTextLen: number;
  readonly directText: string;
  readonly totalTextLen: number;
  readonly lineHeightPx: number | null;
  readonly letterSpacingPx: number;
  readonly textTransform: string;
  readonly capsText: boolean;
  readonly textAlign: string;
  readonly hyphens: string;
  readonly rectWidth: number;
  readonly chWidthPx: number;
  readonly isProseTag: boolean;
  readonly isHeading: boolean;
  readonly interactive: boolean;
  readonly codeContext: boolean;
  readonly srOnly: boolean;
  readonly ariaHidden: boolean;
  readonly voice: string;
}

interface RawRole {
  readonly label: string;
  readonly role: string;
  readonly width: number;
  readonly height: number;
  readonly animating: boolean;
}

interface RawCell {
  readonly cell: string;
  readonly state: "disabled" | "rest";
  readonly texts: readonly RawText[];
  readonly roles: readonly RawRole[];
}

interface RawGather {
  /** The mount wrapper's own resolved background — the theme-polarity liveness fact. */
  readonly wrapperBg: { readonly r: number; readonly g: number; readonly b: number; readonly a: number };
  readonly cells: readonly RawCell[];
}

/** In-page ancestor-background walk result (types are erased before the evaluate callback ships). */
interface LayerWalk {
  readonly layers: RawLayer[];
  readonly reachedOpaque: boolean;
}

/** In-page typography fact slice (erased at serialisation, mirrors the TextStyleInput fields). */
interface TypeFacts {
  readonly fontSizePx: number;
  readonly fontWeight: number;
  readonly lineHeightPx: number | null;
  readonly letterSpacingPx: number;
  readonly textTransform: string;
  readonly capsText: boolean;
  readonly textAlign: string;
  readonly hyphens: string;
  readonly chWidthPx: number;
}

/** In-page context fact slice (erased at serialisation). */
interface ContextFacts {
  readonly interactive: boolean;
  readonly codeContext: boolean;
  readonly srOnly: boolean;
  readonly ariaHidden: boolean;
  readonly voice: string;
}

/** PASS 1 — one in-page sweep over every [data-cell]: canvas-resolved colours (the engine converts
 *  oklch — the pixel-contrast precedent; an rgb() regex returns nothing on this tree's tokens), the
 *  ancestor background stack for node-side compositing, and the raw text/role facts the kernels judge.
 *  Each sampled text element is STAMPED data-vam-ref for the pass-2 classifier join. */
function gatherRawFacts(page: Page): Promise<RawGather> {
  return page.evaluate(() => {
    const wrapper = document.querySelector('[data-testid="variant-arm-root"]');
    if (wrapper === null) {
      throw new Error("variant-arm-matrix: mount wrapper not found");
    }
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    // THE CANVAS LIVES INSIDE THE THEME WRAPPER — this is load-bearing, not hygiene. The semantic-intent
    // tokens are ONE `light-dark(a, b)` string (D71), and canvas colour parsing resolves `light-dark()`
    // against the CANVAS ELEMENT's own used color-scheme. A detached canvas resolves against the page
    // root (the CT harness's dark base), so under the light arm every light-dark ink read back its DARK
    // arm — measured on this suite's first run as a wall of ~1.07:1 "findings" on arms the eye reads
    // fine. Inside the wrapper, the canvas inherits the same scheme as the cells it measures.
    canvas.style.position = "absolute";
    canvas.style.width = "1px";
    canvas.style.height = "1px";
    wrapper.append(canvas);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx === null) {
      throw new Error("variant-arm-matrix: no 2d context to resolve colours through");
    }
    const maxChannel = 255;
    const resolve = (css: string): { r: number; g: number; b: number; a: number } => {
      ctx.clearRect(0, 0, 1, 1);
      // The keyword sentinel resets fillStyle between reads (an invalid parse KEEPS the previous value,
      // which would mis-attribute one element's colour to the next) — a keyword, not a colour literal,
      // per the §13.7 no-hardcoded-colour clause.
      ctx.fillStyle = "transparent";
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return { r: r ?? 0, g: g ?? 0, b: b ?? 0, a: (a ?? maxChannel) / maxChannel };
    };
    const collapse = (value: string | null): string => (value ?? "").replace(/\s+/gu, " ").trim();
    const proseTags = new Set(["p", "li", "td", "th", "dd", "blockquote", "figcaption"]);
    const headingTags = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
    const interactiveSel =
      'a[href],button,input,select,textarea,[role="button"],[role="option"],[role="tab"],[role="switch"],[role="checkbox"],[role="radio"],[role="slider"],[role="menuitem"],[role="combobox"],[role="link"]';
    const capsRe = /[A-Za-zÀ-ɏ]/u;

    const directTextOf = (el: Element): string => {
      let direct = "";
      for (const child of el.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          direct += child.textContent ?? "";
        }
      }
      return collapse(direct);
    };

    const nodeLayers = (nodeStyle: CSSStyleDeclaration): RawLayer[] => {
      const found: RawLayer[] = [];
      if (nodeStyle.backgroundImage !== "none") {
        found.push({ r: 0, g: 0, b: 0, a: 0, image: true });
      }
      const bg = resolve(nodeStyle.backgroundColor);
      if (bg.a > 0) {
        found.push({ ...bg, image: false });
      }
      return found;
    };

    const layersOf = (el: Element): LayerWalk => {
      const layers: RawLayer[] = [];
      let reachedOpaque = false;
      for (let node: Element | null = el; node !== null; node = node.parentElement) {
        const found = nodeLayers(getComputedStyle(node));
        layers.push(...found);
        if (found.some((layer) => layer.image === false && layer.a >= 0.999)) {
          reachedOpaque = true;
          break;
        }
      }
      return { layers, reachedOpaque };
    };

    const opacityOf = (el: Element): number => {
      let product = 1;
      for (let node: Element | null = el; node !== null; node = node.parentElement) {
        product *= Number.parseFloat(getComputedStyle(node).opacity);
      }
      return product;
    };

    const roleOf = (el: Element, label: string): RawRole | null => {
      const role = el.getAttribute("role");
      const rect = el.getBoundingClientRect();
      if (role === null || role.trim().length === 0 || rect.width <= 0 || rect.height <= 0) {
        return null;
      }
      return { label, role: role.trim().toLowerCase(), width: rect.width, height: rect.height, animating: el.getAnimations().length > 0 };
    };

    const typeFactsOf = (style: CSSStyleDeclaration, direct: string): TypeFacts => {
      const lineH = Number.parseFloat(style.lineHeight);
      const letterS = Number.parseFloat(style.letterSpacing);
      ctx.font = `${style.fontStyle || "normal"} ${style.fontWeight || "400"} ${style.fontSize} ${style.fontFamily}`;
      return {
        fontSizePx: Number.parseFloat(style.fontSize),
        fontWeight: Number.parseFloat(style.fontWeight),
        lineHeightPx: Number.isNaN(lineH) ? null : lineH,
        letterSpacingPx: Number.isNaN(letterS) ? 0 : letterS,
        textTransform: style.textTransform,
        capsText: capsRe.test(direct) && direct === direct.toUpperCase(),
        textAlign: style.textAlign,
        hyphens: style.hyphens,
        chWidthPx: ctx.measureText("0").width,
      };
    };

    const contextFactsOf = (el: Element, style: CSSStyleDeclaration, rect: DOMRect, totalText: string): ContextFacts => {
      const interactiveHost = el.closest(interactiveSel);
      return {
        interactive: interactiveHost !== null && (interactiveHost === el || totalText === collapse(interactiveHost.textContent)),
        codeContext: el.closest("pre,code,kbd,samp,var,svg") !== null,
        srOnly: (rect.width <= 2 && rect.height <= 2) || style.clipPath.includes("inset(50%)"),
        ariaHidden: el.closest('[aria-hidden="true"]') !== null,
        voice: el.closest("[data-voice]")?.getAttribute("data-voice") ?? "",
      };
    };

    const textOf = (el: Element, ref: string): RawText | null => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const direct = directTextOf(el);
      if (direct.length === 0 || style.visibility === "hidden" || rect.width <= 0 || rect.height <= 0) {
        return null;
      }
      el.setAttribute("data-vam-ref", ref);
      const { layers, reachedOpaque } = layersOf(el);
      const totalText = collapse(el.textContent);
      const tag = el.tagName.toLowerCase();
      return {
        ref,
        label: `${tag}[${ref}] "${direct.slice(0, 40)}"`,
        ink: resolve(style.color),
        ancestorOpacity: opacityOf(el),
        layers,
        reachedOpaque,
        tag,
        directTextLen: direct.length,
        directText: direct.slice(0, 120),
        totalTextLen: totalText.length,
        rectWidth: rect.width,
        isProseTag: proseTags.has(tag),
        isHeading: headingTags.has(tag),
        ...typeFactsOf(style, direct),
        ...contextFactsOf(el, style, rect, totalText),
      };
    };

    const wrapperBg = resolve(getComputedStyle(wrapper).backgroundColor);

    let refCounter = 0;
    const cells = [...document.querySelectorAll<HTMLElement>("[data-cell]")].map((cellEl) => {
      const cellId = cellEl.getAttribute("data-cell") ?? "";
      const state = cellEl.getAttribute("data-cell-state") === "disabled" ? ("disabled" as const) : ("rest" as const);
      const texts: RawText[] = [];
      const roles: RawRole[] = [];
      const nodes = [cellEl, ...cellEl.querySelectorAll<HTMLElement>("*")];
      for (const el of nodes) {
        refCounter += 1;
        const ref = `t${String(refCounter)}`;
        const roleFact = roleOf(el, `${el.tagName.toLowerCase()}[role]#${String(refCounter)}`);
        if (roleFact !== null) {
          roles.push(roleFact);
        }
        const textFact = textOf(el, ref);
        if (textFact !== null) {
          texts.push(textFact);
        }
      }
      return { cell: cellId, state, texts, roles };
    });
    return { wrapperBg, cells };
  });
}

/** PASS 2 — the shared inactive classifier, VERBATIM, in a string script (the snap/walker pattern:
 *  INACTIVE_KIND_EXPR is a string constant so instruments inline it unmodified — one home, no re-spelled
 *  selector order). Joined to pass-1 samples by the stamped data-vam-ref.
 *
 *  A string `evaluate` returns `unknown` and there is no compiler across the page boundary, so the payload
 *  is SETTLED at the seam against the refs pass 1 actually sampled (#1015 — see the gather module's header
 *  for why a missing ref is the silent arm). Every arm of the refusal is pinned in
 *  tests/ui/variant-arm-parity.suite.test.ts. */
function sampledRefsOf(raw: RawGather): string[] {
  return raw.cells.flatMap((cell) => cell.texts.map((text) => text.ref));
}

async function classifyInactive(page: Page, raw: RawGather): Promise<Record<string, InactiveKind>> {
  const script = `(() => {
    const out = {};
    for (const el of document.querySelectorAll("[data-vam-ref]")) {
      out[el.getAttribute("data-vam-ref")] = ${INACTIVE_KIND_EXPR};
    }
    return out;
  })()`;
  const parsed: unknown = await page.evaluate(script);
  return inactiveClassification(parsed, sampledRefsOf(raw));
}

// ── Node-side: resolve, judge with the imported kernels, and account ──────────────────────────────

type ResolvedBackdrop = { readonly kind: "flat"; readonly color: Rgb } | { readonly kind: "image-layer" } | { readonly kind: "unresolved" };

/** Fold the ancestor layer stack onto its opaque base with the kernel's own source-over composite. */
function resolveBackdrop(text: RawText): ResolvedBackdrop {
  if (text.layers.some((layer) => layer.image)) {
    return { kind: "image-layer" };
  }
  const base = text.layers.at(-1);
  if (text.reachedOpaque === false || base === undefined) {
    return { kind: "unresolved" };
  }
  let acc: Rgb = { r: base.r, g: base.g, b: base.b };
  for (let index = text.layers.length - 2; index >= 0; index -= 1) {
    const layer = text.layers[index];
    if (layer !== undefined) {
      acc = compositeForeground({ r: layer.r, g: layer.g, b: layer.b }, acc, layer.a);
    }
  }
  return { kind: "flat", color: acc };
}

function contrastInputFor(scope: string, sample: JoinedText, backdrop: Rgb): ContrastInput {
  return {
    selector: `${scope} ${sample.text.label}`,
    color: { r: sample.text.ink.r, g: sample.text.ink.g, b: sample.text.ink.b },
    backdrop: { kind: "flat", color: backdrop },
    fontSizePx: sample.text.fontSizePx,
    fontWeight: sample.text.fontWeight,
    inactive: sample.inactive,
    // TWO independent dimmers multiplied, exactly as the pixel sampler does: the ink's own alpha and
    // the accumulated ancestor opacity (tests/support/browser/pixel-contrast.ts readInk).
    foregroundOpacity: sample.text.ink.a * sample.text.ancestorOpacity,
  };
}

function textStyleInputFor(scope: string, text: RawText): TextStyleInput {
  return {
    selector: `${scope} ${text.label}`,
    tag: text.tag,
    directTextLen: text.directTextLen,
    directText: text.directText,
    totalTextLen: text.totalTextLen,
    fontSizePx: text.fontSizePx,
    lineHeightPx: text.lineHeightPx,
    letterSpacingPx: text.letterSpacingPx,
    textTransform: text.textTransform,
    capsText: text.capsText,
    textAlign: text.textAlign,
    hyphens: text.hyphens,
    rectWidth: text.rectWidth,
    chWidthPx: text.chWidthPx,
    isProseTag: text.isProseTag,
    isHeading: text.isHeading,
    interactive: text.interactive,
    codeContext: text.codeContext,
    srOnly: text.srOnly,
    ariaHidden: text.ariaHidden,
    voice: text.voice,
  };
}

/** The one role a silhouette rule currently exists for (checks-a11y CONTROL_SILHOUETTES). */
const SILHOUETTE_ROLES = new Set(["switch"]);

interface RuleTally {
  judged: number;
  withheld: number;
  excluded: number;
}

interface JoinedText {
  readonly text: RawText;
  readonly inactive: InactiveKind;
}

interface CellJudgment {
  readonly findings: readonly Finding[];
  /** rule id → this cell's disposition bucket. */
  readonly disposition: ReadonlyMap<string, keyof RuleTally>;
  readonly withheldReasons: readonly string[];
  readonly textCount: number;
}

interface ColourSplit {
  readonly flat: readonly { readonly sample: JoinedText; readonly input: ContrastInput }[];
  readonly refused: readonly string[];
}

function splitColourSamples(scope: string, samples: readonly JoinedText[]): ColourSplit {
  const flat: { sample: JoinedText; input: ContrastInput }[] = [];
  const refused: string[] = [];
  for (const sample of samples) {
    const backdrop = resolveBackdrop(sample.text);
    if (backdrop.kind === "flat") {
      flat.push({ sample, input: contrastInputFor(scope, sample, backdrop.color) });
    } else {
      refused.push(`${sample.text.label}: ${backdrop.kind} (composition/base outside this suite's flat-token contract)`);
    }
  }
  return { flat, refused };
}

function colourBucket(split: ColourSplit): keyof RuleTally {
  if (split.flat.length > 0) {
    return "judged";
  }
  return split.refused.length > 0 ? "withheld" : "excluded";
}

function judgeColour(split: ColourSplit, findings: Finding[], disposition: Map<string, keyof RuleTally>): void {
  const bucket = colourBucket(split);
  disposition.set("contrast", bucket);
  disposition.set("gray-on-color", bucket);
  const hasInactiveSubject = split.flat.some(({ sample }) => sample.inactive !== "none");
  let inactiveBucket: keyof RuleTally = "excluded";
  if (hasInactiveSubject) {
    inactiveBucket = "judged";
  } else if (bucket === "withheld") {
    inactiveBucket = "withheld";
  }
  disposition.set("inactive-control-legibility", inactiveBucket);
  for (const { input } of split.flat) {
    const contrastFinding = checkContrast(input);
    if (contrastFinding !== null) {
      findings.push(contrastFinding);
    }
    const grayFinding = checkGrayOnColor(input);
    if (grayFinding !== null) {
      findings.push(grayFinding);
    }
  }
}

function judgeAspect(scope: string, roles: readonly RawRole[], findings: Finding[], disposition: Map<string, keyof RuleTally>): string[] {
  const silhouettes = roles.filter((entry) => SILHOUETTE_ROLES.has(entry.role));
  const still = silhouettes.filter((entry) => entry.animating === false);
  let bucket: keyof RuleTally = "excluded";
  if (still.length > 0) {
    bucket = "judged";
  } else if (silhouettes.length > 0) {
    bucket = "withheld";
  }
  disposition.set("control-aspect", bucket);
  for (const entry of still) {
    const finding = checkControlAspect({ selector: `${scope} ${entry.label}`, role: entry.role, width: entry.width, height: entry.height, animating: false });
    if (finding !== null) {
      findings.push(finding);
    }
  }
  return silhouettes.length > still.length ? ["silhouette control measured mid-animation — box is a frame, not a design"] : [];
}

function judgeCell(scope: string, cell: RawCell, inactiveByRef: Readonly<Record<string, InactiveKind>>): CellJudgment {
  const findings: Finding[] = [];
  const disposition = new Map<string, keyof RuleTally>();
  const painted: JoinedText[] = cell.texts.filter((text) => text.srOnly === false).map((text) => ({ text, inactive: inactiveByRef[text.ref] ?? "none" }));
  const split = splitColourSamples(scope, painted);
  judgeColour(split, findings, disposition);
  const textBucket: keyof RuleTally = painted.length > 0 ? "judged" : "excluded";
  disposition.set("text-below-ramp", textBucket);
  disposition.set("undersized-ui-text", textBucket);
  for (const sample of painted) {
    findings.push(...checkTextStyle(textStyleInputFor(scope, sample.text)));
  }
  const aspectReasons = judgeAspect(scope, cell.roles, findings, disposition);
  return { findings, disposition, withheldReasons: [...split.refused, ...aspectReasons], textCount: painted.length };
}

interface SuiteAccounting {
  readonly story: string;
  readonly theme: ThemeArm;
  readonly strategy: ArmPlan["strategy"];
  readonly candidates: number;
  readonly perRule: Readonly<Record<string, RuleTally>>;
  readonly withheld: readonly string[];
}

interface MountJudgment {
  readonly findings: readonly Finding[];
  readonly accounting: SuiteAccounting;
  readonly blindCells: readonly string[];
}

interface MountInput {
  readonly scope: string;
  readonly raw: RawGather;
  readonly inactiveByRef: Readonly<Record<string, InactiveKind>>;
  readonly plan: ArmPlan;
  readonly theme: ThemeArm;
}

function judgeMount({ scope, raw, inactiveByRef, plan, theme }: MountInput): MountJudgment {
  const findings: Finding[] = [];
  const perRule: Record<string, RuleTally> = {};
  for (const rule of JUDGED_RULES) {
    perRule[rule] = { judged: 0, withheld: 0, excluded: 0 };
  }
  const withheld: string[] = [];
  const blindCells: string[] = [];
  for (const cell of raw.cells) {
    const cellScope = `${scope}[${cell.state}:${cell.cell}]`;
    const judgment = judgeCell(cellScope, cell, inactiveByRef);
    findings.push(...judgment.findings);
    for (const [rule, bucket] of judgment.disposition) {
      const tally = perRule[rule];
      if (tally !== undefined) {
        tally[bucket] += 1;
      }
    }
    withheld.push(...judgment.withheldReasons.map((reason) => `${cellScope}: ${reason}`));
    if (judgment.textCount === 0 && cell.state === "rest") {
      blindCells.push(cellScope);
    }
  }
  return {
    findings,
    accounting: { story: plan.story, theme, strategy: plan.strategy, candidates: raw.cells.length, perRule, withheld },
    blindCells,
  };
}

// ── The severity floor (#1016) ────────────────────────────────────────────────────────────────────
// THE HOUSE PRECEDENT IS A FLOOR, NOT A BUCKET. The CLI already reports every severity and FAILS on a
// configurable one (`ops/run.ts`: `findings.some((f) => isAtOrAboveSeverity(f.severity, opts.failOn))`),
// so a P3 is printed and never fatal. This suite adopts the same floor through the SAME exported
// predicate rather than inventing a second disposition, which is what un-parked the disabled axis:
// `inactive-control-legibility` fires on STANDARD disabled dimming BY DESIGN (button/toggle disabled
// arms measured 2.3-2.9:1 on all three themes, 2026-09-01), so a zero-findings assertion over disabled
// arms is structurally red forever — while a baseline or an exclusion would make the row invisible, and
// a control nobody can see IS a defect, just not the AA one.
//
// So: advisories are TALLIED per rule and PRINTED into the run artifact beside the accounting, and the
// planted 1.00:1 disabled twin (VariantArmContrastProbe) proves a real advisory still surfaces.
const ARM_FAIL_ON = "P2";

function isBlocking(finding: Finding): boolean {
  return isAtOrAboveSeverity(finding.severity, ARM_FAIL_ON);
}

/** One advisory row as it lands in the annotation — enough to act on without re-running. */
function advisoryRow(finding: Finding): string {
  return `${finding.severity} ${finding.rule} ${finding.selector}: ${finding.value}`;
}

// ── The matrix ────────────────────────────────────────────────────────────────────────────────────

// Lazy per-story plan cache: text's pairwise plan costs ~7s (measured 2026-09-01), so it is computed
// inside the owning test's own timeout budget rather than at module load for every worker.
const plans = new Map<string, ArmPlan>();

function planFor(story: VariantArmStoryDef): ArmPlan {
  const cached = plans.get(story.key);
  if (cached !== undefined) {
    return cached;
  }
  const plan = armPlanFor(story);
  plans.set(story.key, plan);
  return plan;
}

for (const story of VARIANT_ARM_STORY_DEFS) {
  for (const theme of THEME_ARMS) {
    test(`${story.key}: every arm judged clean under ${theme}`, async ({ mount, page }) => {
      const plan = planFor(story);
      await mount(<VariantArmCells cells={plan.cells} storyKey={story.key} theme={theme} withDisabled={story.supportsDisabled} />);
      const raw = await gatherRawFacts(page);
      const inactiveByRef = await classifyInactive(page, raw);
      // THEME LIVENESS: the wrapper paints the token background of the ACTIVE palette — light must be
      // light, both dark palettes dark. A data-theme typo falls through to :root silently (#875 F2);
      // this read is what makes each theme arm a measurement instead of an intention.
      const wrapperLum = relativeLuminance({ r: raw.wrapperBg.r, g: raw.wrapperBg.g, b: raw.wrapperBg.b });
      expect(raw.wrapperBg.a, "the mount wrapper must paint an OPAQUE token background").toBeGreaterThanOrEqual(0.999);
      const polarityLanded = theme === "light" ? wrapperLum > 0.5 : wrapperLum < 0.5;
      expect(polarityLanded, `theme "${theme}" did not land — wrapper luminance ${wrapperLum.toFixed(3)}`).toBe(true);
      const expectedCells = plan.cells.length * (story.supportsDisabled ? 2 : 1);
      expect(raw.cells.length, "every planned arm cell renders exactly once").toBe(expectedCells);

      const { findings, accounting, blindCells } = judgeMount({ scope: `${story.key}/${theme}`, raw, inactiveByRef, plan, theme });
      // The denominator statement, attached to the run artifact (reports/ct-report.json) — now WITH the
      // sub-floor advisories, which is what keeps the floor from being a swallow (#1016).
      const advisories = findings.filter((finding) => isBlocking(finding) === false);
      test.info().annotations.push({ type: "variant-arm-accounting", description: JSON.stringify({ ...accounting, advisories: advisories.map(advisoryRow) }) });
      // candidates = judged + withheld + excluded, PER RULE — the partition law. A missing row sums to
      // -1 (sentinel), which fails against the real candidate count loudly.
      for (const rule of JUDGED_RULES) {
        const tally = accounting.perRule[rule] ?? { judged: -1, withheld: 0, excluded: 0 };
        expect(tally.judged + tally.withheld + tally.excluded, `${rule}: judged+withheld+excluded === candidates`).toBe(accounting.candidates);
      }
      const blindWhereTextPromised = story.expectText ? blindCells : [];
      expect(blindWhereTextPromised, "expectText story produced cells with ZERO text samples — the gatherer went blind, not the arm").toEqual([]);
      // KNOWN-DEFECT PINS (EXPECTED_FINDINGS, def.ts): a pinned defect keeps the suite green WITHOUT
      // hiding — any unpinned finding still reds, and a pinned row that stops matching (the fix landed,
      // or only partially) reds HERE so the fixing commit must delete/adjust the row.
      const rows = EXPECTED_FINDINGS.filter((row) => row.story === story.key && row.theme === theme);
      const matchesRow = (finding: Finding, row: ExpectedFinding): boolean =>
        finding.rule === row.rule && row.cellContains.every((part) => finding.selector.includes(part));
      // The pin rows below are checked against EVERY finding (a pinned P3 must still stop matching when
      // its defect is fixed); only the BLOCKING ones can fail the arm.
      const unexpected = findings.filter((finding) => isBlocking(finding) && rows.some((row) => matchesRow(finding, row)) === false);
      for (const row of rows) {
        const matched = findings.filter((finding) => matchesRow(finding, row));
        expect(matched.length, `EXPECTED-FINDING row no longer matches its defect — ${row.reason}`).toBe(row.count);
      }
      expect(unexpected, `arm findings at or above ${ARM_FAIL_ON} for ${story.key} under ${theme} — each names its cell`).toEqual([]);
    });
  }
}

// ── Planted positive control — the green that CAN fail ────────────────────────────────────────────

test("PLANTED CONTROL: the fg==bg probe arm produces a contrast finding through the full pipeline", async ({ mount, page }) => {
  await mount(<VariantArmContrastProbe />);
  const raw = await gatherRawFacts(page);
  const inactiveByRef = await classifyInactive(page, raw);
  const probePlan: ArmPlan = { story: "probe", axes: [], strategy: "full-cross", cells: [] };
  const { findings } = judgeMount({ scope: "probe", raw, inactiveByRef, plan: probePlan, theme: "hearth" });
  const contrast = findings.filter((finding) => finding.rule === "contrast");
  expect(contrast.length, "a 1.00:1 token pair MUST fire — zero findings here means the instrument went blind").toBeGreaterThan(0);

  // THE FLOOR'S OWN CONTROL (#1016): the SAME 1.00:1 pair inside a `:disabled` control. WCAG 1.4.3
  // exempts it from the AA minimum, so it must NOT be a contrast P1 — and it must NOT vanish either.
  // A severity floor that could not produce this row would be a silent exclusion wearing a floor's name.
  const advisories = findings.filter((finding) => isBlocking(finding) === false);
  const invisible = advisories.filter((finding) => finding.rule === "inactive-control-legibility");
  expect(invisible.length, "the disabled 1.00:1 twin MUST still surface as a P3 advisory — the floor prints, it does not swallow").toBeGreaterThan(0);
  expect(
    contrast.filter((finding) => finding.selector.includes("disabled")),
    "an INACTIVE control is 1.4.3-exempt — it must never be filed as an AA contrast failure",
  ).toEqual([]);
  expect(invisible.every(isBlocking), "the advisory must sit BELOW the fail floor").toBe(false);
});
