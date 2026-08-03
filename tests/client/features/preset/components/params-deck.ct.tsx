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
  ParamsDeckCapabilityErrorStory,
  ParamsDeckCustomParamsStory,
  ParamsDeckExplicitStory,
  ParamsDeckGhostStory,
  ParamsDeckPendingCapabilityStory,
  ParamsDeckStaleStory,
} from "./_params-deck-stories";

const SAVE_POLL = { intervals: [100, 200, 300, 500] };
// The capability-gate notes + the ADVANCED gloss (hoisted — useTopLevelRegex). ONE note for the model-fed
// clusters (F-02), printed once where it used to appear three times.
const GATE_SETTINGS_RE = /Settings → Connections → Model roles/;
/** Any prose claiming something about the user's chat model — the gate's PENDING arm must show none of it. */
const CHAT_MODEL_CLAIM_RE = /chat model/;
/** `toHaveAttribute(name, ANY)` needs a hoisted pattern (useTopLevelRegex) — the assertions below are
 *  about an attribute's ABSENCE, so the pattern only has to match anything at all. */
const ANY = /.*/u;
/** The exact server message the review captured — the deck must show it, not swallow it. */
const CAPABILITY_ERROR = "400 incoherent routing (agent-sdk × local-light)";
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
  const topP = deck.getByRole("textbox", { name: "Top-P", exact: true });
  await expect(topP).toHaveValue("");
  await expect(topP).toHaveAttribute("placeholder", "0.92");
  await expect(deck.getByText("model default", { exact: true })).toBeVisible();

  // The slider is at that same effective value — the ghost thumb, not a zeroed track.
  await expect(deck.getByRole("slider", { name: "Top-P", exact: true })).toHaveValue("0.92");

  // A knob the funnel reports NOTHING for claims no number (the honest empty — never a fabricated default).
  await expect(deck.getByRole("textbox", { name: "Min-P", exact: true })).toHaveAttribute("placeholder", "default");

  // G1: `topA` finally has a row (schema-supported since it was minted, editor-less until now).
  await expect(deck.getByRole("textbox", { name: "Top-A", exact: true })).toBeVisible();
});

test("PROMOTION — typing into the twin writes ONLY that knob's key (the ghost is never written back)", async ({ mount }) => {
  const deck = await mount(<ParamsDeckGhostStory />);

  await setNumber(deck.getByRole("textbox", { name: "Top-P", exact: true }), "0.5");

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
  await setNumber(deck.getByRole("textbox", { name: "Temperature", exact: true }), "0.73");
  await expect(deck.getByRole("slider", { name: "Temperature", exact: true })).toHaveValue("0.73");
});

test("RESET — ↺ clears the knob back to inherit, and the ghost returns", async ({ mount }) => {
  const deck = await mount(<ParamsDeckGhostStory />);
  const topP = deck.getByRole("textbox", { name: "Top-P", exact: true });
  await setNumber(topP, "0.5");
  await expect.poll(() => saved(deck).textContent(), SAVE_POLL).toContain("keys=topP");

  await deck.getByRole("button", { name: "Reset Top-P to inherited" }).click();

  await expect(topP).toHaveValue("");
  await expect(deck.getByText("model default", { exact: true })).toBeVisible();
  await expect.poll(() => saved(deck).textContent(), SAVE_POLL).toContain("keys= ");
});

test("F-21 — the provenance gloss BELONGS to its row: both modalities point aria-describedby at it", async ({ mount }) => {
  const deck = await mount(<ParamsDeckGhostStory />);

  // The glosses used to be loose text under the tracks, which a screen reader runs together across rows —
  // "model default default full window" as one blob, attached to nothing. Both the slider and its twin now
  // name THIS row's line, and the id resolves to that exact text.
  const slider = deck.getByRole("slider", { name: "Top-P", exact: true });
  const twin = deck.getByRole("textbox", { name: "Top-P", exact: true });

  const glossId = await slider.getAttribute("aria-describedby");
  expect(glossId).not.toBeNull();
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
  await expect(deck.getByRole("textbox", { name: "Repetition penalty", exact: true })).toHaveValue("2.5");
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
  await expect.poll(() => saved(deck).textContent(), SAVE_POLL).toContain('values=quality:"deep"');

  // …and picking OFF again writes NO quality key at all (not `"off"`, not a materialized default) while the
  // gloss returns to the named off arm. This is the whole ruling: the arm is the absence.
  await dial.click();
  await deck.page().getByRole("option", { name: "Don't use quality", exact: true }).click();
  await expect.poll(() => saved(deck).textContent(), SAVE_POLL).toContain("keys= ");
  await expect(deck.getByText(QUALITY_OFF_GLOSS, { exact: true })).toBeVisible();
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

  await expect(deck.getByRole("textbox", { name: "Max output tokens", exact: true })).toHaveAttribute("placeholder", "2048");
  await expect(deck.getByText("default", { exact: true })).toBeVisible();
  await expect(deck.getByRole("textbox", { name: "Max context tokens", exact: true })).toHaveAttribute("placeholder", "32768");
  await expect(deck.getByText("full window", { exact: true })).toBeVisible();

  await setNumber(deck.getByRole("textbox", { name: "Max output tokens", exact: true }), "999999");

  // RAW digits, not "8,192" (crunch-list 9): ONE number grammar across the deck. The clamped value came
  // back through Base UI's formatter, while the row below it ghosts its placeholder as a plain string —
  // same KnobRow family, two grammars, until `KNOB_NUMBER_FORMAT` turned grouping off.
  await expect(deck.getByRole("textbox", { name: "Max output tokens", exact: true })).toHaveValue("8192");
  await expect.poll(() => saved(deck).textContent(), SAVE_POLL).toContain("values=maxOutputTokens:8192");
  // The ghost placeholder beside it is raw too — that is what "one grammar" means here.
  await expect(deck.getByRole("textbox", { name: "Max context tokens", exact: true })).toHaveAttribute("placeholder", "32768");
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

test("CAPABILITY ERROR — a FAILED read shows the server's reason once, and no skeleton", async ({ mount }) => {
  // F-02, the P1: the review's own receipt — the server said `400 incoherent routing (agent-sdk ×
  // local-light)` and the deck told a user with a model connected to connect one.
  const deck = await mount(<ParamsDeckCapabilityErrorStory />);

  await expect(deck.getByText(CAPABILITY_ERROR, { exact: false })).toBeVisible();
  // The routing sentence is printed exactly ONCE, where it used to appear three times (F-02's P0).
  await expect(deck.getByText(GATE_SETTINGS_RE)).toHaveCount(1);
  // A settled arm is not a loading arm — the placeholder is gone.
  await expect(deck.locator('[data-slot="skeleton"]')).toHaveCount(0);
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
  const twin = deck.getByRole("textbox", { name: "Top-P", exact: true });

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

  // THUMB: the inherited row reads "not yours yet" and the explicit one is full weight.
  expect(await partColor(ghostRow, "slider-thumb")).not.toBe(await partColor(explicitRow, "slider-thumb"));

  // FILL — the inherited row claims NO magnitude at all (F-09's surviving half: an unset Top-P at its 0.92
  // model default painting a near-full bar read as MORE set than the explicit rows beside it)…
  expect(await partColor(ghostRow, "slider-indicator")).toBe("rgba(0, 0, 0, 0)");
  // …and the explicit row's fill IS the ember, exactly.
  expect(await partColor(explicitRow, "slider-indicator")).toBe(ember);
});

test("CLEAR-THEN-BLANK — emptying the twin returns the knob to inherited (blank-means-default survives)", async ({ mount }) => {
  const deck = await mount(<ParamsDeckExplicitStory />);
  await clearNumber(deck.getByRole("textbox", { name: "Repetition penalty", exact: true }));

  await expect.poll(() => saved(deck).textContent(), SAVE_POLL).toContain("keys=quality");
  await expect(deck.getByText("clamped to 2 — this model's max", { exact: true })).toBeHidden();
});

// EVERY knob's explainer clears the D62 touch floor, WHATEVER its label is (side-eye R-8).
//
// The re-check filed "the info buttons are 12×12, coarse pointer included". Half of that is a measurement
// of the wrong box: the `Field`-hosted hints ride `Button size="inline"`, whose visible box is deliberately
// text-height (crunch item 10 — a full control box sheared every hinted label row 16px taller than its
// unhinted neighbour) and whose HIT AREA is a layout-neutral `::after` pinned to `--spacing-touch-target`.
// Those measure 12x12 with a 44x44 `::after`, and are correct.
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

      const hits = [...document.querySelectorAll('button[aria-label^="More info about"]')].map((el) => {
        const box = el.getBoundingClientRect();
        const after = getComputedStyle(el, "::after");
        // A `size="inline"` trigger carries its floor in the pseudo; a `size="icon"` one carries it in its
        // own box. Whichever is larger is the real target.
        return {
          label: el.getAttribute("aria-label") ?? "",
          width: Math.max(box.width, Number.parseFloat(after.width) || 0),
          height: Math.max(box.height, Number.parseFloat(after.height) || 0),
        };
      });
      return { floor, hits };
    });

    expect(measured.floor, "the touch-target token must resolve, or this assertion is vacuous").toBeGreaterThan(0);
    expect(measured.hits.length).toBeGreaterThan(5);
    for (const hit of measured.hits) {
      expect(hit.width, `${hit.label}: hit width`).toBeGreaterThanOrEqual(measured.floor);
      expect(hit.height, `${hit.label}: hit height`).toBeGreaterThanOrEqual(measured.floor);
    }
  });
});
