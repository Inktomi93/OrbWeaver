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
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RelationalPopulationReport } from "@orb/testkit/node";
import { AUDIT_ARGV, configureRelationalCliBudget, RELATIONAL_CLI_TIMEOUT_MS, readAuditReport, relationalDocument } from "@orb/testkit/node";
import type { ToolFixtures } from "@orb/testkit/tooling";
import { auditRuleTest, expect } from "@orb/testkit/tooling";

configureRelationalCliBudget();

async function auditFixture(scratch: string, runSnap: ToolFixtures["runSnap"], name: string, body: string): Promise<RelationalPopulationReport> {
  await writeFile(join(scratch, `${name}.html`), relationalDocument(body));
  const res = await runSnap(["--file", join(scratch, `${name}.html`), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  return await readAuditReport(res.stdout);
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
      disposition: { kind: "judged" },
    },
  ],
  "a control named by <label for> is not filed as unnamed",
  async ({ runSnap, scratch }) => {
    const body = `<label for="sw-1">Show timestamps</label><button role="switch" id="sw-1" ${CONTROL}></button>`;
    const report = await auditFixture(scratch, runSnap, "name-label-for", body);
    expect(namesIn(report)).toHaveLength(0);
    return report;
  },
);

auditRuleTest(
  [
    {
      rule: "aria-name",
      kind: "silent",
      reason: "the wrapping-label spelling of the same association, which the browser reports through the same HTMLElement.labels list",
      disposition: { kind: "judged" },
    },
  ],
  "a control wrapped in its <label> is not filed as unnamed",
  async ({ runSnap, scratch }) => {
    const body = `<label>Show timestamps <button role="switch" id="sw-2" ${CONTROL}></button></label>`;
    const report = await auditFixture(scratch, runSnap, "name-label-wrap", body);
    expect(namesIn(report)).toHaveLength(0);
    return report;
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
  async ({ runSnap, scratch }) => {
    const body = `<button role="switch" id="sw-3" ${CONTROL}></button>`;
    expect(namesIn(await auditFixture(scratch, runSnap, "name-none", body))).toHaveLength(1);
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
  async ({ runSnap, scratch }) => {
    const body = `<label for="sw-elsewhere">Show timestamps</label><button role="switch" id="sw-4" ${CONTROL}></button><button id="sw-elsewhere" ${CONTROL}>elsewhere</button>`;
    expect(namesIn(await auditFixture(scratch, runSnap, "name-label-other", body))).toHaveLength(1);
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
  async ({ runSnap, scratch }) => {
    const row = (id: string): string => `<label for="${id}">Show timestamps</label><button role="switch" id="${id}" ${CONTROL}></button>`;
    const body = `<section><div>${row("dup-a")}</div></section><article><p>x</p>${row("dup-b")}</article>`;
    const report = await auditFixture(scratch, runSnap, "door-label-for", body);
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
  async ({ runSnap, scratch }) => {
    const body = `<button id="icon-only" ${CONTROL}><span aria-hidden="true">x</span></button>`;
    expect(namesIn(await auditFixture(scratch, runSnap, "name-aria-hidden-text", body))).toHaveLength(1);
  },
);

auditRuleTest(
  [
    {
      rule: "aria-name",
      kind: "silent",
      reason:
        "the precision neighbour: sr-only text is visually hidden but NOT aria-hidden, so it IS the control's accessible name — narrowing the text source to what the eye can see would file a P1 on every correctly-named icon button",
      disposition: { kind: "judged" },
    },
  ],
  "screen-reader-only text still names its control",
  async ({ runSnap, scratch }) => {
    const srOnly = 'style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap"';
    const body = `<button id="icon-sr" ${CONTROL}><span aria-hidden="true">x</span><span ${srOnly}>Close</span></button>`;
    const report = await auditFixture(scratch, runSnap, "name-sr-only-text", body);
    expect(namesIn(report)).toHaveLength(0);
    return report;
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
      disposition: { kind: "excluded", reason: "viewSwitchCell" },
    },
  ],
  "a toolbar cell sharing a name with a nav button is excluded as a view switch, and counted",
  async ({ runSnap, scratch }) => {
    const report = await auditFixture(scratch, runSnap, "door-toolbar-cell", SWITCHER(' role="toolbar"'));
    expect(doorsIn(report), "the nav button and the toolbar cell are two verbs, not two homes").toHaveLength(0);
    // Counted, never dropped: both cells of the switcher are in the denominator with their reason.
    expect(report.populationAccounting?.["duplicate-action-door"]).toMatchObject({ candidates: 2, judged: 0, excluded: { viewSwitchCell: 2 } });
    return report;
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
  async ({ runSnap, scratch }) => {
    const report = await auditFixture(scratch, runSnap, "door-plain-cell", SWITCHER(""));
    expect(doorsIn(report), "without the toolbar role there is no view switcher to recognise").toHaveLength(1);
    expect(report.populationAccounting?.["duplicate-action-door"]).toMatchObject({ candidates: 2, judged: 2, excluded: {} });
  },
);

// ── a radio is a choice of its group ─────────────────────────────────────────
// Settings -> Appearance offers "Flat" in the chat-style picker and in the elevation picker. A radio's own
// name says which option and its radiogroup says which setting, so the two fixtures differ only in the
// second group's name: two settings stay silent, one setting offered twice still fires. The two groups
// carry distinct slots, as the shipped pickers do, so their paths are two homes.
// A null label leaves that group unnamed; its options' text must not stand in for a name.
const groupLabel = (label: string | null): string => (label === null ? "" : ` aria-label="${label}"`);
const CHOICES = (
  second: string | null,
  first: string | null = "Chat style",
): string => `<div role="radiogroup"${groupLabel(first)} data-slot="chat-style-cards">
  <button id="style-flat" role="radio" aria-checked="false" ${CONTROL}>Flat</button>
  <button id="style-bubble" role="radio" aria-checked="true" ${CONTROL}>Bubble</button>
</div>
<div role="radiogroup"${groupLabel(second)} data-slot="elevation-cards">
  <button id="second-flat" role="radio" aria-checked="true" ${CONTROL}>Flat</button>
  <button id="second-raised" role="radio" aria-checked="false" ${CONTROL}>Raised</button>
</div>`;

auditRuleTest(
  [
    {
      rule: "duplicate-action-door",
      kind: "silent",
      reason: "one option label in two named radiogroups is a choice in each of two settings, not one action with two homes",
      disposition: { kind: "no-candidate" },
    },
  ],
  "a shared option label in two differently named radiogroups is two choices",
  async ({ runSnap, scratch }) => {
    const report = await auditFixture(scratch, runSnap, "door-two-settings", CHOICES("Surface elevation"));
    expect(doorsIn(report), "Chat style · Flat and Surface elevation · Flat are two settings").toHaveLength(0);
    return report;
  },
);

auditRuleTest(
  [
    {
      rule: "duplicate-action-door",
      kind: "fires",
      reason: "the same pair under one group name is one setting offered twice on one plane, the rule's real target",
    },
  ],
  "a shared option label in two radiogroups of one name is still two homes",
  async ({ runSnap, scratch }) => {
    const report = await auditFixture(scratch, runSnap, "door-one-setting-twice", CHOICES("Chat style"));
    expect(doorsIn(report), "the group-qualified key still pairs a repeated setting").toHaveLength(1);
    expect(report.populationAccounting?.["duplicate-action-door"]).toMatchObject({ candidates: 2, judged: 2, excluded: {} });
  },
);

auditRuleTest(
  [
    {
      rule: "duplicate-action-door",
      kind: "fires",
      reason: "two unnamed radiogroups give no setting context, so one option label in both stays one name offered twice",
    },
  ],
  "a shared option label in two unnamed radiogroups is still two homes",
  async ({ runSnap, scratch }) => {
    const report = await auditFixture(scratch, runSnap, "door-unnamed-groups", CHOICES(null, null));
    expect(doorsIn(report), "an unnamed group is not named after its options").toHaveLength(1);
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
  async ({ runSnap, scratch }) => {
    const body = '<textarea style="width:20px;height:20px;display:block;box-sizing:border-box;border:0;padding:0;margin:0"></textarea>';
    const report = await auditFixture(scratch, runSnap, "interactive-vocab-textarea", body);
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
  async ({ runSnap, scratch }) => {
    const body = '<details><summary style="width:20px;height:20px;display:block">show</summary><p>detail</p></details>';
    const report = await auditFixture(scratch, runSnap, "interactive-vocab-summary", body);
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
      disposition: { kind: "judged" },
    },
  ],
  "a floor-sized labeled textarea does not file a tap-target finding",
  async ({ runSnap, scratch }) => {
    const body = '<label for="notes">Notes</label><textarea id="notes" style="width:64px;height:64px;display:block"></textarea>';
    const report = await auditFixture(scratch, runSnap, "interactive-vocab-textarea-clean", body);
    expect(tapTargetSelectorsIn(report)).toHaveLength(0);
    return report;
  },
);

// ── #1077 (orb-ui audit F5): a rest-hidden reveal cluster is NAMED at fine pointer ───────────────────
//
// ROW_REVEAL (opacity-0 at rest, group-hover/focus-within/pointer-coarse:opacity-100 revealed) fails
// `isVisible`'s opacity gate at fine-pointer rest and was silently dropped from every offered-control
// census with no accounting reason at all. `reveal-coverage` is accounting-only (no Finding, no
// severity ever fires) — its job is to name the gap: present with a count when a rest-hidden reveal
// control exists, absent entirely when none does.
//
// THE COUNT IS AN EXCLUSION, NOT A WITHHOLDING (#2468). It shipped as withheld, and since ROW_REVEAL is
// the house row-actions idiom that made EVERY list surface a permanent fine-pointer NO VERDICT — 30 of
// them on `--goto characters`, recoverable by no operator action. The third assertion in the firing arm
// is the defect proof: naming the cluster must cost the run nothing. See census-collision.ts's emit
// site for why the fine REST regime is a closed negative rather than missing evidence.

auditRuleTest(
  [
    {
      rule: "reveal-coverage",
      kind: "fires",
      reason:
        "an opacity-0-at-rest control (the ROW_REVEAL shape — real geometry, zero paint, hover/coarse-revealed) must be named as an excluded reveal-coverage candidate instead of vanishing from the census with no reason",
    },
  ],
  "a rest-hidden reveal cluster produces a reveal-coverage EXCLUDED row and keeps the verdict",
  async ({ runSnap, scratch }) => {
    // The stray labeled control gives the walker something ELSE to censuse (evidence.ts's own
    // `censusTotal` doctrine): the subject under test is entirely invisible by design, so without it
    // the page would census zero nodes everywhere and refuse as NO VERDICT before this rule ever runs.
    const body =
      '<label for="anchor">Anchor</label><input id="anchor" style="width:64px;height:32px" />' +
      '<div class="group"><button id="reveal-btn" style="opacity:0;width:40px;height:40px">Reveal</button></div>';
    const report = await auditFixture(scratch, runSnap, "reveal-coverage-fires", body);
    expect(report.populationAccounting?.["reveal-coverage"]).toMatchObject({ candidates: 1, judged: 0, excluded: { restHiddenReveal: 1 } });
    expect(report.populationAccounting?.["reveal-coverage"]?.withheld, "the cluster is a CLOSED negative — it must not hold the run's verdict").toEqual({});
  },
);

auditRuleTest(
  [
    {
      rule: "reveal-coverage",
      kind: "silent",
      reason:
        "a fully-opaque control of the same shape is the negative control — no rest-hidden reveal cluster exists, so no reveal-coverage row prints at all",
      disposition: { kind: "no-candidate" },
    },
  ],
  "a page with no rest-hidden reveal cluster produces no reveal-coverage row",
  async ({ runSnap, scratch }) => {
    const body =
      '<label for="anchor2">Anchor</label><input id="anchor2" style="width:64px;height:32px" />' +
      '<div class="group"><button id="visible-btn" style="opacity:1;width:40px;height:40px">Visible</button></div>';
    const report = await auditFixture(scratch, runSnap, "reveal-coverage-silent", body);
    // The JSON accounting record is always present (every family carries its own zero); the row this
    // test names is the PRINTED `POPULATION reveal-coverage …` line, which report.ts folds a
    // zero-candidate rule into the `nothing-to-judge` summary instead of printing on its own.
    expect(report.populationAccounting?.["reveal-coverage"]).toMatchObject({ candidates: 0, withheld: {}, excluded: {} });
    return report;
  },
);

// ── a vendored scroller: generic, tabindex -1, no API to name it ──────────────
// `@codemirror/view` builds `div.cm-scroller` itself with tabindex -1 and exposes only contentAttributes and
// editorAttributes, so no owner can name it. The door census already reads a generic tabindex -1 node as
// focus plumbing; the names census reads it the same way, from the same role and tabindex facts.
const SCROLLER = 'style="width:320px;height:120px;overflow:auto;background:#222"';

auditRuleTest(
  [
    {
      rule: "aria-name",
      kind: "silent",
      reason: "a generic node with tabindex -1 is programmatic focus plumbing, not an offered control, so it owes no name",
      disposition: { kind: "excluded", reason: "programmaticFocus" },
    },
  ],
  "a generic tabindex -1 scroller is excluded from the names census",
  async ({ runSnap, scratch }) => {
    const body = `<div class="cm-scroller" tabindex="-1" ${SCROLLER}><div aria-hidden="true">1</div></div>`;
    const report = await auditFixture(scratch, runSnap, "name-programmatic-scroller", body);
    expect(report.populationAccounting?.["aria-name"]).toMatchObject({ judged: 0, excluded: { programmaticFocus: 1 } });
    return report;
  },
);

auditRuleTest(
  [
    {
      rule: "aria-name",
      kind: "fires",
      reason: "the same unnamed node with a widget role is a control a user is offered, so the role, not the tabindex, decides",
    },
  ],
  "an unnamed tabindex -1 node with a widget role is still judged",
  async ({ runSnap, scratch }) => {
    const body = `<div role="textbox" tabindex="-1" ${SCROLLER}><div aria-hidden="true">1</div></div>`;
    const report = await auditFixture(scratch, runSnap, "name-roled-tabindex", body);
    expect(namesIn(report)).toHaveLength(1);
    expect(report.populationAccounting?.["aria-name"]).toMatchObject({ judged: 1, affected: 1, excluded: {} });
  },
);
