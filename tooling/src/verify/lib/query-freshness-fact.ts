// Shared query/invalidation graph for the freshness family. All descendants arrive through the
// runtime visitor stream; the fact does not open a Project or perform a private subtree walk.

import { resolveLexicalValueDeclaration, resolveModuleMemberOrigin } from "@orb/tooling/_shared/reference-fact";
import type { Node as MorphNode, PropertyAccessExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";

const SEAM_FACTORY = "createInvalidation";
const SEAM_ANCHOR = "Invalidation";
const SEAM_SIBLING = /\/packages\/client\/src\/data\/invalidation[^/]*\.ts$/u;
const READ_TERMINALS = new Set(["queryOptions", "infiniteQueryOptions"]);
const FILTER_TERMINALS = new Set(["pathFilter", "queryFilter"]);

interface QueryKey {
  readonly router: string;
  readonly proc: string;
}
interface LocatedFilter {
  readonly node: PropertyAccessExpression;
  readonly owner: MorphNode | undefined;
  readonly key: string | undefined;
  readonly root: string | undefined;
}
interface IdentifierUse {
  readonly node: MorphNode;
  readonly owner: MorphNode | undefined;
}

function baseIsTrpc(base: MorphNode): boolean {
  return Node.isIdentifier(base) ? /^trpc$/iu.test(base.getText()) : Node.isPropertyAccessExpression(base) && /^trpc$/iu.test(base.getName());
}

function trpcChain(node: MorphNode, terminals: ReadonlySet<string>): QueryKey | undefined {
  if (!(Node.isPropertyAccessExpression(node) && terminals.has(node.getName()))) {
    return;
  }
  const proc = node.getExpression();
  if (!Node.isPropertyAccessExpression(proc)) {
    return;
  }
  const router = proc.getExpression();
  if (!(Node.isPropertyAccessExpression(router) && baseIsTrpc(router.getExpression()))) {
    return;
  }
  return { router: router.getName(), proc: proc.getName() };
}

function trpcRoot(node: MorphNode, terminals: ReadonlySet<string>): string | undefined {
  if (!(Node.isPropertyAccessExpression(node) && terminals.has(node.getName()))) {
    return;
  }
  const router = node.getExpression();
  return Node.isPropertyAccessExpression(router) && baseIsTrpc(router.getExpression()) ? router.getName() : undefined;
}

function topLevelBinding(node: MorphNode): MorphNode | undefined {
  let current: MorphNode | undefined = node;
  while (current !== undefined && !Node.isSourceFile(current)) {
    if (Node.isFunctionDeclaration(current) && Node.isSourceFile(current.getParent())) {
      return current;
    }
    if (Node.isVariableDeclaration(current)) {
      const statement = current.getVariableStatement();
      if (statement !== undefined && Node.isSourceFile(statement.getParent())) {
        return current;
      }
    }
    current = current.getParent();
  }
  return current;
}

function sameDeclaration(reference: MorphNode, declaration: MorphNode): boolean {
  if (!Node.isIdentifier(reference)) {
    return false;
  }
  const lexical = resolveLexicalValueDeclaration(reference);
  if (lexical.kind === "resolved" && lexical.value === declaration) {
    return true;
  }
  const origin = resolveModuleMemberOrigin(reference);
  return origin.kind === "resolved" && origin.value.canonical.kind === "project" && origin.value.canonical.declaration === declaration;
}

export interface QueryFreshnessFact {
  readonly consumed: ReadonlyMap<string, PropertyAccessExpression>;
  readonly coverage: { readonly keys: ReadonlySet<string>; readonly roots: ReadonlySet<string> };
  readonly seam: SourceFile | undefined;
  readonly anchor: MorphNode | undefined;
  readonly anchorPresent: boolean;
  readonly covered: (key: string) => boolean;
}

export const queryFreshnessFact = defineFact({
  id: "query-freshness-graph",
  population: "@client",
  analysis: "types",
  resources: [],
  create: (ctx) => {
    const sources = new Map<string, SourceFile>();
    const declarations = new Set<MorphNode>();
    const declarationsBySource = new Map<SourceFile, MorphNode[]>();
    const importsBySource = new Map<SourceFile, SourceFile[]>();
    const anchorSources = new Set<SourceFile>();
    const consumed = new Map<string, PropertyAccessExpression>();
    const filters: LocatedFilter[] = [];
    const identifiers: IdentifierUse[] = [];
    let anchor: MorphNode | undefined;

    const addDeclaration = (node: MorphNode, source: SourceFile): void => {
      if (topLevelBinding(node) !== node) {
        return;
      }
      declarations.add(node);
      const list = declarationsBySource.get(source) ?? [];
      list.push(node);
      declarationsBySource.set(source, list);
    };

    return {
      visitFile: (source) => {
        sources.set(ctx.relativePath(source), source);
      },
      visitors: [
        {
          kinds: [
            SyntaxKind.FunctionDeclaration,
            SyntaxKind.VariableDeclaration,
            SyntaxKind.InterfaceDeclaration,
            SyntaxKind.ImportDeclaration,
            SyntaxKind.PropertyAccessExpression,
            SyntaxKind.Identifier,
          ],
          // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one visitor classifies the closed shared node stream by kind.
          visit: (node, source) => {
            if (Node.isFunctionDeclaration(node) || Node.isVariableDeclaration(node)) {
              addDeclaration(node, source);
              return;
            }
            if (Node.isInterfaceDeclaration(node)) {
              if (node.getName() === SEAM_ANCHOR) {
                anchorSources.add(source);
              }
              return;
            }
            if (Node.isImportDeclaration(node)) {
              const target = node.getModuleSpecifierSourceFile();
              if (target !== undefined) {
                importsBySource.set(source, [...(importsBySource.get(source) ?? []), target]);
              }
              return;
            }
            if (Node.isPropertyAccessExpression(node)) {
              const read = trpcChain(node, READ_TERMINALS);
              if (read !== undefined) {
                const key = `${read.router}.${read.proc}`;
                if (!consumed.has(key)) {
                  consumed.set(key, node);
                }
              }
              const filter = trpcChain(node, FILTER_TERMINALS);
              const root = filter === undefined ? trpcRoot(node, FILTER_TERMINALS) : undefined;
              if (filter !== undefined || root !== undefined) {
                filters.push({ node, owner: topLevelBinding(node), key: filter === undefined ? undefined : `${filter.router}.${filter.proc}`, root });
              }
              return;
            }
            if (Node.isIdentifier(node)) {
              if (node.getText() === SEAM_ANCHOR) {
                anchor ??= node;
              }
              identifiers.push({ node, owner: topLevelBinding(node) });
            }
          },
        },
      ],
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: finish closes one graph from the collected declarations, edges and filters.
      finish: (): QueryFreshnessFact => {
        const seam = [...sources.values()].find((source) => {
          const own = declarationsBySource.get(source) ?? [];
          const hasFactory = own.some((node) => (Node.isFunctionDeclaration(node) || Node.isVariableDeclaration(node)) && node.getName() === SEAM_FACTORY);
          return hasFactory && anchorSources.has(source);
        });
        const keys = new Set<string>();
        const roots = new Set<string>();
        if (seam !== undefined) {
          const modules = new Set<SourceFile>([seam]);
          for (const target of importsBySource.get(seam) ?? []) {
            if (SEAM_SIBLING.test(target.getFilePath())) {
              modules.add(target);
            }
          }
          const bindings = [...declarations].filter((declaration) => modules.has(declaration.getSourceFile()));
          const factory = bindings.find(
            (node) =>
              (Node.isFunctionDeclaration(node) || Node.isVariableDeclaration(node)) && node.getSourceFile() === seam && node.getName() === SEAM_FACTORY,
          );
          const reachable = new Set<MorphNode>();
          const pending = factory === undefined ? [] : [factory];
          while (pending.length > 0) {
            const owner = pending.pop();
            if (owner === undefined || reachable.has(owner)) {
              continue;
            }
            reachable.add(owner);
            for (const use of identifiers) {
              if (use.owner !== owner) {
                continue;
              }
              for (const candidate of bindings) {
                if (candidate !== owner && sameDeclaration(use.node, candidate) && !reachable.has(candidate)) {
                  pending.push(candidate);
                }
              }
            }
          }
          for (const filter of filters) {
            if (filter.owner === undefined || !reachable.has(filter.owner)) {
              continue;
            }
            if (filter.key !== undefined) {
              keys.add(filter.key);
            }
            if (filter.root !== undefined) {
              roots.add(filter.root);
            }
          }
        }
        const covered = (key: string): boolean => keys.has(key) || roots.has(key.slice(0, key.indexOf(".")));
        ctx.receipt({ kind: "population", source: "query-freshness-client-files", members: ctx.files.length });
        return { consumed, coverage: { keys, roots }, seam, anchor, anchorPresent: anchor !== undefined, covered };
      },
    };
  },
});
