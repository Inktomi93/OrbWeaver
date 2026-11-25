// domain/plugin/substrate/grants — the grant subset math, pure and Principal-free. The manifest
// DECLARES a capability set; the installing owner CONFIRMS a subset (`granted_capabilities`); every host
// function enforces its capability per call against that confirmed subset. Two invariants live here as pure
// predicates the verbs enforce (throwing the typed errors): a grant must be ⊆ the declared set (install /
// upgrade / setGrant), and an upgrade that DECLARES a capability the prior grant never confirmed must land
// `disabled` for re-confirmation ("upgrade with a superset → disabled until re-granted"). The RE-GRANT itself is
// `verbs/set-grant.ts` — which also reuses {@link widenedNetHosts} as its acknowledgement check, so "what counts
// as a new destination" has exactly one definition across the upgrade trigger and the consent act.
//
// WHAT THE OWNER ACTUALLY CONSENTED TO IS *REACH*, NOT A LIST OF CAPABILITY NAMES (02 §2, read honestly).
// `net.fetch` is the one capability whose reach is parameterized by the manifest — the exact-host `netHosts`
// allowlist IS the wall, and the whole point of an exact-host allowlist is that the owner approved THOSE hosts.
// So the re-grant trigger is any widening of DECLARED REACH: a new capability, OR a new host. An upgrade that
// keeps `net.fetch` but swaps `api.vendor.example` for `collector.attacker.example` re-arms the egress wall at a
// destination nobody confirmed, and comparing capability sets alone cannot see it.
//
// `netHosts` is not the only manifest field whose reach activation reads with the grant unchanged. `providers` adds
// rows to the owner's connection choices, and `matchAutomationEvents` lets already-granted event handlers receive
// automation-caused facts. {@link manifestWidening} is the one home of the field set an upgrade compares; the
// upgrade verb and any upgrade preview read it, so the two cannot disagree about what widens.

import type { ProviderDef, ProviderId } from "@orb/contracts/inference";
import type { PluginCapability, PluginManifest, PluginReachWidening } from "@orb/contracts/plugin";
import type { UnansweredReach } from "../contract/service.ts";

/** The capabilities in `requested` that the manifest does NOT declare — a non-empty result is an invalid
 *  grant (the verb throws `CapabilityNotGrantedError`). De-duplicated, `requested`-ordered. */
export function ungrantableCapabilities(declared: readonly PluginCapability[], requested: readonly PluginCapability[]): PluginCapability[] {
  const declaredSet = new Set(declared);
  return [...new Set(requested)].filter((cap) => !declaredSet.has(cap));
}

/** A valid grant (⊆ declared) as a de-duplicated, declaration-ordered subset — the value stored in
 *  `granted_capabilities`. Caller MUST have already checked {@link ungrantableCapabilities} is empty. */
export function normalizeGrant(declared: readonly PluginCapability[], requested: readonly PluginCapability[]): PluginCapability[] {
  const requestedSet = new Set(requested);
  return declared.filter((cap) => requestedSet.has(cap));
}

// The capabilities a re-uploaded manifest DECLARES that the prior grant never confirmed. Non-empty means the upgrade
// lands `disabled` pending re-grant; empty means the prior grant carries forward.
function newlyDeclaredCapabilities(newlyDeclared: readonly PluginCapability[], priorGranted: readonly PluginCapability[]): PluginCapability[] {
  const grantedSet = new Set(priorGranted);
  return [...new Set(newlyDeclared)].filter((cap) => !grantedSet.has(cap));
}

/** Fold a declared `netHosts` entry to the form the ENFORCER compares. **Coupled site: `hostAllowed` in
 *  `infra/network/egress.ts`.** It lowercases each allowlist entry and matches it against an already-lowercased
 *  request host, so `API.Vendor.example` and `api.vendor.example` are the SAME reach and a case-only edit must
 *  NOT cost the owner a re-consent (alarm fatigue is how a re-consent prompt stops being read).
 *
 *  It deliberately does NOT strip a trailing dot, because `hostAllowed` does not either: an `example.com.` entry
 *  matches nothing and is a silent fail-closed dud. So `example.com.` → `example.com` IS a widening (a dud
 *  becomes live) and correctly triggers re-consent. The converse (`example.com` → `example.com.`) reaches LESS
 *  yet still triggers, because this fold is a string identity beyond case and does not re-model the enforcer's
 *  dud rule in a second place that would have to track it — one spurious prompt on a spelling nobody writes, and
 *  fail-SAFE is the only direction a consent gate may err in. If `hostAllowed` ever normalizes the trailing dot,
 *  this folding must follow it. */
function foldNetHost(host: string): string {
  return host.toLowerCase();
}

/** The `netHosts` a re-uploaded manifest declares that the PRIOR manifest did not — i.e. destinations the
 *  installing owner never confirmed. Non-empty ⇒ the upgrade lands `disabled` pending re-confirmation, exactly
 *  like a new capability. De-duplicated, `newlyDeclared`-ordered (spelled as declared, so the owner sees the
 *  string the manifest actually carries).
 *
 *  ASYMMETRIC BY DESIGN — a STRICTLY NARROWING change (a host dropped, or `net.fetch` removed whole) does NOT
 *  trigger. Consent to reach A and B already covers reaching only A: nothing the owner refused becomes
 *  reachable, so there is nothing to re-confirm. It is also the same asymmetry capabilities already have
 *  (`normalizeGrant` silently narrows a dropped capability out of the grant), and the opposite rule would punish
 *  exactly the hygiene we want from plugin authors — knocking every install offline for removing a host they no
 *  longer call is how authors learn to never shrink an allowlist. */
export function widenedNetHosts(newlyDeclared: readonly string[], priorDeclared: readonly string[]): string[] {
  const priorSet = new Set(priorDeclared.map(foldNetHost));
  const seen = new Set<string>();
  return newlyDeclared.filter((host) => {
    const folded = foldNetHost(host);
    if (priorSet.has(folded) || seen.has(folded)) {
      return false;
    }
    seen.add(folded);
    return true;
  });
}

/** The declared hosts an activation may actually ARM THE EGRESS WALL AT: everything the manifest declares
 *  MINUS the destinations the owner has never answered for. Host identity is {@link foldNetHost}, the one fold
 *  the enforcer and the re-consent trigger already share, so "the same host" means the same thing here as it
 *  does in `hostAllowed`.
 *
 *  WHY THIS EXISTS (the hole it closes). `setEnabled` deliberately grants nothing and activates on
 *  the STORED grant — and for capability NAMES that is airtight, because an unconfirmed capability was never
 *  written into `granted_capabilities`. It was NOT airtight for `net.fetch`, whose reach is parameterized by
 *  the manifest rather than by the grant: a v2 that keeps `net.fetch` and merely bolts a destination onto
 *  `netHosts` lands `disabled` + `pending_reconsent` with the grant INTACT, and activation forwarded the NEW
 *  manifest's list verbatim — so one toggle of a switch the surface leaves live armed `safeFetch` at a host
 *  nobody confirmed, while the row still said "asked for more than you allowed". That is the exact host-swap
 *  asymmetry `widenedNetHosts` was minted for, one tier further down: consent is about REACH, so REACH is what
 *  an unanswered re-consent has to withhold. Withholding (rather than refusing the enable) keeps the two owner
 *  decisions separate — "you may have these powers" and "run" — and keeps the partial-consent path from
 *  collapsing into "grant everything or never run it again".
 *
 *  `unanswered` is the CALLER's fact, not this function's: each activation site knows precisely which
 *  destinations are still unconfirmed at the moment it activates (see the three call sites), and the row's
 *  persisted delta is a DISPLAY record that a covering acknowledgement deliberately outlives. */
export function consentedNetHosts(declared: readonly string[], unanswered: readonly string[]): string[] {
  const withheld = new Set(unanswered.map(foldNetHost));
  return declared.filter((host) => !withheld.has(foldNetHost(host)));
}

/** The hosts an UNANSWERED re-consent covers — what the notice marks "New" — persisted on the row
 *  (`plugins.widened_net_hosts`) because the comparison that produces it is only possible at the instant of
 *  upgrade, before the prior manifest is overwritten.
 *
 *  IT ACCUMULATES, and that is the whole reason it is not just {@link widenedNetHosts}. `widenedNetHosts`
 *  answers "what did THIS upgrade add", which is the right trigger question and the wrong display question:
 *  ship v2 adding host X (refused, recorded), then ship v3 adding host Y, and v3 widens only Y relative to
 *  v2's manifest — so a replace would leave X rendering unmarked beside the marked Y, which on a consent
 *  surface reads as "X was carried forward, you already allowed it". X was never allowed. So the answer is
 *  the UNION of this upgrade's widening and any earlier widening the owner never resolved (`carriedPending`,
 *  passed by the verb only while `pending_reconsent` still stands).
 *
 *  Result spelling and order are the NEW manifest's own, de-duplicated — a mark has to match the string the
 *  screen renders, and the screen renders `manifest.netHosts`. A carried host the new manifest DROPPED is
 *  absent by construction (it is filtered out of `newlyDeclared`): it is no longer reachable, so there is
 *  nothing left to consent to. Host identity is {@link foldNetHost}, the one fold the enforcer and the
 *  re-consent trigger already share — the client never re-implements it, because the persisted delta is a
 *  literal subset of the same array the client renders. */
function pendingWidenedNetHosts(newlyDeclared: readonly string[], widened: readonly string[], carriedPending: readonly string[]): string[] {
  const unanswered = new Set([...widened, ...carriedPending].map(foldNetHost));
  const seen = new Set<string>();
  return newlyDeclared.filter((host) => {
    const folded = foldNetHost(host);
    if (seen.has(folded) || !unanswered.has(folded)) {
      return false;
    }
    seen.add(folded);
    return true;
  });
}

/** The reach a settled row withholds: nothing. */
export const NO_UNANSWERED_REACH: UnansweredReach = { netHosts: [], providerIds: [], changedProviderIds: [], matchAutomationEvents: false };

/** Provider ids `next` declares with a definition `prior` did not, in `next` order: a new id, or a known id whose
 *  definition changed. The owner approved the definition they were shown, and the connection domain's per-owner claim
 *  refuses a changed one only once an activation has claimed the id, so an approved id no activation claimed would
 *  otherwise carry a new base URL, models or kind with no re-consent. Definition identity is the one that claim
 *  hashes: the serialized row, which both manifests produce through the same schema parse, so key order is fixed.
 *  `changed` is the part of `ids` whose id `prior` declared: this is the one moment the two definitions are both known. */
function widenedProviders(next: readonly ProviderDef[], prior: readonly ProviderDef[]): { readonly ids: ProviderId[]; readonly changed: ProviderId[] } {
  const priorDefinitions = new Map(prior.map((row) => [row.id, JSON.stringify(row)]));
  const widened = next.filter((row) => priorDefinitions.get(row.id) !== JSON.stringify(row));
  return { ids: widened.map((row) => row.id), changed: widened.filter((row) => priorDefinitions.has(row.id)).map((row) => row.id) };
}

/** What `next` reaches that the owner of `prior` never consented to, per widening field. `capabilities` is judged
 *  against the prior GRANT (a capability declared and never confirmed asks again on every upgrade); every other
 *  field against the prior MANIFEST, the record of what the owner last saw. Narrowing never widens. */
export function manifestWidening(
  prior: { readonly manifest: PluginManifest; readonly grantedCapabilities: readonly PluginCapability[] },
  next: PluginManifest,
): PluginReachWidening {
  const providers = widenedProviders(next.providers ?? [], prior.manifest.providers ?? []);
  return {
    capabilities: newlyDeclaredCapabilities(next.capabilities, prior.grantedCapabilities),
    netHosts: widenedNetHosts(next.netHosts ?? [], prior.manifest.netHosts ?? []),
    providerIds: providers.ids,
    changedProviderIds: providers.changed,
    matchAutomationEvents: next.matchAutomationEvents === true && prior.manifest.matchAutomationEvents !== true,
  };
}

/** An upgrade with this widening lands `disabled` for re-consent. */
export function isReachWidened(widening: PluginReachWidening): boolean {
  return widening.capabilities.length > 0 || widening.netHosts.length > 0 || widening.providerIds.length > 0 || widening.matchAutomationEvents;
}

/** The reach still unanswered after an upgrade to `next`: this upgrade's widening plus whatever an earlier one left
 *  unanswered (`carried`), filtered to what `next` still declares. It accumulates so that a follow-up bundle that
 *  widens nothing relative to a refused one cannot erase the refusal; it is filtered so that a field the new
 *  manifest dropped leaves nothing to consent to. */
export function unansweredReachAfter(next: PluginManifest, widening: PluginReachWidening, carried: UnansweredReach): UnansweredReach {
  const providerIds = new Set<ProviderId>([...widening.providerIds, ...carried.providerIds]);
  const carriedIds = new Set<ProviderId>(carried.providerIds);
  const carriedChanged = new Set<ProviderId>(carried.changedProviderIds);
  const changedNow = new Set<ProviderId>(widening.changedProviderIds);
  const unansweredIds = (next.providers ?? []).map((row) => row.id).filter((id) => providerIds.has(id));
  return {
    netHosts: pendingWidenedNetHosts(next.netHosts ?? [], widening.netHosts, carried.netHosts),
    providerIds: unansweredIds,
    // An id the owner has never answered keeps the kind it first asked as: a new provider an earlier update added stays new
    // when a later one redefines it, because the owner has never seen any definition of it.
    changedProviderIds: unansweredIds.filter((id) => (carriedIds.has(id) ? carriedChanged.has(id) : changedNow.has(id))),
    matchAutomationEvents: next.matchAutomationEvents === true && (widening.matchAutomationEvents || carried.matchAutomationEvents),
  };
}

/** Is any reach still unanswered? Paired with an ungranted declared capability, this is what `pending_reconsent`
 *  records. */
export function hasUnansweredReach(reach: UnansweredReach): boolean {
  return reach.netHosts.length > 0 || reach.providerIds.length > 0 || reach.matchAutomationEvents;
}

/** The declared providers an activation may contribute: the manifest's rows minus the ids still unanswered. */
export function consentedProviders(declared: readonly ProviderDef[], withheld: readonly ProviderId[]): ProviderDef[] {
  const held = new Set(withheld);
  return declared.filter((row) => !held.has(row.id));
}
