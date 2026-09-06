// Closed resource requests; adding a family requires a concrete provider and a proof, never a path callback.
import type { SourceFile } from "ts-morph";
import type { OrdinaryWaiverSource } from "./ordinary-waiver-source.ts";
import type { ResourceFact, ResourceReaderOptions, ResourceReceipt, ResourceTreeEntry, TrackedResourceIndex } from "./resource.ts";
import type { PackageMetadata, PackageResourceId, StaticConfigFacts, StaticConfigResourceId } from "./resource-config.ts";
import type { CssFacts, CssInventoryRequest } from "./resource-css.ts";
import type { AuthoredCssFile, AuthoredTreeId } from "./resource-tree.ts";

export interface ResourceHost {
  readonly authoredTree: (id: AuthoredTreeId) => ResourceFact<readonly ResourceTreeEntry[]>;
  readonly authoredCss: () => ResourceFact<readonly AuthoredCssFile[]>;
  readonly productCss: () => ResourceFact<readonly AuthoredCssFile[]>;
  readonly cssInventory: (request: CssInventoryRequest) => ResourceFact<CssFacts>;
  readonly packageMetadata: (id: PackageResourceId) => ResourceFact<PackageMetadata>;
  readonly staticConfig: (id: StaticConfigResourceId) => ResourceFact<StaticConfigFacts>;
  readonly trackedFiles: () => ResourceFact<TrackedResourceIndex>;
}

/** Invocation composition only. The parser seam permits the fixture runner's shared workspace. */
export interface ResourceHostOptions extends ResourceReaderOptions {
  readonly parseSource?: (path: string, text: string) => SourceFile;
}

export interface ResourceInvocation {
  readonly host: ResourceHost;
  /** Unique acquisitions, including failures. Cache hits do not inflate cost/member totals. */
  readonly receipts: () => readonly ResourceReceipt[];
  /** Comment-aware text snapshots from facts already acquired through declared resource doors. */
  readonly ordinaryWaiverSources: () => readonly OrdinaryWaiverSource[];
}
