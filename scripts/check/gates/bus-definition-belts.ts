// Gate: bus-definition-belts (client-architecture-lockdown.md §13 law 4/5, §16 G11) — a new bus's
// `*_EVENT_TYPES` belt const is the PRODUCER-coverage belt; a client mapped-type-total map over its event
// union is the CONSUMER-exhaustiveness belt. Two belt shapes are recognized: the object literal
// `{ … } satisfies Record<X["type"], true>` (CHAT_BUS_EVENT_TYPES/USER_BUS_EVENT_TYPES) and the array
// literal `[…] as const satisfies readonly X["type"][]` (RPG_BUS_EVENT_TYPES) — a plain `[…] as const`
// with no `satisfies` (DOMAIN_EVENT_TYPES) is NOT a bus belt and is out of scope. A new bus can ship the
// belt const and still be missing either enforcement belt (a coverage gate that never got built, or a
// client map that never got wired) — both are silent holes tsc can't see (a `satisfies` const with no
// consumer is legal TypeScript). Every such const found in `@orb/contracts` must have BOTH: a
// `scripts/check/gates/*.ts` coverage-gate file naming it, AND a mapped-type total map over its event union
// somewhere in `packages/client/src` (the ONE invalidation seam `data/invalidation.ts` for the global
// chat/user buses; a bus's own stream hook otherwise — the belt is located client-wide BY SHAPE, never by
// path). (Truth-repair 2026-08-14, event-bus coverage survey §1.2: this line used to name
// `features/rpg/hooks/use-rpg-stream.ts` as the rpg map's home. That file does not exist — `RPG_BUS_FILTERS`
// lives in `data/invalidation.ts` with the other two maps, and the gate never looked at a path anyway.)
import type { SourceFile, Node as TsNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const CONTRACTS_SCOPE = /\/packages\/contracts\/src\//u;
const GATES_SCOPE = /\/scripts\/check\/gates\//u;
const OWN_HOME = /bus-definition-belts\.ts$/u;
const CLIENT_SRC = /\/packages\/client\/src\//u;
const EVENT_TYPES_SUFFIX = "_EVENT_TYPES";

const NO_COVERAGE_GATE_PREFIX =
  "*_EVENT_TYPES const has NO matching coverage-gate file — a new bus's producer-coverage belt (client-architecture-lockdown.md §13 law 4, the bus-coverage/user-bus-coverage precedent) was never built. Add a scripts/check/gates/<bus>-coverage.ts ratchet naming this const: ";
const NO_CLIENT_MAP_PREFIX =
  "*_EVENT_TYPES const has NO client-side total map in packages/client/src — a new bus's consumer-exhaustiveness belt (client-architecture-lockdown.md §13 law 3/5) is unwired; add a mapped-type total map over the event union (the ONE invalidation seam data/invalidation.ts for global buses, or the bus's own stream hook): ";

interface EventTypesConst {
  readonly name: string;
  readonly unionName: string;
  readonly file: string;
}

/** `decl`'s initializer, if it is one of the two producer-coverage belt shapes — the union's type-name,
 *  or `undefined` if the shape doesn't match. Both shapes assert the belt is total over `Union["type"]`:
 *    A. object literal `{ … } satisfies Record<Union["type"], true>` (chat/user)
 *    B. array literal `[…] as const satisfies readonly Union["type"][]` (rpg)
 *  A plain `[…] as const` with NO `satisfies` (e.g. `DOMAIN_EVENT_TYPES`) is NOT a bus belt — excluded. */
function recordUnionName(decl: { getInitializer: () => TsNode | undefined }): string | undefined {
  const init = decl.getInitializer();
  if (init === undefined || !Node.isSatisfiesExpression(init)) {
    return;
  }
  const typeNode = init.getTypeNode();
  // Shape A: satisfies Record<Union["type"], true>
  if (Node.isTypeReference(typeNode) && typeNode.getTypeName().getText() === "Record") {
    const first = typeNode.getTypeArguments()[0];
    return first !== undefined && Node.isIndexedAccessTypeNode(first) ? first.getObjectTypeNode().getText() : undefined;
  }
  // Shape B: satisfies readonly Union["type"][]  (the `readonly` is a TypeOperator wrapping the ArrayType)
  const arrayType = Node.isTypeOperatorTypeNode(typeNode) ? typeNode.getTypeNode() : typeNode;
  if (arrayType === undefined || !Node.isArrayTypeNode(arrayType)) {
    return;
  }
  const el = arrayType.getElementTypeNode();
  return Node.isIndexedAccessTypeNode(el) ? el.getObjectTypeNode().getText() : undefined;
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

/** Does SOME `packages/client/src` file declare a mapped type (`[K in Union["type"]]`) OR a
 *  `Record<Union["type"], …>` type reference over this exact union — the client consumer-exhaustiveness
 *  belt. All three live maps (chat/user/rpg) happen to sit in the ONE invalidation seam
 *  `data/invalidation.ts` today, but the search is BY SHAPE and client-wide on purpose: a feature bus may
 *  legitimately home its total map in its own stream hook, and a path-keyed gate dies on a rename.
 *  (Truth-repair 2026-08-14: this comment used to assert the rpg map lived in
 *  `features/rpg/hooks/use-rpg-stream.ts` — no such file exists.) */
function fileHasTotalMap(sf: SourceFile, unionName: string): boolean {
  const mappedHit = sf.getDescendantsOfKind(SyntaxKind.MappedType).some((m) => isIndexedOverUnion(m.getTypeParameter().getConstraint(), unionName));
  if (mappedHit) {
    return true;
  }
  return sf
    .getDescendantsOfKind(SyntaxKind.TypeReference)
    .some((ref) => ref.getTypeName().getText() === "Record" && isIndexedOverUnion(ref.getTypeArguments()[0], unionName));
}

function hasClientTotalMap(files: readonly SourceFile[], unionName: string): boolean {
  return files.some((f) => CLIENT_SRC.test(f.getFilePath()) && fileHasTotalMap(f, unionName));
}

export const gate: GateDescriptor = {
  name: "bus-definition-belts",
  docRow: "client-architecture-lockdown.md §13 law 4/5, §16 G11",
  status: "active",
  scopeSafety: "whole-project",
  message: NO_COVERAGE_GATE_PREFIX,
  fix: "add the missing belt: a scripts/check/gates/<bus>-coverage.ts ratchet naming the const, and/or a mapped-type total map over the event union somewhere in packages/client/src (data/invalidation.ts for global buses, or the bus's own stream hook).",
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
    {
      // the ARRAY-belt shape (`[…] as const satisfies readonly X["type"][]`, the rpg pattern) is now in
      // scope — it too fires when both belts are missing.
      files: {
        "packages/contracts/src/__probe/index.ts":
          'export type PArr = { type: "a" };\nexport const PARR_EVENT_TYPES = ["a"] as const satisfies readonly PArr["type"][];\n',
        "packages/client/src/data/invalidation.ts": "export const untouched = 1;\n",
      },
      expect: { messageIncludes: "NO matching coverage-gate file" },
      why: "an array-literal `satisfies readonly X[type][]` belt (the rpg shape) with neither belt — the array-shape blindness fix now catches it",
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
      why: "a plain `as const` array with NO `satisfies` (DOMAIN_EVENT_TYPES) is NOT a bus belt — out of this gate's target, passes",
    },
    {
      // the array-belt shape WITH both belts — and the client total map homed in a FEATURE STREAM HOOK
      // (not data/invalidation.ts), the rpg `use-rpg-stream.ts` case: the belt is located client-wide.
      files: {
        "packages/contracts/src/__probe/index.ts":
          'export type PArr = { type: "a" };\nexport const PARR_EVENT_TYPES = ["a"] as const satisfies readonly PArr["type"][];\n',
        "scripts/check/gates/__parr-coverage.ts": 'export const TYPES_CONST = "PARR_EVENT_TYPES";\n',
        "packages/client/src/features/probe/hooks/use-probe-stream.ts":
          'import type { PArr } from "@orb/contracts/__probe";\ntype ProbeMap = { readonly [K in PArr["type"]]: () => void };\n',
      },
      why: "an array-belt const with BOTH belts, the client map in a feature stream hook (not the invalidation seam) — the client-wide belt location, passes",
    },
  ],
};
