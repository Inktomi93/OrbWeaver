// The PolicyContext integration seam: one consumed-resource receipt per owner, including cache hits.
import type { GatePolicyContext } from "../contract/policy.ts";
import type { ResourceFact } from "../contract/resource.ts";
import type { ResourceHost } from "../contract/resource-host.ts";

/** Bind once per owner create; ignored non-ready facts still withhold authority at the receipt phase. */
export function bindPolicyResources(
  host: ResourceHost,
  context: Pick<GatePolicyContext, "receipt" | "resourcePaths">,
  onConsumed?: (paths: readonly string[]) => void,
): ResourceHost {
  const allowedPaths = new Set(context.resourcePaths);
  const consumed = new Set<string>();
  const accept = <T>(fact: ResourceFact<T>): ResourceFact<T> => {
    if (fact.paths.some((path) => !allowedPaths.has(path)) || (fact.status === "ready" && fact.paths.length === 0)) {
      context.receipt({ kind: "resource", source: fact.receipt.source, resources: fact.members, unresolved: 1 });
      throw new Error(`resource ${fact.receipt.source} is outside the effective resource population`);
    }
    if (fact.status === "ready") {
      onConsumed?.(fact.paths);
    }
    if (!consumed.has(fact.receipt.source)) {
      context.receipt({ kind: "resource", source: fact.receipt.source, resources: fact.members, unresolved: fact.status === "ready" ? 0 : 1 });
      consumed.add(fact.receipt.source);
    }
    return fact;
  };
  const bound: ResourceHost = {
    authoredTree: (id) => accept(host.authoredTree(id)),
    authoredCss: () => accept(host.authoredCss()),
    productCss: () => accept(host.productCss()),
    packageMetadata: (id) => accept(host.packageMetadata(id)),
    staticConfig: (id) => accept(host.staticConfig(id)),
    trackedFiles: () => accept(host.trackedFiles()),
  };
  return Object.freeze(bound);
}
