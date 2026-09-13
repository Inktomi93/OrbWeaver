// The PolicyContext integration seam: one consumed-resource receipt per owner, including cache hits.
import type { GatePolicyContext } from "../contract/policy.ts";
import { POLICY_PASS_REFUSALS } from "../contract/policy-pass.ts";
import type { ResourceFact } from "../contract/resource.ts";
import type { GateResourceRequest } from "../contract/resource-declaration.ts";
import { isGateResourceUnpopulatedKind } from "../contract/resource-declaration.ts";
import type { ExactFile, ExactResourceId } from "../contract/resource-exact.ts";
import type { ResourceHost } from "../contract/resource-host.ts";
import type { AuthoredTextCorpus } from "../contract/resource-text.ts";
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
      throw new Error(`resource request ${requestIdentity} ${POLICY_PASS_REFUSALS.resourceRequestUndeclared}`);
    }
    const fact = acquire();
    // An UNPOPULATED kind (`installed-package`) legitimately publishes zero authored paths: its subject is a
    // resolved store path outside the checkout. The non-empty rule is right for every populated kind and
    // would refuse every correct installed read, so it is skipped by NAME rather than weakened for all.
    const emptyReady = fact.status === "ready" && fact.paths.length === 0 && !isGateResourceUnpopulatedKind(request.kind);
    if (fact.paths.some((path) => !allowedPaths.has(path)) || emptyReady) {
      context.receipt({ kind: "resource", source: fact.receipt.source, resources: fact.members, unresolved: 1 });
      throw new Error(`resource ${fact.receipt.source} ${POLICY_PASS_REFUSALS.resourceOutsidePopulation}`);
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
  /** A DEMAND door owns no population, so the two fences `accept` applies — path membership and the
   *  non-empty-ready rule — do not apply and would refuse every correct call. What still applies, and is the
   *  only thing standing between this door and an undeclared filesystem read, is the DECLARATION fence.
   *  Each distinct subject files its own receipt: two demands are two measurements. */
  let demandSequence = 0;
  const acceptDemand = <T>(request: GateResourceRequest, acquire: () => ResourceFact<T>): ResourceFact<T> => {
    const requestIdentity = resourceRequestIdentity(request);
    if (!declaredRequests.has(requestIdentity)) {
      context.receipt({ kind: "resource", source: requestIdentity, resources: 0, unresolved: 1 });
      throw new Error(`resource request ${requestIdentity} ${POLICY_PASS_REFUSALS.resourceRequestUndeclared}`);
    }
    const fact = acquire();
    if (fact.status === "ready") {
      // Consumption is about the REQUEST, not its paths: an unpopulated door consumes its declaration while
      // contributing no path, and skipping this leaves the policy refused for "unconsumed requests" — a
      // message about the descriptor for a door that worked perfectly.
      onConsumed?.(requestIdentity, fact.paths);
    }
    demandSequence += 1;
    context.receipt({
      kind: "resource",
      source: `${requestIdentity}#${String(demandSequence)}`,
      resources: fact.members,
      unresolved: fact.status === "ready" ? 0 : 1,
    });
    return fact;
  };
  /** The per-policy half of the text fence. The host's own gate is `acquiredPaths`, which spans the WHOLE
   *  invocation — so without this a policy could read text another policy's declaration happened to admit.
   *  It throws rather than refusing quietly, exactly as `accept` does for an out-of-population fact. */
  const fencedText = (paths: readonly string[]): ResourceFact<AuthoredTextCorpus> => {
    const outside = paths.find((path) => !allowedPaths.has(path));
    if (outside !== undefined) {
      context.receipt({ kind: "resource", source: "authored-text", resources: 0, unresolved: 1 });
      throw new Error(`authored text ${outside} ${POLICY_PASS_REFUSALS.resourceOutsidePopulation}`);
    }
    return acceptDemand({ kind: "authored-text" }, () => host.authoredText(paths));
  };
  /** The exact-file door's own fence. The declaration is per ID while the call takes a LIST, so EVERY
   *  demanded id is checked before the acquisition — otherwise a policy that declared one file could read a
   *  second by widening its argument, and the widened read would arrive fully receipted. The refusal names
   *  the undeclared id, never just the kind. */
  const fencedExactFiles = (ids: readonly ExactResourceId[]): ResourceFact<ReadonlyMap<ExactResourceId, ExactFile>> => {
    const [first] = ids;
    if (first === undefined) {
      context.receipt({ kind: "resource", source: "exact-file", resources: 0, unresolved: 1 });
      throw new Error(POLICY_PASS_REFUSALS.exactFilesZeroIds);
    }
    const undeclared = ids.find((id) => !declaredRequests.has(resourceRequestIdentity({ kind: "exact-file", id })));
    if (undeclared !== undefined) {
      context.receipt({ kind: "resource", source: `exact-file:${undeclared}`, resources: 0, unresolved: 1 });
      throw new Error(`resource request exact-file:${undeclared} ${POLICY_PASS_REFUSALS.resourceRequestUndeclared}`);
    }
    // Consumption is marked for every demanded id, because every one of them was a declaration this call
    // satisfied; crediting only the first would leave the rest reported as unconsumed requests.
    return accept({ kind: "exact-file", id: first }, () => {
      const fact = host.exactFiles(ids);
      if (fact.status === "ready") {
        for (const id of ids) {
          onConsumed?.(resourceRequestIdentity({ kind: "exact-file", id }), []);
        }
      }
      return fact;
    });
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
    candidateIndexDelta: (paths) => {
      const outside = paths.find((path) => !allowedPaths.has(path));
      if (outside !== undefined) {
        context.receipt({ kind: "resource", source: "candidate-index-delta", resources: 0, unresolved: 1 });
        throw new Error(`candidate index path ${outside} ${POLICY_PASS_REFUSALS.resourceOutsidePopulation}`);
      }
      return accept({ kind: "tracked-files" }, () => host.candidateIndexDelta(paths));
    },
    json: (id) => accept({ kind: "json", id }, () => host.json(id)),
    installedPackage: (request) => accept({ kind: "installed-package", ...request }, () => host.installedPackage(request)),
    mirrorIndex: (id) => accept({ kind: "mirror-index", id }, () => host.mirrorIndex(id)),
    documents: () => accept({ kind: "documents" }, () => host.documents()),
    ledger: (id) => accept({ kind: "ledger", id }, () => host.ledger(id)),
    exactFiles: fencedExactFiles,
    vendorCssSurface: () => accept({ kind: "vendor-css-surface" }, () => host.vendorCssSurface()),
    tokenContract: () => accept({ kind: "token-contract" }, () => host.tokenContract()),
    devtoolsClosure: () => accept({ kind: "devtools-closure" }, () => host.devtoolsClosure()),
    authoredPaths: (selectors) => acceptDemand({ kind: "authored-path" }, () => host.authoredPaths(selectors)),
    authoredText: fencedText,
  };
  return Object.freeze(bound);
}
