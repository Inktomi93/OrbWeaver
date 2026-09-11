// Gate: seed-theme-ink-contrast — every colour token the product paints as TEXT must clear WCAG
// AA-NORMAL 4.5:1 in EVERY SHIPPED SEED palette, on every ground it can rest on, INCLUDING its own
// `bg-<token>/N` tint and the `bg-accent` an interactive row paints on hover. Static, no browser.
// SCOPE: the seeds WE ship (theme.css). Custom `<ThemeScope>` palettes are clamp.ts's, not this gate's.
// COMMENT POSTURE: comment-SAFE — inks come from the shared static-class walk (authored values, not text).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NORMAL_MIN_RATIO } from "../../_shared/wcag.ts";
import type { ExemptionTable, GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import type { InkUse, SeedPalette } from "../lib/seed-theme-ink.ts";
import { collectInkUses, compositeOver, readSeedPalettes, toRgb, worstContrast } from "../lib/seed-theme-ink.ts";
import type { StaticClassCandidate } from "../lib/static-class-expression.ts";
import { walkStaticClassExpressions } from "../lib/static-class-expression.ts";

const THEME_CSS = "packages/ui/src/styles/theme.css";
const GATE_SELF = "tooling/src/verify/gates/seed-theme-ink-contrast.ts";
const INK_SOURCES = ["packages/ui/src/", "packages/client/src/"] as const;
const PERCENT = 100;
/** Shared reason for the six track-ramp strokes — one decision, six tokens. */
const TRACK_STROKE_WHY =
  "`RING_STROKE` feeds `currentColor` to the RingGauge arc stroke on aria-hidden decorative geometry (its own header, #697) — WCAG 1.4.11's 3:1 applies, not 4.5:1 text, and palette-contrast.suite.test.ts already enforces that floor per seed. ENDS the day this kit typesets with a track token, which is what this row's stale arm watches for.";
/** How much of a stale row's `why` the diagnostic quotes — enough to identify it, not a wall. */
const WHY_EXCERPT = 48;

/**
 * THE GROUNDS AN INK CAN REST ON — enumerated, because co-occurrence is not statically derivable and a
 * guessed ground manufactures findings. Each row is a claim about the product, with its receipt.
 * The accent row is the composition the 2026-09-01 seed audit found nobody had priced: a ListRow or a
 * Card paints `bg-accent` UNDER whatever the row contains, and rows contain status glosses and chips.
 */
const GROUNDS: Readonly<Record<string, string>> = {
  "--color-background": "the app canvas — every surfaceless run of text",
  "--color-card": "the tile/pane surface most status text and every soft chip rests on",
  "--color-popover": "menus, selects, dialogs — the elevated surface",
  "--color-surface-raised": "the raised chrome step (panel headers, rails)",
  "--color-sidebar": "the rail/sidebar plane",
  "--color-muted": "the quiet fill (neutral chips, zebra rows)",
  "--color-secondary": "the low-emphasis surface",
  "--color-accent":
    "THE INTERACTIVE GROUND: hover/selected on ListRow + Card (list-row/variants.ts:107,188,212, card/variants.ts:34) and the highlighted menu row",
};

/**
 * Tokens whose `text-*` use is NOT TEXT — keyed `<file>::<token>`, never by file alone.
 *
 * WHY THE KEY IS THE PAIR (2026-09-01, verifier F3): a FILE key exempts every ink in that file, so a
 * carrier that legitimately strokes six gauge colours also silently absolves the real label and value
 * text sitting beside them — `meter/variants.ts` paints `text-foreground` and `text-muted-foreground`
 * on its own readouts, and a file-keyed row was covering those too while its reason justified only the
 * strokes. Enumerating the pair makes the stated end condition a MECHANISM: the stale arm below reds
 * when an exempted (file, token) stops existing, not merely when a whole file stops painting any ink.
 *
 * And the key is the CARRIER pair, not the token, because the fact that exempts it lives at the
 * carrier: `currentColor` feeding an SVG stroke on aria-hidden geometry. A token-only key would be the
 * wrong inference and would have MISSED the defect that minted this gate — `text-highlight` was a
 * background token doing real text duty on three surfaces.
 *
 * DELIBERATELY NARROW: `text-primary` / `text-destructive` as gauge FILLS in the same file are NOT
 * exempted. They are decorative under 1.4.11's 3:1, so judging them at the stricter 4.5:1 text bar is
 * the conservative direction, they clear it today in all three seeds, and every row left out of this
 * table is a row that cannot rot.
 */
const DECORATIVE_STROKE_CARRIERS: ExemptionTable = {
  "packages/ui/src/charts/meter/variants.ts::track-1": { why: TRACK_STROKE_WHY },
  "packages/ui/src/charts/meter/variants.ts::track-2": { why: TRACK_STROKE_WHY },
  "packages/ui/src/charts/meter/variants.ts::track-3": { why: TRACK_STROKE_WHY },
  "packages/ui/src/charts/meter/variants.ts::track-4": { why: TRACK_STROKE_WHY },
  "packages/ui/src/charts/meter/variants.ts::track-5": { why: TRACK_STROKE_WHY },
  "packages/ui/src/charts/meter/variants.ts::track-6": { why: TRACK_STROKE_WHY },
  "packages/ui/src/charts/meter/variants.ts::border": {
    why: "the gauge RAIL stroke (`track: text-border`, three species) — `--color-border` is a translucent LINE token that has no opaque colour to judge as text at all, and the rail is aria-hidden geometry under 1.4.11. ENDS if a `track` slot ever typesets, or if border stops being the rail's colour.",
  },
  "packages/ui/src/charts/meter/variants.ts::muted": {
    why: "the UNFILLED segment (`filled:false -> segment: text-muted`) — a SURFACE token deliberately one ramp step from the panel, which is the whole point of an empty segment (its own header, #685/#693) and is 1.4.11 geometry, not text. ENDS if a segment ever carries a label.",
  },
  "packages/ui/src/primitives/switch/variants.ts::background": {
    why: "`readOnlyIcon` is the readonly LOCK GLYPH painted ON the switch thumb: `text-background` inverts against the thumb's own `bg-foreground` fill, measuring ~13:1 on the surface it actually sits on. An INVERTED pair ink — the `-foreground` suffix rule cannot see it because the inversion runs the other way (the INK is `background`) — and a glyph, judged at 1.4.11's 3:1. ENDS if this slot ever paints a text run, or if the thumb stops declaring its own fill.",
  },
};

interface Judged {
  readonly use: InkUse;
  readonly palette: string;
  readonly ground: string;
  readonly ratio: number;
}
interface Verdict {
  readonly failures: readonly Judged[];
  readonly measured: number;
  readonly unresolved: readonly string[];
}

function judgeInPalette(use: InkUse, palette: SeedPalette): Verdict {
  const failures: Judged[] = [];
  const unresolved: string[] = [];
  const inkValue = palette.vars.get(`--color-${use.token}`);
  if (inkValue === undefined) {
    return { failures, measured: 0, unresolved }; // not a palette token (`text-current`) — nothing to judge
  }
  const ink = toRgb(inkValue);
  if (ink === null) {
    return { failures, measured: 0, unresolved: [`--color-${use.token} @ ${palette.name} (${inkValue})`] };
  }
  let measured = 0;
  for (const groundVar of Object.keys(GROUNDS)) {
    const groundValue = palette.vars.get(groundVar);
    const ground = groundValue === undefined ? null : toRgb(groundValue);
    if (ground === null) {
      unresolved.push(`${groundVar} @ ${palette.name}`);
      continue;
    }
    const judged = use.selfTintPercent === null ? ground : compositeOver(ink, ground, use.selfTintPercent / PERCENT);
    const ratio = worstContrast(ink, judged);
    measured += 1;
    if (ratio < NORMAL_MIN_RATIO) {
      failures.push({ use, palette: palette.name, ground: groundVar, ratio });
    }
  }
  return { failures, measured, unresolved };
}

function reportBlind(ctx: GateRunCtx, what: string): void {
  ctx.report({
    file: GATE_SELF,
    line: 0,
    column: 0,
    message: `seed-theme-ink-contrast ${what} — instrument blindness, not a clean tree (tooling/src/verify/gates/seed-theme-ink-contrast.ts)`,
  });
}

function reportFailure(ctx: GateRunCtx, failure: Judged): void {
  const tint = failure.use.selfTintPercent === null ? "" : ` under its own ${failure.use.selfTintPercent}% tint`;
  // @finding-overload-ok: the ink is a class TOKEN inside a class string, not a node this walk hands back — and a seed palette failing AA is a ledger verdict, not a site an author may absolve.
  ctx.report({
    file: failure.use.file,
    line: failure.use.line,
    column: failure.use.column,
    token: failure.use.className,
    message: `${failure.use.className}${tint} measures ${failure.ratio.toFixed(2)}:1 on ${failure.ground} in the ${failure.palette} seed — below WCAG AA-NORMAL ${NORMAL_MIN_RATIO}:1 — see tooling/src/verify/gates/seed-theme-ink-contrast.ts`,
  });
}

/** The repo-relative path of a class carrier, or null when it is outside the ink sources. */
function carrierPath(candidate: StaticClassCandidate): string | null {
  const anchor = candidate.segments[0];
  if (anchor === undefined) {
    return null;
  }
  const absolute = anchor.node.getSourceFile().getFilePath();
  const root = INK_SOURCES.find((prefix) => absolute.includes(`/${prefix}`));
  return root === undefined ? null : root + absolute.slice(absolute.indexOf(`/${root}`) + root.length + 1);
}

function censusInks(ctx: GateRunCtx): readonly InkUse[] {
  const files = ctx.files.filter((file) => INK_SOURCES.some((root) => file.getFilePath().includes(`/${root}`)));
  if (files.length === 0) {
    return [];
  }
  return collectInkUses(walkStaticClassExpressions(files).candidates, carrierPath);
}

function reportStaleExemptions(ctx: GateRunCtx, seen: ReadonlySet<string>): void {
  for (const [pair, row] of Object.entries(DECORATIVE_STROKE_CARRIERS)) {
    if (!seen.has(pair)) {
      ctx.report({
        file: GATE_SELF,
        line: 0,
        column: 0,
        message: `stale decorative-stroke exemption: ${pair} is not painted any more — delete the row or re-prove it ("${row.why.slice(0, WHY_EXCERPT)}…") — tooling/src/verify/gates/seed-theme-ink-contrast.ts`,
      });
    }
  }
}

interface Sweep {
  readonly measured: number;
  readonly exemptSeen: ReadonlySet<string>;
  readonly unresolved: ReadonlySet<string>;
}

function sweep(ctx: GateRunCtx, uses: readonly InkUse[], palettes: readonly SeedPalette[]): Sweep {
  const exemptSeen = new Set<string>();
  const unresolved = new Set<string>();
  let measured = 0;
  for (const use of uses) {
    const exemptKey = `${use.file}::${use.token}`;
    if (DECORATIVE_STROKE_CARRIERS[exemptKey] !== undefined) {
      exemptSeen.add(exemptKey);
      continue;
    }
    for (const palette of palettes) {
      const verdict = judgeInPalette(use, palette);
      measured += verdict.measured;
      for (const miss of verdict.unresolved) {
        unresolved.add(miss);
      }
      for (const failure of verdict.failures) {
        reportFailure(ctx, failure);
      }
    }
  }
  return { measured, exemptSeen, unresolved };
}

function run(ctx: GateRunCtx): void {
  const themePath = join(ctx.root, THEME_CSS);
  if (!existsSync(themePath)) {
    return; // no shipped stylesheet in this fileset (a scoped run, a mini-project) — nothing to judge
  }
  const palettes = readSeedPalettes(readFileSync(themePath, "utf8"));
  if (palettes.length === 0) {
    reportBlind(ctx, "resolved zero seed palettes from theme.css");
    return;
  }
  const uses = censusInks(ctx);
  const { measured, exemptSeen, unresolved } = sweep(ctx, uses, palettes);
  // The zero-ink tripwire and the stale-exemption sweep are REAL-TREE claims: a conformance mini-project
  // legitimately carries neither, so both guard on a real-tree anchor (GATE-AUTHORING §4 rule 5) — the
  // gate's own source file being in the fileset this run walked.
  const realTree = ctx.files.some((file) => file.getFilePath().endsWith(GATE_SELF));
  if (realTree && uses.length === 0) {
    reportBlind(ctx, "found zero text-<token> inks across the ui + client sources");
  }
  if (realTree) {
    reportStaleExemptions(ctx, exemptSeen);
  }
  for (const miss of unresolved) {
    reportBlind(ctx, `could not resolve a colour for ${miss}`);
  }
  ctx.scan({ unit: `ink×ground×seed pair [palettes=${palettes.length} inks=${uses.length}]`, candidates: measured, scanned: measured });
}

export const gate: GateDescriptor = {
  name: "seed-theme-ink-contrast",
  docRow: "docs/architecture/core/Core-Enforcement-Active-Gates.md — Layer 3 (seed-palette ink-duty contrast)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "a colour token painted as TEXT does not clear WCAG AA-NORMAL 4.5:1 in every shipped seed palette, on every ground it can rest on — its own tint and the interactive hover ground included (tooling/src/verify/gates/seed-theme-ink-contrast.ts)",
  fix: "give the token a polarity-aware light-dark() arm in the family's own band, lower the self-tint alpha, or paint the text with an ink token instead of a surface/mark token",
  run,
  mustFlag: [
    {
      files: {
        "packages/ui/src/styles/theme.css":
          "@theme {\n--color-background: oklch(0.98 0.004 75);\n--color-card: oklch(0.995 0.003 75);\n--color-popover: oklch(0.995 0.003 75);\n--color-surface-raised: oklch(0.965 0.005 75);\n--color-sidebar: oklch(0.955 0.006 72);\n--color-muted: oklch(0.95 0.006 70);\n--color-secondary: oklch(0.94 0.008 70);\n--color-accent: oklch(0.93 0.01 70);\n--color-primary: oklch(0.55 0.16 50);\n}\n:root { color-scheme: light; }\n",
        "packages/ui/src/primitives/badge/variants.ts":
          "import { tv } from 'tailwind-variants';\nexport const badge = tv({ base: 'bg-primary/15 text-primary' });",
      },
      expect: { token: "text-primary" },
      why: "THE FOUNDING DEFECT, verbatim: the light seed's primary at oklch(0.55) doing ink duty under its own 15% tint — 3.97:1, invisible to every surface audit because no shipped surface had adopted the arm yet",
    },
    {
      files: {
        "packages/ui/src/styles/theme.css":
          "@theme {\n--color-card: oklch(0.205 0.006 60);\n--color-accent: oklch(0.285 0.009 60);\n--color-destructive: oklch(0.65 0.19 25);\n}\n:root { color-scheme: dark; }\n",
        "packages/client/src/features/x.tsx": 'export const X = <span className="text-destructive">2 failed</span>;',
      },
      expect: { token: "text-destructive" },
      why: "THE HOVER GROUND: the pre-2026-09-01 destructive dark arm was 4.07:1 on the bg-accent a ListRow paints under its own content — a bare ink, no tint, which is why a chip-only rule could not have caught it",
    },
    {
      files: {
        "packages/ui/src/styles/theme.css":
          "@theme {\n--color-background: oklch(0.98 0.004 75);\n--color-card: oklch(0.995 0.003 75);\n--color-popover: oklch(0.995 0.003 75);\n--color-surface-raised: oklch(0.965 0.005 75);\n--color-sidebar: oklch(0.955 0.006 72);\n--color-muted: oklch(0.95 0.006 70);\n--color-secondary: oklch(0.94 0.008 70);\n--color-accent: oklch(0.93 0.01 70);\n--color-primary: oklch(0.5 0.16 50);\n}\n:root { color-scheme: light; }\n",
        "packages/client/src/features/x.tsx": 'export const X = <span className="hover:text-card">x</span>;',
      },
      expect: { token: "text-card" },
      why: "F2 (verifier, 2026-09-01): an ink authored ONLY behind a variant must still be censused. A bare-only reader judged `hover:text-card` NOWHERE — and its coverage of the live tree was accidental, since every variant-prefixed ink there happened to also appear bare",
    },
    {
      files: {
        "packages/ui/src/styles/theme.css":
          "@theme {\n--color-background: oklch(0.98 0.004 75);\n--color-card: oklch(0.995 0.003 75);\n--color-popover: oklch(0.995 0.003 75);\n--color-surface-raised: oklch(0.965 0.005 75);\n--color-sidebar: oklch(0.955 0.006 72);\n--color-muted: oklch(0.95 0.006 70);\n--color-secondary: oklch(0.94 0.008 70);\n--color-accent: oklch(0.93 0.01 70);\n--color-primary: oklch(0.5 0.16 50);\n}\n:root { color-scheme: light; }\n",
        "packages/ui/src/charts/meter/variants.ts": "import { tv } from 'tailwind-variants';\nexport const meter = tv({ base: 'text-card' });",
      },
      expect: { token: "text-card" },
      why: "F3 (verifier, 2026-09-01): a carrier holding an exempted STROKE token must still be judged on every OTHER ink it paints — the file-keyed table absolved ~18 ink uses while its reason justified only the strokes (this file paints real `text-foreground` label and `text-muted-foreground` value text of its own)",
    },
    {
      files: {
        "packages/ui/src/styles/theme.css": "@theme {\n--spacing-row: 1px;\n}\n",
        "packages/client/src/features/x.tsx": 'export const X = <span className="text-card">x</span>;',
      },
      expect: { messageIncludes: "instrument blindness" },
      why: "a theme.css carrying no --color-* declaration at all must REFUSE (zero seed palettes) — a bare zero from an instrument is 'I could not measure', never 'clean'",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/ui/src/styles/theme.css":
          "@theme {\n--color-background: oklch(0.98 0.004 75);\n--color-card: oklch(0.995 0.003 75);\n--color-popover: oklch(0.995 0.003 75);\n--color-surface-raised: oklch(0.965 0.005 75);\n--color-sidebar: oklch(0.955 0.006 72);\n--color-muted: oklch(0.95 0.006 70);\n--color-secondary: oklch(0.94 0.008 70);\n--color-accent: oklch(0.93 0.01 70);\n--color-primary: oklch(0.5 0.16 50);\n}\n:root { color-scheme: light; }\n",
        "packages/ui/src/primitives/badge/variants.ts":
          "import { tv } from 'tailwind-variants';\nexport const badge = tv({ base: 'bg-primary/8 text-primary' });",
      },
      why: "THE SHIPPED FIX: the same arm at the family band (0.50) under the family's 8% tint clears on every light ground",
    },
    {
      files: {
        "packages/ui/src/styles/theme.css":
          "@theme {\n--color-background: oklch(0.98 0.004 75);\n--color-card: oklch(0.995 0.003 75);\n--color-popover: oklch(0.995 0.003 75);\n--color-surface-raised: oklch(0.965 0.005 75);\n--color-sidebar: oklch(0.955 0.006 72);\n--color-muted: oklch(0.95 0.006 70);\n--color-secondary: oklch(0.94 0.008 70);\n--color-accent: oklch(0.93 0.01 70);\n--color-primary: oklch(0.5 0.16 50);\n}\n:root { color-scheme: light; }\n",
        "packages/ui/src/primitives/badge/variants.ts":
          "import { tv } from 'tailwind-variants';\nexport const badge = tv({ base: 'hover:bg-primary/8 hover:text-primary !text-primary' });",
      },
      why: "F2's coverage claim, stated so it cannot silently return: variant prefixes and importance markers are STRIPPED (`hover:`, `!`), the variant-scoped `hover:bg-primary/8` is paired as a self-tint, and the shipped arm clears both the tinted and the bare judgement",
    },
    {
      files: {
        "packages/ui/src/styles/theme.css":
          "@theme {\n--color-card: oklch(0.995 0.003 75);\n--color-primary: oklch(0.5 0.16 50);\n--color-primary-foreground: oklch(0.99 0.01 75);\n}\n:root { color-scheme: light; }\n",
        "packages/client/src/features/x.tsx": 'export const X = <span className="bg-primary text-primary-foreground">Save</span>;',
      },
      why: "DECLARED LIMIT: a `-foreground` PAIR ink is judged on its own fill by palette-contrast.suite.test.ts, never against neutral chrome — measuring near-white on a light card here would be a manufactured failure",
    },
    {
      files: {
        "packages/ui/src/styles/theme.css":
          "@theme {\n--color-card: oklch(0.205 0.006 60);\n--color-track-1: oklch(0.68 0.13 145);\n}\n:root { color-scheme: dark; }\n",
        "packages/ui/src/charts/meter/variants.ts": "import { tv } from 'tailwind-variants';\nexport const ring = tv({ base: 'text-track-1' });",
      },
      why: "DECLARED LIMIT: the meter kit's `text-track-N` is currentColor for an aria-hidden SVG stroke (1.4.11's 3:1, #697), exempted by CARRIER because that is where the fact lives",
    },
  ],
};
