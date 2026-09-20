// infra/providers/contract/engine-ownership — the TYPE HOME for the vLLM engine LAUNCH-OWNERSHIP vocabulary
// (#1756). The values and the I/O live in `vllm/engine/process-identity.ts`; these two shapes are here for
// the same reason `ProviderScrubSet` is (see errors.ts): this file is the providers type home, and both are
// consumed ACROSS a package boundary — `@orb/tooling/stack`'s `engines-ctl` reads them to print what it
// verified before it signals.
//
// Both are aliases rather than interfaces on purpose: one is a phantom brand and the other is a closed
// discriminated union, and neither can be spelled as an interface.

declare const engineLaunchMarkerBrand: unique symbol;

/**
 * A MINTED per-launch marker — the token the launcher exports into every engine's spawn env, so that
 * `/proc/<pid>/environ` of a surviving group member proves which launch started it after the recorded
 * leader is gone.
 *
 * BRANDED because the value's ENTROPY is the whole guarantee. The marker is the evidence a NEGATIVE-PGID
 * signal is authorized on, and a hand-typed constant ("engines", "dev") would satisfy the shape check while
 * being forgeable by anything that can set an environment variable. `mintEngineLaunchMarker()` is the only
 * producer, so `pnpm ast refs` enumerates every launcher that stamps a group — and a value PARSED back out
 * of the durable record or read from `/proc` is deliberately a plain `string`, never this brand: we did not
 * mint it, and typing it as if we had would be a lie about where the evidence came from.
 */
export type EngineLaunchMarker = string & { readonly [engineLaunchMarkerBrand]: true };

/**
 * What a LEADERLESS engine process group may be. Only `adoptable` — every live member carrying the recorded
 * marker — may ever reach the negative-PGID signal; `unmarked` names the pid that refused the group, and
 * `no-marker` is the pre-#1756 refusal for a record written before the marker existed. `leader-live` means
 * the question does not apply: the ordinary field-by-field identity door owns that decision.
 */
export type EngineGroupAdoption =
  | { readonly kind: "adoptable"; readonly pgid: number; readonly members: readonly number[] }
  | { readonly kind: "unmarked"; readonly pgid: number; readonly unmarked: readonly number[] }
  | { readonly kind: "empty"; readonly pgid: number }
  | { readonly kind: "no-marker"; readonly pgid: number; readonly reason: string }
  | { readonly kind: "leader-live"; readonly pgid: number; readonly reason: string };
