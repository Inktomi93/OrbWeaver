// Gate: seed-theme-ink-contrast — every colour token the product paints as TEXT must clear WCAG
// AA-NORMAL 4.5:1 in EVERY SHIPPED SEED palette, on every ground it can rest on, INCLUDING its own
// `bg-<token>/N` tint and the `bg-accent` an interactive row paints on hover. Static, no browser.
// SCOPE: the seeds WE ship (theme.css). Custom `<ThemeScope>` palettes are clamp.ts's, not this gate's.
// COMMENT POSTURE: comment-SAFE — inks come from the shared static-class walk (authored values, not text).
//
// FAMILY: a SINGLETON UNDER ITS OWN ID, and the reason is the loader's law rather than a judgement — a
// policy with no proven sibling must name its own id, and `lib/policy-module.ts#policyFamilyNames` refuses
// anything else (measured: declaring the shared name first made `check:structure` exit 2 with "singleton
// family static-class-ink must equal its sole policy id"). The shared reader IS real —
// `lib/static-class-expression.ts#walkStaticClassExpressions`, seven importers, shared with
// `css-length-tokens`, `css-family-ownership` and `css-selector-has-a-writer` — and the name that family
// should take when its SECOND member converts is `static-class-ink`. This is the `no-raw-color-in-css`
// precedent verbatim: re-declare the shared family in the same commit that converts the second member.
// `lib/seed-theme-ink.ts` is this policy's own ALGORITHM (one importer) — a private helper, not a family,
// and since #2293 it reads NOTHING: its `DECLARATION`/`THEME_BLOCK`/`SEED_BLOCK` regexes and its
// hand-rolled balanced-brace scan over `theme.css` TEXT are DELETED, and `readSeedPalettes` now takes the
// `product-css` declaration FACTS this policy already declares plus the sheet itself, for the shared
// ANCESTRY readers. What survives there is judgment the resource cannot make (which grounds an ink rests
// on, the self-tint composite, the ink utility grammar, which nested declarations are part of a palette),
// which §12.3 permits in `verify/lib`; what left was repository CSS reading behind `defineGate`, which it
// does not. The NESTING adjudication that fold owed — a conditional at-rule is an ARM, a nested plain
// selector is not the palette — is stated in that module's header and pinned per case in the family test.
//
// A DECLARED HYBRID (§12.4: "a hybrid's dual role is explicit and receipted"):
//   RESOURCE half — `product-css`, for `theme.css`. There is no `theme-css` `exact-file` id and the kind
//   vocabulary is FROZEN, so the smallest CLOSED id admits all five product sheets where this policy reads
//   one. That is the `ui-exports-map-complete` / resource-policy-contract §5 alt-D precedent, recorded here
//   so a later reader does not "fix" it by minting an id.
//   COMPILER half — `population: { in: ["@client", "@ui"] }`, the ink census. The legacy `INK_SOURCES`
//   filter was `packages/ui/src/` + `packages/client/src/`, which is `@ui` + `@client` byte for byte
//   (`contract/population.ts#POPULATION_ROOTS`), so the port is lossless and `carrierPath`'s hand-rolled
//   absolute-to-relative slicing retires with it — `ctx.relativePath` is the total house idiom.
//
// POPULATION PORT: BYTE-IDENTICAL on both halves, legacy at eba8ef526. The legacy `existsSync(theme.css)`
// early return and the `realTree` anchor (the gate's own source file being in `ctx.files`) are BOTH retired:
// a resource fixture supplies its whole CSS identity, so "is this the real tree" is no longer a question —
// an unloadable `product-css` is a population-phase REFUSAL (`mustRefuse[0]`), and the zero-ink tripwire and
// the stale-grant sweep no longer need an anchor to be honest. The stale sweep in particular is now the
// CENTRAL `stale-reviewed-grant` alarm rather than `reportStaleExemptions`, which is §12.5's whole point.
//
// AUTHORITY: `reviewed-grant`, and this is the one decision the §5b audit did not price. The audit ruled
// `hard` on the strength of `reportFailure`'s finding-overload-ok reason ("a seed palette failing AA is a
// ledger verdict, not a site an author may absolve") — which is TRUE and survives: there is no marker door
// here and an author cannot absolve anything inline. But the module also carried
// `DECORATIVE_STROKE_CARRIERS`, a NINE-ROW `ExemptionTable`, and §12.5 bans a gate-owned exemption grammar
// outright. the gate-runtime exception-authority census classifies those rows by name — "9 decorative-stroke
// GRANTS" — so they migrate to `lib/reviewed-grants.ts` and the policy's authority follows its exception
// mechanism. The ruling survives; its INPUT changed: an AUTHOR still cannot absorb a contrast failure, and
// a REVIEWER now must, in one central table with a mandatory `why` and `endsWhen`.
//
// AND THAT FORCED THE FINDING GRANULARITY, which is the behavioural delta a reader should look for. A
// reviewed grant is strictly 1:1 (§12.5): a grant matching N candidates suppresses NOTHING and alarms
// `over-broad`. One decorative carrier fails on up to eight grounds × three palettes, so a per-(ground,
// palette) finding would make every one of the nine rows over-broad on arrival. The sweep therefore
// AGGREGATES: one finding per `(carrier file, ink token)` class, carrying the WORST measurement it found in
// its message. The legacy rows asserted `{ token }` with no count, so the proof set ports unchanged and
// gains the counts §4.1 owes.
//
// THE finding-overload-ok MARKER IS DELETED, NOT TRANSLATED, and that is the guide's own disposition for
// its grammar (§7 kind 3: "DELETE with its gate; never translate"). Its subject was the legacy `ctx.report`
// OVERLOAD — reporting a coordinate the walk did not hand back — and the final contract has no overload:
// `report.file` IS the file sink. Its REASON was load-bearing and is kept, as the authority paragraph above.
//
// BOTH mentions of that marker in this
// header are spelled WITHOUT their `@` opener on purpose (#2293, and this file is inside the corpus
// `finding-overload-provenance` polices): its `markersIn` reader matches the marker form in the file's
// FULL TEXT and exempts only string/template/regex spans, so a `//` comment naming the opener is read as a
// MALFORMED marker. Two sentences of explanation took that live legacy gate from 0 findings in this file
// to 2, masked by the standing whole-tree red. Never write the opener in prose here — the gate's own
// module does the same thing for the same reason (`finding-overload-provenance.ts:9-10`).
//
// WHERE A BROKEN RESOURCE REFUSES — not here. An unloadable product CSS identity makes
// `resolveResourceDeclarations` THROW at the POPULATION phase and withholds this owner before `create` runs
// (guide §3's acquisition-refusal rule), so this module owns no not-ready branch and reads through `readyResourceValue`.
// THE REACHABLE STATUS SET IS A PROPERTY OF THE READER, enumerated FROM it (#2314 — this sentence said
// "BOTH reachable statuses" and there are FOUR). `ops/resource-tree.ts#loadCssFiles` forwards
// `ops/resource-reader.ts#read`'s status BEFORE it can judge the CSS grammar (`read` →
// `ready | missing | empty | unresolved`), and only then adds `malformed` of its own. Every one of the
// four matters here for the same reason: since the fold this policy derives its palettes from the sheet's
// declaration facts, so a sheet it could not read would arrive as ZERO seed palettes and be reported as
// instrument blindness about the TREE instead of a refusal about the SHEET.
//   missing     `mustRefuse[0]` — a vanished theme.css.
//   malformed   `mustRefuse[1]` — an unclosed rule block, refused before the parse (#2294).
//   empty       `mustRefuse[2]` — a zero-length sheet, on `read`'s own empty arm, which never reaches the
//               `malformed` test at all.
//   unresolved  NOT expressible as a row (no JS string carries an invalid UTF-8 byte), so it is a
//               `runPolicyPass` pin in tests/tooling/verify/gates/seed-theme-ink-family.suite.test.ts — bytes
//               on a real `mkdtemp` root with NO overlay, beside a healthy twin on the same substrate.
//
// DECLARED LIMITS, each with its row: a `-foreground` PAIR ink is judged on its own fill by
// `palette-contrast.suite.test.ts`, never against neutral chrome (`mustPass[2]`); and a theme.css carrying
// no `--color-*` declaration REFUSES as instrument blindness rather than reading clean (`mustFlag[4]`).
//
// THE THREE BLINDNESS ARMS EACH HAVE A ROW, and the third was owed (#2293): zero palettes (`mustFlag[4]`),
// zero inks (`mustFlag[5]`), and — new — a ground the sheet DECLARES but no reader can turn into a colour
// (`mustFlag[8]`). The third was measured UNENFORCED because every other fixture completes its grounds on
// purpose, so nothing could ever reach it; the row makes exactly one ground unresolvable in an otherwise
// clean corpus, and cutting `for (const miss of unresolved)` turns it green.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `seed-theme-ink-contrast` descriptor at a9745471429558128b7953bc59e52dc59ae62828, the parent of the conversion
// `2dabae9ce` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The `eba8ef526`
// cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both citations
// resolve to this source. The legacy descriptor had no `scanRoot`, so its effective population is its in-run path
// filter — `INK_SOURCES = ["packages/ui/src/", "packages/client/src/"]`, `file.getFilePath().includes(`/${root}`)`.
// Over the SAME 7,556 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`) it
// admits 1,685 and the final `population` admits 1,685 (the bare harness dispatch was 7,556). legacy − final = ∅.
// final − legacy = ∅. Controls: inside `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by
// both; outside `packages/contracts/src/assets/__cbbhr_out_index.ts` rejected by both.

import { NORMAL_MIN_RATIO } from "../../_shared/wcag.ts";
import { THEME } from "../contract/css-family.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import type { SeedPalette } from "../lib/seed-theme-ink.ts";
import { readSeedPalettes } from "../lib/seed-theme-ink.ts";
import type { InkUse } from "../lib/seed-theme-ink-census.ts";
import { collectInkUses, compositeOver, toRgb, worstContrast } from "../lib/seed-theme-ink-census.ts";
import { walkStaticClassExpressions } from "../lib/static-class-expression.ts";

const PERCENT = 100;
const MESSAGE =
  "a colour token painted as TEXT does not clear WCAG AA-NORMAL 4.5:1 in every shipped seed palette, on every ground it can rest on — its own tint and the interactive hover ground included (tooling/src/verify/gates/seed-theme-ink-contrast.ts)";

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

/** The grant OPERATION for one ink class. The grant identity is `(carrier file, ink:<token>)`, which is the
 *  CARRIER pair the retired `DECORATIVE_STROKE_CARRIERS` table keyed on — deliberately not the token alone,
 *  because the fact that licenses a decorative stroke lives at the carrier (`currentColor` feeding an SVG on
 *  aria-hidden geometry), and a token-only key would have MISSED the defect that minted this gate:
 *  `text-highlight` was a background token doing real text duty on three surfaces. */
function inkOperation(token: string): string {
  return `ink:${token}`;
}

interface Judged {
  readonly palette: string;
  readonly ground: string;
  readonly ratio: number;
  /** The TINT the failing arm was judged under. It rides the failure rather than the group's anchor because
   *  `collectInkUses` emits a `bg-<token>/N text-<token>` site TWICE — once bare, once tinted — and the
   *  aggregation groups both under one `(file, token)` class. Reading the tint off the anchor names whichever
   *  arm happened to be first, which measured as a message that said "bare" about a tinted failure. */
  readonly tint: number | null;
}
interface Verdict {
  readonly failures: readonly Judged[];
  readonly measured: number;
  /** Grounds this palette could not resolve — a claim about the SHEET, reported at the sheet. */
  readonly unresolved: readonly string[];
  /** This INK could not be resolved in this palette — a claim about the INK CLASS, reported at its carrier
   *  under the class's own grant identity. Kept apart from the ground misses because the two have different
   *  subjects, and collapsing them is what made a granted decorative ink resurface as three sheet-anchored
   *  blindness findings the moment the legacy skip-before-judging was replaced by a grant (measured on the
   *  real tree: `text-border` is `oklch(… / 0.08)`, a translucent LINE token with no opaque colour). */
  readonly inkUnreadable: readonly string[];
}

function judgeInPalette(use: InkUse, palette: SeedPalette): Verdict {
  const failures: Judged[] = [];
  const unresolved: string[] = [];
  const inkValue = palette.vars.get(`--color-${use.token}`);
  if (inkValue === undefined) {
    return { failures, measured: 0, unresolved, inkUnreadable: [] }; // not a palette token (`text-current`)
  }
  const ink = toRgb(inkValue);
  if (ink === null) {
    return { failures, measured: 0, unresolved, inkUnreadable: [`${palette.name} (${inkValue})`] };
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
      failures.push({ palette: palette.name, ground: groundVar, ratio, tint: use.selfTintPercent });
    }
  }
  return { failures, measured, unresolved, inkUnreadable: [] };
}

type Report = (file: string, details: { line: number; column: number; token?: string; subject?: string; operation?: string; message: string }) => void;

/** A blindness finding needs a grant identity like every other finding of a `reviewed-grant` policy (the
 *  runtime refuses one without: `invalid-reviewed-grant-identity`). The operation carries WHAT went blind, so
 *  two different blindnesses are two identities and a row licensing one cannot silence the other — and so a
 *  row licensing ANY of them would have to say out loud that it is licensing an instrument to stay blind. */
function reportBlind(report: Report, anchor: string, operation: string, what: string): void {
  report(anchor, {
    line: 1,
    column: 1,
    subject: anchor,
    operation: `instrument-blindness:${operation}`,
    message: `seed-theme-ink-contrast ${what} — instrument blindness, not a clean tree (tooling/src/verify/gates/seed-theme-ink-contrast.ts)`,
  });
}

/** ONE finding per `(carrier file, ink token)` class, carrying the WORST measurement — see the header on why
 *  the granularity is the grant's and not the measurement's. The worst arm is chosen rather than the first so
 *  the message names the case a reader must actually fix. */
function reportClass(report: Report, use: InkUse, failures: readonly Judged[]): void {
  const worst = failures.reduce((left, right) => (right.ratio < left.ratio ? right : left));
  const tint = worst.tint === null ? "" : ` under its own ${String(worst.tint)}% tint`;
  const others = failures.length === 1 ? "" : ` (and ${String(failures.length - 1)} further ground/seed pair(s))`;
  report(use.file, {
    line: use.line,
    column: use.column,
    token: use.className,
    subject: use.file,
    operation: inkOperation(use.token),
    message: `${use.className}${tint} measures ${worst.ratio.toFixed(2)}:1 on ${worst.ground} in the ${worst.palette} seed${others} — below WCAG AA-NORMAL ${String(NORMAL_MIN_RATIO)}:1 — see tooling/src/verify/gates/seed-theme-ink-contrast.ts`,
  });
}

interface Sweep {
  readonly measured: number;
  readonly unresolved: ReadonlySet<string>;
}

function sweep(report: Report, uses: readonly InkUse[], palettes: readonly SeedPalette[]): Sweep {
  const unresolved = new Set<string>();
  // ONE ENTRY PER `(carrier file, ink token)` — the grant's identity, so the group is what a row licenses.
  // Grouping by USE would report the SAME identity twice for a carrier painting one token at two sites (or
  // once bare and once tinted, which is the shipped `bg-primary/15 text-primary` shape), and a grant matching
  // two candidates suppresses NEITHER and alarms over-broad (§12.5). The first use anchors the group.
  const classes = new Map<string, { readonly anchor: InkUse; readonly failures: Judged[]; readonly unreadable: string[] }>();
  let measured = 0;
  for (const use of uses) {
    const key = `${use.file}::${use.token}`;
    const group = classes.get(key) ?? { anchor: use, failures: [], unreadable: [] };
    classes.set(key, group);
    for (const palette of palettes) {
      const verdict = judgeInPalette(use, palette);
      measured += verdict.measured;
      for (const miss of verdict.unresolved) {
        unresolved.add(miss);
      }
      group.failures.push(...verdict.failures);
      group.unreadable.push(...verdict.inkUnreadable);
    }
  }
  for (const { anchor, failures, unreadable } of classes.values()) {
    if (unreadable.length > 0) {
      // AN UNREADABLE INK IS ITS CLASS'S VERDICT, not the sheet's, and it is reported under the class's own
      // grant identity so a decorative ink that HAS a reviewed row consumes it here instead of resurfacing
      // as N sheet-anchored blindness findings the row cannot reach. One finding per class, palettes listed.
      report(anchor.file, {
        line: anchor.line,
        column: anchor.column,
        token: anchor.className,
        subject: anchor.file,
        operation: inkOperation(anchor.token),
        message: `${anchor.className} has no opaque colour to judge as text in ${unreadable.join(", ")} — instrument blindness for this ink, not a clean verdict (tooling/src/verify/gates/seed-theme-ink-contrast.ts)`,
      });
      continue;
    }
    if (failures.length > 0) {
      reportClass(report, anchor, failures);
    }
  }
  return { measured, unresolved };
}

function censusInks(ctx: GatePolicyContext): readonly InkUse[] {
  const relative = new Map(ctx.files.map((file) => [file.getFilePath(), ctx.relativePath(file)]));
  return collectInkUses(walkStaticClassExpressions(ctx.files).candidates, (candidate) => {
    const anchor = candidate.segments[0];
    return anchor === undefined ? null : (relative.get(anchor.node.getSourceFile().getFilePath()) ?? null);
  });
}

export const gate = defineGate({
  id: "seed-theme-ink-contrast",
  family: "seed-theme-ink-contrast",
  authority: "reviewed-grant",
  severity: "error",
  population: { in: ["@client", "@ui"] },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "product-css" }],
  message: MESSAGE,
  fix: "give the token a polarity-aware light-dark() arm in the family's own band, lower the self-tint alpha, or paint the text with an ink token instead of a surface/mark token",
  create: (ctx) => ({
    evaluate: () => {
      const css = readyResourceValue(ctx.resources.cssInventory("product"));
      const sheets = css.files;
      const report: Report = (file, details) => {
        ctx.report.file(file, details);
      };
      const theme = sheets.find((sheet) => sheet.path === THEME);
      // The blindness arms anchor on the THEME SHEET, never on this gate's own source file: a gate module is
      // in no resource population this policy declares, so `ctx.report.file` would THROW on it (guide §2.1's
      // absent-verdict rule). The sheet is declared, read and present whenever the resource resolved.
      const anchor = theme?.path ?? sheets[0]?.path ?? THEME;
      // The palettes come from the DECLARATION FACTS of the theme sheet plus the SHARED ANCESTRY readers —
      // the resource this policy already declares — never from a private parse of its text (#2293, §5b.7).
      // The sheet itself is handed in for the ancestry half (`rulesContaining`/`atRulesContaining`), which
      // is the same shape `motion-token-purity` and `rest-transform-grid` use for their own ancestry
      // questions; a declaration's `owner` alone names only its INNERMOST block.
      const palettes =
        theme === undefined
          ? []
          : readSeedPalettes(
              theme,
              css.declarations.filter((declaration) => declaration.file === theme.path),
            );
      if (palettes.length === 0) {
        reportBlind(report, anchor, "zero-palettes", "resolved zero seed palettes from theme.css");
        return;
      }
      const uses = censusInks(ctx);
      const { measured, unresolved } = sweep(report, uses, palettes);
      if (uses.length === 0) {
        reportBlind(report, anchor, "zero-inks", "found zero text-<token> inks across the ui + client sources");
      }
      for (const miss of unresolved) {
        reportBlind(report, anchor, `unresolved-colour:${miss}`, `could not resolve a colour for ${miss}`);
      }
      // THE RECEIPT STATES WHAT IT MEASURED, AND IT IS THE PALETTE COUNT, NOT THE CENSUS. `receiptFailures`
      // reds on `members === 0` OR `unresolved > 0` (`lib/policy-pass.ts`), so receipting the ink×ground
      // census would turn this policy's OWN blindness findings into TOOL ERRORS — a corpus with no inks
      // measures zero pairs and would refuse instead of reporting that it found none. That is §12.3's
      // "a `-health` consumer receipts a CONSTANT, never its census", one layer out; `palettes.length` is
      // the honest denominator and is ≥ 1 past the guard above. The ink×ground total rides the message.
      ctx.receipt({
        kind: "population",
        source: `seed-theme-ink-contrast [ink×ground×seed pairs=${String(measured)}]`,
        members: palettes.length,
        unresolved: 0,
      });
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        "packages/ui/src/styles/theme.css":
          "@theme {\n--color-background: oklch(0.98 0.004 75);\n--color-card: oklch(0.995 0.003 75);\n--color-popover: oklch(0.995 0.003 75);\n--color-surface-raised: oklch(0.965 0.005 75);\n--color-sidebar: oklch(0.955 0.006 72);\n--color-muted: oklch(0.95 0.006 70);\n--color-secondary: oklch(0.94 0.008 70);\n--color-accent: oklch(0.93 0.01 70);\n--color-primary: oklch(0.55 0.16 50);\n}\n:root { color-scheme: light; }\n",
        "packages/ui/src/styles/globals.css": "@layer base {}\n",
        "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
        "packages/client/src/styles/globals.css": "@layer base {}\n",
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell {}\n",
        // TWO SITES of one ink class in one carrier, deliberately: without the per-(file, token) grouping this
        // row reports TWICE with the SAME grant identity, and a grant matching two candidates licenses
        // NEITHER (§12.5). `count: 1` is therefore the aggregation's own pin as much as the arm's.
        "packages/ui/src/primitives/badge/variants.ts":
          "import { tv } from 'tailwind-variants';\nexport const badge = tv({ base: 'bg-primary/15 text-primary' });\nexport const chip = tv({ base: 'text-primary' });",
      },
      // ONE finding, not eight: the aggregation the reviewed-grant 1:1 rule forces (see the header). The
      // count is the claim — a per-(ground, seed) shape would report this class eight times and make every
      // grant row over-broad on arrival.
      expect: { count: 1, token: "text-primary", messageIncludes: "further ground/seed pair(s)" },
      why: "THE FOUNDING DEFECT, verbatim: the light seed's primary at oklch(0.55) doing ink duty under its own 15% tint — 3.97:1, invisible to every surface audit because no shipped surface had adopted the arm yet",
    },
    {
      mode: "resource",
      files: {
        // THE COMPLETE EIGHT-GROUND SET, in dark values, for the same reason `server-layout`'s `mustFlag[0]`
        // supplies the whole legal root: a fixture short of a ground raises an `unresolved-colour` blindness
        // finding, and the count would then be ratifying two arms under a one-finding claim (measured: this
        // row produced SEVEN before the grounds were completed, six of them blindness). The arm those six
        // came from is pinned on its own by `mustFlag[8]`, which isolates ONE unresolvable ground in a
        // corpus with nothing else to report — completing the grounds here is what made that row owed.
        "packages/ui/src/styles/theme.css":
          "@theme {\n--color-background: oklch(0.145 0.004 60);\n--color-card: oklch(0.205 0.006 60);\n--color-popover: oklch(0.22 0.006 60);\n--color-surface-raised: oklch(0.24 0.007 60);\n--color-sidebar: oklch(0.19 0.005 60);\n--color-muted: oklch(0.26 0.008 60);\n--color-secondary: oklch(0.25 0.008 60);\n--color-accent: oklch(0.285 0.009 60);\n--color-destructive: oklch(0.65 0.19 25);\n}\n:root { color-scheme: dark; }\n",
        "packages/ui/src/styles/globals.css": "@layer base {}\n",
        "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
        "packages/client/src/styles/globals.css": "@layer base {}\n",
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell {}\n",
        "packages/client/src/features/x.tsx": 'export const X = <span className="text-destructive">2 failed</span>;',
      },
      expect: { count: 1, token: "text-destructive", messageIncludes: "--color-accent" },
      why: "THE HOVER GROUND: the pre-2026-09-01 destructive dark arm was 4.07:1 on the bg-accent a ListRow paints under its own content — a bare ink, no tint, which is why a chip-only rule could not have caught it",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/styles/theme.css":
          "@theme {\n--color-background: oklch(0.98 0.004 75);\n--color-card: oklch(0.995 0.003 75);\n--color-popover: oklch(0.995 0.003 75);\n--color-surface-raised: oklch(0.965 0.005 75);\n--color-sidebar: oklch(0.955 0.006 72);\n--color-muted: oklch(0.95 0.006 70);\n--color-secondary: oklch(0.94 0.008 70);\n--color-accent: oklch(0.93 0.01 70);\n--color-primary: oklch(0.5 0.16 50);\n}\n:root { color-scheme: light; }\n",
        "packages/ui/src/styles/globals.css": "@layer base {}\n",
        "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
        "packages/client/src/styles/globals.css": "@layer base {}\n",
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell {}\n",
        "packages/client/src/features/x.tsx": 'export const X = <span className="hover:text-card">x</span>;',
      },
      expect: { count: 1, token: "text-card" },
      why: "F2 (verifier, 2026-09-01): an ink authored ONLY behind a variant must still be censused. A bare-only reader judged `hover:text-card` NOWHERE — and its coverage of the live tree was accidental, since every variant-prefixed ink there happened to also appear bare",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/styles/theme.css":
          "@theme {\n--color-background: oklch(0.98 0.004 75);\n--color-card: oklch(0.995 0.003 75);\n--color-popover: oklch(0.995 0.003 75);\n--color-surface-raised: oklch(0.965 0.005 75);\n--color-sidebar: oklch(0.955 0.006 72);\n--color-muted: oklch(0.95 0.006 70);\n--color-secondary: oklch(0.94 0.008 70);\n--color-accent: oklch(0.93 0.01 70);\n--color-primary: oklch(0.5 0.16 50);\n}\n:root { color-scheme: light; }\n",
        "packages/ui/src/styles/globals.css": "@layer base {}\n",
        "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
        "packages/client/src/styles/globals.css": "@layer base {}\n",
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell {}\n",
        "packages/ui/src/charts/meter/variants.ts": "import { tv } from 'tailwind-variants';\nexport const meter = tv({ base: 'text-card text-track-9' });",
      },
      // F3's successor, restated for the GRANT model: the exemption is now a `(file, ink:<token>)` grant, so
      // a carrier holding an exempted stroke reports its OTHER inks as their own classes with their own
      // identities — `text-card` here — and only the granted identity is licensed. Under the retired
      // file-keyed table the whole carrier went silent.
      expect: { count: 1, token: "text-card" },
      why: "F3 (verifier, 2026-09-01): a carrier holding an exempted STROKE token must still be judged on every OTHER ink it paints — the file-keyed table absolved ~18 ink uses while its reason justified only the strokes",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/styles/theme.css": "@theme {\n--spacing-row: 1px;\n}\n",
        "packages/ui/src/styles/globals.css": "@layer base {}\n",
        "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
        "packages/client/src/styles/globals.css": "@layer base {}\n",
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell {}\n",
        "packages/client/src/features/x.tsx": 'export const X = <span className="text-card">x</span>;',
      },
      expect: { count: 1, messageIncludes: "instrument blindness" },
      why: "a theme.css carrying no --color-* declaration at all must REFUSE (zero seed palettes) — a bare zero from an instrument is 'I could not measure', never 'clean'",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/styles/theme.css":
          "@theme {\n--color-background: oklch(0.98 0.004 75);\n--color-card: oklch(0.995 0.003 75);\n--color-popover: oklch(0.995 0.003 75);\n--color-surface-raised: oklch(0.965 0.005 75);\n--color-sidebar: oklch(0.955 0.006 72);\n--color-muted: oklch(0.95 0.006 70);\n--color-secondary: oklch(0.94 0.008 70);\n--color-accent: oklch(0.93 0.01 70);\n--color-primary: oklch(0.5 0.16 50);\n}\n:root { color-scheme: light; }\n",
        "packages/ui/src/styles/globals.css": "@layer base {}\n",
        "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
        "packages/client/src/styles/globals.css": "@layer base {}\n",
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell {}\n",
        "packages/client/src/features/x.tsx": "export const X = 1;\n",
      },
      // THE ZERO-INK TRIPWIRE, measured UNENFORCED before this row existed (`if (uses.length === 0)` → `if
      // (false)` killed nothing). It is a BLINDNESS arm, so its falsifier runs in the tripwire direction: the
      // cut makes the policy flag FEWER, and this `mustFlag` goes green.
      expect: { count: 1, messageIncludes: "found zero text-<token> inks" },
      why: "a corpus with seeds but NO inks is an instrument that walked and saw nothing, which is 'I could not measure' — the arm the retired real-tree anchor used to gate",
    },
    {
      mode: "resource",
      grant: { subject: "packages/ui/src/charts/meter/variants.ts", operation: "ink:border" },
      files: {
        "packages/ui/src/styles/theme.css":
          "@theme {\n--color-background: oklch(0.98 0.004 75);\n--color-card: oklch(0.995 0.003 75);\n--color-popover: oklch(0.995 0.003 75);\n--color-surface-raised: oklch(0.965 0.005 75);\n--color-sidebar: oklch(0.955 0.006 72);\n--color-muted: oklch(0.95 0.006 70);\n--color-secondary: oklch(0.94 0.008 70);\n--color-accent: oklch(0.93 0.01 70);\n--color-border: oklch(0.2 0.01 60 / 0.12);\n}\n:root { color-scheme: light; }\n",
        "packages/ui/src/styles/globals.css": "@layer base {}\n",
        "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
        "packages/client/src/styles/globals.css": "@layer base {}\n",
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell {}\n",
        "packages/ui/src/charts/meter/variants.ts": "import { tv } from 'tailwind-variants';\nexport const rail = tv({ base: 'text-border' });",
      },
      // THE UNREADABLE-INK ARM, and it is the one behaviour the migration from a skip-table to a grant
      // CHANGED. The legacy table skipped `text-border` BEFORE judging, which also swallowed the fact that a
      // translucent LINE token has no opaque colour to judge at all; the grant model reports it under the
      // ink's own identity so the reviewed row consumes it and the instrument stays honest. On the real tree
      // this is exactly the `seed-theme-ink-contrast:meter-border` grant, measured consumed 1:1.
      expect: { count: 1, token: "text-border", messageIncludes: "no opaque colour to judge as text" },
      why: "a translucent LINE token painted as an ink is a blindness verdict about that INK CLASS, reported under its own grant identity rather than as N sheet-anchored findings a reviewed row could never reach",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/styles/theme.css":
          "@theme {\n--color-background: oklch(0.98 0.004 75);\n--color-card: oklch(0.995 0.003 75);\n--color-popover: oklch(0.995 0.003 75);\n--color-surface-raised: oklch(0.965 0.005 75);\n--color-sidebar: oklch(0.955 0.006 72);\n--color-muted: oklch(0.95 0.006 70);\n--color-secondary: oklch(0.94 0.008 70);\n--color-accent: oklch(0.93 0.01 70);\n--color-primary: oklch(0.5 0.16 50);\n}\n:root { color-scheme: light; }\n",
        "packages/ui/src/styles/globals.css": "@layer base {}\n",
        "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
        "packages/client/src/styles/globals.css": "@layer base {}\n",
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell {}\n",
        "packages/ui/src/primitives/chip/variants.ts":
          "import { tv } from 'tailwind-variants';\nexport const chip = tv({ base: 'bg-primary/45 text-primary' });",
      },
      // THE SELF-TINT COMPOSITION, isolated. `mustPass[0]` proves this exact ink CLEARS every ground bare and
      // at 8%; at 45% the ink's own wash moves the ground far enough toward it to break AA — so cutting
      // `compositeOver` out of the judgement turns THIS row green and no other. Measured UNENFORCED before it
      // existed: the founding-defect row fails bare as well, so it could never isolate the tint.
      expect: { count: 1, token: "text-primary", messageIncludes: "under its own 45% tint" },
      why: "the self-tint is the composition, not a decoration: the same shipped arm that clears every ground bare fails under a heavy wash of its own hue",
    },
    {
      mode: "resource",
      files: {
        // `mustPass[0]`'s corpus with ONE GROUND made unresolvable. Every other ground resolves and the
        // shipped 0.50 arm clears all seven, so the only thing this row can report is the SHEET-level
        // blindness verdict — which is exactly what makes it the falsifier.
        "packages/ui/src/styles/theme.css":
          "@theme {\n--color-background: oklch(0.98 0.004 75);\n--color-card: oklch(0.995 0.003 75);\n--color-popover: var(--nope);\n--color-surface-raised: oklch(0.965 0.005 75);\n--color-sidebar: oklch(0.955 0.006 72);\n--color-muted: oklch(0.95 0.006 70);\n--color-secondary: oklch(0.94 0.008 70);\n--color-accent: oklch(0.93 0.01 70);\n--color-primary: oklch(0.5 0.16 50);\n}\n:root { color-scheme: light; }\n",
        "packages/ui/src/styles/globals.css": "@layer base {}\n",
        "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
        "packages/client/src/styles/globals.css": "@layer base {}\n",
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell {}\n",
        "packages/ui/src/primitives/badge/variants.ts":
          "import { tv } from 'tailwind-variants';\nexport const badge = tv({ base: 'bg-primary/8 text-primary' });",
      },
      // THE SHEET-LEVEL UNRESOLVED-GROUND ARM, measured UNENFORCED before this row existed (#2293): cut k08
      // (`for (const miss of unresolved)` → an empty array) killed no row, because every other fixture
      // COMPLETES its grounds precisely so this arm cannot fire beside the finding that row is about — see
      // `mustFlag[1]`'s comment. It is a BLINDNESS arm, so its falsifier runs in the tripwire direction: the
      // cut makes the policy flag FEWER and this `mustFlag` goes green.
      expect: { count: 1, messageIncludes: "could not resolve a colour for --color-popover @ hearth" },
      why: "a ground the sheet declares but no reader can turn into a colour is a claim about the SHEET — every ink judged against it was judged on seven grounds, not eight, and a bare zero from an instrument is 'I could not measure', never 'clean'",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "packages/ui/src/styles/theme.css":
          "@theme {\n--color-background: oklch(0.98 0.004 75);\n--color-card: oklch(0.995 0.003 75);\n--color-popover: oklch(0.995 0.003 75);\n--color-surface-raised: oklch(0.965 0.005 75);\n--color-sidebar: oklch(0.955 0.006 72);\n--color-muted: oklch(0.95 0.006 70);\n--color-secondary: oklch(0.94 0.008 70);\n--color-accent: oklch(0.93 0.01 70);\n--color-primary: oklch(0.5 0.16 50);\n}\n:root { color-scheme: light; }\n",
        "packages/ui/src/styles/globals.css": "@layer base {}\n",
        "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
        "packages/client/src/styles/globals.css": "@layer base {}\n",
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell {}\n",
        "packages/ui/src/primitives/badge/variants.ts":
          "import { tv } from 'tailwind-variants';\nexport const badge = tv({ base: 'bg-primary/8 text-primary' });",
      },
      why: "THE SHIPPED FIX: the same arm at the family band (0.50) under the family's 8% tint clears on every light ground",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/styles/theme.css":
          "@theme {\n--color-background: oklch(0.98 0.004 75);\n--color-card: oklch(0.995 0.003 75);\n--color-popover: oklch(0.995 0.003 75);\n--color-surface-raised: oklch(0.965 0.005 75);\n--color-sidebar: oklch(0.955 0.006 72);\n--color-muted: oklch(0.95 0.006 70);\n--color-secondary: oklch(0.94 0.008 70);\n--color-accent: oklch(0.93 0.01 70);\n--color-primary: oklch(0.5 0.16 50);\n}\n:root { color-scheme: light; }\n",
        "packages/ui/src/styles/globals.css": "@layer base {}\n",
        "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
        "packages/client/src/styles/globals.css": "@layer base {}\n",
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell {}\n",
        "packages/ui/src/primitives/badge/variants.ts":
          "import { tv } from 'tailwind-variants';\nexport const badge = tv({ base: 'hover:bg-primary/8 hover:text-primary !text-primary' });",
      },
      why: "F2's coverage claim, stated so it cannot silently return: variant prefixes and importance markers are STRIPPED (`hover:`, `!`), the variant-scoped `hover:bg-primary/8` is paired as a self-tint, and the shipped arm clears both the tinted and the bare judgement",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/styles/theme.css":
          "@theme {\n--color-background: oklch(0.98 0.004 75);\n--color-card: oklch(0.995 0.003 75);\n--color-popover: oklch(0.995 0.003 75);\n--color-surface-raised: oklch(0.965 0.005 75);\n--color-sidebar: oklch(0.955 0.006 72);\n--color-muted: oklch(0.95 0.006 70);\n--color-secondary: oklch(0.94 0.008 70);\n--color-accent: oklch(0.93 0.01 70);\n--color-primary: oklch(0.5 0.16 50);\n--color-primary-foreground: oklch(0.99 0.01 75);\n}\n:root { color-scheme: light; }\n",
        "packages/ui/src/styles/globals.css": "@layer base {}\n",
        "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
        "packages/client/src/styles/globals.css": "@layer base {}\n",
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell {}\n",
        // The passing `text-primary` beside the pair ink is NOT decoration: with the real-tree anchor retired,
        // a corpus whose only ink is a `-foreground` pair censuses ZERO inks and the tripwire fires — which is
        // the tripwire working, and would make this row a `mustFlag` about the wrong thing. One judged ink
        // that clears is what lets the row make the claim it means.
        "packages/client/src/features/x.tsx":
          'export const X = <span className="bg-primary text-primary-foreground">Save</span>;\nexport const Y = <span className="text-primary">Total</span>;',
      },
      why: "DECLARED LIMIT: a `-foreground` PAIR ink is judged on its own fill by palette-contrast.suite.test.ts, never against neutral chrome — measuring near-white on a light card here would be a manufactured failure",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: {
        "packages/ui/src/styles/globals.css": "@layer base {}\n",
        "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
        "packages/client/src/styles/globals.css": "@layer base {}\n",
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell {}\n",
        "packages/client/src/features/x.tsx": 'export const X = <span className="text-card">x</span>;',
      },
      // The legacy `existsSync(theme.css)` early return's successor. A vanished seed sheet is "I could not
      // judge", never the clean zero a silent return produced — and it is the whole reason the real-tree
      // anchor could retire.
      expect: { messageIncludes: "product-css is missing" },
      why: "a vanished theme.css refuses the five-home product identity at the population phase rather than returning a clean tree",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/styles/theme.css": "@theme {\n--color-background: oklch(0.98 0.004 75);\n",
        "packages/ui/src/styles/globals.css": "@layer base {}\n",
        "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
        "packages/client/src/styles/globals.css": "@layer base {}\n",
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell {}\n",
        "packages/client/src/features/x.tsx": 'export const X = <span className="text-card">x</span>;',
      },
      // `product-css`'s SECOND reachable status (#2294), and this policy needs it named more than its
      // sibling does: since the fold (#2293) the palettes come from the sheet's DECLARATION FACTS, so a
      // sheet the shared parser cannot read would resolve zero palettes and this gate would report
      // "resolved zero seed palettes" — an instrument-blindness verdict about the TREE — where the honest
      // answer is a population-phase refusal about the SHEET. `ops/resource-tree.ts#blockProblem` catches
      // the unclosed block before the parse, so the refusal fires first and the arms never disagree.
      expect: { messageIncludes: "product-css is malformed: unsupported or malformed CSS in packages/ui/src/styles/theme.css" },
      why: "a theme.css the shared CSS parser cannot read refuses at the population phase, rather than reaching this policy as a sheet with zero seed palettes and being reported as instrument blindness",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/styles/theme.css": "",
        "packages/ui/src/styles/globals.css": "@layer base {}\n",
        "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
        "packages/client/src/styles/globals.css": "@layer base {}\n",
        "packages/client/src/features/app-shell/surfaces/shell.css": ".shell {}\n",
        "packages/client/src/features/x.tsx": 'export const X = <span className="text-card">x</span>;',
      },
      // `product-css`'s THIRD reachable status (#2314). `ops/resource-tree.ts#loadCssFiles` forwards
      // `reader.read`'s status BEFORE it can judge the CSS, and `read` answers a zero-length file `empty`
      // on its own arm — so `empty` never reaches the `malformed` test at all. It matters for the same
      // reason `malformed` does: a zero-byte theme.css would otherwise reach this policy as a sheet with
      // no `--color-*` and be reported as instrument blindness about the TREE.
      expect: { messageIncludes: "product-css is empty: resource file is empty: packages/ui/src/styles/theme.css" },
      why: "a zero-length theme.css refuses at the population phase on the reader's OWN empty arm, before the CSS grammar is consulted at all",
    },
  ],
});
