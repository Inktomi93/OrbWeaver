// verb: upgradeFromShowcase — the one-click upgrade for a SEEDED SHOWCASE install (#1740), the twin of
// `upgrade-from-stored-url.ts` with the bundled copy as the byte source instead of a remembered URL. Everything
// that makes an upgrade safe is UNCHANGED because the bytes go through the SAME `upgrade` verb: #615's wall
// lands the row DISABLED pending re-consent whenever the new bundle WIDENS reach, carries a strict narrowing
// forward silently, and keeps the grant at prior ∩ newly-declared. There is no second install path and no
// second consent story here — this file only decides WHICH bytes and WHOSE row.
//
// WHY IT EXISTS. The boot seeder auto-upgrades a PRISTINE seeded install and deliberately passes over a
// DIVERGED one — a row whose version is no longer what we last wrote has been taken over by its owner
// (`entry/boot/seed-example-plugins.ts`, the divergence oracle `verbs/uninstall-for-all-users.ts` minted). That
// refusal is right and stays: this verb does not weaken it, it answers the question the refusal LEFT OPEN —
// how the owner takes a newer shipped bundle ON PURPOSE. Automatic stays automatic-only-for-pristine; this is
// an explicit act, initiated by the person who took the plugin over, exactly like the url one-click.
//
// OWNER-SCOPED PRE-CHECK BEFORE ANY PACK — the security ordering the cross-tenant sweep probes, identical to
// its stored-url twin. The owned row is loaded first (`getById(ctx.db, caller.userId, pluginId)`); a
// foreign/missing id is a leak-free `PluginNotFoundError` (NOT_FOUND) thrown BEFORE `ctx.showcase.bundle` is
// ever asked, so a stranger holding another user's real pluginId learns nothing — not even whether that row is
// one of the examples. A plugin this build ships no bundle for (a hand upload, or a slug the shipped set
// dropped) is a typed `PluginNotShowcaseError` (BAD_REQUEST — "upload a new bundle instead"), thrown AFTER the
// owner load. `upgrade` re-loads + re-checks ownership/slug/downgrade itself (TOCTOU + defense in depth), which
// is also what refuses a shipped bundle that is OLDER than the installed row.

import { PluginNotFoundError, PluginNotShowcaseError } from "../contract/errors.ts";
import type { UpgradeFromShowcaseParams } from "../contract/params.ts";
import type { PluginContext, PluginService } from "../contract/service.ts";
import { getById } from "../persistence/plugins.ts";

export function createUpgradeFromShowcase(ctx: PluginContext, deps: { readonly upgrade: PluginService["upgrade"] }): PluginService["upgradeFromShowcase"] {
  return async ({ caller, pluginId }: UpgradeFromShowcaseParams) => {
    const existing = await getById(ctx.db, caller.userId, pluginId);
    if (existing === undefined) {
      throw new PluginNotFoundError(pluginId);
    }
    // The SLUG is the identity a shipped bundle is looked up by — the manifest `id` the install funnel recorded,
    // never anything the caller supplied. A url-origin row is refused here even when its slug collides with a
    // shipped one: that plugin is the owner's own choice of source (`toPluginView` reads it as `updateSource:
    // "url"` for the same reason), and swapping our copy under it would be the takeover this domain refuses.
    const bundle = existing.sourceUrl === null ? await ctx.showcase.bundle(existing.slug) : null;
    if (bundle === null) {
      throw new PluginNotShowcaseError(pluginId);
    }
    return deps.upgrade({ caller, pluginId, bundle });
  };
}
