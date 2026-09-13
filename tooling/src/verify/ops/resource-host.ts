// Each invocation shares one lazy provider cache; policies cannot reach disk, parsers, or cache reset.

import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { getWorkspace } from "@orb/tooling/_shared/ts-workspace";
import type { Project, SourceFile } from "ts-morph";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ConfigSnapshot, ConfigSnapshotRunner } from "../contract/config-snapshot.ts";
import type { OrdinaryWaiverCarrierRefusal, OrdinaryWaiverCarriers, OrdinaryWaiverSource } from "../contract/ordinary-waiver-source.ts";
import type { ResourceFact, ResourceLoad, ResourceReceipt } from "../contract/resource.ts";
import type { PackageResourceId, StaticConfigResourceId } from "../contract/resource-config.ts";
import type { LedgerFacts, LedgerId } from "../contract/resource-document.ts";
import type { ExactFile, ExactResourceId } from "../contract/resource-exact.ts";
import type { ResourceHost, ResourceHostOptions, ResourceInvocation } from "../contract/resource-host.ts";
import type { InstalledPackageFacts, InstalledPackageRequest } from "../contract/resource-installed.ts";
import type { JsonResourceFacts, JsonResourceId } from "../contract/resource-json.ts";
import type { MirrorFamilyId } from "../contract/resource-mirror.ts";
import type { AuthoredTextCorpus, AuthoredTextFile, AuthoredTextRefusal } from "../contract/resource-text.ts";
import type { AuthoredTreeId } from "../contract/resource-tree.ts";
import { ordinaryWaiverResourceFormat } from "../lib/ordinary-waiver-source.ts";
import { loadDevToolsClosure, loadTokenContract } from "./resource-artifact.ts";
import { loadPackageMetadata, loadStaticConfig } from "./resource-config.ts";
import { loadCssFacts } from "./resource-css.ts";
import { loadDocumentIndex, loadLedger } from "./resource-document.ts";
import { loadExactFiles } from "./resource-exact.ts";
import { loadCandidateIndexDelta } from "./resource-index.ts";
import { loadInstalledPackage } from "./resource-installed.ts";
import { loadJsonResource } from "./resource-json.ts";
import { loadMirrorIndex } from "./resource-mirror.ts";
import { loadNativeConfig } from "./resource-native-config.ts";
import { loadAuthoredPaths } from "./resource-path.ts";
import { createResourceReader } from "./resource-reader.ts";
import { loadTrackedFiles } from "./resource-tracked.ts";
import { loadAuthoredCss, loadAuthoredTree, loadProductCss } from "./resource-tree.ts";
import { loadVendorCssSurface } from "./resource-vendor.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:structure");

function freezeValue<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) {
      freezeValue(child);
    }
    Object.freeze(value);
  }
  return value;
}

/** Create once at the invocation root; release the returned object to release every cached resource. */
export function createResourceHost(options: ResourceHostOptions): ResourceInvocation {
  const root = resolve(options.root);
  const invocationOptions = { ...options, root, ...(options.overlay === undefined ? {} : { overlay: { ...options.overlay } }) };
  const reader = createResourceReader(invocationOptions);
  const receipts = new Map<string, ResourceReceipt>();
  const acquiredPaths = new Set<string>();
  const recordPaths = (paths: readonly string[]): void => {
    for (const path of paths) {
      acquiredPaths.add(path);
    }
  };
  let parser: Project | undefined;
  const sourceParser =
    options.parseSource ??
    ((path: string, text: string): SourceFile => {
      parser ??= getWorkspace({ root, globs: [] });
      parser.compilerOptions.set({ allowJs: true });
      return parser.createSourceFile(`${root}/${path}`, text, { overwrite: true });
    });
  const parseSource = (path: string, text: string): SourceFile => {
    const source = sourceParser(path, text);
    if (resolve(source.getFilePath()) !== resolve(root, path)) {
      throw new Error(`resource parser returned a source outside its exact invocation identity: ${path}`);
    }
    return source;
  };
  const cached = <T>(source: string, load: () => ResourceLoad<T>): (() => ResourceFact<T>) => {
    let fact: ResourceFact<T> | undefined;
    return () => {
      if (fact !== undefined) {
        return fact;
      }
      const started = performance.now();
      let loaded: ResourceLoad<T>;
      try {
        loaded = load();
      } catch (error) {
        loaded = { status: "unresolved", paths: [], members: 0, reason: error instanceof Error ? error.message : String(error) };
      }
      recordPaths(loaded.paths);
      const receipt: ResourceReceipt = {
        source,
        status: loaded.status,
        paths: loaded.paths,
        members: loaded.members,
        durationMs: performance.now() - started,
        ...(loaded.subprocess === undefined ? {} : { subprocess: loaded.subprocess }),
      };
      fact = freezeValue({ ...loaded, receipt });
      receipts.set(source, fact.receipt);
      return fact;
    };
  };
  const keyed = <Id extends string, T>(family: string, load: (id: Id) => ResourceLoad<T>): ((id: Id) => ResourceFact<T>) => {
    const providers = new Map<Id, () => ResourceFact<T>>();
    return (id) => {
      let provider = providers.get(id);
      if (provider === undefined) {
        provider = cached(`${family}:${id}`, () => load(id));
        providers.set(id, provider);
      }
      return provider();
    };
  };
  // A DEMAND door takes its subject at call time, so `cached`'s one-slot memo cannot serve it. Each distinct
  // demand is its own acquisition with its own receipt, keyed by the exact subject list — two different
  // demands must not collapse into one receipt that describes neither.
  const demanded = <T>(family: string, load: (subject: readonly string[]) => ResourceLoad<T>): ((subject: readonly string[]) => ResourceFact<T>) => {
    const providers = new Map<string, () => ResourceFact<T>>();
    return (subject) => {
      const distinct = [...new Set(subject)].toSorted((left, right) => left.localeCompare(right));
      const key = JSON.stringify(distinct);
      let provider = providers.get(key);
      if (provider === undefined) {
        provider = cached(`${family}#${String(providers.size)}`, () => load(distinct));
        providers.set(key, provider);
      }
      return provider();
    };
  };
  // An installed-package request is keyed by its whole identity, mode and named file included: `text` of one
  // file and `ast` of the same package are two different acquisitions with two different receipts.
  const installedProviders = new Map<string, () => ResourceFact<InstalledPackageFacts>>();
  const installed = (request: InstalledPackageRequest): ResourceFact<InstalledPackageFacts> => {
    const key = request.mode === "text" ? `${request.id}:text:${request.file}` : `${request.id}:${request.mode}`;
    let provider = installedProviders.get(key);
    if (provider === undefined) {
      provider = cached(`installed-package:${key}`, () => loadInstalledPackage(root, request));
      installedProviders.set(key, provider);
    }
    return provider();
  };
  /** The public half of the text door. TOTAL over the demanded paths: unlike the private waiver carrier
   *  below it, a path whose extension carries no comment grammar is SERVED with `format: undefined` rather
   *  than dropped — a silent drop is absence, which §12.3 forbids. */
  const loadAuthoredText = (paths: readonly string[]): ResourceLoad<AuthoredTextCorpus> => {
    if (paths.length === 0) {
      return { status: "empty", paths: [], members: 0, reason: "authored text was demanded for zero paths" };
    }
    const files: AuthoredTextFile[] = [];
    const refusals: AuthoredTextRefusal[] = [];
    for (const path of paths) {
      if (!acquiredPaths.has(path)) {
        refusals.push(Object.freeze({ path, status: "unacquired", reason: `resource was not acquired through a declared door: ${path}` }));
        continue;
      }
      const text = reader.read(path);
      if (text.status === "ready") {
        files.push(Object.freeze({ path, text: text.value, format: ordinaryWaiverResourceFormat(path) }));
      } else {
        refusals.push(Object.freeze({ path, status: text.status, reason: text.reason }));
      }
    }
    // `members` is what the door MEASURED — every demanded path — never only the ones it could serve.
    return { status: "ready", value: { files, refusals }, paths: [], members: files.length + refusals.length };
  };
  // An exact-file acquisition is keyed by its whole demanded ID SET: a policy asking for one file and a
  // policy asking for three are two different measurements with two different refusal surfaces, and one
  // receipt describing both would describe neither.
  const exactProviders = new Map<string, () => ResourceFact<ReadonlyMap<ExactResourceId, ExactFile>>>();
  const exactFiles = (ids: readonly ExactResourceId[]): ResourceFact<ReadonlyMap<ExactResourceId, ExactFile>> => {
    const distinct = [...new Set(ids)].toSorted((left, right) => left.localeCompare(right));
    const key = distinct.join(",");
    let provider = exactProviders.get(key);
    if (provider === undefined) {
      provider = cached(`exact-file:${key}`, () => loadExactFiles(reader, distinct));
      exactProviders.set(key, provider);
    }
    return provider();
  };
  const authoredCss = cached("authored-css", () => loadAuthoredCss(reader));
  const productCss = cached("product-css", () => loadProductCss(reader));
  const host: ResourceHost = Object.freeze({
    authoredTree: keyed("authored-tree", (id: AuthoredTreeId) => loadAuthoredTree(reader, id)),
    authoredCss,
    productCss,
    cssInventory: keyed("css-inventory", (request) => loadCssFacts(request === "authored" ? authoredCss() : productCss())),
    packageMetadata: keyed("package", (id: PackageResourceId) => loadPackageMetadata(reader, id)),
    staticConfig: keyed("static-config", (id: StaticConfigResourceId) => loadStaticConfig(reader, id, parseSource)),
    nativeConfig: keyed<ConfigSnapshotRunner, ConfigSnapshot>("native-config", (id) =>
      loadNativeConfig(reader, invocationOptions, id),
    ) as ResourceHost["nativeConfig"],
    trackedFiles: cached("tracked-files", () => loadTrackedFiles(root)),
    candidateIndexDelta: demanded("candidate-index-delta", (paths) => loadCandidateIndexDelta(root, paths)),
    json: keyed<JsonResourceId, JsonResourceFacts>("json", (id) => loadJsonResource(reader, id)),
    installedPackage: (request: InstalledPackageRequest) => installed(request),
    mirrorIndex: keyed("mirror-index", (id: MirrorFamilyId) => loadMirrorIndex(reader, id)),
    documents: cached("documents", () => loadDocumentIndex(reader)),
    // The per-id narrowing is a TYPE property of the door (`LedgerFactsFor`); the provider is one function
    // over the closed id set, exactly as `nativeConfig` resolves its own per-runner snapshot type.
    ledger: keyed<LedgerId, LedgerFacts>("ledger", (id) => loadLedger(reader, id)) as ResourceHost["ledger"],
    exactFiles,
    vendorCssSurface: cached("vendor-css-surface", () => loadVendorCssSurface(reader, root)),
    tokenContract: cached("token-contract", () => loadTokenContract(reader, root)),
    devtoolsClosure: cached("devtools-closure", () => loadDevToolsClosure(reader)),
    authoredPaths: demanded("authored-path", (selectors) => loadAuthoredPaths(root, selectors)),
    authoredText: demanded("authored-text", (paths) => loadAuthoredText(paths)),
  });
  // Every demanded waiver-format path leaves here as a carrier or as a REFUSAL carrying the reader's own
  // reason. A silent drop was the shape that let a by-design symlink refusal reach the dispatcher as an
  // unexplained absence (#1947).
  const ordinaryWaiverCarriers = (subjects: readonly string[]): OrdinaryWaiverCarriers => {
    const sources: OrdinaryWaiverSource[] = [];
    const refusals: OrdinaryWaiverCarrierRefusal[] = [];
    for (const path of [...new Set(subjects)].toSorted((left, right) => left.localeCompare(right))) {
      const format = ordinaryWaiverResourceFormat(path);
      if (format === undefined) {
        continue;
      }
      if (!acquiredPaths.has(path)) {
        refusals.push(Object.freeze({ path, format, status: "unacquired", reason: `resource was not acquired through a declared door: ${path}` }));
        continue;
      }
      const text = reader.read(path);
      if (text.status === "ready") {
        sources.push(Object.freeze({ kind: "resource", path, format, text: text.value }));
      } else {
        refusals.push(Object.freeze({ path, format, status: text.status, reason: text.reason }));
      }
    }
    return Object.freeze({ sources: Object.freeze(sources), refusals: Object.freeze(refusals) });
  };
  return Object.freeze({
    host,
    receipts: () => Object.freeze([...receipts.values()].toSorted((left, right) => left.source.localeCompare(right.source))),
    ordinaryWaiverCarriers,
  });
}
