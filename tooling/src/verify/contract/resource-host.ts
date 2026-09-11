// Closed resource requests; adding a family requires a concrete provider and a proof, never a path callback.
import type { SourceFile } from "ts-morph";
import type { ConfigSnapshotByRunner, ConfigSnapshotRunner } from "./config-snapshot.ts";
import type { OrdinaryWaiverCarriers } from "./ordinary-waiver-source.ts";
import type { ResourceFact, ResourceReaderOptions, ResourceReceipt, ResourceTreeEntry, TrackedResourceIndex } from "./resource.ts";
import type { DevToolsClosure, TokenContractResource } from "./resource-artifact.ts";
import type { PackageMetadata, PackageResourceId, StaticConfigFacts, StaticConfigResourceId } from "./resource-config.ts";
import type { CssFacts, CssInventoryRequest } from "./resource-css.ts";
import type { DocumentIndex, LedgerFactsFor, LedgerId } from "./resource-document.ts";
import type { ExactFile, ExactResourceId } from "./resource-exact.ts";
import type { InstalledPackageFacts, InstalledPackageRequest } from "./resource-installed.ts";
import type { JsonResourceFacts, JsonResourceId } from "./resource-json.ts";
import type { MirrorFamilyId, MirrorIndex } from "./resource-mirror.ts";
import type { AuthoredPathIndex } from "./resource-path.ts";
import type { AuthoredTextCorpus } from "./resource-text.ts";
import type { AuthoredCssFile, AuthoredTreeId } from "./resource-tree.ts";
import type { VendorCssSurface } from "./resource-vendor.ts";

export interface ResourceHost {
  readonly authoredTree: (id: AuthoredTreeId) => ResourceFact<readonly ResourceTreeEntry[]>;
  readonly authoredCss: () => ResourceFact<readonly AuthoredCssFile[]>;
  readonly productCss: () => ResourceFact<readonly AuthoredCssFile[]>;
  readonly cssInventory: (request: CssInventoryRequest) => ResourceFact<CssFacts>;
  readonly packageMetadata: (id: PackageResourceId) => ResourceFact<PackageMetadata>;
  readonly staticConfig: (id: StaticConfigResourceId) => ResourceFact<StaticConfigFacts>;
  readonly nativeConfig: <R extends ConfigSnapshotRunner>(id: R) => ResourceFact<ConfigSnapshotByRunner[R]>;
  readonly trackedFiles: () => ResourceFact<TrackedResourceIndex>;
  readonly json: (id: JsonResourceId) => ResourceFact<JsonResourceFacts>;
  readonly installedPackage: (request: InstalledPackageRequest) => ResourceFact<InstalledPackageFacts>;
  /** The derived source/test mirror index — membership, not the mirror RULE (`resource-mirror.ts`). */
  readonly mirrorIndex: (id: MirrorFamilyId) => ResourceFact<MirrorIndex>;
  /** The living-document corpus, and the named registries. Two doors because a corpus tolerates a refused
   *  member and an IDENTITY does not (`resource-document.ts`). */
  readonly documents: () => ResourceFact<DocumentIndex>;
  readonly ledger: <I extends LedgerId>(id: I) => ResourceFact<LedgerFactsFor<I>>;
  /** Exact named files. Every demanded id resolves or the whole fact refuses (`resource-exact.ts`). */
  readonly exactFiles: (ids: readonly ExactResourceId[]) => ResourceFact<ReadonlyMap<ExactResourceId, ExactFile>>;
  /** The committed-mirror ↔ installed-vendor comparison surface (`resource-vendor.ts`). */
  readonly vendorCssSurface: () => ResourceFact<VendorCssSurface>;
  /** The two canonical generated artifacts (`resource-artifact.ts`). */
  readonly tokenContract: () => ResourceFact<TokenContractResource>;
  readonly devtoolsClosure: () => ResourceFact<DevToolsClosure>;
  /** DEMAND doors. They own no population, take their subject at call time, and are fenced by declaration
   *  rather than by path membership — see `resource-declaration.ts` on the two classes of kind. */
  readonly authoredPaths: (selectors: readonly string[]) => ResourceFact<AuthoredPathIndex>;
  readonly authoredText: (paths: readonly string[]) => ResourceFact<AuthoredTextCorpus>;
}

/** Invocation composition only. The parser seam permits the fixture runner's shared workspace. */
export interface ResourceHostOptions extends ResourceReaderOptions {
  readonly parseSource?: (path: string, text: string) => SourceFile;
}

export interface ResourceInvocation {
  readonly host: ResourceHost;
  /** Unique acquisitions, including failures. Cache hits do not inflate cost/member totals. */
  readonly receipts: () => readonly ResourceReceipt[];
  /** Comment-aware text snapshots of the EXACT demanded paths, from facts already acquired through
   *  declared resource doors. Demand-driven because an executable-config population is the whole authored
   *  transaction: reading every waiver-format member of it costs seconds and answers nobody's question. */
  readonly ordinaryWaiverCarriers: (paths: readonly string[]) => OrdinaryWaiverCarriers;
}
