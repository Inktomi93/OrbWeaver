// THE ACCENT-EDGE CENSUS SEES BOTH SPELLINGS (#1103), proven through the real CLI against a file://
// fixture.
//
// `ops/walker/census-accent.ts` collects the `side-tab` / `border-accent-on-rounded` population. Until
// 2026-09-05 it read the element's own `border-*-width` and nothing else, so the §6-banned bar this
// codebase actually paints — an absolutely-positioned `::after` filled with a token colour, pinned to one
// edge — produced `candidates=0 judged=0 affected=0 withheld() excluded()`, which reads to a human exactly
// like "clean". Measured live: `[aria-label="Tags"]::after`, 3px × 252px, `oklch(0.72 0.175 52)`, on a
// 10px-radius card (docs/reviews/side-eye/2026-09-02-config-surface-live-drive-2.md F12).
//
// The three arms below are the tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md checklist in one fixture: the codebase's own idiom must
// FIRE (step 2), the adjacent pseudo idiom the rule does NOT ask about — the full-box gradient RING at
// packages/ui/src/styles/globals.css:377 — must stay SILENT (step 3), and the ratified illustrated-picker
// art exemption (#1642, #1151) must reach the new channel the day it lands rather than being re-opened by
// this repair (step 4: a printed `excluded`, not a silent skip).
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CliResult, RunCliOpts } from "../../../../support/tool-fixtures.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { AUDIT_ARGV, findingSelectors, RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "../../../../support/ui-audit-relational.ts";

/** The live F12 geometry, authored the way the tree authors it: a `<style>` block, because a pseudo
 *  element cannot be spelled in an inline `style` attribute — which is itself why an inline-only fixture
 *  could never have caught this class. `oklch` is the only colour spelling a tokens-only tree produces. */
const FIXTURE_CSS = `.bar-host { position: relative; border: 1px solid #555; border-radius: 10px; background: #1b1b1b; width: 320px; height: 120px; margin: 8px }
.bar-host::after { content: ""; position: absolute; top: 0; bottom: 0; left: 0; width: 3px; background: oklch(0.72 0.175 52) }
.ring-host { position: relative; border: 1px solid #555; border-radius: 10px; background: #1b1b1b; width: 320px; height: 120px; margin: 8px }
.ring-host::after { content: ""; position: absolute; inset: 0; border-radius: 10px; background: linear-gradient(180deg, oklch(0.72 0.175 52 / 0.45), oklch(0.99 0.005 60 / 0.03)) }`;

const ACCENT_RULES = ["side-tab", "border-accent-on-rounded"] as const;

interface AuditRuleProof {
  readonly rule: string;
  readonly kind: "fires" | "silent";
  readonly reason: string;
}

interface ToolContext {
  readonly runCli: (tool: string, args: readonly string[], opts?: RunCliOpts) => Promise<CliResult>;
  readonly scratch: string;
}

function auditRuleTest(proofs: readonly AuditRuleProof[], title: string, fn: (context: ToolContext) => Promise<void>): void {
  // Vitest parses the fixture callback's first argument SYNTACTICALLY and refuses anything but an object
  // destructuring pattern, so the wrapper has to name the fixtures it forwards rather than pass a bag.
  test(title, ({ runCli, scratch }: ToolContext) => {
    expect(proofs.every((proof) => proof.reason.trim() !== "")).toBe(true);
    return fn({ runCli, scratch });
  });
}

auditRuleTest(
  [
    {
      rule: "side-tab",
      kind: "fires",
      reason:
        "a token-filled absolutely-positioned ::after pinned to one edge IS how this codebase paints an accent edge — the border-width-only census reported candidates=0 on the very surface carrying the live banned bar, which reads as clean",
    },
    {
      rule: "side-tab",
      kind: "silent",
      reason:
        "a full-box gradient ring is a border on four sides — the one shape §6 does not ban — and its paint is an IMAGE, so it carries no background colour for this arm to read",
    },
    {
      rule: "border-accent-on-rounded",
      kind: "fires",
      reason: "the radius-versus-edge contradiction does not care whether the edge is a border or a bar; the HOST's own radius is what the rule asks about",
    },
    {
      rule: "border-accent-on-rounded",
      kind: "silent",
      reason:
        "#1642's illustrated-picker art exemption is read off the HOST, so it reaches the new channel the day it lands instead of being re-opened by this repair (#1151)",
    },
  ],
  "an accent bar painted on a ::after layer is judged; the full-box gradient ring and the picker's art pane are not",
  async ({ runCli, scratch }) => {
    const body = `<style>${FIXTURE_CSS}</style>
<div id="pseudo-bar" class="bar-host">a real surface wearing the banned edge</div>
<div id="ring" class="ring-host">the sanctioned CTA / active-tab gradient ring</div>
<div data-slot="picker-cell"><span data-slot="picker-cell-art"><div id="art-bar" class="bar-host">skin diagram</div></span></div>`;
    await writeFile(join(scratch, "accent-bar-census.html"), relationalDocument(body));
    const res = await runCli("snap", ["--file", join(scratch, "accent-bar-census.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

    for (const rule of ACCENT_RULES) {
      const selectors = findingSelectors(res.stdout, rule);
      // FIRES: the codebase's own accent-edge idiom. Note the host's own border is 1px — under the old
      // border-width-only census this element could not even become a candidate.
      expect(selectors, `${rule}: a token-filled ::after bar pinned to one edge IS an accent edge`).toContain("#pseudo-bar::after");
      // SILENT, naive idiom: a ring is a border on four sides, the one shape §6 does not ban. It carries no
      // background COLOR at all (its paint is a gradient image), so an image-channel read here would have
      // convicted every CTA, active tab and active rail button on the tree.
      expect(
        selectors.some((selector) => selector.startsWith("#ring")),
        `${rule}: a full-box gradient ring is not an edge bar`,
      ).toBe(false);
      // SILENT, ratified: the picture of an accent edge inside an illustrated picker's art aperture. The
      // sample is still counted — `excluded(illustratedPickerArt)`, never dropped.
      expect(
        selectors.some((selector) => selector.startsWith("#art-bar")),
        `${rule}: #1642's art-pane exemption must reach the pseudo channel`,
      ).toBe(false);
    }
  },
);

// ── #1834: the RENAMED `selectionRail` field still recognizes BOTH ratified carriers ────────────────
// `AccentBorderInput.listRowSelected` → `selectionRail` (and the disposition reason
// `ratifiedListRowSelection` → `ratifiedSelectionRail`) is a pure rename — the walker's selector
// (`SELECTION_RAIL_SEL`, lib/selection-rail-sel.ts) already covers `[data-slot='list-row-root']`,
// `[data-slot='list-row-body']` and `[data-slot='config-band']` since #1823. This plant proves the
// rename did not silently narrow the population back to one carrier, and that the exemption still keys
// on BOTH halves of the predicate — an unselected band with the identical geometry stays judged.
auditRuleTest(
  [
    {
      rule: "side-tab",
      kind: "silent",
      reason: "a selected list-row-root wears the ratified selection rail and is exempt",
    },
    {
      rule: "side-tab",
      kind: "silent",
      reason: "a selected config-band wears the identical ratified rail (#1823) and is exempt too",
    },
    {
      rule: "side-tab",
      kind: "fires",
      reason: "the SAME geometry on an UNSELECTED config-band is not exempt — the state half of the predicate",
    },
  ],
  "selectionRail recognizes both ratified carriers post-rename, and an unselected band stays judged",
  async ({ runCli, scratch }) => {
    const railStyle = "border-left:2px solid #dc2828;border-radius:8px;padding:8px;width:200px";
    const body = `<div id="rail-row" data-slot="list-row-root" data-selected style="${railStyle}">selected list row</div>
<div id="rail-band" data-slot="config-band" data-selected style="${railStyle}">selected config band</div>
<div id="rail-band-off" data-slot="config-band" style="${railStyle}">unselected config band</div>`;
    await writeFile(join(scratch, "selection-rail-rename.html"), relationalDocument(body));
    const res = await runCli("snap", ["--file", join(scratch, "selection-rail-rename.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

    const selectors = findingSelectors(res.stdout, "side-tab");
    expect(selectors, "a selected list-row-root wears the rail and must stay exempt").not.toContain("#rail-row");
    expect(selectors, "a selected config-band wears the identical rail and must stay exempt").not.toContain("#rail-band");
    expect(selectors, "an UNSELECTED band is not exempt — it must still fire").toContain("#rail-band-off");
  },
);
