// Gate: over-art-plate-arm (UI-Theming-and-Content.md §12.1 / D144) — THE OVER-ART PLATE LAW, enforced.
// A translucent surface that can composite over the WALLPAPER layer must mix its own tint over
// `--color-reading-plate` on the LIGHT arm of a `light-dark()`, gated on `[data-has-bg-image]` — never over
// `transparent` (D144(b): the plate's alpha is SOLVED against the worst legal art). The dark arm re-spells
// the base verbatim (D144(d)). The reader is `lib/over-art-plate.ts`; this file is the policy + proofs.
//
// WHY A GATE: nine surfaces adopted the plate ONE AT A TIME and every adoption was found by a post-ship
// pixel-sample on one surface (#204 #217 #241 #229 #221 #167 #237 #487 #623). The population is small and
// enumerable — every rule under an `html[data-blur-*]` gate whose background is a translucent mix — so the
// class is decidable statically and surface number ten does not have to be found by eye. ARMS: A the
// unpaired PLATELESS base · B the DARK ARM MOVED · C an UNREADABLE translucent shape (never a clean zero) ·
// D the blindness tripwire · G the ratchet shrink arm · H the unpaired NO-FILL carrier (#1171).
//
// #1171 — "NO FILL" AND "AN ALPHA I CANNOT COMPUTE" ARE DIFFERENT CLAIMS. `background-color: transparent`
// (and `background: none`, and `rgba(…,0)`) used to land in ARM C, where an exemption cannot reach. Alpha 0
// is READ (ARM H): it owes a plate arm like any plateless base, a waiver absolves exactly the site it names,
// and a fill PROVED to have moved to the subject's own `::before`/`::after` carrier (#1154's shell panes)
// leaves the population as a measured skip rather than as an exemption.
//
// FAMILY: singleton under its own id. The shared reader is `lib/over-art-plate.ts#judgeStylesheets` and it
// has exactly one policy consumer — the plate ALGEBRA is this gate's own, which is what §12.3 means by "a
// unique policy algorithm may live in verify/lib". Its co-consumer of `lib/css-rules.ts` (`motion-token-
// purity`, `rest-transform-grid`) rests on a different reader for its own subject, so neither is a proven
// sibling, and the loader refuses a lone member whose `family` is not its id.
//
// POPULATION PORT (legacy `6977b977b`), byte-identical: the legacy `stylesheetsOf` globbed
// `packages/client/src/**/*.css` + `packages/ui/src/**/*.css` and parsed each with `parseCssRules`;
// `authored-css` is exactly every `.css` under those two trees (`ops/resource-tree.ts:84-107`) and its
// `rules` come from the SAME `lib/css-rules.ts` parser. The ledger is the declared `ledger:ratchet-baselines`
// resource, whose discovered member set is every `*.baseline.json` beside the gate corpus — which includes
// this gate's own, and which is why the stale-row arm may anchor there.
//
// EXEMPTION-MECHANISM MOVE (guide §6.4's EXEMPTION-MECHANISM MOVE classification): the private two-sided `@over-art-plate-ok` vocabulary is
// RETIRED for `@orb-waive`. The central engine owns malformed / stale / dead-position / over-broad
// reconciliation for every ordinary policy at once, so the legacy MALFORMED, OVER-EXEMPTING and STALE arms
// (legacy `mustFlag` E/F and their two `mustPass` twins) are retired WITH A STRONGER SUCCESSOR rather than
// dropped: a marker naming a subject that is no longer plateless now ALARMS as a dead position, and the
// over-exempting case is structurally impossible because a rule's two subjects are two findings with two
// distinct position tokens. MARKER CENSUS at conversion: **ZERO** live `@over-art-plate-ok` markers — the
// grammar was empty, so nothing was translated and the whole vocabulary is deleted rather than migrated.
// Re-derived on this tree rather than remembered: a literal sweep of `packages/` returns 0, and the three
// residual matches repo-wide are this gate's own retired proof fixtures plus one string in the central
// engine's foreign-marker list. That matches the two standing censuses, the gate-runtime exception-authority census
// and the waiver-migration manifest, both of which record the count as 0 and prescribe "delete
// the empty grammar". The five surfaces those documents describe as "becoming warning debt" did NOT need
// to: they were already carried by the ratchet, which this conversion preserves.
//
// ANCHOR MOVE (guide §6.4's ANCHOR MOVE classification): a live finding used to report at the DECLARATION's line and carry no
// token. It now reports at the SELECTOR SUBJECT that names it, because an ordinary finding's position token
// must slice the authored text at its reported column — and that is also what makes the two subjects of one
// rule separately waivable. Every translated marker's binding was verified on the real tree.
//
// THE RATCHET IS GONE, AND IT WAS NOT MY CALL — `severity: "warning"` + a live `workItem` REPLACES IT. The
// conversion was first built with the ledger preserved behind a declared `ledger:ratchet-baselines`
// resource, and `pnpm gate:contract` REFUSED it at the `.baseline.json` literal:
//   `[baseline-ledger] gate-owned baseline ledgers are forbidden; use exact grants or warning debt`
//   (`lib/gate-contract.ts:294`, mechanical on any `*.baseline.json` string in a gate module).
// Of the two sanctioned successors, WARNING DEBT is the honest one here. The four surfaces are not
// permanent exemptions — one is a MEASURED contrast failure (`[data-slot="composer"]` 3.30:1) and three are
// STRUCTURAL findings pending a framebuffer measurement (the per-role `[data-slot="message-bubble"]` rules
// at `--blur-fill-dense`) — and guide §6.2 is explicit that "debt is never converted into a grant to make a
// run clean". Both standing censuses reached the same answer independently:
// the gate-runtime exception-authority census ("4 rows / 4 burnable findings … four current violations become
// warning debt") and the waiver-migration manifest ("the four live plate findings become
// `workItem: 2024` warning debt").
//
// THE OWNER IS #2326 SINCE 2026-09-13, AND THE POINTER HAS NOW ROTTED TWICE — which is why the flip condition
// below is stated as a COUNT and never as a date. #626 closed under the debt (`17a495fb8` repointed to #2024);
// #2024 then closed the same day on the REPOINT RECEIPT while all four surfaces were still firing, so the debt
// again had no live owner. `warning-workitem-liveness` is what MEASURES this now: it holds a warning's
// `workItem` against its `docs/work` item and reds when that item is done or missing. THE FLIP CONDITION WAS MET AND TAKEN (owner,
// 2026-09-19): #2389 gave all four subjects their `--color-reading-plate` light arm, the effective count on
// the real corpus read ZERO (`reports/check-structure.json`), and this commit raised `severity` to `"error"` and
// deleted `workItem`. AUTHORITY STAYS `"ordinary"`, not the `"hard"` the condition first spelled: #1171's
// NO-FILL exemption (`mustPass[9]`) and the §4.2 identity proofs are an exact ordinary waiver at the selector
// subject, and hard authority has no waiver door — taking "hard" would delete a ratified exemption to satisfy a
// sentence. The error BAR is what the condition was for, and it is back. History above kept as the record.
//
// THE COST IS REAL AND IS THE LANE'S ONE ESCALATION: this gate was `error` and is now `warning`, so a NEW
// unpaired glass surface warns where it used to RED. That is a downgrade of an enforcement bar, not a
// refactor. The alternative that keeps the error bar is `authority: "reviewed-grant"` with four rows in
// `lib/reviewed-grants.ts` — outside this lane's fence, and it would have to launder measured debt as a
// permanent licence. Deleted with the ledger: `over-art-plate-arm.baseline.json`, its single-writer
// generator, its `ops/baseline.ts` verb, its `verify/index.ts` export and its `ops/debt.ts` row.
//
// WHERE A BROKEN RESOURCE REFUSES — not here. A declared resource that comes back
// missing/empty/unresolved/malformed makes `resolveResourceDeclarations` (`lib/resource-declaration.ts:182`)
// THROW during the POPULATION phase, and the receipt phase withholds every consumer, both before
// `create`/`evaluate` run (guide §3's acquisition-refusal rule). This module owns no not-ready branch: it reads both declared
// resources through `readyResourceValue`, whose throw asserts the runtime's own refusal already held.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `over-art-plate-arm` descriptor at 89851ec5eae1f7d6f17384fe48946087c73a7308, the parent of the conversion
// `a0807ce47` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The `6977b977b`
// cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both citations
// resolve to this source. Over the 7,435 harness candidates at that tree the legacy `scanRoot: () => false` admits 0
// and the final `population: { of: "none" }` admits 0, both by declaration: legacy − final = ∅, final − legacy = ∅.
// That equality is VACUOUS BY CONSTRUCTION — neither side ever had a TypeScript subject — and the subject comparison
// is the resource paragraph above (`authored-css` (+ the retired ratchet ledger)); no inside control exists to plant.
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { Judgement, Site } from "../lib/over-art-plate.ts";
import { GLASS_GATE, judgeStylesheets, TRANSPARENT, WALLPAPER_GATE } from "../lib/over-art-plate.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

/** Real-tree anchor for the BLINDNESS arm, and its finding's own home: a conformance fixture holds only the
 *  files its row materializes, so "zero recognised glass rules" is correct-by-construction there rather than
 *  a rotted reader. This is a live stylesheet inside the declared CSS population, which is also what makes
 *  it a LEGAL anchor — a resource finding must land inside the policy's own resource population. */
const ANCHOR = "packages/client/src/styles/globals.css";

const MESSAGE =
  "over-art plate law (UI-Theming-and-Content.md §12.1 / D144(b)): a translucent surface that can composite " +
  "over the WALLPAPER layer must mix its own tint over `--color-reading-plate` on the LIGHT arm of a " +
  "`light-dark()`, gated on `[data-has-bg-image]` — never over `transparent`. The plate's alpha is DERIVED " +
  "against the worst legal art (`readingPlateAlpha`, @orb/kit/theme-derivation); a fill mixed with " +
  "`transparent` hands the ink's real backdrop to whatever photo the user picked.";

const FIX =
  "add a companion rule for the same subject gated on `[data-has-bg-image]`, whose background-color is " +
  "`light-dark(color-mix(in oklab, <the same tint> <the same %>, var(--color-reading-plate)), <the base rule " +
  "verbatim>)` — the light arm takes the plate, the dark arm is re-spelled byte-identical (D144(d): the " +
  "sacred dark rooms do not move). #237 (.shell-panel) and #623 (the modal slots) are the worked precedents. " +
  "A surface that can never sit over the wallpaper is waived with " +
  "`/* @orb-waive over-art-plate-arm(<position>): <reason> */` on the line above the rule, where <position> " +
  "is the SELECTOR SUBJECT this finding reports — the last compound of the selector, verbatim " +
  '(`[data-slot="composer"]`, `.shell-panel`), never the whole selector and never the declaration.';

/** ONE live site's message. TWO SHAPES, NOT ONE (#1171): a PLATELESS base mixes a real tint over
 *  `transparent` and its repair is the `[data-has-bg-image]` companion; a NO-FILL carrier paints nothing at
 *  all, so there is no tint to mix and the only repairs are "paint the plate here" or "declare why this
 *  surface can never sit over the wallpaper". Printing the plateless sentence over a no-fill site named a
 *  `var()` that is not in the rule, which is a finding nobody can act on. */
function liveMessage(site: Site): string {
  if (site.reading.kind === "no-fill") {
    return (
      `\`${site.subject}\` paints NO FILL under a \`${GLASS_GATE}…]\` gate and no \`${WALLPAPER_GATE}\` rule ` +
      "gives this subject a plate arm — nothing of its own sits between its ink and whatever photo the user " +
      "picked, and no `::before`/`::after` rule in this stylesheet carries the fill for it. Give the fill (and " +
      "its plate arm) a home, or state why this surface can never sit over the wallpaper (see the fix)."
    );
  }
  return `\`${site.subject}\` mixes \`var(${site.tint})\` over \`${TRANSPARENT}\` and no \`${WALLPAPER_GATE}\` rule gives that pair a \`light-dark()\` plate arm (UI-Theming-and-Content.md §12.1).`;
}

/** The unpaired remainder, each at its own selector subject. WARNING DEBT, not a ratchet: the four surfaces
 *  alive at mint report every run and #2326 owns them (#626 and then #2024 both CLOSED under the debt). */
function reportLive(ctx: GatePolicyContext, judged: Judgement): void {
  for (const [, site] of [...judged.live].sort(([a], [b]) => a.localeCompare(b))) {
    ctx.report.file(site.rel, { line: site.line, column: site.column, token: site.subject, message: liveMessage(site) });
  }
}

/** THE BLINDNESS ARM. Anchored on a real stylesheet inside the declared CSS population, and guarded on that
 *  same stylesheet being present, because a fixture corpus is small by construction rather than blind. */
function reportBlindness(ctx: GatePolicyContext, judged: Judgement): void {
  if (judged.glassRules === 0) {
    ctx.report.file(ANCHOR, {
      line: 1,
      column: 1,
      token: ANCHOR,
      message: `BLINDNESS TRIPWIRE — zero \`${GLASS_GATE}…]\` background rules were recognised on a real tree, so this gate's reader has rotted (a renamed attribute, a moved stylesheet, a new value spelling). Zero is "I could not measure (UI-Theming-and-Content.md §12.1)", never "clean".`,
    });
  }
}

/** Every proof row spreads this: `authored-css` is assembled from the `client-source` AND `ui-source` trees,
 *  so a row that leaves either empty comes back a `[population]` TOOL ERROR instead of a finding and proves
 *  nothing about its arm. */
const CORPUS = {
  "packages/ui/src/styles/keep.css": ".keep {\n  color: var(--color-foreground);\n}\n",
} as const;

const COMPOSER_RULE = 'html[data-blur-composer] [data-slot="composer"] {\n  background-color: color-mix(in oklab, var(--color-sidebar) 70%, transparent);\n}\n';

export const gate = defineGate({
  id: "over-art-plate-arm",
  family: "over-art-plate-arm",
  authority: "ordinary",
  severity: "error",
  population: { of: "none", why: "CSS is a ResourceHost fact population, never a compiler population" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "authored-css" }],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const files = readyResourceValue(ctx.resources.authoredCss());
      const judged = judgeStylesheets(files);
      for (const finding of judged.findings) {
        ctx.report.file(finding.file, { line: finding.line, column: finding.column, token: finding.token, message: finding.message });
      }
      reportLive(ctx, judged);
      if (files.some(({ path }) => path === ANCHOR)) {
        reportBlindness(ctx, judged);
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: { ...CORPUS, "packages/client/src/styles/g.css": COMPOSER_RULE },
      expect: { count: 1, line: 1, token: '[data-slot="composer"]', messageIncludes: "gives that pair a `light-dark()` plate arm" },
      why: 'THE FOUNDING SHAPE — a glass chrome surface mixed over `transparent` with no `[data-has-bg-image]` plate companion. This is `[data-slot="composer"]` verbatim, one of the surfaces the gate found at mint. The `line: 1` + `token` pin is the ANCHOR MOVE: the finding reports on the SELECTOR SUBJECT, not on the declaration a line below it',
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/client/src/styles/g.css":
          'html[data-blur-panels] .shell-grid[data-has-bg-image][data-section]:not([data-section="chats"]) .shell-main {\n  background-color: color-mix(in oklab, var(--color-card) 70%, transparent);\n}\n',
      },
      expect: { count: 1, token: ".shell-main", messageIncludes: "gives that pair a `light-dark()` plate arm" },
      why: "`.shell-main` verbatim: the selector is ALREADY wallpaper-gated, which is not the same as carrying the plate — a `[data-has-bg-image]` gate on a transparent mix must not absolve itself",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/client/src/styles/g.css":
          "html[data-blur-panels] .shell-panel {\n  background-color: color-mix(in oklab, var(--color-sidebar) 70%, var(--color-reading-plate));\n}\n",
      },
      expect: { count: 1, token: ".shell-panel", messageIncludes: "DARK ARM MOVED" },
      why: "ARM B (D144(d)): the plate taken OUTSIDE a `light-dark()` moves the dark arm too — the sacred dark rooms",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/client/src/styles/g.css":
          "html[data-blur-panels] .shell-grid[data-has-bg-image] .shell-panel {\n  background-color: light-dark(\n    color-mix(in oklab, var(--color-sidebar) 70%, var(--color-reading-plate)),\n    color-mix(in oklab, var(--color-sidebar) 90%, var(--color-background))\n  );\n}\n",
      },
      expect: { count: 1, token: ".shell-panel", messageIncludes: "DARK ARM MOVED" },
      why: "ARM B's OTHER half, and the subtle one: the LIGHT arm is correct but the DARK arm is not the plateless base re-spelled — the dark rooms moved anyway, which a light-arm-only check would have passed",
    },
    {
      mode: "resource",
      files: { ...CORPUS, "packages/client/src/styles/g.css": "html[data-blur-panels] .shell-panel {\n  background-color: oklch(0.2 0 0 / 0.7);\n}\n" },
      expect: { count: 1, token: ".shell-panel", messageIncludes: "UNREADABLE translucent background" },
      why: "ARM C: a translucent spelling this reader cannot classify REFUSES LOUDLY — a clean zero over an unrecognised shape is the lying-gate shape this repo keeps paying for. `messageIncludes` is what discriminates it: the fail-closed arm produces the same COUNT as ARM A and differs only in message",
    },
    {
      mode: "resource",
      files: { ...CORPUS, "packages/client/src/styles/g.css": "html[data-blur-panels] .shell-panel {\n  background-color: transparent;\n}\n" },
      expect: { count: 1, token: ".shell-panel", messageIncludes: "paints NO FILL" },
      why: "ARM H (#1171), the alpha-0 half: an unmarked, uncarried `transparent` under a glass gate owes a plate arm exactly as a plateless mix does — and it says so in a sentence naming NO tint, because there is none to mix",
    },
    {
      mode: "resource",
      files: { ...CORPUS, "packages/client/src/styles/g.css": "html[data-blur-panels] .shell-panel {\n  background: none;\n}\n" },
      expect: { count: 1, token: ".shell-panel", messageIncludes: "paints NO FILL" },
      why: "ARM H is SPELLING-BLIND on purpose: `background: none` computes to the same `transparent` colour, and a gate an author dodges by changing the keyword is the blind-spot class this repo keeps paying for",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/client/src/styles/g.css":
          'html[data-blur-modals] [data-slot="dialog-popup"],\nhtml[data-blur-modals] [data-slot="alert-dialog-popup"] {\n  background-color: color-mix(in oklab, var(--color-popover) 70%, transparent);\n}\n',
      },
      expect: { count: 2, token: '[data-slot="alert-dialog-popup"]' },
      why: "the SUCCESSOR to the legacy OVER-EXEMPTING arm, and the reason that arm could be retired rather than ported: ONE rule styling TWO subjects is TWO findings with TWO distinct position tokens on TWO lines, so a marker naming one of them cannot silently absolve the other. The legacy grammar allowed an UNPOSITIONED marker and had to hand-roll a fourth arm to refuse it; `@orb-waive` has no unpositioned form",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/client/src/styles/g.css":
          "html[data-blur-panels] .shell-panel {\n  background-color: color-mix(in oklab, var(--color-sidebar) 70%, transparent);\n}\nhtml[data-blur-panels] .shell-panel {\n  background-color: light-dark(\n    color-mix(in oklab, var(--color-sidebar) 70%, var(--color-reading-plate)),\n    color-mix(in oklab, var(--color-sidebar) 70%, transparent)\n  );\n}\n",
      },
      expect: { count: 1, line: 1, token: ".shell-panel" },
      why: "NARROWING ROW for the `wallpaperGated` fence on a PROVIDER: the companion rule here is byte-perfect — light arm takes the plate, dark arm re-spells the base — but it is NOT gated on `[data-has-bg-image]`, so it applies with or without art and CHANGES the un-wallpapered render, which D144 exists to keep byte-identical. Cut the fence and this row goes green on a companion that does not satisfy the law",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/client/src/styles/g.css":
          "html[data-blur-panels] .shell-panel {\n  background-color: color-mix(in oklab, var(--color-sidebar) 70%, transparent);\n}\nhtml[data-blur-panels] .shell-grid[data-has-bg-image] .shell-panel {\n  background-color: light-dark(\n    color-mix(in oklab, var(--color-sidebar) 70%, var(--color-reading-plate)),\n    color-mix(in oklab, var(--color-sidebar) 70%, transparent)\n  );\n}\n",
      },
      why: "#237's ADOPTED shape verbatim — base + a `[data-has-bg-image]` companion whose LIGHT arm takes the plate and whose DARK arm is the base re-spelled: the whole point of the gate",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/client/src/styles/g.css":
          'html[data-blur-modals] [data-slot="dialog-popup"],\nhtml[data-blur-modals] [data-slot="alert-dialog-popup"] {\n  background-color: color-mix(in oklab, var(--color-popover) 70%, transparent);\n}\nhtml[data-blur-modals] .shell-grid[data-has-bg-image] ~ [data-slot="portal-root"] [data-slot="dialog-popup"],\nhtml[data-blur-modals] .shell-grid[data-has-bg-image] ~ [data-slot="portal-root"] [data-slot="alert-dialog-popup"] {\n  background-color: light-dark(\n    color-mix(in oklab, var(--color-popover) 70%, var(--color-reading-plate)),\n    color-mix(in oklab, var(--color-popover) 70%, transparent)\n  );\n}\n',
      },
      why: "#623's shape: the companion reaches the popup as a portal SIBLING, not a descendant — the pairing keys on the selector SUBJECT, so a different ancestry still pairs (getting this wrong would false-RED every portalled popup)",
    },
    {
      mode: "resource",
      files: { ...CORPUS, "packages/client/src/styles/g.css": "html[data-blur-panels] .shell-panel {\n  background-color: var(--color-sidebar);\n}\n" },
      why: "DECLARED LIMIT: an OPAQUE fill under a glass gate is not in the population — nothing composites through it",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/client/src/styles/g.css":
          "html[data-blur-panels] .shell-panel {\n  background-color: color-mix(in oklab, var(--color-sidebar) 70%, var(--color-background));\n}\n",
      },
      why: "DECLARED LIMIT: a mix whose last partner is some OTHER token is a SKIP — a token's alpha is not statically knowable, and this gate is deliberately conservative because a false RED here blocks every lane's floor",
    },
    {
      mode: "resource",
      files: { ...CORPUS, "packages/client/src/styles/g.css": "html[data-blur-panels] .shell-panel {\n  backdrop-filter: blur(8px);\n}\n" },
      why: "DECLARED LIMIT: a glass rule that sets no background is not a plate question at all",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/client/src/styles/g.css": ".plain {\n  background-color: color-mix(in oklab, var(--color-sidebar) 70%, transparent);\n}\n",
      },
      why: "NARROWING ROW for the GLASS-GATE fence: the identical plateless mix the founding `mustFlag` row REDs, on a rule that is NOT under an `html[data-blur-*]` gate. Without the blur gate nothing composites through the surface, so there is no wallpaper behind its ink and no plate question — cut the fence and this row REDs on a surface the law does not reach. Measured together with the BACKGROUND_PROPS fence beside it, because two fences guarding one subject are individually uncuttable",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/client/src/styles/g.css":
          "html[data-blur-panels] .shell-panel {\n  border-color: color-mix(in oklab, var(--color-sidebar) 70%, transparent);\n}\n",
      },
      why: "NARROWING ROW for the BACKGROUND_PROPS fence: a translucent BORDER under a glass gate is the same VALUE shape the founding row REDs, on a property that paints no backdrop for anything's ink. The plate law is about what sits between ink and art; cut the property filter and every translucent border in the shell becomes a plate finding",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/client/src/styles/g.css":
          "/* html[data-blur-panels] .shell-panel { background-color: color-mix(in oklab, var(--color-sidebar) 70%, transparent); } */\n.plain {\n  color: var(--color-foreground);\n}\n",
      },
      why: "COMMENT POSTURE, the value half: a commented-out glass rule is trivia — the parser blanks comment spans before parsing, so it is never judged",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/client/src/styles/g.css": `/* @orb-waive over-art-plate-arm([data-slot="composer"]): a probe surface that can never sit over the wallpaper layer. */\n${COMPOSER_RULE}`,
      },
      why: "§4.2 IDENTITY, on the founding `mustFlag` row's exact fixture: the correct ordinary waiver at the reported position — the SELECTOR SUBJECT — suppresses the one finding it produces. This is the successor to the legacy marker's HONOURED half, and the fixture produces exactly ONE finding so one marker consumes one occurrence",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/client/src/styles/g.css":
          "/* @orb-waive over-art-plate-arm(.shell-panel): this pane's ink is plated by the surface behind it. */\nhtml[data-blur-panels] .shell-panel {\n  background-color: transparent;\n}\n",
      },
      why: "#1171's WHOLE POINT, carried through the conversion: the exemption the finding's own fix text prescribes must actually absolve a NO-FILL site. Before #1171 this exact file REDded TWICE — the unreadable finding plus a stale marker — with no legal way to be green",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/client/src/styles/g.css":
          'html[data-blur-panels] .shell-panel {\n  background: none;\n}\nhtml[data-blur-panels] .shell-panel::before {\n  content: "";\n  background-color: color-mix(in oklab, var(--color-sidebar) 70%, transparent);\n}\nhtml[data-blur-panels] .shell-grid[data-has-bg-image] .shell-panel::before {\n  background-color: light-dark(\n    color-mix(in oklab, var(--color-sidebar) 70%, var(--color-reading-plate)),\n    color-mix(in oklab, var(--color-sidebar) 70%, transparent)\n  );\n}\n',
      },
      why: "#1154's SHIPPED SHAPE, proved rather than exempted: the pane hands its fill to a `::before` carrier (which this reader judges on its own row, plate arm and all), so the host's no-fill is a measured SKIP. A marker here would be an unchecked promise; the carrier is a fact in the same stylesheet",
    },
  ],
});
