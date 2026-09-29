// CT: a saved connection whose provider is absent stays identifiable, editable and removable while every
// provider-backed list action is unavailable. The badge and disabled switch state the reason at the row.

import { expect, test } from "@playwright/experimental-ct-react";
import { connectionRow, openRowMenu, stubConnectionsPane } from "../_connection-fixtures.ts";
import { ConnectionsAuthoringStory } from "../_ct-stories.tsx";

const ROW_NAME = "Legacy relay · claude-opus-5";

test("an unavailable-provider row stays operable while provider-backed actions are disabled", async ({ mount, page }) => {
  const row = connectionRow({
    label: "Legacy relay",
    providerId: "plugin:relay/anthropic",
    providerLabel: "plugin:relay/anthropic",
    model: "anthropic/claude-opus-5",
    tasks: [],
    allowBackground: true,
  });
  await stubConnectionsPane(page, { connections: [row], providers: [] });
  const component = await mount(<ConnectionsAuthoringStory width={870} />);

  await expect(component.getByText("Provider unavailable", { exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: ROW_NAME, exact: true })).toBeEnabled();
  await expect(
    component.getByRole("switch", {
      name: `Allow background work unavailable on ${ROW_NAME} because its provider is unavailable`,
    }),
  ).toBeDisabled();

  await openRowMenu(page, ROW_NAME);
  const remove = page.getByRole("menuitem", { name: "Remove", exact: true });
  await expect(remove).toBeEnabled();
  await expect(page.getByRole("menuitem", { name: /Use this connection for everything it can serve/u })).toHaveCount(0);
  await expect(page.getByText(/Sets\s+to this connection/u)).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: /Add another model/u })).toHaveCount(0);
  await remove.click();
  await expect(page.getByRole("alertdialog", { name: 'Remove "Legacy relay"?' })).toBeVisible();
});
