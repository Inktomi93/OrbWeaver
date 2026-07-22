// domain/plugin/substrate/grants — the grant subset math (02 §2/§4), pure and Principal-free. The manifest
// DECLARES a capability set; the installing owner CONFIRMS a subset (`granted_capabilities`); every host
// function enforces its capability per call against that confirmed subset. Two invariants live here as pure
// predicates the verbs enforce (throwing the typed errors): a grant must be ⊆ the declared set (install /
// upgrade), and an upgrade that DECLARES a capability the prior grant never confirmed must land `disabled`
// for re-confirmation (02 §2 — "upgrade with a superset → disabled until re-granted").

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
 *  upgrade lands `disabled` pending re-grant (02 §2); empty ⇒ the prior grant carries forward. */
export function newlyDeclaredCapabilities(newlyDeclared: readonly PluginCapability[], priorGranted: readonly PluginCapability[]): PluginCapability[] {
  const grantedSet = new Set(priorGranted);
  return [...new Set(newlyDeclared)].filter((cap) => !grantedSet.has(cap));
}
