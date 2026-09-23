// Authored-path IDENTITY — the one door a policy has for asking whether a SELECTOR it read out of some
// other resource names a live node inside this repository. It answers identity and NEVER content: a policy
// can learn `file | directory | absent | outside`, and cannot read a byte through it. That is the whole
// containment, and it is why an arbitrary selector is admissible here when it would be forbidden anywhere
// else in the contract.
//
// WHY IT EXISTS (`gates/runner-config-path-liveness.ts:23-39`, a measured and orchestrator-approved
// conversion REFUSAL that is this door's specification):
//   1. `trackedFiles()` returns repo paths and Git lists a SYMLINK as an ordinary path, so an in-repo
//      symlink pointing outside the tree silently PASSES a liveness check built on tracked membership.
//      `ResourceFileSnapshot`'s `symlink` variant (`resource.ts`) does not close this: it is internal and
//      never reaches a policy.
//   2. `GatePolicyContext` deliberately carries no root, so an ABSOLUTE selector cannot be related to the
//      repository at all. Normalization has to happen behind the host or not at all.
// The third read that refusal names — `statSync(...).isFile()` — is derivable from `tracked-files` prefixes
// and is NOT part of the gap; it is served here anyway because splitting it would make a policy combine two
// doors to answer one question.
//
// THE PARTITION IS TOTAL. Every demanded selector leaves as exactly one identity, including the ones the
// door could not decide (`unresolved`). A dropped selector would be absence, and §12.3 of
// `docs/law/gate-runtime-standardization.md` forbids absence: unsupported input returns an unresolved
// FACT, never a shorter list. So the enclosing `ResourceFact` is `ready` whenever selectors were supplied,
// and per-selector failure rides the row — which is also why the door publishes no receipt-level
// `unresolved` count: no consumer expresses its dependency through one, and a provider that receipts what
// it FOUND preempts its own accuser (§12.3).

/** @public knip type-face false positive — the one-home vocabulary tuple behind the exported `AuthoredPathSelectorForm` union
 *  — the ONE importable spelling of this axis, which nothing outside this module enumerates YET; un-exporting it would
 *  invite the re-spell `no-inline-union-redecl` exists to stop. */
export const AUTHORED_PATH_SELECTOR_FORMS = ["repo-relative", "absolute"] as const;
export type AuthoredPathSelectorForm = (typeof AUTHORED_PATH_SELECTOR_FORMS)[number];

/** `outside` covers both halves of containment: a selector that escapes lexically, and one that escapes
 *  only through a symlink target. A policy cannot tell them apart and must not — both mean the same thing,
 *  that an existing path outside the checkout satisfied a selector, and the reason string never echoes the
 *  resolved external target.
 *  @public knip type-face false positive — the one-home vocabulary tuple behind the exported `AuthoredPathStatus` union
 *  — the ONE importable spelling of this axis, which nothing outside this module enumerates YET; un-exporting it would invite the
 *  re-spell `no-inline-union-redecl` exists to stop. */
export const AUTHORED_PATH_STATUSES = ["file", "directory", "absent", "outside", "unresolved"] as const;
/** @public knip type-face false positive — the importable union spelling of the `AUTHORED_PATH_STATUSES` vocabulary — one home
 *  for the axis (Spine-TypeScript-and-Patterns.md §5.5), which consumers reach through the literal today rather than by naming
 *  the alias. */
export type AuthoredPathStatus = (typeof AUTHORED_PATH_STATUSES)[number];

/** A repo-path → identity lookup for the dangling-refs reader and any policy that needs path status. */
export type PathStatusIndex = ReadonlyMap<string, AuthoredPathStatus>;

export type AuthoredPathIdentity = {
  /** Exactly the string the policy supplied, so a finding can anchor on the authored selector. */
  readonly selector: string;
  readonly form: AuthoredPathSelectorForm;
} & (
  | {
      readonly status: "file" | "directory" | "absent";
      /** Repo-relative normalization of `selector`; `.` names the repository root itself. */
      readonly path: string;
    }
  | { readonly status: "outside" | "unresolved"; readonly reason: string }
);

export interface AuthoredPathIndex {
  /** One identity per DISTINCT demanded selector, sorted by selector. */
  readonly identities: readonly AuthoredPathIdentity[];
}
