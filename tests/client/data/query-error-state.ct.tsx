// CT: `<QueryErrorState>` (rollup-audit C2) — the shared read-error block, and `<QueryBoundary>`'s
// default `renderError` falling back to it.
import { QueryErrorState } from "@orb/client/data";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../support/ct/route-trpc";
import { EchoBoundaryWithoutRenderErrorStory } from "./_ct-stories";

test("renders the label + a Retry that fires onRetry", async ({ mount }) => {
  let retried = 0;
  const component = await mount(
    <QueryErrorState
      label="your chats"
      onRetry={(): void => {
        retried += 1;
      }}
    />,
  );

  await expect(component.getByText("Couldn't load your chats.")).toBeVisible();
  await component.getByRole("button", { name: "Retry" }).click();
  expect(retried).toBe(1);
});

test("QueryBoundary defaults renderError to QueryErrorState when omitted", async ({
  mount,
  page,
}) => {
  let call = 0;
  const trpc = await routeTrpc(page, {
    echo: (): unknown => (call++ === 0 ? trpcError({ message: "boom" }) : { message: "recovered" }),
  });

  await mount(<EchoBoundaryWithoutRenderErrorStory />);

  await expect(page.getByText("Couldn't load this.")).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();

  await expect(page.getByText("recovered")).toBeVisible();
  expect(trpc.count("echo")).toBe(2);
});
