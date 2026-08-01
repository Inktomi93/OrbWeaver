// CT: the PARAMS DECK (preset-surface-redesign.md §4) — the per-cluster proofs the redesign's defects name.
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
// its `aria-label`; the slider carries `"<label> slider"` so the two modalities never collide.

import { DEFAULT_COMPACTION_MODE, MANAGED_COMPACT_DEFAULT_PCT, MANAGED_VERBATIM_TAIL } from "@orb/contracts/preset";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { compactionModeLabel } from "../../../../../packages/client/src/features/preset/lib/preset-nav";
import { clearNumber, setNumber } from "../../../../support/ct/set-number";
import { CompactionTabDefaultsStory, CompactionTabSetStory } from "./_add-flow-stories";
import {
  ParamsDeckCustomParamsStory,
  ParamsDeckExplicitStory,
  ParamsDeckGhostStory,
  ParamsDeckNoModelStory,
  ParamsDeckStaleStory,
} from "./_params-deck-stories";

const SAVE_POLL = { intervals: [100, 200, 300, 500] };
// The three capability-gate notes + the ADVANCED gloss (hoisted — useTopLevelRegex).
const SAMPLING_GATE_RE = /Temperature, top-p, top-k, the penalties and seed appear here/;
const REASONING_GATE_RE = /The reasoning switch, effort level and thinking budget appear here/;
const OUTPUT_GATE_RE = /Max output tokens, max context tokens and verbosity appear here/;
const CLAUDE_ENV_RE = /claudeEnv/;
const DEFAULT_PREFIX = /Default — /;
const SETTLE_MS = 500;

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
  const topP = deck.getByLabel("Top-P", { exact: true });
  await expect(topP).toHaveValue("");
  await expect(topP).toHaveAttribute("placeholder", "0.92");
  await expect(deck.getByText("model default", { exact: true })).toBeVisible();

  // The slider is at that same effective value — the ghost thumb, not a zeroed track.
  await expect(deck.getByRole("slider", { name: "Top-P slider" })).toHaveValue("0.92");

  // A knob the funnel reports NOTHING for claims no number (the honest empty — never a fabricated default).
  await expect(deck.getByLabel("Min-P", { exact: true })).toHaveAttribute("placeholder", "default");

  // G1: `topA` finally has a row (schema-supported since it was minted, editor-less until now).
  await expect(deck.getByLabel("Top-A", { exact: true })).toBeVisible();
});

test("PROMOTION — typing into the twin writes ONLY that knob's key (the ghost is never written back)", async ({ mount }) => {
  const deck = await mount(<ParamsDeckGhostStory />);

  await setNumber(deck.getByLabel("Top-P", { exact: true }), "0.5");

  // THE PIN: the saved patch carries `topP` and nothing else — not the ghosted top-p the resolver reported
  // for the OTHER rows, not the max-output floor, not a materialized default anywhere.
  await expect.poll(() => saved(deck).textContent(), SAVE_POLL).toContain("keys=topP");
  await expect.poll(() => saved(deck).textContent(), SAVE_POLL).toContain("values=topP:0.5");

  // The row is now EXPLICIT: the provenance gloss is gone and the reset appears.
  await expect(deck.getByText("model default", { exact: true })).toBeHidden();
  await expect(deck.getByRole("button", { name: "Reset Top-P to inherited" })).toBeVisible();
});

test("TWIN CONVERGENCE — the slider follows a typed value (two modalities, ONE field)", async ({ mount }) => {
  const deck = await mount(<ParamsDeckGhostStory />);
  await setNumber(deck.getByLabel("Temperature", { exact: true }), "0.73");
  await expect(deck.getByRole("slider", { name: "Temperature slider" })).toHaveValue("0.73");
});

test("RESET — ↺ clears the knob back to inherit, and the ghost returns", async ({ mount }) => {
  const deck = await mount(<ParamsDeckGhostStory />);
  const topP = deck.getByLabel("Top-P", { exact: true });
  await setNumber(topP, "0.5");
  await expect.poll(() => saved(deck).textContent(), SAVE_POLL).toContain("keys=topP");

  await deck.getByRole("button", { name: "Reset Top-P to inherited" }).click();

  await expect(topP).toHaveValue("");
  await expect(deck.getByText("model default", { exact: true })).toBeVisible();
  await expect.poll(() => saved(deck).textContent(), SAVE_POLL).toContain("keys= ");
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
  await expect(deck.getByLabel("Repetition penalty", { exact: true })).toHaveValue("2.5");
});

test("QUALITY — the mapping gloss reads the RESOLVER's provenance, not a client re-derivation", async ({ mount }) => {
  const deck = await mount(<ParamsDeckExplicitStory />);
  await expect(deck.getByRole("button", { name: "Deep", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(deck.getByText("deep → temp 1 — explicit knobs below override this", { exact: true })).toBeVisible();
});

// ── §4.2 staleness (F7) ───────────────────────────────────────────────────────────────────────────────

test("STALENESS — a stored-but-unhonored knob is named, and Clear unsets it", async ({ mount }) => {
  const deck = await mount(<ParamsDeckStaleStory />);
  await expect(deck.getByText("Set but not honored by this model: top_a 0.2", { exact: true })).toBeVisible();

  await deck.getByRole("button", { name: "Clear" }).click();

  await expect.poll(() => saved(deck).textContent(), SAVE_POLL).toContain("keys= ");
});

test("STALENESS — Keep dismisses the row for the session without touching the value", async ({ mount, page }) => {
  const deck = await mount(<ParamsDeckStaleStory />);
  await deck.getByRole("button", { name: "Keep" }).click();

  await expect(deck.getByText("Set but not honored by this model: top_a 0.2", { exact: true })).toBeHidden();
  await page.evaluate((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)), SETTLE_MS);
  // ONESHOT-OK: settled — the wait above IS the negative-assertion window (Keep is a dismissal, not a write).
  expect(await saved(deck).textContent()).toContain("keys=- ");
});

// ── OUTPUT: the integer arm ───────────────────────────────────────────────────────────────────────────

test("OUTPUT — the token caps are KnobRows at the model's real ceilings, and a typed overflow clamps", async ({ mount }) => {
  const deck = await mount(<ParamsDeckGhostStory />);

  await expect(deck.getByLabel("Max output tokens", { exact: true })).toHaveAttribute("placeholder", "2048");
  await expect(deck.getByText("default", { exact: true })).toBeVisible();
  await expect(deck.getByLabel("Max context tokens", { exact: true })).toHaveAttribute("placeholder", "32768");
  await expect(deck.getByText("full window", { exact: true })).toBeVisible();

  await setNumber(deck.getByLabel("Max output tokens", { exact: true }), "999999");

  await expect(deck.getByLabel("Max output tokens", { exact: true })).toHaveValue("8,192");
  await expect.poll(() => saved(deck).textContent(), SAVE_POLL).toContain("values=maxOutputTokens:8192");
});

test("OUTPUT — the stop-sequence chip list adds and removes (G2)", async ({ mount }) => {
  const deck = await mount(<ParamsDeckGhostStory />);
  // Located by PLACEHOLDER, not by its aria-label: inside a `<Field>` Base UI associates the field's own
  // Label with the control, and that association wins the accessible name (the Field-forces-a11y reality).
  await deck.getByPlaceholder("add…").fill("<|im_end|>");
  await deck.getByPlaceholder("add…").press("Enter");

  await expect.poll(() => saved(deck).textContent(), SAVE_POLL).toContain('values=stop:["<|im_end|>"]');
  await deck.getByRole("button", { name: "Remove stop sequence <|im_end|>" }).click();
  await expect.poll(() => saved(deck).textContent(), SAVE_POLL).toContain("values=stop:[]");
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
  await expect(deck.getByText(compactionModeLabel("auto"), { exact: false })).toBeVisible();
  await expect(deck.getByText(DEFAULT_PREFIX)).toHaveCount(0);
});

// ── The capability gate + ADVANCED ────────────────────────────────────────────────────────────────────

test("NO MODEL — the model-fed clusters name their hidden knobs; QUALITY/CONTEXT/ADVANCED still render", async ({ mount }) => {
  const deck = await mount(<ParamsDeckNoModelStory />);

  await expect(deck.getByText(SAMPLING_GATE_RE)).toBeVisible();
  await expect(deck.getByText(REASONING_GATE_RE)).toBeVisible();
  await expect(deck.getByText(OUTPUT_GATE_RE)).toBeVisible();

  await expect(deck.getByRole("button", { name: "Balanced", exact: true })).toBeVisible();
  await expect(deck.getByLabel("Verbatim tail", { exact: true })).toBeVisible();
  await expect(deck.getByRole("button", { name: "Advanced" })).toBeVisible();
});

test("ADVANCED — the ONE collapsed disclosure; it opens onto the escape hatches + the D7 presence row", async ({ mount }) => {
  const deck = await mount(<ParamsDeckCustomParamsStory />);

  await expect(deck.getByLabel("Logit bias", { exact: true })).toBeHidden();
  await deck.getByRole("button", { name: "Advanced" }).click();

  await expect(deck.getByLabel("Logit bias", { exact: true })).toBeVisible();
  await expect(deck.getByRole("switch", { name: "Parallel tool calls" })).toBeVisible();
  // D7: the server-only BYOK blob is DECLARED, never editable — an invisible knob that changes the wire
  // fails the no-silent-knobs bar.
  await expect(deck.getByText("top_a · repetition_penalty", { exact: true })).toBeVisible();
  await expect(deck.getByText(CLAUDE_ENV_RE)).toBeVisible();
});

// ── The geometry, against the mock's grammar (computed px vs the resolved tokens) ─────────────────────

test("GEOMETRY — label column · flexing track · mono twin, all on ONE line (the mock's KnobRow)", async ({ mount }) => {
  const deck = await mount(<ParamsDeckGhostStory />);

  const labelColumn = deck.getByText("Top-P", { exact: true }).locator("..");
  // Scope every measurement to THIS row — the deck stacks seven of them, and a bare `.first()` would
  // silently measure the temperature row against the top-p twin.
  const row = labelColumn.locator("..");
  const twin = deck.getByLabel("Top-P", { exact: true });

  const labelBox = await labelColumn.boundingBox();
  // The number field's own BOX is the root (the input sits inside its bordered group), and the root is what
  // carries the `--width-number-inline` token.
  const twinBox = await twin.locator("xpath=ancestor::*[@data-slot='number-field-root'][1]").boundingBox();
  const trackBox = await row.locator("[data-slot=slider-control]").boundingBox();

  // The label column is the minted token, not a hand-picked width.
  expect(Math.round(labelBox?.width ?? 0)).toBe(tokenPx(TOKENS["width.label-col"].value));
  // The twin is the inline number token — the whole column reads down one number edge.
  expect(Math.round(twinBox?.width ?? 0)).toBe(tokenPx(TOKENS["width.number-inline"].value));
  // The track takes the middle: wider than either end.
  expect(trackBox?.width ?? 0).toBeGreaterThan(labelBox?.width ?? 0);
  // ONE line: the three cells share a vertical center (the mock's ~32px instrument row).
  const center = (box: { y: number; height: number } | null): number => (box === null ? -1 : Math.round(box.y + box.height / 2));
  expect(Math.abs(center(labelBox) - center(twinBox))).toBeLessThanOrEqual(2);
  expect(Math.abs(center(trackBox) - center(twinBox))).toBeLessThanOrEqual(2);
});

test("GEOMETRY — the inherited row's thumb is the GHOST tone, the explicit row's is not", async ({ mount }) => {
  const deck = await mount(<ParamsDeckExplicitStory />);

  const ghostThumb = deck.getByRole("slider", { name: "Top-P slider" });
  const explicitThumb = deck.getByRole("slider", { name: "Repetition penalty slider" });
  const colorOf = (l: Locator): Promise<string> =>
    l.evaluate((el: HTMLElement) => getComputedStyle(el.closest("[data-slot=slider-thumb]") ?? el).backgroundColor);

  const ghost = await colorOf(ghostThumb);
  const explicit = await colorOf(explicitThumb);
  expect(ghost).not.toBe(explicit);
});

test("CLEAR-THEN-BLANK — emptying the twin returns the knob to inherited (blank-means-default survives)", async ({ mount }) => {
  const deck = await mount(<ParamsDeckExplicitStory />);
  await clearNumber(deck.getByLabel("Repetition penalty", { exact: true }));

  await expect.poll(() => saved(deck).textContent(), SAVE_POLL).toContain("keys=quality");
  await expect(deck.getByText("clamped to 2 — this model's max", { exact: true })).toBeHidden();
});
