// Shared query/invalidation graph for the freshness family. All descendants arrive through the
// runtime visitor stream; the fact does not open a Project or perform a private subtree walk.
//
// EVERY HOP OF THE `trpc.<router>.<proc>.<terminal>` CHAIN IS READ THROUGH `lib/symbol-reference.ts`
// (#2353). Keyed on `PropertyAccessExpression` alone, this reader saw neither side of the graph under a
// bracket respelling: `trpc["automation"]["listChatActivity"]["queryOptions"]({})` was not a CONSUMED read
// (so the coverage policy stopped flagging its own fixtures) and
// `trpc["x"]["y"]["pathFilter"]()` was not a COVERAGE filter (so the acquitting side would
// have gone blind in the same edit). Both halves move together here, which is the only safe direction: a
// widened accusing side alone would have turned correctly invalidated bracket-spelled reads into findings.
// The visitor subscribes `MEMBER_ACCESS_KINDS`, not half the family.

import { staticMemberAccess } from "@orb/tooling/floor/code-facts/reference-fact";
import type { ImportDeclaration, Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { MEMBER_ACCESS_KINDS } from "../../floor/code-facts/reference-fact-contract.ts";
import type { InventoryInvocationPlan, NativeInvocationEvidence } from "../../floor/code-facts/semantic-inventory-contract.ts";
import { typeProjectionFacet } from "../../floor/code-facts/type-projection-contract.ts";
import { defineFact } from "../contract/fact.ts";
import { requiredInvocationFact } from "./native-invocation.ts";

const SEAM_FACTORY = "createInvalidation";
const SEAM_ANCHOR = "Invalidation";
const SEAM_SIBLING = /\/packages\/client\/src\/data\/invalidation[^/]*\.ts$/u;
const READ_TERMINALS = new Set(["queryOptions", "infiniteQueryOptions"]);
const FILTER_TERMINALS = new Set(["pathFilter", "queryFilter"]);
const REACH_PLAN: InventoryInvocationPlan = {
  mode: "value",
  facets: ["module", "type-projection"],
  arguments: [],
  typeProjection: { facets: ["lexical"], properties: [] },
};

interface QueryKey {
  readonly router: string;
  readonly proc: string;
}
interface LocatedFilter {
  readonly node: MorphNode;
  readonly owner: MorphNode | undefined;
  readonly key: string | undefined;
  readonly root: string | undefined;
}
interface IdentifierUse {
  readonly node: MorphNode;
  readonly owner: MorphNode | undefined;
}

function baseIsTrpc(base: MorphNode): boolean {
  if (Node.isIdentifier(base)) {
    return /^trpc$/iu.test(base.getText());
  }
  const read = staticMemberAccess(base);
  return read !== undefined && /^trpc$/iu.test(read.name);
}

/** The RECEIVER of a member read whose member is one of `terminals`, whatever the spelling. */
function terminalReceiver(node: MorphNode, terminals: ReadonlySet<string>): MorphNode | undefined {
  const read = staticMemberAccess(node);
  return read !== undefined && terminals.has(read.name) ? read.receiver : undefined;
}

function trpcChain(node: MorphNode, terminals: ReadonlySet<string>): QueryKey | undefined {
  const terminal = terminalReceiver(node, terminals);
  if (terminal === undefined) {
    return;
  }
  const proc = staticMemberAccess(terminal);
  if (proc === undefined) {
    return;
  }
  const router = staticMemberAccess(proc.receiver);
  if (router === undefined || !baseIsTrpc(router.receiver)) {
    return;
  }
  return { router: router.name, proc: proc.name };
}

function trpcRoot(node: MorphNode, terminals: ReadonlySet<string>): string | undefined {
  const terminal = terminalReceiver(node, terminals);
  if (terminal === undefined) {
    return;
  }
  const router = staticMemberAccess(terminal);
  return router !== undefined && baseIsTrpc(router.receiver) ? router.name : undefined;
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

function sameDeclaration(reference: MorphNode, declaration: MorphNode, evidence: NativeInvocationEvidence): boolean {
  if (!Node.isIdentifier(reference)) {
    return false;
  }
  const lexical = typeProjectionFacet(requiredInvocationFact(evidence.typeProjections, reference), "lexical").value;
  if (lexical.kind === "resolved" && lexical.value === declaration) {
    return true;
  }
  const origin = requiredInvocationFact(evidence.modules, reference);
  return origin.kind === "resolved" && origin.value.canonical.kind === "project" && origin.value.canonical.declaration === declaration;
}

export interface QueryFreshnessFact {
  readonly consumed: ReadonlyMap<string, MorphNode>;
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
    const native = ctx.nativeTypes;
    if (native === undefined) {
      throw new Error("native query freshness evidence is unavailable");
    }
    const sources = new Map<string, SourceFile>();
    const declarations = new Set<MorphNode>();
    const declarationsBySource = new Map<SourceFile, MorphNode[]>();
    const importsBySource = new Map<SourceFile, ImportDeclaration[]>();
    const anchorSources = new Set<SourceFile>();
    const consumed = new Map<string, MorphNode>();
    const filters: LocatedFilter[] = [];
    const identifiers: IdentifierUse[] = [];
    const nominated: MorphNode[] = [];
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
            ...MEMBER_ACCESS_KINDS,
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
              importsBySource.set(source, [...(importsBySource.get(source) ?? []), node]);
              return;
            }
            if (Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node)) {
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
      prepare: () => {
        const seams = [...sources.values()].filter(
          (source) =>
            anchorSources.has(source) &&
            (declarationsBySource.get(source) ?? []).some(
              (node) => (Node.isFunctionDeclaration(node) || Node.isVariableDeclaration(node)) && node.getName() === SEAM_FACTORY,
            ),
        );
        const candidates = new Set(seams);
        for (const source of sources.values()) {
          if (SEAM_SIBLING.test(source.getFilePath())) {
            candidates.add(source);
          }
        }
        for (const source of seams) {
          native.request({ kind: "module-targets", nodes: importsBySource.get(source) ?? [] });
        }
        for (const use of identifiers) {
          if (use.owner !== undefined && candidates.has(use.owner.getSourceFile())) {
            nominated.push(use.node);
          }
        }
        native.request({ kind: "invocation-evidence", nodes: nominated, plan: REACH_PLAN });
      },
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: finish closes one graph from the collected declarations, edges and filters.
      finish: (): QueryFreshnessFact => {
        const seam = [...sources.values()].find((source) => {
          const own = declarationsBySource.get(source) ?? [];
          const hasFactory = own.some((node) => (Node.isFunctionDeclaration(node) || Node.isVariableDeclaration(node)) && node.getName() === SEAM_FACTORY);
          return hasFactory && anchorSources.has(source);
        });
        if (anchor !== undefined && seam === undefined) {
          throw new Error("the Invalidation anchor is present but createInvalidation is absent, so the freshness coverage side would be vacuous");
        }
        const keys = new Set<string>();
        const roots = new Set<string>();
        if (seam !== undefined) {
          const modules = new Set<SourceFile>([seam]);
          const imports = importsBySource.get(seam) ?? [];
          const targets = native.moduleTargets(imports);
          for (const declaration of imports) {
            if (!targets.has(declaration)) {
              throw new Error("native query import target coverage is unavailable");
            }
            const target = targets.get(declaration);
            if (target !== undefined && SEAM_SIBLING.test(target.getFilePath())) {
              modules.add(target);
            }
          }
          const bindings = [...declarations].filter((declaration) => modules.has(declaration.getSourceFile()));
          const factory = bindings.find(
            (node) =>
              (Node.isFunctionDeclaration(node) || Node.isVariableDeclaration(node)) && node.getSourceFile() === seam && node.getName() === SEAM_FACTORY,
          );
          const reachable = new Set<MorphNode>();
          const evidence = native.invocationEvidence(nominated, REACH_PLAN);
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
                if (candidate !== owner && sameDeclaration(use.node, candidate, requiredInvocationFact(evidence, use.node)) && !reachable.has(candidate)) {
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
