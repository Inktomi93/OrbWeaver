// The case vocabulary of the `tooling-os-neutral` policy; its predicates live in lib/os-neutral.ts.

/** Every case the policy reports; each finding names its case through its message. */
export const OS_NEUTRAL_CASES = [
  "linux-spawn",
  "kernel-path",
  "tmp-path",
  "package-manager-spawn",
  "home-without-userprofile",
  "tmpdir-without-temp",
  "newline-split",
  "git-bypass",
] as const;
export type OsNeutralCase = (typeof OS_NEUTRAL_CASES)[number];
