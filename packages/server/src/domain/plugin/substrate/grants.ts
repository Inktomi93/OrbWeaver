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

import type { PluginCapability } from "@orb/contracts/plugin";

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

/** The capabilities a re-uploaded manifest DECLARES that the prior grant never confirmed. Non-empty ⇒ the
 *  upgrade lands `disabled` pending re-grant; empty ⇒ the prior grant carries forward. */
export function newlyDeclaredCapabilities(newlyDeclared: readonly PluginCapability[], priorGranted: readonly PluginCapability[]): PluginCapability[] {
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
