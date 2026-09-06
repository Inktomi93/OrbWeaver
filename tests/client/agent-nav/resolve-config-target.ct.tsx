// CT: `__orb.nav.openConfig`'s #1638 registry-backed validation, driven in a REAL browser (the node unit
// suite in `index.test.ts` + `resolve-config-target.test.ts` proves the dispatch/refusal logic against a
// fake registry; this proves the same arm survives real module evaluation — `createContributorRegistry`,
// the real `openConfigTo` store action — in the browser tier, the split `panel-request.ct.tsx` states for
// its own arm).

import { expect, test } from "@playwright/experimental-ct-react";
import { ConfigTargetStory } from "./_ct-stories.tsx";

test("openConfig() lands a real sub+setting against an injected registry", async ({ mount }) => {
  const component = await mount(<ConfigTargetStory />);
  await component.getByRole("button", { name: "open the real leaf" }).click();
  await expect(component.getByTestId("config-target-verdict")).toHaveText("ok");
});

test("openConfig() refuses an unknown sub against an injected registry, naming the real one", async ({ mount }) => {
  const component = await mount(<ConfigTargetStory />);
  await component.getByRole("button", { name: "open an unknown sub" }).click();
  const verdict = component.getByTestId("config-target-verdict");
  await expect(verdict).toContainText("bogus-sub");
  await expect(verdict).toContainText("sizing");
});

test("openConfig() refuses an unknown setting against an injected registry, naming the real one", async ({ mount }) => {
  const component = await mount(<ConfigTargetStory />);
  await component.getByRole("button", { name: "open an unknown setting" }).click();
  const verdict = component.getByTestId("config-target-verdict");
  await expect(verdict).toContainText("bogus-setting");
  await expect(verdict).toContainText("chat-width");
});
