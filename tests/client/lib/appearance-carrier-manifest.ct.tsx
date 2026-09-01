import type { AppearanceSettings } from "@orb/contracts/settings";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { AppearanceCarrierObservable } from "../../../packages/client/src/lib/appearance-carrier-manifest.ts";
import { APPEARANCE_CARRIER_OBSERVABLES } from "../../../packages/client/src/lib/appearance-carrier-manifest.ts";
import { routeTrpc } from "../../support/ct/route-trpc.ts";
import { AppearanceCarrierStory } from "../features/app-shell/_ct-stories.tsx";
import type { AppearanceCarrierSnapshot } from "./appearance-carrier-matrix.ts";
import { appearanceSettingsForCarrierArm, compareAppearanceCarrierArms } from "./appearance-carrier-matrix.ts";

function readCarrierSnapshot(page: Page): Promise<Partial<AppearanceCarrierSnapshot>> {
  return page.evaluate((observables): Partial<AppearanceCarrierSnapshot> => {
    const snapshot: Partial<AppearanceCarrierSnapshot> = {};
    for (const [key, observable] of Object.entries(observables) as [keyof AppearanceCarrierSnapshot, AppearanceCarrierObservable][]) {
      const element = document.querySelector<HTMLElement>(observable.selector);
      if (element === null) {
        continue;
      }
      if (observable.kind === "attribute") {
        snapshot[key] = element.getAttribute(observable.signal);
        continue;
      }
      if (observable.kind === "inline-style") {
        snapshot[key] = element.style.getPropertyValue(observable.signal);
        continue;
      }
      const payload = JSON.parse(element.textContent ?? "{}") as Record<string, unknown>;
      const value = observable.signal
        .split(".")
        .reduce<unknown>(
          (current, part) => (typeof current === "object" && current !== null ? (current as Record<string, unknown>)[part] : undefined),
          payload,
        );
      if (value !== undefined) {
        snapshot[key] = JSON.stringify(value);
      }
    }
    return snapshot;
  }, APPEARANCE_CARRIER_OBSERVABLES);
}

async function routeAppearance(page: Page, appearance: AppearanceSettings, arm: string): Promise<void> {
  await routeTrpc(page, {
    "persona.list": [],
    "settings.getUserSettings": {
      userId: `user_ct_appearance_carrier_${arm}`,
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, appearance },
      updatedAt: 0,
    },
  });
}

test("#935 every armed appearance key changes its declared real carrier across the generated two-arm matrix", async ({ mount, page }) => {
  const captureArm = async (appearance: AppearanceSettings, arm: string): Promise<Partial<AppearanceCarrierSnapshot>> => {
    await routeAppearance(page, appearance, arm);
    const component = await mount(<AppearanceCarrierStory />);
    await expect
      .poll(async () => JSON.parse((await page.getByTestId("appearance-message-carrier").textContent()) ?? "{}") as Record<string, unknown>)
      .toMatchObject({ avatarSize: appearance.avatarSize });
    const snapshot = await readCarrierSnapshot(page);
    await component.unmount();
    return snapshot;
  };

  // The treatment rows need a live image on both sides; backgroundImageKind gets its own pair so its
  // none→seeded carrier remains independently observable instead of making fit/dim/blur disappear.
  const armA = await captureArm(appearanceSettingsForCarrierArm(0), "a");
  const armB = await captureArm(appearanceSettingsForCarrierArm(1), "b");
  const kindA = await captureArm(appearanceSettingsForCarrierArm(0, true), "kind-a");
  const kindB = await captureArm(appearanceSettingsForCarrierArm(1, true), "kind-b");
  const kindAValue = kindA.backgroundImageKind;
  const kindBValue = kindB.backgroundImageKind;
  if (kindAValue === undefined || kindBValue === undefined) {
    throw new Error("backgroundImageKind carrier was not observable in both dedicated arms");
  }
  armA.backgroundImageKind = kindAValue;
  armB.backgroundImageKind = kindBValue;

  const verdict = compareAppearanceCarrierArms(armA, armB);
  expect(verdict.expected, "the executable matrix population must never silently shrink").toBe(36);
  expect(verdict.compared, `missing carrier observations: ${verdict.findings.join("; ")}`).toBe(verdict.expected);
  expect(verdict.findings).toEqual([]);
});
