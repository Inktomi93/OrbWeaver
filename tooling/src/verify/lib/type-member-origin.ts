// Verify retains the containment graph while direct declaration facts have one floor home.
// biome-ignore lint/performance/noBarrelFile: re-export preserves the original module's public API after extracting direct native readers and the value containment graph to their owners
export {
  declaredByAnyPackage,
  declaredByFile,
  declaredByPackage,
  resolveArrayElementTypeIdentityOrigin,
  resolveContextualMemberOrigin,
  resolveTypeIdentityChain,
  resolveTypeIdentityOrigin,
  resolveTypeMemberOrigin,
} from "../../floor/code-facts/type-member-origin.ts";
export { resolveTypePropertyOrigin } from "../../floor/code-facts/type-member-origin-core.ts";
export { resolveTypeValueOrigins } from "./type-member-origin-graph.ts";
