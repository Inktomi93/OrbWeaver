import type { AppearanceSettings } from "@orb/contracts/settings";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { CHAT_AND_INBOX_READS_EMPTY } from "@orb/testkit/node/chat-and-inbox-reads-empty.ts";
import { routeTrpc } from "@orb/testkit/node/route-trpc.ts";
import { userSettingsView } from "@orb/testkit/node/user-settings-view.ts";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { AppearanceCarrierObservable } from "#client/lib/appearance-carrier-manifest.ts";
import { APPEARANCE_CARRIER_OBSERVABLES } from "#client/lib/appearance-carrier-manifest.ts";
import { AppearanceCarrierStory } from "../features/app-shell/_ct-stories.tsx";
import type { AppearanceCarrierSnapshot } from "./appearance-carrier-matrix.fixtures.ts";
import { appearanceSettingsForCarrierArm, compareAppearanceCarrierArms } from "./appearance-carrier-matrix.fixtures.ts";

function readCarrierSnapshot(page: Page): Promise<Partial<AppearanceCarrierSnapshot>> {
  return page.evaluate((observables): Partial<AppearanceCarrierSnapshot> => {
    const read = (observable: AppearanceCarrierObservable): { readonly found: boolean; readonly value: unknown } => {
      const selector = observable.kind === "message-prop" ? 'section[aria-label="CT Appearance hook snapshot"]' : observable.selector;
      const element = document.querySelector<HTMLElement>(selector);
      if (element === null) {
        return { found: false, value: undefined };
      }
      if (observable.kind === "attribute") {
        return { found: true, value: element.getAttribute(observable.signal) };
      }
      if (observable.kind === "inline-style") {
        return { found: true, value: element.style.getPropertyValue(observable.signal) };
      }
      const payload = JSON.parse(element.textContent ?? "{}") as Record<string, unknown>;
      return {
        found: true,
        value: observable.signal
          .split(".")
          .reduce<unknown>(
            (current, part) => (typeof current === "object" && current !== null ? (current as Record<string, unknown>)[part] : undefined),
            payload,
          ),
      };
    };
    const snapshot: Partial<AppearanceCarrierSnapshot> = {};
    for (const [key, observable] of Object.entries(observables) as [keyof AppearanceCarrierSnapshot, AppearanceCarrierObservable][]) {
      const observed = read(observable);
      if (!observed.found) {
        continue;
      }
      if (observed.value !== undefined) {
        snapshot[key] = observable.kind === "message-prop" ? JSON.stringify(observed.value) : (observed.value as string);
      }
    }
    return snapshot;
  }, APPEARANCE_CARRIER_OBSERVABLES);
}

async function routeAppearance(page: Page, appearance: AppearanceSettings, arm: string): Promise<void> {
  // `chat.listChats`/`notifications.list` are fed here too (#1817 — the #1797 whole-tree census): the
  // mounted `AppShell` reads both beyond the appearance carrier this test actually measures, and left on
  // routeTrpc's null fulfil the pipelines behind them ran INERT.
  await routeTrpc(page, {
    "persona.list": [],
    "plugin.listCommands": [],
    "settings.getUserSettings": userSettingsView({ appearance }, { userId: castId<UserId>(`user_ct_appearance_carrier_${arm}`) }),
    ...CHAT_AND_INBOX_READS_EMPTY,
  });
}

test("#935 every armed appearance key changes its declared real carrier across the generated two-arm matrix", async ({ mount, page }) => {
  const captureArm = async (appearance: AppearanceSettings, arm: string): Promise<Partial<AppearanceCarrierSnapshot>> => {
    await routeAppearance(page, appearance, arm);
    const component = await mount(<AppearanceCarrierStory />);
    // Barrier on the settings having landed. `avatarSize` alone is vacuous for arm B (its value is the schema
    // default, so it matches before the query answers); `chatStyle` is non-default on B, so the pair holds for both arms.
    await expect
      .poll(async () => JSON.parse((await page.getByRole("region", { name: "CT Appearance hook snapshot" }).textContent()) ?? "{}") as Record<string, unknown>)
      .toMatchObject({ avatarSize: appearance.avatarSize, chatStyle: appearance.chatStyle });
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
