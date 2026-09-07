import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { AddCredentialDialogStory } from "../_ct-stories.tsx";

test("the credential key is masked by default and has an explicit reveal control", async ({ mount, page }) => {
  await routeTrpc(page, { "credentials.storageStatus": () => ({ enabled: true }) });
  await mount(<AddCredentialDialogStory />);
  const key = page.getByPlaceholder("Paste your API key");

  await expect(key).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show key" }).click();
  await expect(key).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide key" }).click();
  await expect(key).toHaveAttribute("type", "password");
});
