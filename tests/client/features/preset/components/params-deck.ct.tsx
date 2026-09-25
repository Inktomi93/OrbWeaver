// CT: the PARAMS DECK — the per-cluster proofs the redesign's defects name.
//
//  • THE GHOST (F2 dead): an unset knob shows its RESOLVED EFFECTIVE value + provenance instead of prose,
//    and the value shown is the one `preset.resolveEffective` reported — a hardcoded default would fail.
//  • TOUCH PROMOTES, KEY-MINIMALLY: typing into the twin writes THAT knob's key and nothing else. The ghost
//    is DISPLAY, from the resolver, never written back — the exact data-flow hazard the macro-resolution
//    gate is import-blind to, so it is asserted on the SAVED payload's key set.
//  • RESET DEMOTES: ↺ clears back to inherit (blank-means-default survives as the storage semantic).
//  • THE CLAMP + STALENESS rows (§4.1/§4.2, F7) stay VISIBLE — they are decision-load-bearing.
//  • THE GEOMETRY vs the mock: the label column, the flexing track, the mono twin, one line — asserted as
//    COMPUTED pixels against the resolved TOKENS, never authored classes (`done ≠ rendered`).
//  • The capability gate, CONTEXT's blank-means-default placeholders, and ADVANCED's disclosure.
//
// The twin is located as a TEXTBOX (Base UI renders the number field as an editable textbox by design) via
// its `aria-label`, which is `"<label> value"`; the SLIDER carries the bare `"<label>"` (the role is not part
// of a name — F-27). The split is the 2026-08-19 P1-2 fix: the pair used to share one name exactly.

import { DEFAULT_COMPACTION_MODE, MANAGED_COMPACT_DEFAULT_PCT, MANAGED_VERBATIM_TAIL } from "@orb/contracts/preset";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { compactionModeLabel } from "../../../../../packages/client/src/features/preset/lib/preset-nav.ts";
import { boxWithBeforeFloor, resolveSpacingPxIn } from "../../../../support/browser/touch-floor.ts";
import { clearNumber, setNumber } from "../../../../support/node/set-number.ts";
import { CompactionTabDefaultsStory, CompactionTabSetStory } from "./_add-flow-stories.tsx";
import {
  ParamsDeckCapabilityErrorStory,
  ParamsDeckCapabilityNonRoutingStory,
  ParamsDeckCapabilityTransportFailureStory,
  ParamsDeckExplicitStory,
  ParamsDeckGhostStory,
  ParamsDeckLogitBiasSwitchStory,
  ParamsDeckPendingCapabilityStory,
  ParamsDeckStaleStory,
} from "./_params-deck-stories.tsx";

/** A FUNCTION, not a const: Playwright's `pollAgainstDeadline` pops/shifts the interval array it is handed,
 *  so a shared object is drained by its first use and the other ten polls in this file silently fall back to
 *  1000ms (ct-poll-schedule-and-paint ARM A). */
function savePoll(): { intervals: number[] } {
  return { intervals: [100, 200, 300, 500] };
}
// The capability-gate notes and ADVANCED gloss. One note for the model-fed
// clusters (F-02), printed once where it used to appear three times.
const GATE_SETTINGS_RE = /Settings → Connections → Model roles/;
/** Any prose claiming something about the user's chat model — the gate's PENDING arm must show none of it. */
const CHAT_MODEL_CLAIM_RE = /chat model/;
/** These assertions concern an attribute's absence, so the pattern only has to match anything at all. */
const ANY = /.*/u;
/** The exact server message the review captured — the deck must show it, not swallow it. */
const CAPABILITY_ERROR = "400 incoherent routing (agent-sdk × local-light)";
/** The F-02 routing verdict — EARNED only by a `BAD_REQUEST` routing refusal, and a LIE over any failure
 *  that is a missing precondition (its "not a missing connection" clause is then literally inverted). */
const ROUTING_VERDICT_RE = /routing problem, not a missing connection/i;
/** The server's own reason for the non-routing arm — the deck must quote it, not swallow it. */
const NON_ROUTING_MSG = "the routing settings could not be read";
/** The headline that NAMES A CAUSE (the chat model). Earned by the routing refusal, and by nothing else. */
const MODEL_CAUSE_HEADLINE_RE = /chat model couldn't be resolved/i;
/** The headline that names only the READ — what every unearned arm must fall back to. */
const READ_HEADLINE_RE = /capabilities couldn't be read/i;
const CLAUDE_ENV_RE = /claudeEnv/;
const DEFAULT_PREFIX = /Default — /;
const SETTLE_MS = 500;
/** The dial's OFF arm as the surface states it (owner ruling O-18) — spelled once here, asserted in both
 *  the deck's gloss and the ACTIVE-arm round trip. */
const QUALITY_OFF_GLOSS = "quality off — knobs are what you set";

/** The resolved px width of a `--width-*` token (the deck's geometry is asserted against the TOKEN, never a
 *  hardcoded number — a token edit must move the assertion with it). */
function tokenPx(rem: string): number {
  return Number.parseFloat(rem) * 16;
}

/** The `<output>` mirror of the last SAVED params (key set + values) — the key-minimal patch proof. */
function saved(root: Locator): Locator {
  return root.locator("output");
}

// ── SAMPLING: the ghost, the promotion, the reset ─────────────────────────────────────────────────────

test("GHOST — an unset knob renders the RESOLVER's effective value + provenance, with the twin genuinely empty", async ({ mount }) => {
  const deck = await mount(<ParamsDeckGhostStory />);

  // Top-P is unset: the twin is EMPTY (blank-means-default is untouched in storage) and shows the funnel's
  // own 0.92 as its placeholder, with the rung named under the track.
  const topP = deck.getByRole("textbox", { name: "Top-P value", exact: true });
  await expect(topP).toHaveValue("");
  await expect(topP).toHaveAttribute("placeholder", "0.92");
  await expect(deck.getByText("model default", { exact: true })).toBeVisible();

  // The slider is at that same effective value — the ghost thumb, not a zeroed track.
  await expect(deck.getByRole("slider", { name: "Top-P", exact: true })).toHaveValue("0.92");

  // A knob the funnel reports NOTHING for claims no number (the honest empty — never a fabricated default).
  await expect(deck.getByRole("textbox", { name: "Min-P value", exact: true })).toHaveAttribute("placeholder", "default");

  // G1: `topA` finally has a row (schema-supported since it was minted, editor-less until now).
  await expect(deck.getByRole("textbox", { name: "Top-A value", exact: true })).toBeVisible();
});

test("P1-2 an INHERITED thumb announces 'default', never a bare number — and the pair has two names", async ({ mount }) => {
  const deck = await mount(<ParamsDeckGhostStory />);

  // The reported defect, in the two shapes it takes. Min-P is the funnel-reports-NOTHING arm: the thumb is
  // parked at `min` because it has to be parked somewhere, and the range's own value is therefore literally
  // `0` — the reading a screen reader gave for eight knobs at once.
  const minP = deck.getByRole("slider", { name: "Min-P", exact: true });
  await expect(minP).toHaveValue("0");
  await expect(minP).toHaveAttribute("aria-valuetext", "default (model decides)");

  // Top-P is the funnel-HAS-a-reading arm: the number is real but it is the RESOLVED one, not this preset's.
  await expect(deck.getByRole("slider", { name: "Top-P", exact: true })).toHaveAttribute("aria-valuetext", "0.92 — default (model decides)");

  // THE TWO MODALITIES ARE TELLABLE APART. They used to share one name exactly, so a walk of the deck met
  // "Top-P" twice per row with no way to know which instrument it was on.
  await expect(deck.getByRole("textbox", { name: "Top-P value", exact: true })).toBeVisible();
  await expect(deck.getByRole("slider", { name: "Top-P value", exact: true })).toHaveCount(0);
  await expect(deck.getByRole("textbox", { name: "Top-P", exact: true })).toHaveCount(0);
});

test("P1-2 an EXPLICIT thumb announces its own number — the valuetext is the inherited arm's, not decoration", async ({ mount }) => {
  const deck = await mount(<ParamsDeckExplicitStory />);
  // Repetition penalty is set (2.5, clamped to 2). A valuetext here would replace a true number with prose.
  await expect(deck.getByRole("slider", { name: "Repetition penalty", exact: true })).not.toHaveAttribute("aria-valuetext", ANY);
  // …and the inherited row beside it still carries one.
  await expect(deck.getByRole("slider", { name: "Top-P", exact: true })).toHaveAttribute("aria-valuetext", "0.92 — default (model decides)");
});

test("P3 the hint column is a COLUMN — every explainer at one x, at the touch-floor box", async ({ mount }) => {
  const deck = await mount(<ParamsDeckGhostStory />);
  // The KNOB row's own trigger — deliberately NOT `hint-trigger` first(), which is the QUALITY *Field*'s and
  // renders the primitive's `inline` box. The two sizes coexist BY RULING: `icon` here is the R-8 touch floor
  // (a 44px target the label length used to eat into), and matching the Fields downward would re-break it
  // while matching them upward is a `Field` change reaching every hinted row in the app.
  const triggers = deck.locator('[data-slot="slider-root"]').first().locator("xpath=..").locator('[data-slot="hint-trigger"]');
  // The KNOB rows' explainers only (the deck also renders `Field` hints, a different docked anatomy): reach
  // them from each row's slider, whose ROOT's parent IS the KnobRow line.
  // Grouped BY GRID: a name track belongs to one grid, so the column claim is a per-grid claim.
  const perGrid = await deck.locator('[data-slot="slider-root"]').evaluateAll((roots) => {
    const groups = new Map<Element, number[]>();
    for (const root of roots) {
      const grid = root.parentElement;
      const label = root.previousElementSibling;
      const trigger = label?.querySelector('[data-slot="hint-trigger"]') ?? null;
      if (grid === null || trigger === null) {
        continue;
      }
      groups.set(grid, [...(groups.get(grid) ?? []), Math.round(trigger.getBoundingClientRect().left)]);
    }
    return [...groups.values()];
  });
  const placed = perGrid.flat();
  expect(placed.length, "the sampling rows carry explainers at all").toBeGreaterThan(1);
  for (const group of perGrid) {
    expect(new Set(group).size, `one x inside a cluster (got ${group.join(",")})`).toBe(1);
  }
  // ONE x PER CLUSTER, which is what "one column" now means (side-eye 2026-08-19 P1-1 amends P3's own
  // measurement, not its ruling). P3 docked the glyph at the name cell's TRAILING EDGE so it stops landing
  // wherever each name happens to end — that mechanism is untouched. What changed underneath it: the cell
  // was a fixed `--width-label-col` box, and that box is exactly what clipped the two longest names on the
  // deck at EVERY pane width. The cell is now a content-sized grid track, and a track belongs to ONE grid,
  // so SAMPLING's five explainers share an x and OUTPUT's two share theirs. Two x's across a kicker
  // boundary, not the nine-across-eleven-rows rag P3 measured. Asserted as "at most one x per knob grid".
  expect(new Set(placed).size, `at most one x per knob grid (got ${placed.join(",")})`).toBeLessThanOrEqual(perGrid.length);
  // …and it is still the control-md box R-8 measured, not the primitive's inline default.
  const expected = await resolveSpacingPxIn(triggers.first(), "--spacing-control-md");
  await expect.poll(async () => (await triggers.first().boundingBox())?.width).toBe(expected);
});

test("PROMOTION — typing into the twin writes ONLY that knob's key (the ghost is never written back)", async ({ mount }) => {
  const deck = await mount(<ParamsDeckGhostStory />);

  await setNumber(deck.getByRole("textbox", { name: "Top-P value", exact: true }), "0.5");

  // THE PIN: the saved patch carries `topP` and nothing else — not the ghosted top-p the resolver reported
  // for the OTHER rows, not the max-output floor, not a materialized default anywhere.
  await expect.poll(() => saved(deck).textContent(), savePoll()).toContain("keys=topP");
  await expect.poll(() => saved(deck).textContent(), savePoll()).toContain("values=topP:0.5");

  // The row is now EXPLICIT: the provenance gloss is gone and the reset appears.
  await expect(deck.getByText("model default", { exact: true })).toBeHidden();
  await expect(deck.getByRole("button", { name: "Reset Top-P to inherited" })).toBeVisible();
});

test("TWIN CONVERGENCE — the slider follows a typed value (two modalities, ONE field)", async ({ mount }) => {
  const deck = await mount(<ParamsDeckGhostStory />);
  await setNumber(deck.getByRole("textbox", { name: "Temperature value", exact: true }), "0.73");
  await expect(deck.getByRole("slider", { name: "Temperature", exact: true })).toHaveValue("0.73");
});

test("RESET — ↺ clears the knob back to inherit, and the ghost returns", async ({ mount }) => {
  const deck = await mount(<ParamsDeckGhostStory />);
  const topP = deck.getByRole("textbox", { name: "Top-P value", exact: true });
  await setNumber(topP, "0.5");
  await expect.poll(() => saved(deck).textContent(), savePoll()).toContain("keys=topP");

  await deck.getByRole("button", { name: "Reset Top-P to inherited" }).click();

  await expect(topP).toHaveValue("");
  await expect(deck.getByText("model default", { exact: true })).toBeVisible();
  await expect.poll(() => saved(deck).textContent(), savePoll()).toContain("keys= ");
});

test("F-21 — the provenance gloss BELONGS to its row: both modalities point aria-describedby at it", async ({ mount }) => {
  const deck = await mount(<ParamsDeckGhostStory />);

  // The glosses used to be loose text under the tracks, which a screen reader runs together across rows —
  // "model default default full window" as one blob, attached to nothing. Both the slider and its twin now
  // name THIS row's line, and the id resolves to that exact text.
  const slider = deck.getByRole("slider", { name: "Top-P", exact: true });
  const twin = deck.getByRole("textbox", { name: "Top-P value", exact: true });
  await expect(slider).toHaveAttribute("aria-describedby", ANY);
  const glossId = await slider.getAttribute("aria-describedby");
  await expect(deck.locator(`#${glossId ?? ""}`)).toHaveText("model default");
  // The TWIN composes it with its own bounds description — the same row, both controls.
  expect((await twin.getAttribute("aria-describedby")) ?? "").toContain(glossId ?? "");

  // A row with NO gloss claims none, rather than pointing at an empty node.
  await expect(deck.getByRole("slider", { name: "Min-P", exact: true })).not.toHaveAttribute("aria-describedby", ANY);
});

test("RESET is INERT while a row is inherited — no stray affordance, no focus stop", async ({ mount }) => {
  const deck = await mount(<ParamsDeckGhostStory />);
  await expect(deck.getByRole("button", { name: "Reset Top-P to inherited" })).toBeHidden();
});

// ── The explicit arm: the clamp gloss + the quality mapping ───────────────────────────────────────────

test("CLAMP — an explicit value the model moved says so, visibly (never behind a hover hint)", async ({ mount }) => {
  const deck = await mount(<ParamsDeckExplicitStory />);
  await expect(deck.getByText("clamped to 2 — this model's max", { exact: true })).toBeVisible();
  // The stored intent is still shown as typed (2.5) — the editor does not silently rewrite it.
  await expect(deck.getByRole("textbox", { name: "Repetition penalty value", exact: true })).toHaveValue("2.5");
});

test("QUALITY — the dial is a SELECT and prints the dial's MAPPING datum on ONE line (O-18)", async ({ mount }) => {
  const deck = await mount(<ParamsDeckExplicitStory />);

  // O-18: the segmented strip is dead. The dial reads back through the same combobox grammar as every
  // other select on the deck, showing the stored level.
  await expect(deck.getByRole("combobox", { name: "Quality" })).toHaveText("Deep");
  await expect(deck.getByRole("radiogroup", { name: "Quality" })).toHaveCount(0);

  // F-15's distinction survives the fusion: the DATUM is what the dial FEEDS (the server's own projection
  // of the dial table — true even though `temperature` is currently overridden), and the override note is
  // still its own derivation. Crunch-list 5: they render as ONE line, the mock's own, temp value included.
  await expect(deck.getByText("deep → effort high · temperature 1 — explicit knobs below override this", { exact: true })).toBeVisible();
});

test("QUALITY OFF — 'don't use quality' is a real arm: it writes the ABSENCE and says so (O-18)", async ({ mount }) => {
  // The GHOST story ships `params: {}` — the off arm's storage form — so the deck must open ON it, named.
  const deck = await mount(<ParamsDeckGhostStory />);
  const dial = deck.getByRole("combobox", { name: "Quality" });
  await expect(dial).toHaveText("Don't use quality");
  await expect(deck.getByText(QUALITY_OFF_GLOSS, { exact: true })).toBeVisible();

  // Pick a level → the dial is stored…
  await dial.click();
  await deck.page().getByRole("option", { name: "Deep", exact: true }).click();
  await expect.poll(() => saved(deck).textContent(), savePoll()).toContain('values=quality:"deep"');

  // …and picking OFF again writes NO quality key at all (not `"off"`, not a materialized default) while the
  // gloss returns to the named off arm. This is the whole ruling: the arm is the absence.
  await dial.click();
  await deck.page().getByRole("option", { name: "Don't use quality", exact: true }).click();
  await expect.poll(() => saved(deck).textContent(), savePoll()).toContain("keys= ");
  await expect(deck.getByText(QUALITY_OFF_GLOSS, { exact: true })).toBeVisible();
});

// ── §4.2 staleness (F7) ───────────────────────────────────────────────────────────────────────────────

test("STALENESS — a stored-but-unhonored knob is named, and Clear unsets it", async ({ mount }) => {
  const deck = await mount(<ParamsDeckStaleStory />);
  await expect(deck.getByText("Set but not honored by this model: top_a 0.2", { exact: true })).toBeVisible();

  await deck.getByRole("button", { name: "Clear" }).click();

  await expect.poll(() => saved(deck).textContent(), savePoll()).toContain("keys= ");
});

test("STALENESS — Keep dismisses the row for the session without touching the value", async ({ mount, page }) => {
  const deck = await mount(<ParamsDeckStaleStory />);
  await deck.getByRole("button", { name: "Keep" }).click();

  await expect(deck.getByText("Set but not honored by this model: top_a 0.2", { exact: true })).toBeHidden();
  await page.evaluate((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)), SETTLE_MS);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled — the wait above IS the negative-assertion window (Keep is a dismissal, not a write).
  expect(await saved(deck).textContent()).toContain("keys=- ");
});

// ── OUTPUT: the integer arm ───────────────────────────────────────────────────────────────────────────

test("OUTPUT — the token caps are KnobRows at the model's real ceilings, and a typed overflow clamps", async ({ mount }) => {
  const deck = await mount(<ParamsDeckGhostStory />);

  await expect(deck.getByRole("textbox", { name: "Max output tokens value", exact: true })).toHaveAttribute("placeholder", "2048");
  await expect(deck.getByText("default", { exact: true })).toBeVisible();
  await expect(deck.getByRole("textbox", { name: "Max context tokens value", exact: true })).toHaveAttribute("placeholder", "32768");
  await expect(deck.getByText("full window", { exact: true })).toBeVisible();

  await setNumber(deck.getByRole("textbox", { name: "Max output tokens value", exact: true }), "999999");

  // RAW digits, not "8,192" (crunch-list 9): ONE number grammar across the deck. The clamped value came
  // back through Base UI's formatter, while the row below it ghosts its placeholder as a plain string —
  // same KnobRow family, two grammars, until `KNOB_NUMBER_FORMAT` turned grouping off.
  await expect(deck.getByRole("textbox", { name: "Max output tokens value", exact: true })).toHaveValue("8192");
  await expect.poll(() => saved(deck).textContent(), savePoll()).toContain("values=maxOutputTokens:8192");
  // The ghost placeholder beside it is raw too — that is what "one grammar" means here.
  await expect(deck.getByRole("textbox", { name: "Max context tokens value", exact: true })).toHaveAttribute("placeholder", "32768");
});

test("OUTPUT — the stop-sequence chip list adds and removes, and the add box carries its OWN name (G2, #1620)", async ({ mount }) => {
  const deck = await mount(<ParamsDeckGhostStory />);
  // BY ROLE + NAME, which is the whole of #1620. Under the old `<Field label="Stop sequences">` anatomy the
  // add Input was the field's sole control, so Base UI's context-injected `aria-labelledby` reached it and
  // OUTRANKED any `aria-label` — the box announced the GROUP's name and this locator resolved nothing (the
  // test had to reach for `getByPlaceholder`). A `Fieldset` legend names the group instead, so the box's own
  // name is reachable: this line is the red-first assertion for the change.
  const addBox = deck.getByRole("textbox", { name: "Add stop sequence", exact: true });
  await expect(addBox).toBeVisible();
  // …and the GROUP still announces itself — the legend is a real name, not a name that was merely moved off.
  await expect(deck.getByRole("group", { name: "Stop sequences", exact: true })).toBeVisible();

  await addBox.fill("<|im_end|>");
  await addBox.press("Enter");

  await expect.poll(() => saved(deck).textContent(), savePoll()).toContain('values=stop:["<|im_end|>"]');
  await deck.getByRole("button", { name: "Remove stop sequence <|im_end|>" }).click();
  await expect.poll(() => saved(deck).textContent(), savePoll()).toContain("values=stop:[]");
});

test("OUTPUT — the stop-sequence group holds BOTH ends of the width matrix without spilling (#1620's layout bill)", async ({ mount, page }) => {
  // A legend is a LAYOUT change, not only an accname one: the row left the deck's horizontal label/control
  // pair for a stacked group, so the bill is measured at both ends rather than asserted at one
  // (label-compression-must-be-remeasured-after). NARROW first — the phone pane is where a chip row spills.
  await page.setViewportSize({ width: 320, height: 900 });
  const deck = await mount(<ParamsDeckGhostStory />);
  const group = deck.getByRole("group", { name: "Stop sequences", exact: true });
  await expect(group).toBeVisible();
  await deck.getByRole("textbox", { name: "Add stop sequence", exact: true }).fill("<|im_end|>");
  await deck.getByRole("textbox", { name: "Add stop sequence", exact: true }).press("Enter");
  await expect(deck.getByRole("button", { name: "Remove stop sequence <|im_end|>" })).toBeVisible();

  // POLLED, never same-tick: a viewport change re-resolves on the next layout pass (the deck's own
  // container query moves with it), so a bare read here is a false verdict either way.
  await expect.poll(() => group.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  await expect.poll(async () => Math.round((await group.boundingBox())?.width ?? 0)).toBeLessThanOrEqual(320);

  // WIDE: the group is a block in the column, so it may not out-grow the pane at the other end either.
  await page.setViewportSize({ width: 1224, height: 900 });
  await expect(group).toBeVisible();
  await expect.poll(() => group.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  // The chip survives the reflow at both ends — the add box and its chips stay one usable group, which is
  // the thing a "the legend costs layout" regression would break first.
  await expect(deck.getByRole("button", { name: "Remove stop sequence <|im_end|>" })).toBeVisible();
  await expect(deck.getByRole("textbox", { name: "Add stop sequence", exact: true })).toBeVisible();
});

// ── CONTEXT: the re-homed compaction fields + the two gap-closes ──────────────────────────────────────

test("CONTEXT — UNSET compaction communicates its resolved defaults on first paint", async ({ mount }) => {
  const deck = await mount(<CompactionTabDefaultsStory />);

  await expect(deck.getByText(`Default — ${compactionModeLabel(DEFAULT_COMPACTION_MODE)}`, { exact: false })).toBeVisible();
  await expect(deck.getByLabel("Managed threshold", { exact: true })).toHaveAttribute("placeholder", `${MANAGED_COMPACT_DEFAULT_PCT} (default)`);
  // G4: the "missing 4th compaction knob" now has an editor, with the ENGINE floor as its placeholder.
  await expect(deck.getByLabel("Verbatim tail", { exact: true })).toHaveAttribute("placeholder", `${MANAGED_VERBATIM_TAIL} (engine default)`);
  // G3: the provider-side switch that had no editor anywhere.
  await expect(deck.getByRole("switch", { name: "Provider context compression" })).toBeVisible();
});

test("CONTEXT — an explicit compaction mode renders the selected value (not the placeholder)", async ({ mount }) => {
  const deck = await mount(<CompactionTabSetStory />);
  // Asserted on the TRIGGER, not on page text: since O-4 shortened the option labels to the bare mode name
  // ("Auto"), a loose text match also hits the auto-mode honesty gloss that begins "Auto uses the runner's
  // own compaction…" — two matches, and the one that matters is what the CONTROL reads.
  await expect(deck.getByRole("combobox", { name: "Compaction mode" })).toHaveText(compactionModeLabel("auto"));
  await expect(deck.getByText(DEFAULT_PREFIX)).toHaveCount(0);
});

// ── The capability gate + ADVANCED ────────────────────────────────────────────────────────────────────

test("PENDING CAPABILITY — the gate holds a skeleton and claims NOTHING; QUALITY/CONTEXT/ADVANCED still render", async ({ mount }) => {
  const deck = await mount(<ParamsDeckPendingCapabilityStory />);

  // No descriptor and no error is the read IN FLIGHT and nothing else, so the model-fed clusters' slot is a
  // busy placeholder — never the connect-a-model empty state it used to print (which every editor open
  // flashed at users who HAVE a model; the settled state it described is unreachable).
  await expect(deck.locator('[aria-busy="true"] [data-slot="skeleton"]').first()).toBeVisible();
  await expect(deck.getByText(CHAT_MODEL_CLAIM_RE)).toHaveCount(0);
  await expect(deck.getByText(GATE_SETTINGS_RE)).toHaveCount(0);

  await expect(deck.getByRole("combobox", { name: "Quality" })).toBeVisible();
  await expect(deck.getByLabel("Verbatim tail", { exact: true })).toBeVisible();
  await expect(deck.getByRole("button", { name: "Advanced" })).toBeVisible();
});

test("CAPABILITY ERROR (BAD_REQUEST) — the server's reason is quoted and named as ROUTING, exactly once", async ({ mount }) => {
  // F-02, the P1: the review's own receipt — the server said `400 incoherent routing (agent-sdk ×
  // local-light)` and the deck told a user with a model connected to connect one. `BAD_REQUEST` is the ONE
  // code that EARNS the routing verdict, and it must still print it verbatim.
  const deck = await mount(<ParamsDeckCapabilityErrorStory />);

  await expect(deck.getByText(CAPABILITY_ERROR, { exact: false })).toBeVisible();
  await expect(deck.getByText(ROUTING_VERDICT_RE)).toBeVisible();
  // The EARNED arm keeps both halves: the cause-naming headline and the verdict.
  await expect(deck.getByText(MODEL_CAUSE_HEADLINE_RE)).toBeVisible();
  // The routing sentence is printed exactly ONCE, where it used to appear three times (F-02's P0).
  await expect(deck.getByText(GATE_SETTINGS_RE)).toHaveCount(1);
  // A settled arm is not a loading arm — the placeholder is gone.
  await expect(deck.locator('[data-slot="skeleton"]')).toHaveCount(0);
});

test("CAPABILITY ERROR (non-routing code) — NEITHER line names a cause the error never gave", async ({ mount }) => {
  // The 2026-08-08 defect, and its graduation follow-up: the gate hardcoded "this is a routing problem, NOT a
  // missing connection" over EVERY failure — and the first fix discriminated only the GUIDANCE, leaving the
  // headline still asserting the chat model as the cause. Both lines must fall back to naming the READ.
  const deck = await mount(<ParamsDeckCapabilityNonRoutingStory />);

  // The server's own reason is still shown — a failure is never swallowed.
  await expect(deck.getByText(NON_ROUTING_MSG, { exact: false })).toBeVisible();
  // THE REGRESSION, both halves: no routing verdict, and no chat-model cause in the headline.
  await expect(deck.getByText(ROUTING_VERDICT_RE)).toHaveCount(0);
  await expect(deck.getByText(MODEL_CAUSE_HEADLINE_RE)).toHaveCount(0);
  await expect(deck.getByText(READ_HEADLINE_RE)).toBeVisible();
  // The place to LOOK is still offered — withholding a cause is not withholding help.
  await expect(deck.getByText(GATE_SETTINGS_RE)).toHaveCount(1);
  await expect(deck.locator('[data-slot="skeleton"]')).toHaveCount(0);
});

test("CAPABILITY ERROR (no tRPC data — a transport failure) — the band states no cause at all", async ({ mount }) => {
  // A dropped socket / a 500 carries no `data.code`, so the gate knows the read failed and nothing more.
  const deck = await mount(<ParamsDeckCapabilityTransportFailureStory />);

  await expect(deck.getByText("Failed to fetch", { exact: false })).toBeVisible();
  await expect(deck.getByText(ROUTING_VERDICT_RE)).toHaveCount(0);
  await expect(deck.getByText(MODEL_CAUSE_HEADLINE_RE)).toHaveCount(0);
  await expect(deck.getByText(READ_HEADLINE_RE)).toBeVisible();
});

test("ADVANCED — the ONE collapsed disclosure; it opens onto the escape hatches", async ({ mount }) => {
  const deck = await mount(<ParamsDeckGhostStory />);

  await expect(deck.getByLabel("Logit bias", { exact: true })).toBeHidden();
  await deck.getByRole("button", { name: "Advanced" }).click();

  await expect(deck.getByLabel("Logit bias", { exact: true })).toBeVisible();
  await expect(deck.getByRole("switch", { name: "Parallel tool calls" })).toBeVisible();
  await expect(deck.getByText(CLAUDE_ENV_RE)).toBeVisible();
});

// ── THE FOLDED ROW HAS A VALUE COLUMN (side-eye 2026-08-30 P2-C) ──────────────────────────────────────
//
// Measured at 430px coarse on the shipped deck: label x=12, rail 12→418, value cell 284→364 — three
// elements on three different x's, identically on all TEN knobs, so the most common read on this tab
// ("which of these have I set?") had no column to run down and became ten separate hunts. The folded arm
// stacked every cell in turn, which also cost 148px per row against 38px on desktop (~2,800px of scroll).
//
// The fix pairs the NAME with its VALUE on line one and gives the rail the line beneath, so the value cell
// ends exactly where the rail does. Asserted as the ALIGNMENT (an equality between two measured boxes) and
// as the PITCH (row-to-row spacing), because either alone can be satisfied while the other regresses — and
// on EVERY knob, since the defect was uniform and a first-row sample would have missed nothing.
test.describe("coarse pointer — the folded knob row reads down a value column", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 430, height: 932 } });

  test("P2-C every value cell ends on the rail's own edge, and the pair costs ONE line instead of two", async ({ mount, page }) => {
    const deck = await mount(<ParamsDeckGhostStory />);
    await expect(deck.getByRole("slider", { name: "Temperature", exact: true })).toBeVisible();

    // A KnobRow is GRID CELLS, not a box, so a row IS a slider root with its two SIBLINGS — the name cell
    // before it, the value cluster after it. Walked that way rather than by slot name deliberately: the
    // sibling walk resolves on BOTH arms of this fix, so what the assertion below reds on is the GEOMETRY,
    // never a missing attribute (the value cluster's `data-slot` is pinned separately, as an anchor).
    // Polled: the fold is a CONTAINER query, and a same-tick read of one is a false negative by construction.
    const read = (): Promise<{ label: string; slot: string; numberRight: number; trackRight: number; labelTop: number; valueTop: number }[]> =>
      deck.evaluate((root: HTMLElement) =>
        [...root.querySelectorAll('[data-slot="slider-root"]')].map((slider) => {
          const name = slider.previousElementSibling;
          const cluster = slider.nextElementSibling;
          const value = cluster?.getBoundingClientRect();
          // THE NUMBER, not the cluster: the cluster reserves a slot for the reset on every row (visible or
          // not), so measuring IT would report an alignment the eye cannot see — which is exactly the shape
          // of the reported defect (the report's own census measured the `default` field at 284→364 against
          // a rail ending at 418). The number field's root is what carries `--width-number-inline`.
          const number = cluster?.querySelector('[data-slot="number-field-root"]')?.getBoundingClientRect();
          const track = slider.querySelector('[data-slot="slider-control"]')?.getBoundingClientRect();
          return {
            label: name?.textContent ?? "",
            slot: cluster?.getAttribute("data-slot") ?? "",
            numberRight: number?.right ?? -1,
            trackRight: track?.right ?? -2,
            labelTop: Math.round(name?.getBoundingClientRect().top ?? -1),
            valueTop: Math.round(value?.top ?? -2),
          };
        }),
      );
    await expect.poll(async () => (await read()).length, savePoll()).toBeGreaterThan(5);
    const rows = await read();

    expect(rows.length, "the story must render its whole knob set, or this alignment proof is vacuous").toBeGreaterThan(5);
    for (const row of rows) {
      const at = `knob ${row.label} [number ${String(Math.round(row.numberRight))} · rail ${String(Math.round(row.trackRight))} · slot ${row.slot}]`;
      // THE COLUMN: the number's trailing edge IS the rail's. Sub-pixel tolerance only — the point of the
      // finding is that these were 54px apart.
      expect(Math.abs(row.numberRight - row.trackRight), `${at}: the value must end where the rail does`).toBeLessThanOrEqual(1);
      // THE LINE: name and value share it, which is what gives the column its edge and saves the row.
      expect(Math.abs(row.labelTop - row.valueTop), `${at}: the value rides the label's line`).toBeLessThanOrEqual(2);
      // …and the walk landed on the value cluster rather than a gloss or the next row's name, which is what
      // entitles the two measurements above to be called the value cell's.
      expect(row.slot, `${at}: the element after the rail is the value cluster`).toBe("knob-value");
    }

    // THE PITCH: the desktop row is ~38px and the stacked arm was 148px. A phone row legitimately costs more
    // than a desktop one (a 48px touch floor on the twin, a full-width rail beneath), so this is a CEILING
    // well under the stacked cost, not a claim of parity.
    //
    // Measured WITHIN a cluster (one KnobGrid) and never across two: a deck's clusters are separated by a
    // kicker rule and by non-knob controls, so a whole-deck scan reports those as ~420px "rows" and would
    // fail this ceiling however tight the rows themselves are.
    const pitch = await page.evaluate(() => {
      const grids = new Set([...document.querySelectorAll('[data-slot="slider-root"]')].map((slider) => slider.parentElement));
      const gaps: number[] = [];
      for (const grid of grids) {
        const tops = [...(grid?.querySelectorAll('[data-slot="slider-root"]') ?? [])].map((s) => s.previousElementSibling?.getBoundingClientRect().top ?? 0);
        for (const [index, top] of tops.slice(1).entries()) {
          gaps.push(top - (tops[index] ?? 0));
        }
      }
      return gaps.length === 0 ? -1 : Math.max(...gaps);
    });
    expect(pitch, "the per-row pitch must be measurable, or the ceiling below is vacuous").toBeGreaterThan(0);
    expect(pitch, "a folded row costs one pair-line plus its rail, never a cell-per-line stack").toBeLessThan(120);
  });
});

// ── The geometry, against the mock's grammar (computed px vs the resolved tokens) ─────────────────────

test("GEOMETRY — label column · flexing track · mono twin, all on ONE line (the mock's KnobRow)", async ({ mount }) => {
  const deck = await mount(<ParamsDeckGhostStory />);

  const labelColumn = deck.getByText("Top-P", { exact: true }).locator("..");
  // Scope every measurement to THIS row. A KnobRow is GRID CELLS now (side-eye 2026-08-19 P1-1), so there is
  // no row ELEMENT to scope to — the row is the name cell and its two next siblings, which is exactly how
  // the cells are reached below. A bare `.first()` would silently measure the temperature row's rail.
  const twin = deck.getByRole("textbox", { name: "Top-P value", exact: true });

  const labelBox = await labelColumn.boundingBox();
  // The number field's own BOX is the root (the input sits inside its bordered group), and the root is what
  // carries the `--width-number-inline` token.
  const twinBox = await twin.locator("xpath=ancestor::*[@data-slot='number-field-root'][1]").boundingBox();
  const trackBox = await deck.getByRole("slider", { name: "Top-P", exact: true }).locator("xpath=ancestor::*[@data-slot='slider-control'][1]").boundingBox();

  // THE NAME TRACK IS A FLOOR, NOT A FIXED BOX. `--width-label-col` still decides where the column reads
  // down for every cluster whose names fit it — that is the token's whole job — but it is now the MINIMUM of
  // a content-sized track, because as a fixed width it clipped the deck's two longest names at every pane
  // width. So: at least the token, and never less.
  expect(Math.round(labelBox?.width ?? 0)).toBeGreaterThanOrEqual(tokenPx(TOKENS["width.label-col"].value));
  // The twin is the inline number token — the whole column reads down one number edge.
  expect(Math.round(twinBox?.width ?? 0)).toBe(tokenPx(TOKENS["width.number-inline"].value));
  // The track takes the middle: wider than either end.
  expect(trackBox?.width ?? 0).toBeGreaterThan(labelBox?.width ?? 0);
  // ONE line: the three cells share a vertical center (the mock's ~32px instrument row).
  const center = (box: { y: number; height: number } | null): number => (box === null ? -1 : Math.round(box.y + box.height / 2));
  expect(Math.abs(center(labelBox) - center(twinBox))).toBeLessThanOrEqual(2);
  expect(Math.abs(center(trackBox) - center(twinBox))).toBeLessThanOrEqual(2);
});

test("P2 the deck holds a MEASURE at both ends of the width matrix — the track stops growing, the row never overflows", async ({ mount, page }) => {
  // BOTH ENDS, because a cap is a range property and a single width proves nothing about the other one.
  // WIDE (the reported end): 1224px gave a 0-2 temperature a 595px rail — ~300px per unit of a dial whose
  // useful precision is 0.05, i.e. an instrument that got harder to aim as the window got bigger.
  await page.setViewportSize({ width: 1224, height: 900 });
  const deck = await mount(<ParamsDeckGhostStory />);
  // The KnobRow LINE is the slider ROOT's parent (the root is only the flexing track cell — measuring it and
  // calling it the row is how this pin first read a correctly-capped 430px track as a failure).
  const row = deck.locator('[data-slot="slider-root"]').first().locator("xpath=..");
  await expect(row).toBeVisible();

  const cap = tokenPx(TOKENS["width.content-col"].value);
  const wide = await row.boundingBox();
  expect(Math.round(wide?.width ?? 0), "the knob row is capped at the measure token, not the pane").toBe(cap);
  // …AND IT IS THE CAP, NEVER THE BREATHE STEP (#1682, refused). Seven other `--width-content-col`
  // consumers take `@5xl:max-w-(--width-content-col-wide)` (#1664) and an rg count read this deck as the
  // eighth oversight. Stated against the WIDE token by name so the next audit fails on the RULING rather
  // than on a number that happens to be 720: an instrument whose only flexing cell is a control track
  // holds the cap. Measured when #1682 was refused — planting the breathe here took this row to 896.
  expect(Math.round(wide?.width ?? 0), "an INSTRUMENT does not breathe: the deck holds the cap inside the column that does").not.toBe(
    tokenPx(TOKENS["width.content-col-wide"].value),
  );
  const wideTrack = await deck.locator('[data-slot="slider-control"]').first().boundingBox();
  // The track is what was over-growing; everything else in the row is a fixed token box.
  expect(wideTrack?.width ?? 0).toBeLessThan(cap - tokenPx(TOKENS["width.label-col"].value) - tokenPx(TOKENS["width.number-inline"].value));

  // NARROW (the other end): the row must still lay out on ONE line with nothing spilling out of it.
  await page.setViewportSize({ width: 568, height: 900 });
  const narrow = await row.boundingBox();
  expect(Math.round(narrow?.width ?? 0)).toBeLessThanOrEqual(568);
  const spill = await row.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(spill, "no horizontal overflow at the narrow end").toBeLessThanOrEqual(0);
});

// ── THE WIDTH FLOOR (side-eye 2026-08-19 P1-1) ────────────────────────────────────────────────────────
//
// MEASURED on the shipped deck at `--appearance-preset reading` (fontScale 1.25) in a 390px content pane:
// ALL TEN `[data-slot=slider-track]`s came out 0px — a 30px thumb parked on no rail at all — and the three
// longest labels clipped their own text at EVERY width, 1864 included, because the label CELL is a fixed
// `--width-label-col` box that the hint trigger eats a third of.
//
// It is pinned as a RANGE property, never a point: the matrix is {390, 568, 1864} x {fontScale 1, 1.25},
// which straddles the layout's own fold in both axes (a rem-scaled container query moves with the font).
// `--expect-no-overflow` PASSED over the broken arm — an ancestor clips first — so nothing here trusts an
// overflow verdict: every number is read off the element's own box.

/** The aimable-rail floor. Under it a 0..1 knob at step 0.05 gets ~4px of travel per step, which is the
 *  point where a drag stops being a way to set a value. A FLOOR the layout must clear, so it is a number
 *  and not a token the layout is built from. */
const MIN_TRACK_PX = 88;

/** Every label the deck renders in the story capability's clusters — the two OUTPUT names are the ones the
 *  fixed cell clipped, and they are why the list is spelled out rather than sampled. */
const DECK_KNOB_LABELS = ["Temperature", "Top-P", "Min-P", "Top-A", "Repetition penalty", "Max output tokens", "Max context tokens"] as const;

interface KnobFloor {
  readonly width: number;
  readonly tracks: readonly number[];
  readonly clipped: readonly string[];
}

/** Rail widths + any label cell whose own text does not fit it, at one pane width, read from the ELEMENTS'
 *  own boxes. Polls first: a container query re-resolves on the next layout pass, and a same-tick read of
 *  it is a false negative by construction. */
async function knobFloorAt(deck: Locator, page: Page, width: number): Promise<KnobFloor> {
  await page.setViewportSize({ width, height: 900 });
  const read = (): Promise<{ tracks: number[]; clipped: string[] }> =>
    deck.evaluate((root: HTMLElement, labels: readonly string[]) => {
      const tracks = [...root.querySelectorAll('[data-slot="slider-track"]')].map((el) => Math.round(el.getBoundingClientRect().width));
      const clipped = [...root.querySelectorAll("span")]
        .filter((el) => labels.includes(el.textContent ?? "") && el.scrollWidth - el.clientWidth > 1)
        .map((el) => el.textContent ?? "");
      return { tracks, clipped };
    }, DECK_KNOB_LABELS);
  await expect.poll(async () => (await read()).tracks.length, savePoll()).toBeGreaterThan(5);
  const measured = await read();
  return { width, tracks: measured.tracks, clipped: measured.clipped };
}

for (const fontScale of [1, 1.25]) {
  test(`WIDTH FLOOR — every rail stays aimable and no label clips, at fontScale ${String(fontScale)} across 390/568/1864`, async ({ mount, page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    const deck = await mount(<ParamsDeckGhostStory />);
    // The `reading` arm's geometry axis: `--font-scale` rescales the ROOT font size, so every rem token —
    // the label column, the number twin, the container-query steps — moves with it. Set on the element the
    // app's own boot hint writes it to.
    await page.evaluate((scale: number) => {
      document.documentElement.style.setProperty("--font-scale", String(scale));
    }, fontScale);

    // Sequential by construction (each entry re-lays-out the pane), spelled as an array so the matrix reads
    // as the range property it is.
    const matrix: readonly KnobFloor[] = [await knobFloorAt(deck, page, 390), await knobFloorAt(deck, page, 568), await knobFloorAt(deck, page, 1864)];

    for (const measured of matrix) {
      const at = `${String(measured.width)}px`;
      expect(measured.tracks.length, `${at}: the story must render its whole knob set, or the floor is vacuous`).toBeGreaterThan(5);
      for (const [index, track] of measured.tracks.entries()) {
        expect(track, `${at}: rail ${String(index)}`).toBeGreaterThanOrEqual(MIN_TRACK_PX);
      }
      expect(measured.clipped, `${at}: clipped labels`).toEqual([]);
    }
  });
}

test("CONTROL COLOR — one grammar, asserted COMPUTED: explicit slider fill IS the ember, inherited paints none", async ({ mount }) => {
  // OWNER RULING 2026-08-02 ("sliders WHITE, off-palette too"): the deck's set knobs and the surface's
  // switches speak ONE control color. This REVERSES side-eye F-09's non-ember arm — that call rationed the
  // accent and produced a set knob painted in a grey the palette does not otherwise speak.
  //
  // Asserted on COMPUTED style against the RESOLVED token, never the authored class: a custom-token class
  // can lose a tailwind-merge race and still read correct in source (the tailwind-merge custom-token
  // lesson), which is exactly how "rack switches are amber now" survived a review while rendering grey.
  const deck = await mount(<ParamsDeckExplicitStory />);

  const ghostRow = deck.getByRole("slider", { name: "Top-P", exact: true });
  const explicitRow = deck.getByRole("slider", { name: "Repetition penalty", exact: true });
  const partColor = (l: Locator, part: string): Promise<string> =>
    l.evaluate((el: HTMLElement, slot: string) => {
      const control = el.closest("[data-slot=slider-control]") ?? el;
      return getComputedStyle(control.querySelector(`[data-slot="${slot}"]`) ?? el).backgroundColor;
    }, part);
  // The ember as the BROWSER resolves it — `--color-primary` is authored in oklch and computes to a
  // different string, so the token is resolved through a probe element rather than string-compared.
  const ember = await deck.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--color-primary)";
    document.body.append(probe);
    const resolved = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return resolved;
  });

  // THUMB: the inherited row reads "not yours yet" and the explicit one is full weight. The inherited arm
  // is HOLLOW as of side-eye 2026-08-22 P2-3 — a tint alone died at the left rail, where an explicit knob
  // at its minimum draws a zero-width fill and the two rows differed by nothing but a grey. Pinned as
  // unfilled-vs-filled here too, so the deck's own arm cannot drift back to a tint.
  expect(await partColor(ghostRow, "slider-thumb")).toBe("rgba(0, 0, 0, 0)");
  expect(await partColor(explicitRow, "slider-thumb")).not.toBe("rgba(0, 0, 0, 0)");

  // FILL — the inherited row claims NO magnitude at all (F-09's surviving half: an unset Top-P at its 0.92
  // model default painting a near-full bar read as MORE set than the explicit rows beside it)…
  expect(await partColor(ghostRow, "slider-indicator")).toBe("rgba(0, 0, 0, 0)");
  // …and the explicit row's fill IS the ember, exactly.
  expect(await partColor(explicitRow, "slider-indicator")).toBe(ember);
});

test("CLEAR-THEN-BLANK — emptying the twin returns the knob to inherited (blank-means-default survives)", async ({ mount }) => {
  const deck = await mount(<ParamsDeckExplicitStory />);
  await clearNumber(deck.getByRole("textbox", { name: "Repetition penalty value", exact: true }));

  await expect.poll(() => saved(deck).textContent(), savePoll()).toContain("keys=quality");
  await expect(deck.getByText("clamped to 2 — this model's max", { exact: true })).toBeHidden();
});

// EVERY knob's explainer clears the D62 touch floor, WHATEVER its label is (side-eye R-8).
//
// The re-check filed "the info buttons are 12×12, coarse pointer included". Half of that is a measurement
// of the wrong box: the `Field`-hosted hints ride `Button size="inline"`, whose visible box is deliberately
// text-height (crunch item 10 — a full control box sheared every hinted label row 16px taller than its
// unhinted neighbour) and whose HIT AREA is a layout-neutral `::before` pinned to `--spacing-touch-target`.
// Those measure 12x12 with a 44x44 `::before`, and are correct.
//
// The other half was real, and had to be isolated by measuring: `KnobRow`'s own hint is a `size="icon"`
// button (a 48px box at coarse) sitting as a FLEX ITEM in a fixed-width label cell — so the three longest
// labels on the deck squeezed their own trigger to 44x48, 43x48 and 42x48, i.e. the floor depended on the
// copy. This asserts the union: for each trigger, the larger of its own box and its hit-area pseudo clears
// the floor, with the floor read from the LIVE token rather than written as 44 (it is pointer-conditional).
test.describe("coarse pointer — every knob explainer clears the touch floor", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 430, height: 932 } });

  test("no label length can shrink a hint trigger under the pointer's floor", async ({ mount, page }) => {
    const deck = await mount(<ParamsDeckGhostStory />);
    await expect(deck.getByRole("button", { name: "More info about Temperature" })).toBeVisible();

    const measured = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.width = "var(--spacing-touch-target)";
      document.body.append(probe);
      const floor = Number.parseFloat(getComputedStyle(probe).width);
      probe.remove();
      return { floor };
    });
    const triggers = page.locator('button[aria-label^="More info about"]');
    const triggerCount = await triggers.count();
    const hits = await Promise.all(
      Array.from({ length: triggerCount }, async (_unused, index) => {
        const trigger = triggers.nth(index);
        const hit = await boxWithBeforeFloor(trigger, measured.floor);
        return {
          label: (await trigger.getAttribute("aria-label")) ?? "",
          width: hit.x,
          height: hit.y,
        };
      }),
    );

    expect(measured.floor, "the touch-target token must resolve, or this assertion is vacuous").toBeGreaterThan(0);
    await expect.poll(async () => await triggers.count()).toBeGreaterThan(5);
    for (const hit of hits) {
      expect(hit.width, `${hit.label}: hit width`).toBeGreaterThanOrEqual(measured.floor);
      expect(hit.height, `${hit.label}: hit height`).toBeGreaterThanOrEqual(measured.floor);
    }
  });

  // P2-4 (side-eye 2026-08-22): the deck's ONE disclosure was its smallest interactive text — a 544×16 box
  // with a 10.5px label, below WCAG 2.5.8's 24×24 on any pointer and far below the coarse floor, with no
  // hit expansion (`::after` resolved `content: none`, so the `@orb/ui` touch pseudo was not in play). It
  // was `voice="kicker"`, the SECTION-EYEBROW step — right for a label that names a group, wrong for the
  // only thing you can press to reach one. `design-audit` reds this class as `undersized-ui-text` at the
  // 11px functional floor; asserted here as the RESOLVED type step and the RESOLVED coarse box, so the pin
  // does not restate either number as a literal.
  test("P2-4: the Advanced disclosure is sized as a control, not as a section eyebrow", async ({ mount, page }) => {
    const deck = await mount(<ParamsDeckGhostStory />);
    const trigger = deck.getByRole("button", { name: "Advanced" });
    await expect(trigger).toBeVisible();

    const measured = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.height = "var(--spacing-control-sm)";
      probe.style.fontSize = "var(--text-label)";
      document.body.append(probe);
      const style = getComputedStyle(probe);
      const floor = Number.parseFloat(style.height);
      const labelStep = Number.parseFloat(style.fontSize);
      probe.remove();

      const el = document.querySelector<HTMLElement>('[data-slot="collapsible-trigger"]');
      const text = el?.querySelector<HTMLElement>("p") ?? el;
      return { floor, labelStep, height: el?.getBoundingClientRect().height ?? 0, fontSize: Number.parseFloat(getComputedStyle(text as HTMLElement).fontSize) };
    });

    expect(measured.floor, "the control-sm token must resolve, or this assertion is vacuous").toBeGreaterThan(0);
    expect(measured.labelStep, "the label type step must resolve, or this assertion is vacuous").toBeGreaterThan(0);
    expect(measured.fontSize, "the trigger's label rides the control type step, not the eyebrow").toBe(measured.labelStep);
    expect(measured.height, "the trigger's row box clears the coarse floor").toBeGreaterThanOrEqual(measured.floor);
  });
});

/** Open ADVANCED, where the logit-bias box lives. */
async function openAdvanced(deck: Locator): Promise<void> {
  await deck.getByRole("button", { name: "Advanced" }).click();
}

// PARALLEL TOOL CALLS can be turned OFF. Unset is the model's own default (most allow parallel calls), so the
// switch reads on; off writes `false`, which every wire that has the control sends; on clears the field again.
test("PARALLEL TOOL CALLS — off saves false, and on clears the field back to the model default", async ({ mount }) => {
  const deck = await mount(<ParamsDeckGhostStory />);
  await openAdvanced(deck);

  const toggle = deck.getByRole("switch", { name: "Parallel tool calls" });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect.poll(() => saved(deck).textContent(), savePoll()).toContain('advanced:{"parallelToolCalls":false}');

  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect.poll(() => saved(deck).textContent(), savePoll()).not.toContain("parallelToolCalls");
});

// ── #1570 item 3 · THE BOX ALWAYS SHOWS WHAT THE PRESET HOLDS, IN BOTH DIRECTIONS ────────────────
// The field's own ruling is "a blur re-mounts with the CANONICAL serialization of what was actually stored
// — the honest answer to 'invalid JSON is ignored'". Keyed on the stored serialization ALONE that was true
// in one direction only: blurring invalid text OVER a stored map moves the value to `undefined`, so the key
// changes and the box clears; blurring the SAME text with NO stored map moves nothing, so the key does not
// change and the box keeps text that looks saved and is not. One input, two behaviours — this is the arm
// that had none, and the arm below is the one that already worked, pinned so the epoch cannot regress it.
const INVALID_BIAS = "{not json";

test("LOGIT BIAS — invalid text over an EMPTY map clears on blur, exactly as it does over a stored one (#1570)", async ({ mount, page }) => {
  const deck = await mount(<ParamsDeckGhostStory />);
  await openAdvanced(deck);

  const box = deck.getByRole("textbox", { name: "Logit bias" });
  await expect(box).toHaveValue("");
  await box.fill(INVALID_BIAS);
  // Blur is the commit: the field is uncontrolled by design (a controlled value would eat a half-typed brace).
  await page.keyboard.press("Tab");

  await expect(box).toHaveValue("");
});

test("LOGIT BIAS — a VALID map survives its own blur (#1570, the other direction)", async ({ mount, page }) => {
  const deck = await mount(<ParamsDeckGhostStory />);
  await openAdvanced(deck);

  const box = deck.getByRole("textbox", { name: "Logit bias" });
  await box.fill('{"7":50}');
  await page.keyboard.press("Tab");

  // Canonical serialization of what was STORED — not the raw text, and not an empty box.
  await expect(box).toHaveValue('{"7":50}');
});

// #1502's ORIGINAL invariant, pinned here because the #1570 epoch change touched this field's key and the
// property it was protecting had no test of its own: the box is UNCONTROLLED, so React applies its
// `defaultValue` at mount and never again — without the stored serialization in the key, switching presets
// left the previous preset's JSON in the box AND the next blur wrote that stale text over the new preset's
// map (a two-writer bug, not a display glitch). A green-before FENCE, stated as one: it passes with or
// without the epoch, and exists so a later "simplify the key" cannot pass.
test("LOGIT BIAS — switching presets REPLACES the box, it never leaves the previous preset's map (#1502)", async ({ mount }) => {
  const deck = await mount(<ParamsDeckLogitBiasSwitchStory />);
  await openAdvanced(deck);

  const box = deck.getByRole("textbox", { name: "Logit bias" });
  await expect(box).toHaveValue('{"7":50}');

  await deck.getByRole("button", { name: "Switch the preset" }).click();

  await expect(box).toHaveValue('{"9":-10}');
});
