// Where a node sits and what a symbol's declaration is: the cross-world keys the scan joins records on. A declaration's
// key is its name's file and position, so a slot found in one world is the same slot in another.
import type { Node, SyntaxKind } from "@typescript/native/ast";
import { isBindingElement, isVariableDeclaration } from "@typescript/native/ast";
import type { APIRequestGenerator, Symbol as NativeSymbol } from "@typescript/native/sync";
import type { NativeWorld } from "../unwired/index.ts";
import { nameOf, ownerOf } from "./syntax.ts";
import type { Where } from "./types.ts";

const TEXT_WIDTH = 72;

/** A node's file and position as one key. */
export function siteKey(world: NativeWorld, node: Node): string {
  const { file, position } = world.siteOf(node);
  return `${file}:${position}`;
}

/** The package a repository file belongs to, or its top directory. */
function pkgOf(file: string): string {
  const [top, second] = file.split("/");
  return top === "packages" && second !== undefined ? second : (top ?? "other");
}

const lineStarts = new WeakMap<object, readonly number[]>();

function lineOf(node: Node): number {
  const source = node.getSourceFile();
  let starts = lineStarts.get(source);
  if (starts === undefined) {
    starts = [0, ...[...source.text.matchAll(/\n/gu)].map((match) => match.index + 1)];
    lineStarts.set(source, starts);
  }
  const position = node.getStart(source);
  return starts.findLastIndex((start) => start <= position) + 1;
}

export function whereOf(world: NativeWorld, node: Node): Where {
  const { file, position } = world.siteOf(node);
  return { file, line: lineOf(node), pkg: pkgOf(file), position };
}

/** A node's text on one line, cut to a width a report row holds. */
export const shortText = (node: Node): string => node.getText().replaceAll(/\s+/gu, " ").slice(0, TEXT_WIDTH);

/** What a symbol's declaration is: where it sits, what kind, what encloses it. */
export interface DeclInfo {
  readonly site: string | null;
  readonly file: string | null;
  /** The declaration is in a file outside the world's sources: a library. */
  readonly lib: boolean;
  readonly kind: SyntaxKind | null;
  readonly node: Node | undefined;
  readonly owner: string | null;
  readonly name: string;
}

export const NO_DECL: DeclInfo = { site: null, file: null, lib: false, kind: null, node: undefined, owner: null, name: "" };

export function* declInfo(world: NativeWorld, symbol: NativeSymbol | undefined): APIRequestGenerator<DeclInfo> {
  const handle = symbol?.declarations[0];
  if (symbol === undefined || handle === undefined) {
    return NO_DECL;
  }
  const node = yield* handle.resolve.gen();
  const file = world.fileOf(handle);
  return {
    site: node === undefined || file === null ? null : siteKey(world, nameOf(node)),
    file,
    lib: file === null,
    kind: handle.kind,
    node,
    owner: node === undefined ? null : ownerOf(node),
    name: symbol.name,
  };
}

/** The declaration the name at `name` resolves to. */
export function* symbolInfo(world: NativeWorld, name: Node): APIRequestGenerator<DeclInfo> {
  return yield* declInfo(world, yield* world.checker.getSymbolAtLocation.gen(name));
}

/** The declaration a callee's name resolves to. */
export function* calleeInfo(world: NativeWorld, rootName: Node | undefined): APIRequestGenerator<DeclInfo> {
  return rootName === undefined ? NO_DECL : yield* symbolInfo(world, rootName);
}

/** The variable declaration a node is, or the one a destructured name sits in. */
export function variableOf(node: Node | undefined): Node | undefined {
  const holder = node !== undefined && isBindingElement(node) ? node.parent.parent : node;
  return holder !== undefined && isVariableDeclaration(holder) ? holder : undefined;
}
