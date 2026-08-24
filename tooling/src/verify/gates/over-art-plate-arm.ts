// Gate: over-art-plate-arm (UI-Theming-and-Content.md §12.1 / D144) — THE OVER-ART PLATE LAW, enforced.
// A translucent surface that can composite over the WALLPAPER layer must mix its own tint over
// `--color-reading-plate` on the LIGHT arm of a `light-dark()`, gated on `[data-has-bg-image]` — never over
// `transparent` (D144(b): the plate's alpha is SOLVED against the worst legal art). The dark arm re-spells
// the base verbatim (D144(d)). The reader is `lib/over-art-plate.ts`; this file is the descriptor + proofs.
//
// WHY A GATE: nine surfaces adopted the plate ONE AT A TIME and every adoption was found by a post-ship
// pixel-sample on one surface (#204 #217 #241 #229 #221 #167 #237 #487 #623). The population is small and
// enumerable — every rule under an `html[data-blur-*]` gate whose background is a translucent mix — so the
// class is decidable statically and surface number ten does not have to be found by eye. ARMS: A the
// unpaired PLATELESS base · B the DARK ARM MOVED · C an UNREADABLE translucent shape (never a clean zero) ·
// D the §4.6 blindness tripwire · E/F the two-sided `@over-art-plate-ok` marker · G the ratchet shrink arm.
//
// COMMENT POSTURE — BOTH, deliberately (GATE-AUTHORING.md §5): the VALUE scan is comment-BLIND and wired
// through `blankCssComments` (inside `parseCssRules`), so a commented-out rule is never judged; the MARKER
// reader is comments-INTENDED and reads the RAW bytes at the same offsets (blanking is length-preserving).
//
// RATCHET (§4.8): the five plateless surfaces alive at mint are budgeted in `over-art-plate-arm.baseline.json`
// so the gate lands GREEN on a tree it did not break, while `pnpm debt` enumerates them and any shrink that
// is not regenerated REDs. TWO of the five are MEASURED failures (composer 3.30:1, `.shell-main` 3.69:1);
// the three message-bubble rows are STRUCTURAL findings PENDING measurement — the ledger says which is which.
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { RatchetRow } from "../../_shared/ratchet-rows.ts";
import { admissionFor, classNote, readBudgetRows } from "../../_shared/ratchet-rows.ts";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import type { Judgement } from "../lib/over-art-plate.ts";
import { GLASS_GATE, judgeStylesheets, stylesheetsOf, TRANSPARENT, WALLPAPER_GATE } from "../lib/over-art-plate.ts";

/** The ledger's ONE home — exported so `ops/debt.ts` enumerates these rows instead of re-spelling the path. */
export const BASELINE_REL = "tooling/src/verify/gates/over-art-plate-arm.baseline.json";
const GATE_SELF = "tooling/src/verify/gates/over-art-plate-arm.ts";
/** Real-tree anchor (§4.5): present on every real run, and no conformance example creates it. */
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
  "sacred dark rooms do not move). #237 (.shell-panel) and #623 (the modal slots) are the worked precedents.";

/** The committed ledger, read through the ONE row reader so each row's DEBT/RATIFIED class travels. */
export function loadBaseline(root: string): ReadonlyMap<string, RatchetRow> {
  return readBudgetRows(root, BASELINE_REL);
}

/** The BUDGETED arm: a live key a committed row absolves is DECLARED DEBT, counted through `ctx.scan` so a
 *  ✓ still prints the population it is carrying — never silence (GATE-AUTHORING.md §1, `gate-modernization`
 *  ARM D). Everything the ledger does not cover REDs at its own rule's line. */
function reportRatchet(ctx: GateRunCtx, judged: Judgement, baseline: ReadonlyMap<string, RatchetRow>): void {
  let admitted = 0;
  let ratified = 0;
  for (const [key, site] of [...judged.live].sort(([a], [b]) => a.localeCompare(b))) {
    const admission = admissionFor(baseline.get(key), 1);
    admitted += admission.admitted;
    ratified += admission.ratified;
    if (admission.admitted === 0) {
      ctx.report({
        file: site.rel,
        line: site.line,
        column: 0,
        message: `\`${site.subject}\` mixes \`var(${site.tint})\` over \`${TRANSPARENT}\` and no \`${WALLPAPER_GATE}\` rule gives that pair a \`light-dark()\` plate arm (UI-Theming-and-Content.md §12.1).`,
      });
    }
  }
  ctx.scan({ admitted, admittedRatified: ratified });
}

/** The two WHOLE-TREE arms — meaningless off the real tree, so both are anchor-guarded (§4.5): a conformance
 *  mini-project holds only its example's files and no example creates the anchor or the ledger. */
function reportWholeTree(ctx: GateRunCtx, judged: Judgement): void {
  if (!existsSync(join(ctx.root, ANCHOR))) {
    return;
  }
  if (judged.glassRules === 0) {
    ctx.report({
      file: GATE_SELF,
      line: 1,
      column: 0,
      message: `BLINDNESS TRIPWIRE — zero \`${GLASS_GATE}…]\` background rules were recognised on a real tree, so this gate's reader has rotted (a renamed attribute, a moved stylesheet, a new value spelling). Zero is "I could not measure", never "clean" (GATE-AUTHORING.md §4 rule 6).`,
    });
  }
  for (const [key, row] of loadBaseline(ctx.root)) {
    if (!judged.live.has(key)) {
      ctx.report({
        file: GATE_SELF,
        line: 1,
        column: 0,
        message: `${BASELINE_REL} budgets "${key}" but it no longer violates (or its rule is gone) — the ratchet only goes down: regenerate it (\`node tooling/src/verify/cli.ts baseline over-art-plate-arm\`) and commit the shrink.${classNote(row)}`,
      });
    }
  }
}

export const gate: GateDescriptor = {
  name: "over-art-plate-arm",
  docRow: "UI-Theming-and-Content.md §12.1 / D144",
  status: "active",
  scopeSafety: "whole-project", // the pairing is cross-RULE and the ratchet is a whole-tree count
  fsBacked: true,
  // Reads CSS off the filesystem — the ts-morph walk holds no stylesheets, so admitting a TS file here would
  // report a denominator this gate never read (the blind-gate false-clean shape, §1 `ctx.scan`).
  scanRoot: () => false,
  message: MESSAGE,
  fix: FIX,
  run: (ctx) => {
    const judged = judgeStylesheets(ctx.root);
    ctx.scan({ unit: "stylesheet", scanned: stylesheetsOf(ctx.root).length, skipped: judged.skipped });
    for (const finding of judged.findings) {
      ctx.report({ ...finding, column: 0 });
    }
    reportRatchet(ctx, judged, loadBaseline(ctx.root));
    reportWholeTree(ctx, judged);
  },

  mustFlag: [
    {
      files: {
        "packages/client/src/styles/g.css":
          'html[data-blur-composer] [data-slot="composer"] {\n  background-color: color-mix(in oklab, var(--color-sidebar) 70%, transparent);\n}\n',
      },
      expect: { messageIncludes: "gives that pair a `light-dark()` plate arm" },
      why: 'THE FOUNDING SHAPE — a glass chrome surface mixed over `transparent` with no `[data-has-bg-image]` plate companion. This is `[data-slot="composer"]` verbatim, one of the five the gate found at mint',
    },
    {
      files: {
        "packages/client/src/styles/g.css":
          'html[data-blur-panels] .shell-grid[data-has-bg-image][data-section]:not([data-section="chats"]) .shell-main {\n  background-color: color-mix(in oklab, var(--color-card) 70%, transparent);\n}\n',
      },
      expect: { messageIncludes: "gives that pair a `light-dark()` plate arm" },
      why: "`.shell-main` verbatim: the selector is ALREADY wallpaper-gated, which is not the same as carrying the plate — a `[data-has-bg-image]` gate on a transparent mix must not absolve itself",
    },
    {
      files: {
        "packages/client/src/styles/g.css":
          "html[data-blur-panels] .shell-panel {\n  background-color: color-mix(in oklab, var(--color-sidebar) 70%, var(--color-reading-plate));\n}\n",
      },
      expect: { messageIncludes: "DARK ARM MOVED" },
      why: "ARM B (D144(d)): the plate taken OUTSIDE a `light-dark()` moves the dark arm too — the sacred dark rooms",
    },
    {
      files: {
        "packages/client/src/styles/g.css":
          "html[data-blur-panels] .shell-grid[data-has-bg-image] .shell-panel {\n  background-color: light-dark(\n    color-mix(in oklab, var(--color-sidebar) 70%, var(--color-reading-plate)),\n    color-mix(in oklab, var(--color-sidebar) 90%, var(--color-background))\n  );\n}\n",
      },
      expect: { messageIncludes: "DARK ARM MOVED" },
      why: "ARM B's OTHER half, and the subtle one: the LIGHT arm is correct but the DARK arm is not the plateless base re-spelled — the dark rooms moved anyway, which a light-arm-only check would have passed",
    },
    {
      files: {
        "packages/client/src/styles/g.css": "html[data-blur-panels] .shell-panel {\n  background-color: oklch(0.2 0 0 / 0.7);\n}\n",
      },
      expect: { messageIncludes: "UNREADABLE translucent background" },
      why: "ARM C: a translucent spelling this reader cannot classify REFUSES LOUDLY — a clean zero over an unrecognised shape is the lying-gate shape this repo keeps paying for",
    },
    {
      files: {
        "packages/client/src/styles/g.css":
          '/* @over-art-plate-ok */\nhtml[data-blur-composer] [data-slot="composer"] {\n  background-color: color-mix(in oklab, var(--color-sidebar) 70%, transparent);\n}\n',
      },
      expect: { messageIncludes: "MALFORMED" },
      why: "ARM E: a bare marker with no reason is RED as its OWN flavour — it must not sit there looking like protection (§4 rule 3)",
    },
    {
      files: {
        "packages/client/src/styles/g.css":
          "/* @over-art-plate-ok: nothing here is translucent */\nhtml[data-blur-panels] .shell-panel {\n  background-color: var(--color-sidebar);\n}\n",
      },
      expect: { messageIncludes: "STALE" },
      why: "ARM F, two-sidedness: a well-formed marker guarding NOTHING is a loaded gun — the next violation written on that rule would inherit a permit nobody granted it",
    },
    {
      files: {
        "packages/client/src/styles/g.css":
          '/* @over-art-plate-ok: both popups are fine, honest */\nhtml[data-blur-modals] [data-slot="dialog-popup"],\nhtml[data-blur-modals] [data-slot="alert-dialog-popup"] {\n  background-color: color-mix(in oklab, var(--color-popover) 70%, transparent);\n}\n',
      },
      expect: { messageIncludes: "OVER-EXEMPTING" },
      why: "ARM E, §4 rule 3a: ONE rule guards TWO subjects (the real dialog/alert-dialog pair), so an unpositioned marker silently absolves both — it must name its position",
    },
    {
      files: {
        "packages/client/src/styles/g.css":
          '/* @over-art-plate-ok([data-slot="no-such-thing"]): a position that is not here */\nhtml[data-blur-composer] [data-slot="composer"] {\n  background-color: color-mix(in oklab, var(--color-sidebar) 70%, transparent);\n}\n',
      },
      expect: { messageIncludes: "STALE" },
      why: "ARM F: a marker naming a DEAD position is stale exactly as a dead row is — and the underlying violation still REDs",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/client/src/styles/g.css":
          "html[data-blur-panels] .shell-panel {\n  background-color: color-mix(in oklab, var(--color-sidebar) 70%, transparent);\n}\nhtml[data-blur-panels] .shell-grid[data-has-bg-image] .shell-panel {\n  background-color: light-dark(\n    color-mix(in oklab, var(--color-sidebar) 70%, var(--color-reading-plate)),\n    color-mix(in oklab, var(--color-sidebar) 70%, transparent)\n  );\n}\n",
      },
      why: "#237's ADOPTED shape verbatim — base + a `[data-has-bg-image]` companion whose LIGHT arm takes the plate and whose DARK arm is the base re-spelled: the whole point of the gate",
    },
    {
      files: {
        "packages/client/src/styles/g.css":
          'html[data-blur-modals] [data-slot="dialog-popup"],\nhtml[data-blur-modals] [data-slot="alert-dialog-popup"] {\n  background-color: color-mix(in oklab, var(--color-popover) 70%, transparent);\n}\nhtml[data-blur-modals] .shell-grid[data-has-bg-image] ~ [data-slot="portal-root"] [data-slot="dialog-popup"],\nhtml[data-blur-modals] .shell-grid[data-has-bg-image] ~ [data-slot="portal-root"] [data-slot="alert-dialog-popup"] {\n  background-color: light-dark(\n    color-mix(in oklab, var(--color-popover) 70%, var(--color-reading-plate)),\n    color-mix(in oklab, var(--color-popover) 70%, transparent)\n  );\n}\n',
      },
      why: "#623's shape: the companion reaches the popup as a portal SIBLING, not a descendant — the pairing keys on the selector SUBJECT, so a different ancestry still pairs (getting this wrong would false-RED every portalled popup)",
    },
    {
      files: {
        "packages/client/src/styles/g.css": "html[data-blur-panels] .shell-panel {\n  background-color: var(--color-sidebar);\n}\n",
      },
      why: "DECLARED LIMIT: an OPAQUE fill under a glass gate is not in the population — nothing composites through it",
    },
    {
      files: {
        "packages/client/src/styles/g.css":
          "html[data-blur-panels] .shell-panel {\n  background-color: color-mix(in oklab, var(--color-sidebar) 70%, var(--color-background));\n}\n",
      },
      why: "DECLARED LIMIT: a mix whose last partner is some OTHER token is a counted SKIP — a token's alpha is not statically knowable, and this gate is deliberately conservative because a false RED here blocks every lane's floor",
    },
    {
      files: {
        "packages/client/src/styles/g.css": "html[data-blur-panels] .shell-panel {\n  backdrop-filter: blur(8px);\n}\n",
      },
      why: "DECLARED LIMIT: a glass rule that sets no background is not a plate question at all",
    },
    {
      files: {
        "packages/client/src/styles/g.css":
          "/* html[data-blur-panels] .shell-panel { background-color: color-mix(in oklab, var(--color-sidebar) 70%, transparent); } */\n.plain {\n  color: var(--color-foreground);\n}\n",
      },
      why: "COMMENT POSTURE, the value half: a commented-out glass rule is trivia — `parseCssRules` blanks comment spans before parsing, so it is never judged",
    },
    {
      files: {
        "packages/client/src/styles/g.css":
          '/* @over-art-plate-ok: a probe surface that can never sit over the wallpaper layer — delete this row when the probe goes. */\nhtml[data-blur-composer] [data-slot="composer"] {\n  background-color: color-mix(in oklab, var(--color-sidebar) 70%, transparent);\n}\n',
      },
      why: "the marker's HONOURED half (§5 case 2): a well-formed, reason-carrying marker on a real violation exempts it — this is the ONE sanctioned way to declare a surface outside the fence",
    },
  ],
};
