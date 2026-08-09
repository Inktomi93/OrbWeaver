// CT: the Structured-output admin SECTION (D126) — the section's own READ + WRITE proof (SET-SEAMS: a section
// ships both). The knob is an immediate-write enum, so what is worth pinning is: it MOUNTS on the resolved
// shape, picking the strict arm patches EXACTLY that key (nothing else in the one-object app tier), and Reset
// clears it back to the floor with the `null` sentinel rather than writing a second value.
//
// The picked LABEL is asserted, not the wire literal: this row exists so a human mid-incident can tell the two
// shapes apart, so the copy IS the affordance.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { StructuredOutputSectionStory } from "../_ct-stories.tsx";

const UPDATE_PROC = "settings.updateAppSettings";
const RESOLVED = { structuredOutputShape: "as-projected", structuredOutputVehicle: "auto" };
const AS_PROJECTED_LABEL = "As projected";
const STRICT_LABEL = "Strict-compatible";
/** The always-visible teaching paragraph — the section's reason for existing, in the copy an admin reads. */
const TEACHING_COPY = /Switch to Strict-compatible when a provider REJECTS our schema/;
/** The VEHICLE row's own always-visible teaching (task #36) — same rule, second axis. */
const VEHICLE_TEACHING_COPY = /Automatic sends the enforced schema/;

function stub(page: Page, resolved: Record<string, unknown> = RESOLVED, overrides: Record<string, unknown> = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getAppSettingsWithOverrides": () => ({ resolved, overrides }),
    [UPDATE_PROC]: () => resolved,
  });
}

function lastPartial(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  return (trpc.lastInput(UPDATE_PROC) as { partial?: Record<string, unknown> } | undefined)?.partial;
}

test("mounts on the resolved shape, names the deployment default, stamps its anchor, and offers no dead Save", async ({ mount, page }) => {
  await stub(page);
  await mount(<StructuredOutputSectionStory />);

  await expect(page.getByRole("combobox", { name: "JSON-Schema shape" })).toContainText(AS_PROJECTED_LABEL);
  await expect(page.getByText(`Using the deployment default: ${AS_PROJECTED_LABEL}.`)).toBeVisible();
  await expect(page.locator("#settings-anchor-admin-structured-output")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);

  // RENDERED, not just present: the `Select` trigger is a fixed 200px, and the first draft of these labels
  // ("As projected — optional fields stay optional") ellipsed inside it — the selected value, the one thing
  // the control must show, was unreadable. Assert the value fits instead of trusting the string.
  const fit = await page.evaluate(() => {
    const el = document.querySelector('[data-slot="select-value"]');
    return el === null ? null : { scrollW: el.scrollWidth, clientW: el.clientWidth };
  });
  expect(fit).not.toBeNull();
  expect(fit?.scrollW).toBeLessThanOrEqual(fit?.clientW ?? 0);
});

test("the section TEACHES the wall it exists for, VISIBLY — not behind a hover tooltip", async ({ mount, page }) => {
  await stub(page);
  await mount(<StructuredOutputSectionStory />);

  // The knob is unreadable without this: an admin only ever reaches for it because a provider refused a
  // request. The copy names the SYMPTOM + the cost, and it must be readable without hovering anything
  // (`SettingRow`'s `hint` is hover-only chrome — a keyboard/touch reader would never see it).
  const teaching = page.getByText(TEACHING_COPY);
  await expect(teaching).toBeVisible();
  await expect(teaching).toContainText("too many optional fields");
  await expect(teaching).toContainText("small local models handle worse");
});

test("picking the strict shape patches EXACTLY that key", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<StructuredOutputSectionStory />);

  await page.getByRole("combobox", { name: "JSON-Schema shape" }).click();
  await page.getByRole("option", { name: STRICT_LABEL }).click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ structuredOutputShape: "strict-compatible" });
});

test("an active override reads back as the picked shape, and Reset clears it with the null sentinel", async ({ mount, page }) => {
  const trpc = await stub(
    page,
    { structuredOutputShape: "strict-compatible", structuredOutputVehicle: "auto" },
    { structuredOutputShape: "strict-compatible" },
  );
  await mount(<StructuredOutputSectionStory />);

  await expect(page.getByRole("combobox", { name: "JSON-Schema shape" })).toContainText(STRICT_LABEL);
  // Overridden ⇒ the row stops naming a default (the resolved read is floor ⊕ override, so the floor is not
  // recoverable client-side) and points at Reset instead — SET-SEAMS §4.
  await expect(page.getByText("Overridden. Reset to fall back to this deployment's default.")).toBeVisible();

  await page.getByRole("button", { name: "Reset to defaults" }).click();
  // `null` is the CLEAR sentinel — writing "as-projected" back would store a second override, not clear one.
  // Reset clears EVERY key this section owns (both structured-output axes, task #36): a row that resets only
  // half of what it owns leaves an override the admin just told it to drop.
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ structuredOutputShape: null, structuredOutputVehicle: null });
});

// The VEHICLE axis (task #36) — the second knob in this section. It must move INDEPENDENTLY of the shape:
// the pairing the live probe found servable is strict shape + enforced delivery, and an admin who moves one
// while a provider changes its mind about the other needs them separable.
test("picking a delivery vehicle patches EXACTLY that key, leaving the shape alone", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<StructuredOutputSectionStory />);

  await expect(page.getByRole("combobox", { name: "Schema delivery" })).toContainText("Automatic");
  await page.getByRole("combobox", { name: "Schema delivery" }).click();
  await page.getByRole("option", { name: "Enforced schema" }).click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ structuredOutputVehicle: "response-format" });
});

test("the delivery row TEACHES what each arm costs, visibly", async ({ mount, page }) => {
  await stub(page);
  await mount(<StructuredOutputSectionStory />);

  const teaching = page.getByText(VEHICLE_TEACHING_COPY);
  await expect(teaching).toBeVisible();
  await expect(teaching).toContainText("fails loudly");
});
