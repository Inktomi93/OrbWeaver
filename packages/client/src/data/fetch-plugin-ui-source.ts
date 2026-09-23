// The Tier-C guest-source GET — the ONE client seam that fetches a plugin's `ui.js` (U4,
// §4.6). Raw fetch, not tRPC, and the reason is the whole point of the route: the server serves these bytes as
// `application/octet-stream` + `nosniff` so a `<script src>` at them is MIME-refused. Over tRPC the same source
// would arrive as a JSON string with an `application/json` type and no such property, and the only thing between
// it and execution would be every future client author choosing not to. (The `upload-asset.ts` /
// `auth-session.ts` precedent: an HTTP route gets exactly one `data/` fetch fn, imported through `#data`.)
//
// A 404 is a NORMAL answer, not an error, and this function's `null` says so. The route deliberately collapses
// three distinct facts into one status — the plugin ships no `ui.js`, the plugin is not yours, the stored bundle
// no longer parses — because a caller that could tell them apart would be an existence oracle for other
// people's plugins. So the caller gets one bit and the surface stays silent (§4.9), which is the same arm as
// "the guest has not published yet".

import { PLUGIN_UI_ROUTE } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";

const NOT_FOUND = 404;

/** GET one owned plugin's `ui.js` as TEXT, or `null` when the server has none to give.
 *  `credentials: "same-origin"` because the route is owner-gated on the session cookie; a non-404 failure
 *  throws, so a caller can tell "no client half" (null) from "the request itself broke" (a rejection). */
export async function fetchPluginUiSource(pluginId: PluginId): Promise<string | null> {
  const response = await fetch(`${PLUGIN_UI_ROUTE}/${pluginId}`, { credentials: "same-origin" });
  if (response.status === NOT_FOUND) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`plugin ui source request failed (${response.status})`);
  }
  return await response.text();
}
