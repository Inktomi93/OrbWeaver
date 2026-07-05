// Route CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The `/` route
// (HomePage) is the app's central navigation seam; it comes in via a relative path into the package
// (a route has no front-door subpath) and is wrapped in the real data layer (<CtDataProviders> — Query
// + real tRPC over the routeTrpc-stubbed network). HomePage itself owns the shell + active-chat + all
// four regions, so the story is just the provider wrap.

import type { ReactElement } from "react";
import { HomePage } from "../../../packages/client/src/routes/home-page";
import { CtDataProviders } from "../../support/ct/ct-data-providers";

/** The whole `/` home inside the real client data layer — the composed shell + active-chat seam. */
export function HomePageStory(): ReactElement {
  return (
    <CtDataProviders>
      <HomePage />
    </CtDataProviders>
  );
}
