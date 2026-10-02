// Independent live readers model the finder, desktop band and phone title without duplicating the store.
import { expect, test } from "@playwright/experimental-ct-react";
import { ExtensionsSearchProbe } from "./_ct-stories.tsx";

test("query replacement and clear reach every reader, survive remount, and leave other finders alone", async ({ mount }) => {
  const probe = await mount(<ExtensionsSearchProbe />);
  const query = probe.getByRole("textbox", { name: "Extensions query", exact: true });
  const preset = probe.getByRole("textbox", { name: "Preset query", exact: true });
  const first = probe.getByRole("status", { name: "First extensions reader", exact: true });
  const second = probe.getByRole("status", { name: "Second extensions reader", exact: true });
  await preset.fill("preset-only");
  await query.fill("  oracle  ");
  await expect(query).toHaveValue("  oracle  ");
  await expect(first).toHaveText("  oracle  ");
  await expect(second).toHaveText("  oracle  ");
  await probe.getByRole("button", { name: "Toggle sibling reader", exact: true }).click();
  await expect(second).toHaveCount(0);
  await query.fill("chips");
  await expect(first).toHaveText("chips");
  await probe.getByRole("button", { name: "Toggle sibling reader", exact: true }).click();
  await expect(second).toHaveText("chips");
  await expect(preset).toHaveValue("preset-only");
  await probe.getByRole("button", { name: "Clear extensions query", exact: true }).click();
  await expect(query).toHaveValue("");
  await expect(first).toHaveText("");
  await expect(second).toHaveText("");
  await expect(preset).toHaveValue("preset-only");
  await preset.fill("changed-preset");
  await expect(query).toHaveValue("");
  await query.fill("new search");
  await expect(first).toHaveText("new search");
  await expect(second).toHaveText("new search");
  await expect(preset).toHaveValue("changed-preset");
});
