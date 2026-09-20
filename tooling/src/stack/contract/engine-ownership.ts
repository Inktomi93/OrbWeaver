// stack's engine LAUNCH-OWNERSHIP vocabulary (#1756) — the TYPE HOME for the two shapes the negative-PGID
// authorization is spelled in. The values and the I/O live in `lib/engine-fleet/process-identity.ts`.
//
// WHY IT IS HERE AND NOT BESIDE THE I/O. These shapes were `packages/server/src/infra/providers/contract/`
// residents until the fleet moved wholesale into `tooling/`; the move landed them in `lib/engine-fleet/`,
// which is not a type home in any package — `no-inline-types` admits `**/contract/**`, the tooling
// plumbing floor and the package type homes, and a tool's `contract/` slot is the five-slot template's
// answer for exactly this (Core-Tooling-Law.md §2.5). A SEPARATE contract module rather than a section of
// `contract/types.ts`: that file imports `lib/engine-fleet/index.ts`, so homing these there would close a
// module cycle back through `process-identity.ts`. This module imports nothing and can never close one.
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
