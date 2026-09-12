// The detached-work arm vocabulary (#1988). `lib/detached-work.ts` raises the sites and
// `gates/detached-work-traced.ts` reports them arm by arm, so the tuple and its derived union cross the
// lib↔policy boundary and live here rather than beside the reader — `lib/` is not a type home
// (Spine-TypeScript-and-Patterns.md §7.4, Core-Tooling-Law.md §2.5).

export const DETACHED_WORK_ARMS = ["untraced", "swallowed-catch", "blinded-rejection"] as const;
export type DetachedWorkArm = (typeof DETACHED_WORK_ARMS)[number];
