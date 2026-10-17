// Capture maps keep keyed semantic dependencies separate from constructor-owned storage currentness.
import type { Project, SourceFile, ts } from "ts-morph";
import type { NativeReferenceInvocation } from "../compiler/ts-workspace-contract.ts";

/** Keyed semantic reads and whole-view opacity share the exact constructor-owned Map storage. */
export class RefinementMap<K, V extends object> extends Map<K, V> {
  readonly #read: (key: K, value: V | undefined, presence: boolean) => void;
  readonly #opaque: () => void;
  #revision: object = {};
  readonly #freshness = Object.freeze({
    get: (key: K): V | undefined => super.get(key),
    keys: (): MapIterator<K> => super.keys(),
    count: (): number => super.size,
    revision: (): object => this.#revision,
  });
  constructor(values: Iterable<readonly [K, V]>, read: (key: K, value: V | undefined, presence: boolean) => void, opaque: () => void) {
    super();
    for (const [key, value] of values) {
      super.set(key, value);
    }
    this.#read = read;
    this.#opaque = opaque;
  }
  static #owns<ViewKey, ViewValue extends object>(view: ReadonlyMap<ViewKey, ViewValue>): view is RefinementMap<ViewKey, ViewValue> {
    return #freshness in view;
  }
  static freshness<ViewKey, ViewValue extends object>(
    view: ReadonlyMap<ViewKey, ViewValue>,
  ): (Pick<ReadonlyMap<ViewKey, ViewValue>, "get" | "keys"> & { readonly count: () => number; readonly revision: () => object }) | undefined {
    return RefinementMap.#owns(view) ? view.#freshness : undefined;
  }
  override set(key: K, value: V): this {
    if (!super.has(key) || super.get(key) !== value) {
      this.#revision = {};
    }
    return super.set(key, value);
  }
  override delete(key: K): boolean {
    const deleted = super.delete(key);
    if (deleted) {
      this.#revision = {};
    }
    return deleted;
  }
  override clear(): void {
    if (super.size > 0) {
      this.#revision = {};
    }
    super.clear();
  }
  override get(key: K): V | undefined {
    const value = super.get(key);
    this.#read(key, value, false);
    return value;
  }
  override has(key: K): boolean {
    const value = super.has(key);
    this.#read(key, super.get(key), true);
    return value;
  }
  override get size(): number {
    this.#opaque();
    return super.size;
  }
  override entries(): ReturnType<Map<K, V>["entries"]> {
    this.#opaque();
    return super.entries();
  }
  override keys(): ReturnType<Map<K, V>["keys"]> {
    this.#opaque();
    return super.keys();
  }
  override values(): ReturnType<Map<K, V>["values"]> {
    this.#opaque();
    return super.values();
  }
  override [Symbol.iterator](): ReturnType<Map<K, V>[typeof Symbol.iterator]> {
    this.#opaque();
    return super[Symbol.iterator]();
  }
  override forEach(...args: Parameters<Map<K, V>["forEach"]>): void {
    this.#opaque();
    super.forEach(...args);
  }
}

function sourceCompilerNode(file: SourceFile): ts.SourceFile | undefined {
  return file.wasForgotten() ? undefined : file.compilerNode;
}

function sourcesCurrent(sources: Pick<ReadonlyMap<SourceFile, ts.SourceFile>, "get" | "keys">, read: (file: SourceFile) => ts.SourceFile | undefined): boolean {
  for (const file of sources.keys()) {
    // Native wrapper validation precedes the map read; reentrant work cannot substitute the expected value.
    const actual = read(file);
    if (actual === undefined || actual !== sources.get(file)) {
      return false;
    }
  }
  return true;
}

/** A census belongs to this capture's source map and the existing live native reader invocation. */
export class CapturedSourceMap extends RefinementMap<SourceFile, ts.SourceFile> {
  readonly #project: Project;
  #invocation: NativeReferenceInvocation | undefined;
  #current: { readonly program: ts.Program; readonly revision: object; readonly token: object } | undefined;
  constructor(
    project: Project,
    invocation: NativeReferenceInvocation | undefined,
    read: (source: SourceFile, native: ts.SourceFile | undefined, presence: boolean) => void,
    opaque: () => void,
  ) {
    super([], read, opaque);
    this.#project = project;
    this.#invocation = invocation;
  }
  release(): void {
    this.#current = undefined;
    this.#invocation = undefined;
  }
  static owns(sources: ReadonlyMap<SourceFile, ts.SourceFile>): sources is CapturedSourceMap {
    return #current in sources;
  }
  isCurrent(project: Project, program: ts.Program, revision: object): boolean {
    const sources = RefinementMap.freshness(this);
    if (sources === undefined || project !== this.#project || sources.revision() !== revision || project.getProgram().compilerObject !== program) {
      return false;
    }
    const invocation = this.#invocation;
    const native =
      invocation?.current() === true && typeof project.getSourceFileCacheToken === "function" && typeof project.getSourceFileCompilerNode === "function";
    const token = native ? project.getSourceFileCacheToken() : undefined;
    const current = (): boolean =>
      sources.revision() === revision &&
      (!native || (invocation.current() === true && token !== undefined && project.getSourceFileCacheToken() === token)) &&
      project.getProgram().compilerObject === program &&
      (!native || (invocation.current() === true && project.getSourceFileCacheToken() === token)) &&
      sources.revision() === revision;
    if (!current()) {
      return false;
    }
    if (native && this.#current?.program === program && this.#current.revision === revision && this.#current.token === token) {
      return current();
    }
    const read =
      native && token !== undefined ? (file: SourceFile): ts.SourceFile | undefined => project.getSourceFileCompilerNode(file, token) : sourceCompilerNode;
    if (!sourcesCurrent(sources, read)) {
      this.#current = undefined;
      return false;
    }
    if (!current()) {
      return false;
    }
    if (native && token !== undefined) {
      this.#current = { program, revision, token };
    }
    return true;
  }
}

/** Validate storage currentness without recording population-wide semantic reads. */
export function capturedSourcesCurrent(
  sources: ReadonlyMap<SourceFile, ts.SourceFile>,
  project: Project,
  program: ts.Program,
  revision: object | undefined,
): boolean {
  if (CapturedSourceMap.owns(sources) && revision !== undefined) {
    return sources.isCurrent(project, program, revision);
  }
  const freshness = RefinementMap.freshness(sources);
  return (
    sourcesCurrent(freshness ?? sources, sourceCompilerNode) &&
    project.getProgram().compilerObject === program &&
    (revision === undefined || freshness?.revision() === revision)
  );
}
