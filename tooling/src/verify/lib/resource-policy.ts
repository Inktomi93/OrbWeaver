// The PolicyContext integration seam: one consumed-resource receipt per owner, including cache hits.
import type { GatePolicyContext } from "../contract/policy.ts";
import type { ResourceFact } from "../contract/resource.ts";
import type { GateResourceRequest } from "../contract/resource-declaration.ts";
import type { ResourceHost } from "../contract/resource-host.ts";
import { resourceRequestIdentity } from "./resource-declaration.ts";

interface PolicyResourceBinding {
  readonly host: ResourceHost;
  readonly context: Pick<GatePolicyContext, "receipt" | "resourcePaths">;
  readonly declarations: readonly GateResourceRequest[];
  readonly onConsumed?: (requestIdentity: string, paths: readonly string[]) => void;
}

/** Bind once per owner create; ignored non-ready facts still withhold authority at the receipt phase. */
export function bindPolicyResources({ host, context, declarations, onConsumed }: PolicyResourceBinding): ResourceHost {
  const allowedPaths = new Set(context.resourcePaths);
  const declaredRequests = new Set(declarations.map(resourceRequestIdentity));
  const receipted = new Set<string>();
  const accept = <T>(request: GateResourceRequest, acquire: () => ResourceFact<T>): ResourceFact<T> => {
    const requestIdentity = resourceRequestIdentity(request);
    if (!declaredRequests.has(requestIdentity)) {
      context.receipt({ kind: "resource", source: requestIdentity, resources: 0, unresolved: 1 });
      throw new Error(`resource request ${requestIdentity} is undeclared`);
    }
    const fact = acquire();
    if (fact.paths.some((path) => !allowedPaths.has(path)) || (fact.status === "ready" && fact.paths.length === 0)) {
      context.receipt({ kind: "resource", source: fact.receipt.source, resources: fact.members, unresolved: 1 });
      throw new Error(`resource ${fact.receipt.source} is outside the effective resource population`);
    }
    if (fact.status === "ready") {
      onConsumed?.(requestIdentity, fact.paths);
    }
    if (!receipted.has(fact.receipt.source)) {
      context.receipt({ kind: "resource", source: fact.receipt.source, resources: fact.members, unresolved: fact.status === "ready" ? 0 : 1 });
      receipted.add(fact.receipt.source);
    }
    return fact;
  };
  const bound: ResourceHost = {
    authoredTree: (id) => accept({ kind: "authored-tree", id }, () => host.authoredTree(id)),
    authoredCss: () => accept({ kind: "authored-css" }, () => host.authoredCss()),
    productCss: () => accept({ kind: "product-css" }, () => host.productCss()),
    cssInventory: (request) =>
      request === "authored"
        ? accept({ kind: "authored-css" }, () => host.cssInventory(request))
        : accept({ kind: "product-css" }, () => host.cssInventory(request)),
    packageMetadata: (id) => accept({ kind: "package-metadata", id }, () => host.packageMetadata(id)),
    staticConfig: (id) => accept({ kind: "static-config", id }, () => host.staticConfig(id)),
    nativeConfig: (id) => accept({ kind: "native-config", id }, () => host.nativeConfig(id)),
    trackedFiles: () => accept({ kind: "tracked-files" }, () => host.trackedFiles()),
  };
  return Object.freeze(bound);
}
