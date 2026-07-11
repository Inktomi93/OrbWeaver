// CT: the router pending affordance (routes/route-pending.tsx — the P1-b "not a blank page" proof).
// While a route's `beforeLoad` auth gate (`/me`) resolves, the router paints THIS (wired as
// `defaultPendingComponent` + `defaultPendingMs: 0` in routes/router.tsx) instead of a blank document.
// The CT proves it renders a VISIBLE loading affordance with an accessible name — the guarantee the
// blank-page window is gone (the timing wiring is a router-config fact, asserted by review + the running
// stack; this pins that the component itself is a real, labeled, non-empty loading mark).

import { expect, test } from "@playwright/experimental-ct-react";
import { RoutePending } from "../../../packages/client/src/routes/route-pending";

test("renders a visible, accessibly-named loading mark (never a blank page)", async ({
  mount,
  page,
}) => {
  await mount(<RoutePending />);
  await expect(page.getByRole("status", { name: "Loading" })).toBeVisible();
});
