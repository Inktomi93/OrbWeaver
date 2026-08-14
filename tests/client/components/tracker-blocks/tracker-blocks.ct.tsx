// CT: the tracker BLOCK KIT (Context-Panel-Program §3.2) — the seven blocks, both arms. The kit's
// contracts under test:
//   • LABEL always present + value TEXT is the datum (§3.2/§4.9) — a bare number is the named failure;
//   • EDITABLE IN PLACE by default, but DISPLAY-AT-REST (panel-redesign DESIGN.md §12.4.1): an
//     `onEdit*` renders the value as STATIC text on a real button; the inline field appears only on
//     CLICK, commits on blur/Enter, cancels on Escape. The READ-ONLY arm (no callback → static text)
//     stays the honest-arms fallback — display-only is the corruption-trainer failure, so both arms
//     are exhaustively pinned;
//   • the commit FIRES with the parsed value (assert-the-mutation-fired — not just the UI reaction).
// The trailing CONVERGENCE block assembles the kit into the mockup-v2 block regions and screenshots them
// (reports/snaps/tracker-kit-*.png) — the structure/density/hierarchy receipt against the committed mockup.
import { AddRow, AmbientStrip, BeatLine, CastCard, GoalLine, HintEditor, MeterRow, StatCell, TrackerChip } from "@orb/client/components";
import { RPG_WEATHER_TYPES } from "@orb/contracts/rpg";
import { Grid, Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { expect, test } from "@playwright/experimental-ct-react";
import type { ReactElement } from "react";

/** WCAG 2.2 SC 2.5.8's minimum target size. Named once so the ambient chip pin reads as the criterion it is. */
const MIN_TARGET_PX = 24;

// ── MeterRow ──────────────────────────────────────────────────────────────────────────────────────

test("MeterRow read-only: renders label + value/max as the text datum (no edit field)", async ({ mount, page }) => {
  const component = await mount(<MeterRow label="Vitality" value={24} max={30} color={1} />);
  await expect(component).toContainText("Vitality");
  await expect(component).toContainText("24/30");
  await expect(page.locator("[data-slot=tracker-value-edit]")).toHaveCount(0);
});

test("MeterRow UNSET: an unwritten reading is an em dash over an EMPTY rail — never a synthesized 0 (side-eye 08-01)", async ({ mount, page }) => {
  // The kit's own arm of the lying-meter fix: `value === null` means the story has written nothing, and the
  // block may not publish a measurement for it. The CEILING is still a real fact, so it still reads.
  // ONE mount, both arms (the CT harness allows a single React root per test).
  const component = await mount(
    <Stack gap="row">
      <MeterRow label="Vitality" value={null} max={30} color={1} />
      <MeterRow label="Grit" value={null} max={null} color={1} />
    </Stack>,
  );
  const ceilinged = component.locator("[data-slot=meter-row]").first();
  await expect(ceilinged).toContainText("—/30");
  await expect(component.getByText("0/30")).toHaveCount(0);
  await expect(ceilinged).toHaveAttribute("data-unset", "true");
  // The decoration agrees with the text: nothing filled.
  const fill = await page
    .locator("[data-slot=track-bar-fill]")
    .first()
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(fill).toBe(0);

  // No ceiling either (a poolless tracker) ⇒ no `/max` half at all, rather than a fabricated `/0`.
  const poolless = component.locator("[data-slot=meter-row]").nth(1);
  await expect(poolless).toContainText("—");
  await expect(poolless).not.toContainText("/");
});

test("MeterRow editable: display-at-rest → click reveals the inline field; commit fires with the parsed number", async ({ mount, page }) => {
  let committed = -1;
  await mount(
    <MeterRow
      label="Vitality"
      value={24}
      max={30}
      color={1}
      onEditValue={(next): void => {
        committed = next;
      }}
    />,
  );
  // AT REST: no input in the DOM (the instrument posture) — the value is a static-text button.
  await expect(page.locator("[data-slot=tracker-value-edit]")).toHaveCount(0);
  const rest = page.getByRole("button", { name: "Vitality value" });
  await expect(rest).toContainText("24");
  // CLICK → the inline field appears, seeded with the value; blur commits.
  await rest.click();
  const field = page.getByRole("textbox", { name: "Vitality value" });
  await expect(field).toHaveValue("24");
  await field.fill("18");
  await field.blur();
  expect(committed).toBe(18);
  // Back to rest after commit (the field closes).
  await expect(page.locator("[data-slot=tracker-value-edit]")).toHaveCount(0);
});

test("TrackerValue Escape cancels: the draft is dropped, nothing commits, back to rest (§12.4.1)", async ({ mount, page }) => {
  let committed = -1;
  await mount(
    <MeterRow
      label="Vitality"
      value={24}
      max={30}
      color={1}
      onEditValue={(next): void => {
        committed = next;
      }}
    />,
  );
  await page.getByRole("button", { name: "Vitality value" }).click();
  const field = page.getByRole("textbox", { name: "Vitality value" });
  await field.fill("99");
  await field.press("Escape");
  expect(committed).toBe(-1); // nothing sent
  await expect(page.locator("[data-slot=tracker-value-edit]")).toHaveCount(0); // back to rest
  await expect(page.getByRole("button", { name: "Vitality value" })).toContainText("24"); // draft dropped
});

// ── StatCell ──────────────────────────────────────────────────────────────────────────────────────

test("StatCell read-only: big value over the caps label, hint on title", async ({ mount }) => {
  const component = await mount(<StatCell label="STR" value={16} hint="Strength — melee, carry" />);
  await expect(component).toContainText("16");
  await expect(component).toContainText("STR");
  await expect(component).toHaveAttribute("title", "Strength — melee, carry");
});

test("StatCell editable: display-at-rest big value → click reveals the field; commit fires", async ({ mount, page }) => {
  let committed: number | null = -1;
  await mount(
    <StatCell
      label="STR"
      value={16}
      onEditValue={(next): void => {
        committed = next;
      }}
    />,
  );
  const rest = page.getByRole("button", { name: "STR value" });
  await expect(rest).toContainText("16");
  await rest.click();
  const field = page.getByRole("textbox", { name: "STR value" });
  await field.fill("18");
  await field.blur();
  expect(committed).toBe(18);
});

// RPG-STAT-CLOBBER's rendered half — an attribute this sheet carries NO value for is the em-dash arm, never a
// number the host never typed. The kit's never-synthesize-a-reading law applied to the one block that broke
// it: the panel used to print `profile.range.min` for an unset key, which is how a server-side wipe of a typed
// `20` read to the owner as "it reverted to 1" instead of "the value is gone".
test("StatCell unset (read-only): the em-dash arm, not a zero and not a floor", async ({ mount }) => {
  const component = await mount(<StatCell label="STR" value={null} hint="Strength" />);
  await expect(component).toContainText("—");
  await expect(component).not.toContainText("0");
  await expect(component).toContainText("STR");
});

test("StatCell unset (editable): the rest cell reads em-dash and opens an EMPTY field", async ({ mount, page }) => {
  await mount(
    <StatCell
      label="STR"
      value={null}
      onEditValue={(): void => {
        // The presence of a handler is what makes the cell EDITABLE; this test asserts the rest/open render
        // of the unset arm, not the commit (the blank-clears commit is the test below).
      }}
    />,
  );
  const rest = page.getByRole("button", { name: "STR value" });
  await expect(rest).toContainText("—");
  await rest.click();
  // The editor starts blank — there is no invented floor value for the host to select and delete first.
  await expect(page.getByRole("textbox", { name: "STR value" })).toHaveValue("");
});

test("StatCell: BLANKING a set attribute commits null — the clear that un-references the key", async ({ mount, page }) => {
  // Without this door a filled-in attribute can never leave a sheet, and `updateConfig` then refuses to remove
  // that attribute from the profile forever (`rpg_profile_referenced_remove` reads the sheets).
  let committed: number | null = -1;
  await mount(
    <StatCell
      label="STR"
      value={16}
      onEditValue={(next): void => {
        committed = next;
      }}
    />,
  );
  await page.getByRole("button", { name: "STR value" }).click();
  const field = page.getByRole("textbox", { name: "STR value" });
  await field.fill("");
  await field.blur();
  expect(committed).toBeNull();
});

// ── TrackerChip ───────────────────────────────────────────────────────────────────────────────────

test("TrackerChip read-only: label — value pill", async ({ mount }) => {
  const component = await mount(<TrackerChip label="mood" value="wary" />);
  await expect(component).toContainText("mood");
  await expect(component).toContainText("wary");
});

test("TrackerChip guide: carries the guide-chip slot (leading gauge glyph — distinct from a condition)", async ({ mount }) => {
  const guide = await mount(<TrackerChip label="pacing" value="slow burn" guide={true} />);
  await expect(guide).toHaveAttribute("data-slot", "guide-chip");
});

test("TrackerChip plain: carries the tracker-chip slot (no guide glyph)", async ({ mount }) => {
  const plain = await mount(<TrackerChip label="mood" value="wary" />);
  await expect(plain).toHaveAttribute("data-slot", "tracker-chip");
});

test("TrackerChip editable: display-at-rest → click reveals the field; commit fires with the new string", async ({ mount, page }) => {
  let committed = "";
  await mount(
    <TrackerChip
      label="mood"
      value="wary"
      onEditValue={(next): void => {
        committed = next;
      }}
    />,
  );
  const rest = page.getByRole("button", { name: "mood value" });
  await expect(rest).toContainText("wary");
  await rest.click();
  const field = page.getByRole("textbox", { name: "mood value" });
  await field.fill("hostile");
  await field.blur();
  expect(committed).toBe("hostile");
});

// ── CastCard ──────────────────────────────────────────────────────────────────────────────────────

test("CastCard: name + mood line + customFields as chip rows", async ({ mount }) => {
  const component = await mount(
    <CastCard
      name="Sera"
      mood="guarded"
      fields={[
        { name: "Trust", value: "low" },
        { name: "Debt", value: "3 favors" },
      ]}
    />,
  );
  await expect(component).toContainText("Sera");
  await expect(component).toContainText("guarded");
  await expect(component).toContainText("Trust");
  await expect(component).toContainText("3 favors");
});

test("BeatLine: long model-authored content WRAPS — no horizontal overflow (owner scrollbar report 08-01)", async ({ mount, page }) => {
  const longBeat =
    "Kestrel pressed Wren on the missing wagon while the storm rolled over the ford road and the lantern guttered down to its last measure of oil, forcing a choice";
  await mount(
    <div style={{ width: 280 }}>
      <BeatLine>{longBeat}</BeatLine>
    </div>,
  );
  const line = page.locator("[data-slot=beat-line]");
  await expect(line).toBeVisible();
  const overflow = await page.evaluate(() => document.body.scrollWidth - document.body.clientWidth);
  expect(overflow).toBe(0);
  const box = await line.boundingBox();
  if (box === null) {
    throw new Error("beat line has no box");
  }
  expect(box.height).toBeGreaterThan(30);
});

test("CastCard: a long model-authored mood WRAPS instead of overflowing the card (owner jank report 08-01)", async ({ mount, page }) => {
  // Model-authored free text has no length contract — the mood slot must wrap inside a narrow card, never
  // widen it. Geometry assertion (a string assertion stays green through the overflow this pins against).
  const longMood = "quietly furious but hiding it behind a practiced diplomatic smile while counting exits";
  const edits: string[] = [];
  await mount(
    <div style={{ width: 280 }}>
      <CastCard
        name="Sera"
        mood={longMood}
        fields={[]}
        relationship={{ kind: "friend", label: "" }}
        onEditMood={(next): void => {
          edits.push(next);
        }}
      />
    </div>,
  );
  const rest = page.getByRole("button", { name: "Sera mood" });
  await expect(rest).toBeVisible();
  const overflow = await page.evaluate(() => {
    const host = document.body;
    return host.scrollWidth - host.clientWidth;
  });
  expect(overflow).toBe(0);
  const box = await rest.boundingBox();
  if (box === null) {
    throw new Error("mood rest button has no box");
  }
  // Wrapped = taller than a single text line (the label line-height is ~20px; two lines clear 30).
  expect(box.height).toBeGreaterThan(30);
  // And the mood slot never invades the identity half: the badge's box and the mood button's box are
  // horizontally disjoint (the owner screenshot showed the pill painted over by the mood label).
  const badge = await page.getByText("friend").boundingBox();
  if (badge === null) {
    throw new Error("relationship badge has no box");
  }
  expect(box.x).toBeGreaterThanOrEqual(badge.x + badge.width);
});

// RV-11 — the standing guides. They were written richly by the extraction round every beat and rendered
// NOWHERE; these pin the three contracts of the read side: shown when written, ABSENT when not, and the
// unspoken one reads in its own (italic) voice.
test("CastCard guides: appearance/outfit/thoughts render as quiet lines, and an unwritten one is ABSENT", async ({ mount }) => {
  const component = await mount(<CastCard name="Sera" emoji="🕯️" mood="guarded" appearance="tall, silver-haired" thoughts="weighing whether to trust you" />);
  // The model-written cast emoji leads the name (same written-never-rendered class as the guides).
  await expect(component).toContainText("🕯️");
  await expect(component).toContainText("tall, silver-haired");
  await expect(component).toContainText("weighing whether to trust you");
  // The unwritten guide contributes NO line — not a label, not a "none" placeholder.
  await expect(component).not.toContainText("outfit");
  // `thoughts` is inner state, not dialogue — it carries the overheard italic voice the other two don't.
  await expect(component.getByText("weighing whether to trust you")).toHaveCSS("font-style", "italic");
  await expect(component.getByText("tall, silver-haired")).toHaveCSS("font-style", "normal");
});

test("CastCard guides: long model-authored guide prose WRAPS instead of widening the card", async ({ mount, page }) => {
  // Same class as the mood/beat overflow (owner scrollbar report 08-01): guides are model prose with no
  // length contract. Geometry assertion — a text assertion stays green straight through an overflow.
  const longOutfit = "a burnt-hem travelling coat stitched with cooling runes over a mail shirt she has not taken off in nine days";
  await mount(
    <div style={{ width: 280 }}>
      <CastCard name="Sera" outfit={longOutfit} />
    </div>,
  );
  const overflow = await page.evaluate(() => document.body.scrollWidth - document.body.clientWidth);
  expect(overflow).toBe(0);
  const box = await page.getByText(longOutfit).boundingBox();
  if (box === null) {
    throw new Error("guide line has no box");
  }
  expect(box.height).toBeGreaterThan(30); // wrapped past a single ~20px line
});

test("CastCard guides editable: click-to-edit commits with (field, value)", async ({ mount, page }) => {
  let captured: [string, string] = ["", ""];
  await mount(
    <CastCard
      name="Sera"
      appearance="tall, silver-haired"
      onEditGuide={(guide, next): void => {
        captured = [guide, next];
      }}
    />,
  );
  // Display-at-rest like every other value in the kit: no input until the value is clicked.
  await expect(page.locator("[data-slot=tracker-value-edit]")).toHaveCount(0);
  await page.getByRole("button", { name: "Sera appearance" }).click();
  const field = page.getByRole("textbox", { name: "Sera appearance" });
  await field.fill("shaven-headed, a fresh scar");
  await field.blur();
  expect(captured).toEqual(["appearance", "shaven-headed, a fresh scar"]);
});

test("CastCard editable: clicking a field's rest value reveals the editor; onEditField fires with (name, value)", async ({ mount, page }) => {
  let captured: [string, string] = ["", ""];
  await mount(
    <CastCard
      name="Sera"
      fields={[{ name: "Trust", value: "low" }]}
      onEditField={(fieldName, next): void => {
        captured = [fieldName, next];
      }}
    />,
  );
  // The chip's control is named by WHOSE reading it is (side-eye 08-01): two cards on one tab otherwise
  // offer two identical "Trust value" buttons.
  await page.getByRole("button", { name: "Sera Trust" }).click();
  const field = page.getByRole("textbox", { name: "Sera Trust" });
  await field.fill("high");
  await field.blur();
  expect(captured).toEqual(["Trust", "high"]);
});

test("CastCard: a known relationship kind badges with its label (feature 1, §2.1)", async ({ mount }) => {
  const component = await mount(<CastCard name="Mari" relationship={{ kind: "enemy", label: "" }} />);
  await expect(component).toContainText("Mari");
  await expect(component).toContainText("enemy"); // the badge label is the accessible datum (tracker-kit a11y)
});

test("CastCard: a custom relationship renders its label chip", async ({ mount }) => {
  const component = await mount(<CastCard name="Kade" relationship={{ kind: "custom", label: "vassal" }} />);
  await expect(component).toContainText("vassal");
});

test("CastCard: a LONG custom relationship label truncates + titles, and the NAME keeps non-zero width (FIX 2)", async ({ mount }) => {
  // The regression: a realistic free-text label grew the badge to ~236px and starved the name to 0px. The name
  // must retain width (it's `shrink-0`); the badge label truncates and carries the full text on `title` for hover.
  const longLabel = "disgraced former lieutenant of the crown"; // 40 chars — the untested long case
  const component = await mount(
    <div style={{ width: "17rem" }}>
      <CastCard name="Aldric" relationship={{ kind: "custom", label: longLabel }} />
    </div>,
  );
  const name = component.getByText("Aldric");
  const nameBox = await name.boundingBox();
  expect(nameBox?.width ?? 0).toBeGreaterThan(0); // the name is NOT starved to 0px

  const badge = component.locator("[data-slot=relationship-badge]");
  await expect(badge).toHaveAttribute("title", longLabel); // full text on hover
  await expect(badge.locator("span")).toHaveCSS("text-overflow", "ellipsis"); // the label truncates
});

test("CastCard: a neutral relationship badges NOTHING (no clutter)", async ({ mount }) => {
  const component = await mount(<CastCard name="Bob" relationship={{ kind: "neutral", label: "" }} />);
  await expect(component).toContainText("Bob");
  await expect(component).not.toContainText("neutral");
});

test("CastCard: numeric cast-field meters render above the text chips (feature C, §2.8)", async ({ mount }) => {
  const component = await mount(
    <CastCard
      name="Mari"
      relationship={{ kind: "friend", label: "" }}
      meters={<MeterRow label="Suspicion" value={7} max={10} color={1} />}
      fields={[{ name: "Trust", value: "guarded" }]}
    />,
  );
  await expect(component).toContainText("Suspicion");
  await expect(component).toContainText("7/10"); // the meter's value/max text is the datum
  await expect(component).toContainText("guarded");
});

// ── BeatLine ──────────────────────────────────────────────────────────────────────────────────────

test("BeatLine: renders a muted one-liner", async ({ mount }) => {
  const component = await mount(<BeatLine>Sera pocketed the bone key while you argued.</BeatLine>);
  await expect(component).toContainText("Sera pocketed the bone key");
});

// ── AmbientStrip ──────────────────────────────────────────────────────────────────────────────────

test("AmbientStrip read-only: renders set fields, omits unset ones", async ({ mount, page }) => {
  const component = await mount(<AmbientStrip location="The Rusted Lantern" timeOfDay="night" weather="rain" />);
  await expect(component).toContainText("The Rusted Lantern");
  await expect(component).toContainText("night");
  await expect(component).toContainText("rain");
  // No `date` set + read-only ⇒ the Date row omits.
  await expect(component).not.toContainText("Date");
  await expect(page.locator("[data-slot=tracker-value-edit]")).toHaveCount(0);
});

test("AmbientStrip editable: all four fields are present (seedable) and commit fires with the key", async ({ mount, page }) => {
  let captured: [string, string | null] = ["", ""];
  await mount(
    <AmbientStrip
      location="The Rusted Lantern"
      onEditField={(field, next): void => {
        captured = [field, next];
      }}
    />,
  );
  // Editable ⇒ even the unset `date` row renders at rest (seed data mid-chat — §3.2), input on click.
  await page.getByRole("button", { name: "Date value" }).click();
  const dateField = page.getByRole("textbox", { name: "Date value" });
  await dateField.fill("day 3");
  await dateField.blur();
  expect(captured).toEqual(["date", "day 3"]);
});

test("AmbientStrip Time: the closed 6-label PICKER (never free text, never a resting dropdown) commits a label", async ({ mount, page }) => {
  let captured: [string, string | null] = ["", ""];
  await mount(
    <AmbientStrip
      location="The Rusted Lantern"
      timeOfDay="dawn"
      onEditField={(field, next): void => {
        captured = [field, next];
      }}
    />,
  );
  // At rest: the current label as static text on a button — no input, no select.
  const rest = page.getByRole("button", { name: "Time value" });
  await expect(rest).toContainText("dawn");
  await rest.click();
  // The six TIME_OF_DAY labels appear as a pick-once group (Tier-0 §12.3 — off-vocab unconstructable).
  const group = page.getByRole("group", { name: "Time of day" });
  await expect(group.getByRole("button", { name: "night", exact: true })).toBeVisible();
  await group.getByRole("button", { name: "night", exact: true }).click();
  expect(captured).toEqual(["timeOfDay", "night"]);
  // The picker closes back to rest after the pick.
  await expect(page.getByRole("group", { name: "Time of day" })).toHaveCount(0);
});

test("AmbientStrip Weather: the closed PICKER commits a canonical type (off-vocab unconstructable)", async ({ mount, page }) => {
  let captured: [string, string | null] = ["", ""];
  await mount(
    <AmbientStrip
      location="The Rusted Lantern"
      weather="rain"
      onEditField={(field, next): void => {
        captured = [field, next];
      }}
    />,
  );
  const rest = page.getByRole("button", { name: "Weather value" });
  await expect(rest).toContainText("rain");
  await rest.click();
  const group = page.getByRole("group", { name: "Weather" });
  // Every vocabulary member and NO free-text input — a host can no longer hand-write an off-vocab
  // sky. Count DERIVED from the imported tuple (the hardcoded "8" broke the day `indoors` widened
  // the vocab — a closed-picker pin must track the vocabulary it pins).
  await expect(group.getByRole("button")).toHaveCount(RPG_WEATHER_TYPES.length);
  await expect(group.getByRole("button", { name: "indoors", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Weather value" })).toHaveCount(0);
  await group.getByRole("button", { name: "storm", exact: true }).click();
  expect(captured).toEqual(["weather", "storm"]);
  await expect(page.getByRole("group", { name: "Weather" })).toHaveCount(0);
});

// A closed vocabulary has no "nothing" member (minting one would teach the MODEL to write it), so a set
// weather/time was unclearable by hand while the two free-text fields were not. The clear rides the FIELD's
// nullability instead — `onEditField(field, null)`, the store's own [merge-clear] vocabulary.

test("AmbientStrip Weather: a set sky can be CLEARED, and the clear is null (never a vocabulary member)", async ({ mount, page }) => {
  let captured: [string, string | null] = ["", ""];
  await mount(
    <AmbientStrip
      location="The Rusted Lantern"
      weather="rain"
      onEditField={(field, next): void => {
        captured = [field, next];
      }}
    />,
  );
  await page.getByRole("button", { name: "Weather value" }).click();
  // The Clear sits OUTSIDE the closed group, so the vocabulary count above still counts the vocabulary.
  await expect(page.getByRole("group", { name: "Weather" }).getByRole("button")).toHaveCount(RPG_WEATHER_TYPES.length);
  await page.getByRole("button", { name: "Clear weather" }).click();
  expect(captured).toEqual(["weather", null]);
  await expect(page.getByRole("group", { name: "Weather" })).toHaveCount(0);
});

test("AmbientStrip Time: a set hour clears to null through the same door", async ({ mount }) => {
  let captured: [string, string | null] = ["", ""];
  const component = await mount(
    <AmbientStrip
      location="The Rusted Lantern"
      timeOfDay="dawn"
      onEditField={(field, next): void => {
        captured = [field, next];
      }}
    />,
  );
  await component.getByRole("button", { name: "Time value" }).click();
  await component.getByRole("button", { name: "Clear time" }).click();
  expect(captured).toEqual(["timeOfDay", null]);
});

test("AmbientStrip: an UNSET field offers no clear (a control that can do nothing is a lie)", async ({ mount, page }) => {
  const noop = (): void => undefined;
  const component = await mount(<AmbientStrip location="The Rusted Lantern" onEditField={noop} />);
  await component.getByRole("button", { name: "Time value" }).click();
  await expect(page.getByRole("group", { name: "Time of day" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear time" })).toHaveCount(0);
});

// EVERY CHIP COMMITS A DESTRUCTIVE WRITE to shared game state with no visible undo, so its hit target has to
// be BOTH big enough and its OWN. The chips were `size="inline"` — the display-at-rest arm, which wears no
// control box and carries its touch floor in an OVERFLOWING ::after. Measured at the 320px context column
// that produced 13px-tall boxes with 28px hit areas on an ~18px row pitch, so the areas COLLIDED and the row
// below won: `elementFromPoint` 10px under `clear` returned `snow`, under `storm` returned `indoors`. Aiming
// at one sky and committing another is worse than a small target, and a boundingBox assertion cannot see it —
// so this pins the pixel that actually receives the click.
test("AmbientStrip: every vocabulary chip owns its hit area — ≥24px and no collision with the row below", async ({ mount, page }) => {
  const noop = (): void => undefined;
  await mount(
    // The NARROWEST real mount (the panel's 320px context column), where the vocabulary wraps to three rows —
    // a single-row width cannot expose a vertical collision.
    <div style={{ overflow: "visible", width: 320 }}>
      <AmbientStrip date="day 3" location="The Rusted Lantern" onEditField={noop} timeOfDay="dawn" weather="rain" />
    </div>,
  );
  await page.getByRole("button", { name: "Weather value" }).click();
  await expect(page.getByRole("group", { name: "Weather" })).toBeVisible();

  const chips = await page.locator('[role="group"][aria-label="Weather"] button').evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const own = (dy: number): boolean => document.elementFromPoint(cx, box.top + box.height / 2 + dy)?.closest("button") === node;
      return { label: (node.textContent ?? "").trim(), height: box.height, width: box.width, ownsUp: own(-10), ownsDown: own(10) };
    }),
  );

  expect(chips.length).toBe(RPG_WEATHER_TYPES.length);
  for (const chip of chips) {
    // WCAG 2.2 SC 2.5.8 — and the spacing exception does not apply, the chips sit ~5px apart.
    expect(chip.height, `${chip.label} is under the 24px target floor`).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    expect(chip.width, `${chip.label} is under the 24px target floor`).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    // …and 10px either side of its centre still belongs to IT, not to a neighbour in the wrapped grid.
    expect(chip.ownsUp, `10px above ${chip.label} belongs to another control`).toBe(true);
    expect(chip.ownsDown, `10px below ${chip.label} belongs to another control`).toBe(true);
  }
});

test("AmbientStrip: the selected member is ANNOUNCED, not just drawn", async ({ mount, page }) => {
  const noop = (): void => undefined;
  await mount(<AmbientStrip location="The Rusted Lantern" onEditField={noop} weather="rain" />);
  await page.getByRole("button", { name: "Weather value" }).click();

  const group = page.getByRole("group", { name: "Weather" });
  // Selection used to be a border and nothing else — a reader could not tell which sky is current.
  await expect(group.getByRole("button", { name: "rain", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(group.getByRole("button", { name: "storm", exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("AmbientStrip: Escape still closes the picker from the row the Clear control sits on", async ({ mount, page }) => {
  const noop = (): void => undefined;
  const component = await mount(<AmbientStrip location="The Rusted Lantern" weather="rain" onEditField={noop} />);
  await component.getByRole("button", { name: "Weather value" }).click();
  await expect(page.getByRole("button", { name: "Clear weather" })).toBeVisible();
  await page.getByRole("button", { name: "Clear weather" }).press("Escape");
  await expect(page.getByRole("group", { name: "Weather" })).toHaveCount(0);
});

// ── GoalLine ──────────────────────────────────────────────────────────────────────────────────────

test("GoalLine: free-text goal + optional n/m clock segment", async ({ mount }) => {
  const active = await mount(<GoalLine text="Find the bone key" clock={{ filled: 1, total: 3 }} />);
  await expect(active).toContainText("Find the bone key");
  await expect(active).toContainText("1/3");
});

test("GoalLine done: the goal text gets a strikethrough", async ({ mount }) => {
  const done = await mount(<GoalLine text="Escape the inn" done={true} />);
  await expect(done.getByText("Escape the inn")).toHaveCSS("text-decoration-line", "line-through");
});

test("GoalLine editable: display-at-rest → click reveals the field; commit fires with the new goal text", async ({ mount, page }) => {
  let committed = "";
  await mount(
    <GoalLine
      text="Find the bone key"
      onEditText={(next): void => {
        committed = next;
      }}
    />,
  );
  const rest = page.getByRole("button", { name: "Goal" });
  await expect(rest).toContainText("Find the bone key");
  await rest.click();
  const field = page.getByRole("textbox", { name: "Goal" });
  await field.fill("Find the iron key");
  await field.blur();
  expect(committed).toBe("Find the iron key");
});

// ── AddRow + HintEditor — the RV-8 panel-CRUD primitives ─────────────────────────────────────────

test("AddRow: a blank draft REFUSES (every action disabled) — the Tier-2 no-orphan-names rule, structurally", async ({ mount, page }) => {
  let added = "";
  const component = await mount(
    <AddRow
      ariaLabel="New tracker name"
      placeholder="name it first"
      actions={[
        {
          key: "meter",
          label: "meter",
          onAdd: (value): void => {
            added = value;
          },
        },
      ]}
    />,
  );
  await expect(component.getByRole("button", { name: "meter" })).toBeDisabled();
  // Enter on an empty draft sends nothing either (the button is not the only path in).
  await page.getByRole("textbox", { name: "New tracker name" }).press("Enter");
  expect(added).toBe("");
});

test("AddRow: Enter fires the PRIMARY action with the trimmed name and clears the draft", async ({ mount, page }) => {
  const added: string[] = [];
  await mount(
    <AddRow
      ariaLabel="New tracker name"
      placeholder="name it first"
      actions={[
        { key: "meter", label: "meter", onAdd: (value): void => void added.push(`meter:${value}`) },
        { key: "text", label: "text", onAdd: (value): void => void added.push(`text:${value}`) },
      ]}
    />,
  );
  const field = page.getByRole("textbox", { name: "New tracker name" });
  await field.fill("  Grit  ");
  await field.press("Enter");
  expect(added).toEqual(["meter:Grit"]);
  await expect(field).toHaveValue("");
  // The secondary action is a real second arm (one name, several shapes).
  await field.fill("Rumours");
  await page.getByRole("button", { name: "text" }).click();
  expect(added).toEqual(["meter:Grit", "text:Rumours"]);
});

test("AddRow: a stated REFUSAL disables the row and says why (never a silently dead control)", async ({ mount, page }) => {
  const component = await mount(
    <AddRow
      ariaLabel="New attribute name"
      placeholder="name it"
      refusal="A profile carries at most 12 attributes."
      actions={[{ key: "a", label: "Add", onAdd: (): void => undefined }]}
    />,
  );
  await expect(component).toContainText("A profile carries at most 12 attributes.");
  await expect(component.getByRole("button", { name: "Add" })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "New attribute name" })).toBeDisabled();
});

test("HintEditor: commits TRUNCATED to the wire cap, and shows the counter only from 80% full", async ({ mount, page }) => {
  let committed = "";
  const short = await mount(
    <HintEditor
      ariaLabel="Grit hint"
      hint="resolve you spend"
      max={20}
      onEdit={(next): void => {
        committed = next;
      }}
    />,
  );
  // 17 of 20 chars is ≥80% — the quiet counter is showing.
  await expect(short).toContainText("17/20");
  await short.getByRole("button", { name: "Grit hint" }).click();
  const field = page.getByRole("textbox", { name: "Grit hint" });
  await field.fill("a very long gloss that runs past the cap");
  await field.blur();
  expect(committed).toBe("a very long gloss th");
  expect(committed).toHaveLength(20);
});

test("HintEditor read-only + empty renders NOTHING (no labelled gap on a viewer's surface)", async ({ mount }) => {
  const component = await mount(<HintEditor ariaLabel="Grit hint" hint="" max={120} />);
  await expect(component.locator('[data-slot="hint-editor"]')).toHaveCount(0);
});

// ── CONVERGENCE — assemble the kit into the mockup-v2 block regions + screenshot (the receipt) ───────

/** A section kicker (the muted caps label the mockup uses over each block group). */
function sectionLabel(text: string): ReactElement {
  return (
    <Text size="micro" tone="muted" weight="semibold" transform="caps" className="tracking-micro">
      {text}
    </Text>
  );
}

test("CP-3 Trackers-tab region — meters → guides → text trackers (mockup Rung 2)", async ({ mount }) => {
  const component = await mount(
    <Stack gap="block" className="w-panel bg-sidebar p-block">
      {sectionLabel("Meters")}
      <MeterRow label="Affection" value={42} max={100} color={1} />
      <MeterRow label="Suspicion" value={3} max={10} color={2} />
      {sectionLabel("Guides")}
      <Row gap="field" className="flex-wrap">
        <TrackerChip label="pacing" value="slow burn" guide={true} />
        <TrackerChip label="tone" value="dry wit" guide={true} />
      </Row>
      {sectionLabel("Trackers")}
      <Row gap="field" className="flex-wrap">
        <TrackerChip label="mood" value="wary" />
        <TrackerChip label="location" value="rooftop" />
      </Row>
    </Stack>,
  );
  await expect(component).toContainText("42/100");
  await expect(component).toContainText("slow burn");
  await component.screenshot({ path: "reports/snaps/tracker-kit-trackers-tab.png" });
});

test("Scene region — ambient strip → cast card w/ per-NPC meter → beats (mockup lite Scene)", async ({ mount }) => {
  const component = await mount(
    <Stack gap="block" className="w-panel bg-sidebar p-block">
      <AmbientStrip location="The Rusted Lantern — Common Room" date="day 3" timeOfDay="night" weather="rain" />
      {sectionLabel("On stage — 1")}
      <CastCard
        name="Sera"
        mood="guarded"
        meters={<MeterRow label="Corruption" value={70} max={100} color={4} />}
        fields={[
          { name: "Trust", value: "low" },
          { name: "Debt", value: "3 favors" },
        ]}
      />
      {sectionLabel("Goals")}
      <GoalLine text="Recover the bone key" clock={{ filled: 1, total: 3 }} />
      {sectionLabel("Just now")}
      <Stack gap="field">
        <BeatLine>Sera pocketed the bone key while you argued.</BeatLine>
        <BeatLine>The rain has not let up since dusk.</BeatLine>
      </Stack>
    </Stack>,
  );
  await expect(component).toContainText("The Rusted Lantern");
  await expect(component).toContainText("70/100");
  await component.screenshot({ path: "reports/snaps/tracker-kit-scene.png" });
});

test("Editable arm — display-at-rest: an editable region shows NO inputs until a value is clicked (§12.4.1)", async ({ mount, page }) => {
  const noop = (): void => undefined;
  const component = await mount(
    <Stack gap="block" className="w-panel bg-sidebar p-block">
      {sectionLabel("Meters — editable")}
      <MeterRow label="Affection" value={42} max={100} color={1} onEditValue={noop} />
      {sectionLabel("Ambient — editable (seed unset fields)")}
      <AmbientStrip location="Rooftop" onEditField={noop} />
      {sectionLabel("Trackers — editable")}
      <Row gap="field" className="flex-wrap">
        <TrackerChip label="mood" value="wary" onEditValue={noop} />
      </Row>
    </Stack>,
  );
  // The INSTRUMENT posture: zero inputs at rest — every editable value is a static-text button.
  await expect(page.locator("[data-slot=tracker-value-edit]")).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Affection value" })).toContainText("42");
  await component.screenshot({ path: "reports/snaps/tracker-kit-editable.png" });
  // Clicking one value reveals exactly ONE inline field, seeded with the value.
  await component.getByRole("button", { name: "Affection value" }).click();
  await expect(page.locator("[data-slot=tracker-value-edit]")).toHaveCount(1);
  await expect(component.getByRole("textbox", { name: "Affection value" })).toHaveValue("42");
});

test("Sheet region — attribute stat cells, 3-up grid (mockup OSRS skills idiom)", async ({ mount }) => {
  const component = await mount(
    <Stack gap="block" className="w-panel bg-sidebar p-block">
      {sectionLabel("Attributes")}
      <Grid cols="auto" gap="field">
        <StatCell label="STR" value={16} hint="Strength" />
        <StatCell label="DEX" value={12} hint="Dexterity" />
        <StatCell label="CON" value={14} hint="Constitution" />
        <StatCell label="INT" value={10} hint="Intelligence" />
        <StatCell label="WIS" value={13} hint="Wisdom" />
        <StatCell label="CHA" value={8} hint="Charisma" />
      </Grid>
    </Stack>,
  );
  await expect(component).toContainText("STR");
  await expect(component).toContainText("16");
  await component.screenshot({ path: "reports/snaps/tracker-kit-sheet.png" });
});
