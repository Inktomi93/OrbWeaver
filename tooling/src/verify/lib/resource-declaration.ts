// Descriptor resource declarations resolve only through the closed ResourceHost fact surface.

import { PRODUCT_STYLESHEETS } from "../contract/css-family.ts";
import type { GateFact } from "../contract/fact.ts";
import type { GatePolicy } from "../contract/policy.ts";
import type { ResourceFact } from "../contract/resource.ts";
import { PACKAGE_RESOURCE_PATHS, STATIC_CONFIG_RESOURCE_PATHS } from "../contract/resource-config.ts";
import type { GateResourceRequest } from "../contract/resource-declaration.ts";
import type { ResourceHost, ResourceHostOptions } from "../contract/resource-host.ts";
import { AUTHORED_TREE_PATHS } from "../contract/resource-tree.ts";
import { createResourceHost } from "../ops/resource-host.ts";
import { assertGateResourceDeclarations, assertRepoPathIdentity } from "./policy-validation.ts";

export function resourceRequestIdentity(request: GateResourceRequest): string {
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
    case "tracked-files":
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
    case "tracked-files":
      return host.trackedFiles();
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
  }
}

/** Resolve one declaration set to exact fact paths; malformed or non-ready facts are never absence. */
export function resolveResourceDeclarations(host: ResourceHost, requests: readonly GateResourceRequest[]): readonly string[] {
  const paths = new Set<string>();
  for (const request of canonicalResourceDeclarations(requests)) {
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
  return [...paths].toSorted((left, right) => left.localeCompare(right));
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
