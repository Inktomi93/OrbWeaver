import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { ConnectionEditorRequestProbe } from "./_ct-stories.tsx";

test("the latest editor request replaces the target and clear consumes it", async ({ mount }) => {
  const first = mintTypeId(ID_PREFIX.userConnection);
  const second = mintTypeId(ID_PREFIX.userConnection);
  const probe = await mount(<ConnectionEditorRequestProbe first={first} second={second} />);
  await probe.getByRole("button", { name: "clear request" }).click();
  await expect(probe.locator("output")).toHaveText("none");
  await probe.getByRole("button", { name: "request ordinary" }).click();
  await expect(probe.locator("output")).toHaveText(`${first}:false`);
  await probe.getByRole("button", { name: "request advanced" }).click();
  await expect(probe.locator("output")).toHaveText(`${second}:true`);
  await probe.getByRole("button", { name: "clear request" }).click();
  await expect(probe.locator("output")).toHaveText("none");
});
