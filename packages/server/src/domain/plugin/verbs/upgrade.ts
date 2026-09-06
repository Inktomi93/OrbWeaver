// verb: upgrade — replace an installed plugin's bundle. Authority = OWNERSHIP (D147): the owner-scoped row
// load IS the gate (a foreign row is a leak-free NotFound); no admin any-row branch. It is a trust edge like
// install — it swaps the code a resident instance will run under the row owner's own ceiling — so the
// principal that owns the row is the only one who may swap it.
// Flow: load the owned row (leak-free NotFound) → `parseBundle` the new bytes → the new manifest's slug
// MUST match the installed slug (a bundle for a different plugin is a `ManifestInvalidError`) → REFUSE a version
// LOWER than installed (`PluginDowngradeRefusedError` — a re-uploaded old bundle must never silently roll back)
// → recompute the grant (prior grant ∩ newly-declared) → read what the OLD bundle's `ui/assets/` images were
// → store the new bundle + its images → stop the old resident instance → swap the row AND replace its
// bundle-asset links in one batch → reap the now-orphaned old bundle asset and any image this version
// dropped (#820) → land `disabled`.
//
// THE TEARDOWN IS LATE ON PURPOSE. Every fallible write happens while the OLD version is still running, so a
// failure anywhere before the swap leaves a plugin that is exactly what its row says it is — still installed,
// still resident, still enabled — and reaps the bytes the attempt wrote (the same eager reap the success path
// does, rather than leaving them to the weekly `assets-gc` sweep). The swap itself is the one remaining
// window, and its catch repairs the row to `disabled` rather than leaving an `enabled` row with no instance.
//
// Re-grant on WIDENED REACH: a manifest that declares a capability the prior grant never confirmed — OR a
// `netHosts` entry the prior manifest never declared — lands the row `disabled`, and the grant carried forward
// is the INTERSECTION (`normalizeGrant`), so the newly-declared capability is NOT granted. Re-confirming is the
// separate `setGrant` verb (`verbs/set-grant.ts`), then an explicit enable.
//
// TRUTH-REPAIR (2026-08-24): this header used to say "the owner re-enables, re-confirming", and that was a
// comment overstating a security mechanism — `setEnabled` activates with the STORED grant and never recomputes
// one, so re-enabling could not re-confirm anything and the newly-declared capability stayed ungranted forever.
// It failed CLOSED, so it was a dead-end UX rather than a hole; `setGrant` is the missing half. Do not
// re-collapse the two acts: an enable that recomputed the grant would silently widen authority on every restart.
//
// Both arms are the SAME rule, because what the owner consented to is what the plugin may REACH,
// not which capability NAMES it holds: `net.fetch` is parameterized by its exact-host allowlist, so swapping
// `api.vendor.example` for `collector.attacker.example` re-arms the egress wall at an unconfirmed destination
// while the capability set is byte-identical. Comparing capabilities alone was blind to that (P3-H).
// A strictly NARROWING change (a dropped capability or host) carries forward silently — see `widenedNetHosts`.
// WITHOUT widened reach, a plugin that was ENABLED is re-activated on the NEW bundle (the enabled state is
// preserved — only a superset forces re-confirmation).

import type { PluginCapability, PluginManifest } from "@orb/contracts/plugin";
import { errorMessage } from "@orb/kit/error-message";
import type { AssetId, PluginId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import { ManifestInvalidError, PluginDowngradeRefusedError, PluginNotFoundError } from "../contract/errors.ts";
import type { UpgradePluginParams } from "../contract/params.ts";
import type { ActivationDeps, PluginContext, PluginService } from "../contract/service.ts";
import { listPluginBundleAssets } from "../persistence/plugin-assets.ts";
import { applyUpgrade, getById, setStatus, toPluginView } from "../persistence/plugins.ts";
import { storeBundleAssets } from "../substrate/bundle-assets.ts";
import { refreshConsentPrompt } from "../substrate/consent-prompt.ts";
import { newlyDeclaredCapabilities, normalizeGrant, pendingWidenedNetHosts, widenedNetHosts } from "../substrate/grants.ts";
import { isVersionDowngrade, PLUGIN_BUNDLE_MIME, parseBundle } from "../substrate/manifest.ts";

/** The refusal the row carries OUT of this upgrade — whether one stands, and which hosts it is about. One
 *  function because they are one decision written to two columns, and splitting them is how they drift into
 *  a settled row that still carries a "New" mark (`plugins_widened_hosts_check` refuses that outright, so
 *  the drift would surface as a constraint violation rather than a lie — but it should not be reachable).
 *
 *  IT ASKS WHAT IS STILL UNANSWERED, NOT WHAT THIS UPGRADE CHANGED, and the difference is a hole. `widened`
 *  is judged against the PRIOR MANIFEST — which is whatever the last upgrade wrote, INCLUDING one the owner
 *  refused. So the obvious `pending: widened` let a plugin author erase the system's own refusal with a
 *  follow-up bundle: v2 bolts a new destination onto the allowlist (refused, recorded, row disabled), then
 *  v3 declares exactly what v2 declared and widens nothing RELATIVE TO V2 — flag gone, notice gone, status
 *  line back to a plain "Off", while `net.fetch` is still granted (the grant survives a widening upgrade by
 *  design; the CONSENT is what is pending) and the egress wall is still armed at a host nobody confirmed.
 *  Two routine-looking owner upgrades and one unremarkable toggle. Pinned by "a STANDING re-consent
 *  survives a later NON-widening upgrade".
 *
 *  It is NOT a latch either, which is the opposite error: a v3 that DROPS the refused capability or host
 *  leaves nothing to consent to, and the notice must go with it. So both halves are recomputed from the new
 *  manifest every time — `newCaps` is already `declared \ granted` (the existing rule: a capability declared
 *  but never confirmed re-prompts on every upgrade), and the host half is the accumulated unanswered set
 *  filtered to what the new manifest still declares.
 *
 *  The resulting invariant, which the client's notice is built on: `pending` ⟺ the row has an ungranted
 *  declared capability OR a non-empty host delta. A notice with nothing in it is unreachable.
 *
 *  `prior.widenedNetHosts` is read unconditionally: the CHECK guarantees a settled row's delta is empty, so
 *  re-testing the flag here would be a second copy of an invariant the database already holds. */
function refusalAfterUpgrade(
  newCaps: readonly PluginCapability[],
  prior: { readonly widenedNetHosts: readonly string[] },
  declaredHosts: readonly string[],
  priorHosts: readonly string[],
): { readonly pending: boolean; readonly hosts: readonly string[] } {
  const hosts = pendingWidenedNetHosts(declaredHosts, priorHosts, prior.widenedNetHosts);
  return { pending: newCaps.length > 0 || hosts.length > 0, hosts };
}

/** Put the row back in agreement with reality after the swap failed, and reap what the attempt wrote.
 *
 *  EVERY STEP IS BEST-EFFORT, BY CONSTRUCTION: the caller rethrows the ORIGINAL failure, and this function
 *  must not be able to replace it. The repair runs precisely when the db is in trouble, so its own write is
 *  one of the likeliest things to fail — and a repair that threw would hand the operator the wrong sentence
 *  ("the status write failed") while the event they need ("the upgrade could not be applied") disappeared.
 *  Each half is therefore attempted independently — a failed status write must not cost the reap — and each
 *  failure is LOGGED with the original beside it, which is where the operator's ownership of it lives. */
async function repairAfterFailedSwap(ctx: PluginContext, pluginId: PluginId, cause: unknown, attemptAssetIds: readonly AssetId[]): Promise<void> {
  try {
    await setStatus(ctx.db, pluginId, { status: "disabled", lastError: `upgrade failed: ${errorMessage(cause)}`, updatedAt: ctx.now() });
  } catch (repairErr) {
    getLog().error(
      { pluginId, upgradeError: errorMessage(cause), repairError: errorMessage(repairErr) },
      "plugin: upgrade FAILED and the row repair failed too — the row may still read `enabled` with no resident instance (re-enable or retry the upgrade to reconcile)",
    );
  }
  try {
    await ctx.assets.reapOrphans([...attemptAssetIds]);
  } catch (reapErr) {
    getLog().warn(
      { pluginId, upgradeError: errorMessage(cause), reapError: errorMessage(reapErr) },
      "plugin: upgrade FAILED and the attempt's assets could not be reaped — the weekly assets-gc sweep collects them",
    );
  }
}

/** The two things a REPLACEMENT bundle must be before anything is written: the same plugin (slug match — a
 *  bundle for a different plugin is not an upgrade of this one) and not older than what is installed (a
 *  re-uploaded old bundle must never silently roll a plugin back). Both refuse BEFORE the CAS is touched. */
function assertReplaces(manifest: PluginManifest, existing: { readonly slug: string; readonly version: string }): void {
  if (manifest.id !== existing.slug) {
    throw new ManifestInvalidError(`bundle slug "${manifest.id}" does not match the installed plugin "${existing.slug}"`);
  }
  if (isVersionDowngrade(manifest.version, existing.version)) {
    throw new PluginDowngradeRefusedError(manifest.version, existing.version);
  }
}

export function createUpgrade(ctx: PluginContext, deps: ActivationDeps): PluginService["upgrade"] {
  return async ({ caller, pluginId, bundle }: UpgradePluginParams) => {
    const existing = await getById(ctx.db, caller.userId, pluginId);
    if (existing === undefined) {
      throw new PluginNotFoundError(pluginId);
    }

    const { manifest, uiAssets } = parseBundle(bundle);
    assertReplaces(manifest, existing);

    const newCaps = newlyDeclaredCapabilities(manifest.capabilities, existing.grantedCapabilities);
    // The egress half of the same re-consent rule. Compared against the PRIOR MANIFEST's `netHosts` (the row's
    // persisted manifest json is the record of what was confirmed at install/last re-grant) — there is no
    // `granted_net_hosts` column: `granted_capabilities ⊆ declared` is the capability ledger, and the manifest
    // plus the row's UNANSWERED delta are the host ledger. TRUTH-REPAIR (2026-08-24): this used to say
    // activation forwards the manifest's list "verbatim" to the SSRF wall, and that was the hole rather than
    // the design — verbatim meant one `setEnabled` toggle armed `safeFetch` at a destination a standing
    // re-consent covered. Activation now forwards `declared \ withheldNetHosts` (`consentedNetHosts`), so the
    // wall carries the owner's CONFIRMED reach and never more.
    const declaredHosts = manifest.netHosts ?? [];
    const priorHosts = existing.manifest.netHosts ?? [];
    const newHosts = widenedNetHosts(declaredHosts, priorHosts);
    const granted = normalizeGrant(manifest.capabilities, existing.grantedCapabilities);
    const widened = newCaps.length > 0 || newHosts.length > 0;
    // Both halves of the recorded refusal, in one call — see `refusalAfterUpgrade` for why it asks what is
    // still UNANSWERED rather than what this upgrade changed, and why the host delta accumulates.
    const refusal = refusalAfterUpgrade(newCaps, existing, declaredHosts, priorHosts);
    // Re-activation still turns on THIS upgrade's own widening, deliberately: a plugin the owner enabled
    // while a re-consent stood (which `setEnabled` allows — enabling grants nothing) keeps the state they
    // chose across a bundle swap that asks for nothing new.
    const reactivate = existing.status === "enabled" && !widened;

    // #820 — WHAT THE OLD BUNDLE HELD, read BEFORE the swap clears the links (the `uninstall` read-before-
    // delete rule one verb over): after `applyUpgrade` the prior link rows are gone and nothing names those
    // ids. It is the reap candidate set, and it deliberately does NOT need a diff against the new set — the
    // CAS is content-addressed, so an image the new bundle still ships keeps the SAME assetId and the new
    // link row re-references it, which is exactly what `reapIfOrphan` re-checks. A dropped sprite has no
    // surviving reference and goes; an unchanged one is never touched; one another plugin also holds stays.
    const priorBundleAssetIds = (await listPluginBundleAssets(ctx.db, pluginId)).map((asset) => asset.assetId);

    // EVERY FALLIBLE WRITE RUNS BEFORE THE TEARDOWN. The stop used to come first, ahead of these two CAS
    // writes and the row swap — so any failure across that span stranded the row saying `enabled` with no
    // resident instance behind it: the plugin's tools silently gone while every surface reported it running,
    // and the owner's only repair was a toggle nobody would know to reach for. Neither of these writes can
    // touch the resident (they are CAS puts under the caller), so nothing is gained by stopping it first.
    const stored = await ctx.assets.store(caller, bundle, PLUGIN_BUNDLE_MIME);
    const now = ctx.now();
    // The NEW bundle's images into the installer's CAS — the SAME writer install uses, so the two trust
    // edges cannot drift (bytes already magic-proven at `parseBundle`, the SNIFFED mime stored, writes
    // before the row so every FK has a target).
    const bundleAssets = await storeBundleAssets(ctx.assets.store, caller, uiAssets, now);
    if (!bundleAssets.ok) {
      // Reap what THIS attempt wrote (the new zip + the images that landed before the failure) and leave the
      // installed version exactly as it was, still running. `reapIfOrphan` re-checks references per id, so an
      // asset the CURRENT version still points at — an unchanged zip dedups to the same id — is never taken.
      await ctx.assets.reapOrphans([stored.assetId, ...bundleAssets.stored]);
      throw bundleAssets.error;
    }

    // Stop the old resident instance (running the OLD code) — the last act before the swap, so the window in
    // which the row and reality can disagree is exactly the swap itself, and the catch below closes that.
    deps.deactivate(pluginId);

    try {
      await applyUpgrade(
        ctx.db,
        pluginId,
        {
          name: manifest.name,
          version: manifest.version,
          manifest,
          bundleAssetId: stored.assetId,
          grantedCapabilities: granted,
          status: "disabled",
          // RECORD THE SYSTEM'S OWN REFUSAL, here and nowhere else: this is the one moment the PRIOR manifest —
          // the only source of the "what widened" fact — still exists before being overwritten. Without the flag
          // a forced disable renders identically to the owner's own toggle-off, so the surface would present our
          // refusal as their decision. A non-widening upgrade on a SETTLED row writes `false`, which is equally
          // honest; one on a row whose refusal still stands does not get to erase it.
          pendingReconsent: refusal.pending,
          // …and WHICH HOSTS it is about, the half no read surface can reconstruct once this line overwrites the
          // manifest it was computed against. Empty in lockstep with the flag.
          widenedNetHosts: refusal.hosts,
          updatedAt: now,
        },
        bundleAssets.links,
      );
    } catch (err) {
      // THE ROW IS REPAIRED TO MATCH REALITY. The swap did not land, so the plugin is still the OLD version —
      // but its instance is gone, and a row left saying `enabled` would be a lie the surface renders as a
      // running plugin. `disabled` + the failure detail is the true sentence, and it is also the actionable
      // one: the owner can re-enable the version they still have, or retry the upgrade.
      //
      // THE REPAIR IS BEST-EFFORT AND `err` IS WHAT LEAVES. Unguarded, these two awaits swallowed the failure
      // they exist to repair: the case the repair is FOR is a db that is genuinely unavailable, in which the
      // status write rejects too — and the caller was then told the status write broke while "the upgrade
      // could not be applied" vanished, with the row still `enabled` and no instance behind it. Both halves
      // are attempted, both are logged with the original beside them, and neither can replace it.
      await repairAfterFailedSwap(ctx, pluginId, err, [stored.assetId, ...bundleAssets.links.map((link) => link.assetId)]);
      throw err;
    }
    // The old bundle asset is now unreferenced (the row points at the new asset) — reap it, and with it every
    // image the OLD bundle held (#820). `reapIfOrphan` re-checks references per id, so a within-user dedup that
    // reused the SAME asset (identical bytes — an unchanged bundle zip, or a sprite this version still ships)
    // is never reaped, and neither is one a second plugin holds. Only what this upgrade genuinely dropped goes.
    await ctx.assets.reapOrphans([existing.bundleAssetId, ...priorBundleAssetIds]);

    if (reactivate) {
      // `reactivate` only happens when THIS upgrade widened nothing — but a re-consent carried in from an
      // EARLIER one can still be standing (`refusal.hosts`, the accumulated unanswered set filtered to what
      // this manifest still declares), and those destinations stay withheld from the wall until they are
      // answered. Same rule as `setEnabled`'s, at the other activation site.
      await deps.activate({ caller, pluginId, bundleAssetId: stored.assetId, grants: granted, withheldNetHosts: refusal.hosts });
    }

    // A reach-WIDENING upgrade is the other way a plugin starts standing on its owner's answer, so it
    // brings the owner's aggregate consent ask along with it (#1041). `raised` = this row entered the
    // pending state here; an upgrade that only cleared it corrects the standing row's number in place.
    await refreshConsentPrompt(ctx, caller.userId, refusal.pending && !existing.pendingReconsent);

    const row = await getById(ctx.db, caller.userId, pluginId);
    if (row === undefined) {
      throw new PluginNotFoundError(pluginId);
    }
    return toPluginView(row, ctx.showcase.slugs);
  };
}
