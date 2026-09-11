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
import type { ResourceHost, ResourceHostOptions, ResourceInvocation } from "../contract/resource-host.ts";
import type { AuthoredTreeId } from "../contract/resource-tree.ts";
import { ordinaryWaiverResourceFormat } from "../lib/ordinary-waiver-source.ts";
import { loadPackageMetadata, loadStaticConfig } from "./resource-config.ts";
import { loadCssFacts } from "./resource-css.ts";
import { loadNativeConfig } from "./resource-native-config.ts";
import { createResourceReader } from "./resource-reader.ts";
import { loadTrackedFiles } from "./resource-tracked.ts";
import { loadAuthoredCss, loadAuthoredTree, loadProductCss } from "./resource-tree.ts";

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
  });
  // Every demanded waiver-format path leaves here as a carrier or as a REFUSAL carrying the reader's own
  // reason. A silent drop was the shape that let a by-design symlink refusal reach the dispatcher as an
  // unexplained absence (#1947).
  const ordinaryWaiverCarriers = (demanded: readonly string[]): OrdinaryWaiverCarriers => {
    const sources: OrdinaryWaiverSource[] = [];
    const refusals: OrdinaryWaiverCarrierRefusal[] = [];
    for (const path of [...new Set(demanded)].toSorted((left, right) => left.localeCompare(right))) {
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
