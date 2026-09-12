// Descriptor resource declarations resolve only through the closed ResourceHost fact surface.

import { PRODUCT_STYLESHEETS } from "../contract/css-family.ts";
import type { GateFact } from "../contract/fact.ts";
import type { GatePolicy } from "../contract/policy.ts";
import type { ResourceFact } from "../contract/resource.ts";
import { DEVTOOLS_CLOSURE_ROOT, TOKEN_CONTRACT_PATHS } from "../contract/resource-artifact.ts";
import { PACKAGE_RESOURCE_PATHS, STATIC_CONFIG_RESOURCE_PATHS } from "../contract/resource-config.ts";
import type { GateResourceRequest } from "../contract/resource-declaration.ts";
import { isGateResourceUnpopulatedKind } from "../contract/resource-declaration.ts";
import { DOCUMENT_CORPUS_ROOT, LEDGER_DEFINITIONS } from "../contract/resource-document.ts";
import { EXACT_RESOURCE_PATHS } from "../contract/resource-exact.ts";
import type { ResourceHost, ResourceHostOptions } from "../contract/resource-host.ts";
import { JSON_RESOURCE_PATHS } from "../contract/resource-json.ts";
import { MIRROR_FAMILY_DEFINITIONS } from "../contract/resource-mirror.ts";
import { AUTHORED_TREE_PATHS } from "../contract/resource-tree.ts";
import { VENDOR_MIRROR_ROOT } from "../contract/resource-vendor.ts";
import { createResourceHost } from "../ops/resource-host.ts";
import { assertGateResourceDeclarations, assertRepoPathIdentity } from "./policy-validation.ts";

/** Narrow a DECLARED resource fact to its value. A policy that declares a resource never observes a
 *  non-ready one: `resolveResourceDeclarations` below throws on every non-ready declaration and on an
 *  empty fact during the POPULATION phase, and the receipt phase withholds every consumer — both before
 *  `create`/`evaluate` run at all (guide §11 ruling 3). So this is an ASSERTION about the runtime, not a
 *  withhold a policy owns: an in-module `if (fact.status !== "ready") return;` is unreachable code that
 *  also teaches the next author that a silent return is the right answer to a broken resource. It is not.
 *  The narrowing is unavoidable — `ResourceFact<T>` is a discriminated union and `.value` lives only on
 *  the ready arm — so it lives HERE, beside the refusal it is asserting, rather than being re-spelled in
 *  each resource policy. */
export function readyResourceValue<T>(fact: ResourceFact<T>): T {
  if (fact.status !== "ready") {
    throw new Error(`resource ${fact.receipt.source} was declared ready by population resolution but came back ${fact.status}: ${fact.reason}`);
  }
  return fact.value;
}

export function resourceRequestIdentity(request: GateResourceRequest): string {
  if (request.kind === "installed-package") {
    // The MODE and the named file are part of the identity: `text` of one file and `ast` of the same
    // package are two different acquisitions, and collapsing them would let one declaration authorize the
    // other.
    return request.mode === "text" ? `${request.kind}:${request.id}:text:${request.file}` : `${request.kind}:${request.id}:${request.mode}`;
  }
  return "id" in request ? `${request.kind}:${request.id}` : request.kind;
}

function canonicalRequest(request: GateResourceRequest): GateResourceRequest {
  switch (request.kind) {
    case "authored-tree":
      return { kind: request.kind, id: request.id };
    case "authored-css":
      return { kind: request.kind };
    case "product-css":
      return { kind: request.kind };
    case "package-metadata":
      return { kind: request.kind, id: request.id };
    case "static-config":
      return { kind: request.kind, id: request.id };
    case "native-config":
      return { kind: request.kind, id: request.id };
    case "tracked-files":
      return { kind: request.kind };
    case "json":
      return { kind: request.kind, id: request.id };
    case "installed-package":
      return request.mode === "text"
        ? { kind: request.kind, id: request.id, mode: request.mode, file: request.file }
        : { kind: request.kind, id: request.id, mode: request.mode };
    case "mirror-index":
      return { kind: request.kind, id: request.id };
    case "documents":
      return { kind: request.kind };
    case "ledger":
      return { kind: request.kind, id: request.id };
    case "exact-file":
      return { kind: request.kind, id: request.id };
    case "vendor-css-surface":
      return { kind: request.kind };
    case "token-contract":
      return { kind: request.kind };
    case "devtools-closure":
      return { kind: request.kind };
    case "authored-path":
      return { kind: request.kind };
    case "authored-text":
      return { kind: request.kind };
  }
}

export function canonicalResourceDeclarations(requests: readonly GateResourceRequest[]): readonly GateResourceRequest[] {
  assertGateResourceDeclarations(requests);
  return requests.map(canonicalRequest).toSorted((left, right) => resourceRequestIdentity(left).localeCompare(resourceRequestIdentity(right)));
}

function requestFact(host: ResourceHost, request: GateResourceRequest): ResourceFact<unknown> {
  switch (request.kind) {
    case "authored-tree":
      return host.authoredTree(request.id);
    case "authored-css":
      return host.authoredCss();
    case "product-css":
      return host.productCss();
    case "package-metadata":
      return host.packageMetadata(request.id);
    case "static-config":
      return host.staticConfig(request.id);
    case "native-config":
      return host.nativeConfig(request.id);
    case "tracked-files":
      return host.trackedFiles();
    case "json":
      return host.json(request.id);
    case "installed-package":
      return host.installedPackage(request);
    case "mirror-index":
      return host.mirrorIndex(request.id);
    case "documents":
      return host.documents();
    case "ledger":
      return host.ledger(request.id);
    // The declaration is per ID and the door takes a LIST, so planning acquires exactly the one id declared.
    // A policy declaring two exact files acquires each independently here and may then call the door with
    // both; it can never reach an id no declaration named.
    case "exact-file":
      return host.exactFiles([request.id]);
    case "vendor-css-surface":
      return host.vendorCssSurface();
    case "token-contract":
      return host.tokenContract();
    case "devtools-closure":
      return host.devtoolsClosure();
    case "authored-path":
    case "authored-text":
      // A demand kind has no subject at planning time. `resolveResourceDeclarations` never reaches here —
      // it partitions the declarations first — and this arm exists so a future caller that forgets that
      // rule fails LOUDLY instead of acquiring a fact with an empty subject and reading it as a clean zero.
      throw new Error(`resource declaration ${request.kind} is demand-driven and cannot be acquired without a subject`);
  }
}

function pathBelongsToRequest(request: GateResourceRequest, path: string): boolean {
  switch (request.kind) {
    case "authored-tree":
      return path.startsWith(`${AUTHORED_TREE_PATHS[request.id]}/`);
    case "authored-css":
      return path.endsWith(".css") && (path.startsWith(`${AUTHORED_TREE_PATHS["client-source"]}/`) || path.startsWith(`${AUTHORED_TREE_PATHS["ui-source"]}/`));
    case "product-css":
      return (PRODUCT_STYLESHEETS as readonly string[]).includes(path);
    case "package-metadata":
      return path === PACKAGE_RESOURCE_PATHS[request.id];
    case "static-config":
      return path === STATIC_CONFIG_RESOURCE_PATHS[request.id];
    case "tracked-files":
      return true;
    case "native-config":
      return true;
    case "json":
      return path === JSON_RESOURCE_PATHS[request.id];
    case "installed-package":
      // An installed package publishes no authored paths at all (`ops/resource-installed.ts` returns an
      // empty `paths`), so nothing can belong to this request and reaching here at all is the bug.
      return false;
    case "mirror-index":
      return [MIRROR_FAMILY_DEFINITIONS[request.id].sourceRoot, MIRROR_FAMILY_DEFINITIONS[request.id].testRoot].some((root) => path.startsWith(`${root}/`));
    case "documents":
      return path.startsWith(`${DOCUMENT_CORPUS_ROOT}/`);
    case "ledger": {
      const definition = LEDGER_DEFINITIONS[request.id];
      return definition.nature === "markdown" ? (definition.paths as readonly string[]).includes(path) : path.startsWith(`${definition.tree}/`);
    }
    case "exact-file":
      return path === EXACT_RESOURCE_PATHS[request.id];
    // Only the COMMITTED mirror side of the vendor surface publishes repo paths; the installed halves are
    // absolute store paths and publish none (`ops/resource-vendor.ts`).
    case "vendor-css-surface":
      return path.startsWith(`${VENDOR_MIRROR_ROOT}/`);
    case "token-contract":
      return Object.values(TOKEN_CONTRACT_PATHS).includes(path);
    case "devtools-closure":
      return path.startsWith(`${DEVTOOLS_CLOSURE_ROOT}/`);
    case "authored-path":
    case "authored-text":
      return false;
  }
}

/** Resolve one declaration set to exact fact paths; malformed or non-ready facts are never absence.
 *
 *  UNPOPULATED KINDS ARE PARTITIONED OUT BY NAME, NOT SKIPPED SILENTLY. The two demand kinds and
 *  `installed-package` contribute no authored path and would fail the empty-fact refusal below — which is
 *  the correct rule for every other kind and wrong for these three. The rule is stated here, at the one
 *  place that could otherwise turn "this declaration resolved nothing" into a clean zero. */
export function resolveResourceDeclarations(host: ResourceHost, requests: readonly GateResourceRequest[]): readonly string[] {
  const paths = new Set<string>();
  for (const request of canonicalResourceDeclarations(requests).filter((candidate) => !isGateResourceUnpopulatedKind(candidate.kind))) {
    const fact = requestFact(host, request);
    const identity = resourceRequestIdentity(request);
    if (fact.status !== "ready") {
      throw new Error(`resource declaration ${identity} is ${fact.status}: ${fact.reason}`);
    }
    if (fact.paths.length === 0 || fact.members === 0) {
      throw new Error(`resource declaration ${identity} resolved an empty fact`);
    }
    for (const path of fact.paths) {
      assertRepoPathIdentity(path, `resource declaration ${identity} path`);
      if (!pathBelongsToRequest(request, path)) {
        throw new Error(`resource declaration ${identity} returned a cross-root fact: ${path}`);
      }
      paths.add(path);
    }
  }
  return [...paths].toSorted();
}

/** Resolve descriptor-owned declarations once for planning; the returned map is derived, never maintained. */
export function resolvePolicyResourcePaths(policies: readonly GatePolicy[], options: ResourceHostOptions): ReadonlyMap<string, readonly string[]> {
  return resolveResourceOwnerPaths(policies, options);
}

/** Resolve policy or shared-fact declarations without creating a second maintained resource roster. */
export function resolveResourceOwnerPaths(
  owners: readonly (Pick<GatePolicy, "id" | "resources"> | Pick<GateFact, "id" | "resources">)[],
  options: ResourceHostOptions,
): ReadonlyMap<string, readonly string[]> {
  const invocation = createResourceHost(options);
  return new Map(
    owners
      .filter((owner) => owner.resources.length > 0)
      .map((owner) => [owner.id, resolveResourceDeclarations(invocation.host, owner.resources)] as const)
      .toSorted(([left], [right]) => left.localeCompare(right)),
  );
}
