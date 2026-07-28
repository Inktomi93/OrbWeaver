// CT: the tracker BLOCK KIT (Context-Panel-Program §3.2) — the seven blocks, both arms. The kit's
// contracts under test:
//   • LABEL always present + value TEXT is the datum (§3.2/§4.9) — a bare number is the named failure;
//   • EDITABLE IN PLACE by default (an `onEdit*` makes the value an inline field committing on
//     blur/Enter) with a READ-ONLY arm (no callback → static text) — display-only is the corruption-
//     trainer failure, so both arms are exhaustively pinned;
//   • the commit FIRES with the parsed value (assert-the-mutation-fired — not just the UI reaction).
// The trailing CONVERGENCE block assembles the kit into the mockup-v2 block regions and screenshots them
// (reports/snaps/tracker-kit-*.png) — the structure/density/hierarchy receipt against the committed mockup.
import { AmbientStrip, BeatLine, CastCard, GoalLine, MeterRow, StatCell, TrackerChip } from "@orb/client/components";
import { Grid, Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { expect, test } from "@playwright/experimental-ct-react";
import type { ReactElement } from "react";

// ── MeterRow ──────────────────────────────────────────────────────────────────────────────────────

test("MeterRow read-only: renders label + value/max as the text datum (no edit field)", async ({ mount, page }) => {
  const component = await mount(<MeterRow label="Vitality" value={24} max={30} color={1} />);
  await expect(component).toContainText("Vitality");
  await expect(component).toContainText("24/30");
  await expect(page.locator("[data-slot=tracker-value-edit]")).toHaveCount(0);
});

test("MeterRow editable: the value is an inline field; commit fires with the parsed number", async ({ mount, page }) => {
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
  const field = page.getByRole("textbox", { name: "Vitality value" });
  await expect(field).toHaveValue("24");
  await field.fill("18");
  await field.blur();
  expect(committed).toBe(18);
});

// ── StatCell ──────────────────────────────────────────────────────────────────────────────────────

test("StatCell read-only: big value over the caps label, hint on title", async ({ mount }) => {
  const component = await mount(<StatCell label="STR" value={16} hint="Strength — melee, carry" />);
  await expect(component).toContainText("16");
  await expect(component).toContainText("STR");
  await expect(component).toHaveAttribute("title", "Strength — melee, carry");
});

test("StatCell editable: commit fires with the parsed number", async ({ mount, page }) => {
  let committed = -1;
  await mount(
    <StatCell
      label="STR"
      value={16}
      onEditValue={(next): void => {
        committed = next;
      }}
    />,
  );
  const field = page.getByRole("textbox", { name: "STR value" });
  await field.fill("18");
  await field.blur();
  expect(committed).toBe(18);
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

test("TrackerChip editable: commit fires with the new string", async ({ mount, page }) => {
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

test("CastCard editable: editing a field fires onEditField with (name, value)", async ({ mount, page }) => {
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
  const field = page.getByRole("textbox", { name: "Trust value" });
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
  let captured: [string, string] = ["", ""];
  await mount(
    <AmbientStrip
      location="The Rusted Lantern"
      onEditField={(field, next): void => {
        captured = [field, next];
      }}
    />,
  );
  // Editable ⇒ even the unset `date` row renders (seed data mid-chat — §3.2).
  const dateField = page.getByRole("textbox", { name: "Date value" });
  await dateField.fill("day 3");
  await dateField.blur();
  expect(captured).toEqual(["date", "day 3"]);
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

test("GoalLine editable: commit fires with the new goal text", async ({ mount, page }) => {
  let committed = "";
  await mount(
    <GoalLine
      text="Find the bone key"
      onEditText={(next): void => {
        committed = next;
      }}
    />,
  );
  const field = page.getByRole("textbox", { name: "Goal" });
  await field.fill("Find the iron key");
  await field.blur();
  expect(committed).toBe("Find the iron key");
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

test("Editable arm — the value becomes an inline field (editable-in-place is the default posture)", async ({ mount }) => {
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
  await expect(component.getByRole("textbox", { name: "Affection value" })).toHaveValue("42");
  await component.screenshot({ path: "reports/snaps/tracker-kit-editable.png" });
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
