import { expect, test } from "@playwright/experimental-ct-react";
import { ChatMomentProbe } from "./_ct-stories.tsx";

test("a stale suspended completion cannot consume a newer target request", async ({ mount }) => {
  const probe = await mount(<ChatMomentProbe />);
  await probe.getByRole("button", { name: "request moment", exact: true }).click();
  await expect(probe.locator("output")).toContainText("consumed=false");
  await probe.getByRole("button", { name: "remember request" }).click();
  await probe.getByRole("button", { name: "request moment", exact: true }).click();
  await probe.getByRole("button", { name: "consume old request" }).click();
  await expect(probe.locator("output")).toContainText("consumed=false");
  await probe.getByRole("button", { name: "consume current request" }).click();
  await expect(probe.locator("output")).toContainText("consumed=true");
  await probe.getByRole("button", { name: "clear by action" }).click();
  await expect(probe.locator("output")).toHaveText("none");
  await probe.getByRole("button", { name: "open targeted room" }).click();
  await expect(probe.locator("output")).toContainText("consumed=false");
});
