// The Config DEEP-LINK grammar (#866 row-chrome leg) — ONE mint for both
// directions: the row menu's "Copy link" FORMATS `/config?to=<group>[.<sub>[.<setting>]]`, and the
// `/$section` alias route PARSES the `to` param, applies it through `openConfigTo`, and redirects to `/`
// exactly as the alias already does for a bare section — the "URL stays pinned at `/`" ruling is
// preserved: a link APPLIES state and lands home, the address bar never holds it. The dotted spelling is
// the `openConfigTo(group, sub?, setting?)` address vocabulary verbatim (never the wire key — a wire key
// is a write detail, not an address).
//
// Homed in `#state` beside the vocabulary it validates (`CONFIG_GROUP_IDS`): the router (a `#routes`
// module) and the row menu (`#components`) both import DOWN to here, and neither can mint a second
// spelling.

import type { ConfigGroupId } from "./config-group-ids.ts";
import { isConfigGroupId } from "./config-group-ids.ts";

/** A parsed `to` target. `sub`/`setting` are undefined exactly where the link omitted them. */
export interface ConfigLinkTarget {
  readonly group: ConfigGroupId;
  readonly sub?: string;
  readonly setting?: string;
}

/** Format the copyable PATH (`/config?to=…`) for a leaf/section/group address. The caller prefixes the
 *  origin — a relative path is what tests and the clipboard verb compose over. */
export function formatConfigLink(group: ConfigGroupId, sub?: string, setting?: string): string {
  const parts = [group, sub, setting].filter((part): part is string => part !== undefined);
  return `/config?to=${encodeURIComponent(parts.join("."))}`;
}

/** Parse a `to` param back into a target, or `null` for anything that does not name a real group —
 *  a garbled link still lands on the Config section (the alias's own graceful arm), never a crash. */
export function parseConfigLink(to: string): ConfigLinkTarget | null {
  const [group, sub, setting, ...rest] = to.split(".");
  if (group === undefined || rest.length > 0 || !isConfigGroupId(group)) {
    return null;
  }
  return { group, ...(sub === undefined || sub === "" ? {} : { sub }), ...(setting === undefined || setting === "" ? {} : { setting }) };
}
