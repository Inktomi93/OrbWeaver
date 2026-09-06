// The NATIVE LABEL association, proven through the whole instrument (#1009). The accessible-name census
// (ops/walker/census-interactive.ts) read aria-label / aria-labelledby / visible text / title / alt and
// nothing else, so a control named the way HTML has always named controls — `<label for=…>` — was filed
// `aria-name` P1 "exposes no accessible name", and carried an EMPTY door name besides.
//
// SCOPE (re-derived, and it corrects the premise this work was dispatched with): the dispatched "real
// site", packages/client/src/components/setting-switch-row.tsx, is NOT one — Base UI belts every
// association, so its Switch carries `aria-labelledby` as well as the `<label for>` and the census
// already named it. No live app surface today is named by the native association ALONE. This closed a
// LATENT false-positive class: a bare `<label for>` is correct, lint-clean HTML, and an instrument that
// files a P1 on correct markup teaches authors to add redundant aria to appease it.
//
// PRECISION IS THE WHOLE DIFFICULTY. A rule that says "this control has no name" is expensive in BOTH
// directions: a false positive trains readers to discount P1s, and a false negative is a genuinely
// unnamed control reported clean. So the association is resolved by the BROWSER's own
// `HTMLElement.labels` (which knows `for=` and wrapping alike, and knows a `for` pointing elsewhere is
// not an association) rather than by a selector this file would have to keep correct.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CliResult, RunCliOpts } from "../../../../support/tool-fixtures.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import type { RelationalPopulationReport } from "../../../../support/ui-audit-relational.ts";
import { AUDIT_ARGV, auditReport, RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "../../../../support/ui-audit-relational.ts";

/** The proof denominator the `design-audit-rule-proof` gate reads — the sibling census suites' shape. */
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
  test(title, ({ runCli, scratch }: ToolContext) => {
    expect(proofs.every((proof) => proof.reason.trim() !== "")).toBe(true);
    return fn({ runCli, scratch });
  });
}

async function auditFixture(scratch: string, runCli: ToolContext["runCli"], name: string, body: string): Promise<RelationalPopulationReport> {
  await writeFile(join(scratch, `${name}.html`), relationalDocument(body));
  const res = await runCli("snap", ["--file", join(scratch, `${name}.html`), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  return JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as RelationalPopulationReport;
}

/** The control paints a box and carries no text of its own — the switch/checkbox shape exactly. */
const CONTROL = 'style="width:40px;height:24px;background:#444;border:0"';

function namesIn(report: RelationalPopulationReport): readonly { readonly rule: string }[] {
  return report.findings.filter(({ rule }) => rule === "aria-name");
}

// ── silent: the association HTML has always used ─────────────────────────────

auditRuleTest(
  [
    {
      rule: "aria-name",
      kind: "silent",
      reason:
        "a `<label for>` names its control — the app's own settings rows (Field + Switch) are built exactly this way, so filing them unnamed made every one of them a standing false P1",
    },
  ],
  "a control named by <label for> is not filed as unnamed",
  async ({ runCli, scratch }) => {
    const body = `<label for="sw-1">Show timestamps</label><button role="switch" id="sw-1" ${CONTROL}></button>`;
    expect(namesIn(await auditFixture(scratch, runCli, "name-label-for", body))).toHaveLength(0);
  },
);

auditRuleTest(
  [
    {
      rule: "aria-name",
      kind: "silent",
      reason: "the wrapping-label spelling of the same association, which the browser reports through the same HTMLElement.labels list",
    },
  ],
  "a control wrapped in its <label> is not filed as unnamed",
  async ({ runCli, scratch }) => {
    const body = `<label>Show timestamps <button role="switch" id="sw-2" ${CONTROL}></button></label>`;
    expect(namesIn(await auditFixture(scratch, runCli, "name-label-wrap", body))).toHaveLength(0);
  },
);

// ── fires: the rule must still catch what it exists to catch ─────────────────

auditRuleTest(
  [
    {
      rule: "aria-name",
      kind: "fires",
      reason:
        "the planted control: a switch with no label, no aria-label and no text is genuinely unnamed and must still be a P1 — a name resolver that silences this has traded a false positive for a false clean",
    },
  ],
  "a control with no label of any kind is still filed as unnamed",
  async ({ runCli, scratch }) => {
    const body = `<button role="switch" id="sw-3" ${CONTROL}></button>`;
    expect(namesIn(await auditFixture(scratch, runCli, "name-none", body))).toHaveLength(1);
  },
);

auditRuleTest(
  [
    {
      rule: "aria-name",
      kind: "fires",
      reason:
        "the precision neighbour: a `<label for>` naming a DIFFERENT id is not this control's name, and a resolver that reached for the nearest label element instead of the real association would silence it",
    },
  ],
  "a <label for> pointing at another id does not name this control",
  async ({ runCli, scratch }) => {
    const body = `<label for="sw-elsewhere">Show timestamps</label><button role="switch" id="sw-4" ${CONTROL}></button><button id="sw-elsewhere" ${CONTROL}>elsewhere</button>`;
    expect(namesIn(await auditFixture(scratch, runCli, "name-label-other", body))).toHaveLength(1);
  },
);

// ── the OTHER half of the same blindness: the door census ────────────────────
// `doorName` is computed from the same chain in the same census, so a `for`-labelled control was not
// merely mis-filed as unnamed — it was a NAMELESS door, and `duplicate-action-door` (which skips
// zero-length names outright) could not see it at all. This pins the door half through the only surface
// that publishes it. It is also the blast-radius receipt for the change: the doors this makes visible
// can only ever produce a P3 advisory, never a run-failing severity.

auditRuleTest(
  [
    {
      rule: "duplicate-action-door",
      kind: "fires",
      reason:
        "two structurally distinct switches named ONLY by their <label for> are the same offered action from two homes — before #1009 both carried an empty door name and the rule skipped them silently",
    },
  ],
  "a control named only by <label for> is censused as a named action door",
  async ({ runCli, scratch }) => {
    const row = (id: string): string => `<label for="${id}">Show timestamps</label><button role="switch" id="${id}" ${CONTROL}></button>`;
    const body = `<section><div>${row("dup-a")}</div></section><article><p>x</p>${row("dup-b")}</article>`;
    const report = await auditFixture(scratch, runCli, "door-label-for", body);
    const doors = report.findings.filter(({ rule }) => rule === "duplicate-action-door");
    expect(doors).toHaveLength(1);
  },
);

// ── the NAME-TEXT source: accname step 2A, both directions (#1317 item 8) ────
// `hasVisibleText` was `textContent.trim().length > 0`, which counts text inside an `aria-hidden="true"`
// subtree — the exact text the accessible-name computation EXCLUDES. The house shape for an icon-only
// control is a decorative glyph marked aria-hidden, so a genuinely nameless control read as named and
// `aria-name` filed nothing: a FALSE CLEAN, the direction that costs most on an a11y rule.
//
// The neighbour arm is the reason this is not simply "drop hidden text": sr-only content is NOT
// aria-hidden, a screen reader reads it, and it is the sanctioned way to name an icon-only control here.
// Excluding it would trade this false clean for a false P1 on every correctly-named icon button.

auditRuleTest(
  [
    {
      rule: "aria-name",
      kind: "fires",
      reason:
        "a control whose only text sits inside an aria-hidden subtree exposes NO accessible name — accname step 2A excludes that subtree, while textContent still reads it, so the control was reported clean",
    },
  ],
  "text inside an aria-hidden subtree is not an accessible name",
  async ({ runCli, scratch }) => {
    const body = `<button id="icon-only" ${CONTROL}><span aria-hidden="true">x</span></button>`;
    expect(namesIn(await auditFixture(scratch, runCli, "name-aria-hidden-text", body))).toHaveLength(1);
  },
);

auditRuleTest(
  [
    {
      rule: "aria-name",
      kind: "silent",
      reason:
        "the precision neighbour: sr-only text is visually hidden but NOT aria-hidden, so it IS the control's accessible name — narrowing the text source to what the eye can see would file a P1 on every correctly-named icon button",
    },
  ],
  "screen-reader-only text still names its control",
  async ({ runCli, scratch }) => {
    const srOnly = 'style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap"';
    const body = `<button id="icon-sr" ${CONTROL}><span aria-hidden="true">x</span><span ${srOnly}>Close</span></button>`;
    expect(namesIn(await auditFixture(scratch, runCli, "name-sr-only-text", body))).toHaveLength(0);
  },
);

// ── the view-switch cell (#1705) ─────────────────────────────────────────────
// On home, `nav[aria-label=Primary] > button "Chats"` NAVIGATES THE APP while `#context-cell-chats` inside
// `toolbar "Character"` REPAINTS THE CONTEXT REGION with this character's chats. Two regions, two verbs,
// one noun (UI-Architecture-and-Layout.md §4.1–4.3) — so the rule's premise ("one verb wants one home per
// plane") does not hold and it filed a false positive.
//
// The two fixtures are byte-identical except for the `role="toolbar"` attribute, which is the ONLY input to
// the fence: the door PATH is position-free and carries no role, so a control that flips the verdict
// without the fence is impossible and the second arm is a real control rather than a differently-shaped
// document. Keep them that way.

function doorsIn(report: RelationalPopulationReport): readonly { readonly rule: string }[] {
  return report.findings.filter(({ rule }) => rule === "duplicate-action-door");
}

const SWITCHER = (role: string): string => `<nav aria-label="Primary" data-slot="primary-nav">
  <button id="nav-chats" data-slot="nav-cell" ${CONTROL}>Chats</button>
  <button id="nav-library" data-slot="nav-cell" ${CONTROL}>Library</button>
</nav>
<div id="context-rail" data-slot="context-rail"${role} aria-label="Character">
  <button id="context-cell-chats" data-slot="context-cell" ${CONTROL}>Chats</button>
  <button id="context-cell-notes" data-slot="context-cell" ${CONTROL}>Notes</button>
</div>`;

auditRuleTest(
  [
    {
      rule: "duplicate-action-door",
      kind: "silent",
      reason:
        "a cell of a role=toolbar view switcher is not a second door to the app-level action sharing its name — it repaints one region, and the rule's own remedy (give the verb one home) would delete the switcher",
    },
  ],
  "a toolbar cell sharing a name with a nav button is excluded as a view switch, and counted",
  async ({ runCli, scratch }) => {
    const report = await auditFixture(scratch, runCli, "door-toolbar-cell", SWITCHER(' role="toolbar"'));
    expect(doorsIn(report), "the nav button and the toolbar cell are two verbs, not two homes").toHaveLength(0);
    // Counted, never dropped: both cells of the switcher are in the denominator with their reason.
    expect(report.populationAccounting?.["duplicate-action-door"]).toMatchObject({ candidates: 2, judged: 0, excluded: { viewSwitchCell: 2 } });
  },
);

auditRuleTest(
  [
    {
      rule: "duplicate-action-door",
      kind: "fires",
      reason:
        "the same pair with the toolbar role removed is two ordinary regions offering one named action twice — the rule's real target, and the control that proves the fence is keyed on the role rather than on the shape of the markup",
    },
  ],
  "the identical pair without role=toolbar is still two homes",
  async ({ runCli, scratch }) => {
    const report = await auditFixture(scratch, runCli, "door-plain-cell", SWITCHER(""));
    expect(doorsIn(report), "without the toolbar role there is no view switcher to recognise").toHaveLength(1);
    expect(report.populationAccounting?.["duplicate-action-door"]).toMatchObject({ candidates: 2, judged: 2, excluded: {} });
  },
);

// ── #1074 (orb-ui audit F2): textarea + summary enter the base interactive population ───────────────
//
// INTERACTIVE_SELECTOR (ops/walker/core.ts) omitted `textarea` and `summary` while five sibling census
// vocabularies already carried both, so a native <textarea> (Textarea/MacroTextarea) and a <summary>
// disclosure trigger (ToolCallBlock) were invisible to tap-target/aria-name candidacy entirely — not a
// wrong verdict, an ABSENT one. The proof is the CANDIDATE COUNT (populationAccounting), not a finding:
// an unnamed, undersized instance of each must now be COUNTED (and therefore judged and filed), where
// before the fix it was never in the denominator at all.

function tapTargetSelectorsIn(report: RelationalPopulationReport): readonly { readonly rule: string }[] {
  return report.findings.filter(({ rule }) => rule === "tap-target");
}

auditRuleTest(
  [
    {
      rule: "tap-target",
      kind: "fires",
      reason:
        "a native <textarea> with no accessible name and a sub-floor box was invisible to INTERACTIVE_SELECTOR before #1074 — never a candidate, so never judged and never filed",
    },
  ],
  "an undersized unlabeled textarea now enters the tap-target population",
  async ({ runCli, scratch }) => {
    const body = '<textarea style="width:20px;height:20px;display:block;box-sizing:border-box;border:0;padding:0;margin:0"></textarea>';
    const report = await auditFixture(scratch, runCli, "interactive-vocab-textarea", body);
    expect(tapTargetSelectorsIn(report).length, "a sub-floor textarea must now be a judged candidate").toBeGreaterThan(0);
    expect(report.populationAccounting?.["tap-target"]?.candidates ?? 0).toBeGreaterThan(0);
  },
);

auditRuleTest(
  [
    {
      rule: "tap-target",
      kind: "fires",
      reason:
        "a <summary> disclosure trigger (ToolCallBlock's shape) with a sub-floor box was equally invisible before #1074 — the same absent-candidate defect on the other omitted tag",
    },
  ],
  "an undersized summary disclosure now enters the tap-target population",
  async ({ runCli, scratch }) => {
    const body = '<details><summary style="width:20px;height:20px;display:block">show</summary><p>detail</p></details>';
    const report = await auditFixture(scratch, runCli, "interactive-vocab-summary", body);
    expect(tapTargetSelectorsIn(report).length, "a sub-floor summary must now be a judged candidate").toBeGreaterThan(0);
    expect(report.populationAccounting?.["tap-target"]?.candidates ?? 0).toBeGreaterThan(0);
  },
);

auditRuleTest(
  [
    {
      rule: "tap-target",
      kind: "silent",
      reason:
        "a floor-sized, fully-named textarea is the negative control proving the population read is not blanket-firing on every textarea now that it is a candidate",
    },
  ],
  "a floor-sized labeled textarea does not file a tap-target finding",
  async ({ runCli, scratch }) => {
    const body = '<label for="notes">Notes</label><textarea id="notes" style="width:64px;height:64px;display:block"></textarea>';
    const report = await auditFixture(scratch, runCli, "interactive-vocab-textarea-clean", body);
    expect(tapTargetSelectorsIn(report)).toHaveLength(0);
  },
);
