// Gate: bus-definition-belts (client-architecture-lockdown.md §13 law 4/5, §16 G11) — a new bus's
// `*_EVENT_TYPES satisfies Record<X["type"], true>` const (the CHAT_BUS_EVENT_TYPES/USER_BUS_EVENT_TYPES
// pattern) is the PRODUCER-coverage belt; the client's mapped-type-total map in `data/invalidation.ts` is
// the CONSUMER-exhaustiveness belt. A new bus can ship the const and still be missing either belt (a
// coverage gate that never got built, or a client map that never got wired) — both are silent holes tsc
// can't see (a `satisfies` const with no consumer is legal TypeScript). Every such const found in
// `@orb/contracts` must have BOTH: a `scripts/check/gates/*.ts` coverage-gate file naming it, AND a
// mapped-type total map over its event union in `packages/client/src/data/invalidation.ts`.
import type { SourceFile, Node as TsNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const CONTRACTS_SCOPE = /\/packages\/contracts\/src\//u;
const GATES_SCOPE = /\/scripts\/check\/gates\//u;
const OWN_HOME = /bus-definition-belts\.ts$/u;
const INVALIDATION_FILE = /\/packages\/client\/src\/data\/invalidation\.ts$/u;
const EVENT_TYPES_SUFFIX = "_EVENT_TYPES";

const NO_COVERAGE_GATE_PREFIX =
  "*_EVENT_TYPES const has NO matching coverage-gate file — a new bus's producer-coverage belt (client-architecture-lockdown.md §13 law 4, the bus-coverage/user-bus-coverage precedent) was never built. Add a scripts/check/gates/<bus>-coverage.ts ratchet naming this const: ";
const NO_CLIENT_MAP_PREFIX =
  "*_EVENT_TYPES const has NO client-side total map in data/invalidation.ts — a new bus's consumer-exhaustiveness belt (client-architecture-lockdown.md §13 law 3/5) is unwired; add a mapped-type total map over the event union in the ONE invalidation seam: ";

interface EventTypesConst {
  readonly name: string;
  readonly unionName: string;
  readonly file: string;
}

/** `decl`'s initializer, if it is `satisfies Record<Union["type"], true>` — the union's type-name, or
 *  `undefined` if the shape doesn't match (a differently-shaped `_EVENT_TYPES` const, e.g. an array-literal
 *  tuple, is out of this gate's target shape entirely). */
function recordUnionName(decl: { getInitializer: () => TsNode | undefined }): string | undefined {
  const init = decl.getInitializer();
  if (init === undefined || !Node.isSatisfiesExpression(init)) {
    return;
  }
  const typeNode = init.getTypeNode();
  if (!Node.isTypeReference(typeNode) || typeNode.getTypeName().getText() !== "Record") {
    return;
  }
  const first = typeNode.getTypeArguments()[0];
  return first !== undefined && Node.isIndexedAccessTypeNode(first) ? first.getObjectTypeNode().getText() : undefined;
}

/** Every `X_EVENT_TYPES` const in @orb/contracts shaped `satisfies Record<Union["type"], true>` — the
 *  belt-set's producer side (bus-coverage.ts's own home). Vacuous on a synthetic tree with no contracts. */
function findEventTypesConsts(files: readonly SourceFile[]): EventTypesConst[] {
  const found: EventTypesConst[] = [];
  for (const sf of files.filter((f) => CONTRACTS_SCOPE.test(f.getFilePath()))) {
    for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
      const name = decl.getName();
      if (!name.endsWith(EVENT_TYPES_SUFFIX)) {
        continue;
      }
      const unionName = recordUnionName(decl);
      if (unionName !== undefined) {
        found.push({ name, unionName, file: sf.getFilePath() });
      }
    }
  }
  return found;
}

/** Does any scripts/check/gates/*.ts file (other than this one) name the const literally? Mirrors
 *  bus-coverage.ts's own `const TYPES_CONST = "CHAT_BUS_EVENT_TYPES"` convention. */
function hasCoverageGate(files: readonly SourceFile[], constName: string): boolean {
  return files.some((sf) => GATES_SCOPE.test(sf.getFilePath()) && !OWN_HOME.test(sf.getFilePath()) && sf.getFullText().includes(constName));
}

/** Is `node` an `IndexedAccessTypeNode` over exactly `unionName["type"]`-shaped? */
function isIndexedOverUnion(node: TsNode | undefined, unionName: string): boolean {
  return node !== undefined && Node.isIndexedAccessTypeNode(node) && node.getObjectTypeNode().getText() === unionName;
}

/** Does data/invalidation.ts declare a mapped type (`[K in Union["type"]]`) OR a `Record<Union["type"], …>`
 *  type reference over this exact union — the client consumer-exhaustiveness belt. */
function hasClientTotalMap(files: readonly SourceFile[], unionName: string): boolean {
  const sf = files.find((f) => INVALIDATION_FILE.test(f.getFilePath()));
  if (sf === undefined) {
    return false;
  }
  const mappedHit = sf.getDescendantsOfKind(SyntaxKind.MappedType).some((m) => isIndexedOverUnion(m.getTypeParameter().getConstraint(), unionName));
  if (mappedHit) {
    return true;
  }
  return sf
    .getDescendantsOfKind(SyntaxKind.TypeReference)
    .some((ref) => ref.getTypeName().getText() === "Record" && isIndexedOverUnion(ref.getTypeArguments()[0], unionName));
}

export const gate: GateDescriptor = {
  name: "bus-definition-belts",
  docRow: "client-architecture-lockdown.md §13 law 4/5, §16 G11",
  status: "active",
  scopeSafety: "whole-project",
  message: NO_COVERAGE_GATE_PREFIX,
  fix: "add the missing belt: a scripts/check/gates/<bus>-coverage.ts ratchet naming the const, and/or a mapped-type total map over the event union in data/invalidation.ts.",
  run: (ctx) => {
    const files = ctx.project.getSourceFiles();
    for (const c of findEventTypesConsts(files)) {
      const file = ctx.root === "" ? c.file : c.file.slice(ctx.root.length + 1);
      if (!hasCoverageGate(files, c.name)) {
        ctx.report({ file, line: 1, column: 0, message: NO_COVERAGE_GATE_PREFIX + c.name });
      }
      if (!hasClientTotalMap(files, c.unionName)) {
        ctx.report({ file, line: 1, column: 0, message: NO_CLIENT_MAP_PREFIX + c.name });
      }
    }
  },
  mustFlag: [
    {
      files: {
        "packages/contracts/src/__probe/index.ts":
          'export type PEv = { type: "a" };\nexport const PROBE_EVENT_TYPES = { a: true } satisfies Record<PEv["type"], true>;\n',
        "packages/client/src/data/invalidation.ts": "export const untouched = 1;\n",
      },
      expect: { messageIncludes: "NO matching coverage-gate file" },
      why: "a new bus's *_EVENT_TYPES const with NEITHER a coverage-gate file NOR a client total map — both belts missing",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/contracts/src/__probe/index.ts":
          'export type PEv = { type: "a" };\nexport const PROBE_EVENT_TYPES = { a: true } satisfies Record<PEv["type"], true>;\n',
        "scripts/check/gates/__probe-coverage.ts": 'export const TYPES_CONST = "PROBE_EVENT_TYPES";\n',
        "packages/client/src/data/invalidation.ts":
          'import type { PEv } from "@orb/contracts/__probe";\ntype ProbeMap = { readonly [K in PEv["type"]]: () => void };\n',
      },
      why: "the const has BOTH belts: a coverage-gate file naming it + a client mapped-type total map over its union — passes",
    },
    {
      files: {
        "packages/contracts/src/events/index.ts": 'export const DOMAIN_EVENT_TYPES = ["character.updated"] as const;\n',
        "packages/client/src/data/invalidation.ts": "export const untouched = 1;\n",
      },
      why: "an array-literal DOMAIN_EVENT_TYPES const (not `satisfies Record<X[type], true>`) is a DIFFERENT shape — not this gate's target, passes",
    },
  ],
};
