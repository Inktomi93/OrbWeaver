// CT: `useOnlineStatus` (data/use-online-status) — the ONE browser-connectivity read, derived from
// TanStack's `onlineManager` (the same signal `networkMode:"online"` pauses queries on). Pins the
// live subscription: the hook flips with the context's network emulation (browser online/offline
// events), both directions. The boundary-level consumer contract (offline line while pending) is
// tested in ../components/query-boundary.ct.tsx.

import { expect, test } from "@playwright/experimental-ct-react";
import { OnlineStatusProbeStory } from "./_ct-stories.tsx";

test("tracks the browser online/offline events, both directions", async ({ mount, page, context }) => {
  await mount(<OnlineStatusProbeStory />);
  const probe = page.getByTestId("online-status");
  await expect(probe).toHaveText("online");

  await context.setOffline(true);
  await expect(probe).toHaveText("offline");

  await context.setOffline(false);
  await expect(probe).toHaveText("online");
});
