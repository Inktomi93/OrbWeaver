// Policy: message-kind-policy-coverage — MESSAGE_KIND_POLICY (packages/contracts/src/chat/participants.ts)
// is the ONE home for per-kind row behavior, and an AXIS with no production reader is law with no enforcer
// (`comment: { prompt: "never" }` sat unenforced while assembly shipped comments to the wire). A
// single-LITERAL axis admits one value, so no dispatch can exist and demanding a reader would demand dead
// code; it arms itself the commit the axis widens.
//
// THE AXES ARE THE RESOLVED TYPE'S PROPERTIES, so an axis inherited from a base contract is still law that
// owes a reader, and it reports at the BASE's own declaration site. An `extends` clause that resolves to no
// interface REFUSES rather than silently contributing zero axes.
//
// A READER is a property access on the canonical record — proven through the shared module-origin reader,
// so an aliased import counts and a same-named local does not — or an import of a home-file carrier const
// that derives from the record. The legacy DEFERRED table is DELETED: it was empty, and its stale/orphan
// arms were structurally unprovable while it stayed empty.
//
// The two blindness arms are the runtime's own refusal instead of findings this policy must remember to
// raise: a missing home, a renamed record or interface, and an empty axis set all take the receipt to zero
// members and withhold the verdict. No real-tree anchor file decides which substrate a proof receives.
//
// FAMILY: SINGLETON under its own id. `lib/reference-fact.ts` (`resolveModuleMemberOrigin`) is a shared
// PRIMITIVE, not a family key — fifteen policies in thirteen unrelated families resolve references through
// it (`drizzle-schema`, `registry-definitions`, `zod-modern-spellings`, `sole-env-reader`, `no-raw-egress`
// and eight more) — and no sibling policy judges whether a policy RECORD's axis has a production reader,
// which is this policy's subject. The other two contracts-side `*_POLICY` records are structurally excluded
// rather than merely absent, which is why a generic `*_POLICY` coverage policy is not the family here:
// `MODE_POLICY` (contracts/rpg/mode.ts) is read through ONE dynamic capability door, so its per-axis reads
// are invisible to any reader test and its full-mode axes are legitimately reader-less pre-graft, and
// `CONTENT_CLASS_POLICY` (contracts/chat/content-classes.ts) has its totality enforced by tsc's parallel
// dispatch. A naive shared reader test would red both ruled designs.
//
// POPULATION PORT: an INTENTIONAL NARROWING, and lossless. The legacy descriptor was
// `scopeSafety: "whole-project"` and walked `ctx.project.getSourceFiles()` (307640dae^), but it reached a
// verdict from nothing outside `READER_SCOPE_RE` (`packages/{server,client}/src/`) and the home file under
// `packages/contracts/src` — so `in: ["@contracts", "@server", "@client"]` admits exactly the files the
// legacy walk could judge, and `@client` is HALF THE LEGACY READER SCOPE rather than a new third root. The
// one legacy-visited file now outside the population is `packages/db/src/schema/index.ts`, the mode-B
// REAL-TREE ANCHOR; it left with the mode-B arm, whose successor is the zero-member receipt above.
import type { InterfaceDeclaration, Node as MorphNode, SourceFile, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { resolveModuleMemberOrigin } from "../lib/reference-fact.ts";

const HOME = "packages/contracts/src/chat/participants.ts";
const RECORD = "MESSAGE_KIND_POLICY";
const IFACE = "MessageKindPolicy";
const READER_ROOTS = ["packages/server/src/", "packages/client/src/"] as const;
const AXIS_POPULATION = `${IFACE} axis`;

const MESSAGE =
  `a ${RECORD} axis has NO production reader — a policy cell nobody reads is law with no enforcer (the ` +
  "comment prompt:'never' cell was unenforced while assembly shipped comments to the wire). Home: " +
  `${HOME}.`;
const FIX =
  `read the axis in packages/{server,client}/src, directly off ${RECORD} or through a home-file derived export. ` +
  "A deliberate site is waived with `@orb-waive message-kind-policy-coverage(<position>): <reason>` on the " +
  "line above, where <position> is the axis's own declared name.";

interface Axis {
  readonly name: string;
  readonly declaration: MorphNode;
  /** Anchor the finding on the axis NAME: the runtime would otherwise derive `readonly` from the signature. */
  readonly offset: number;
  /** A single-LITERAL type admits one value — no dispatch can exist, so no reader is owed. */
  readonly singleArm: boolean;
  readonly declaredIn: string;
}

function isReaderScope(path: string): boolean {
  return READER_ROOTS.some((root) => path.startsWith(root));
}

/** Every `extends` clause must RESOLVE. A base binding no interface would silently contribute zero axes,
 *  which is exactly the shrunken-denominator failure this policy exists to make impossible. */
function assertHeritageResolves(iface: InterfaceDeclaration): void {
  for (const clause of iface.getExtends()) {
    const symbol = clause.getExpression().getSymbol();
    const declarations = (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? [];
    if (!declarations.some((declaration) => declaration.getKind() === SyntaxKind.InterfaceDeclaration)) {
      throw new Error(`${IFACE} extends "${clause.getText()}", which resolves to no interface declaration — its inherited axes cannot be enumerated`);
    }
  }
}

function declaringInterface(declaration: MorphNode): string {
  return declaration.getParent()?.asKind(SyntaxKind.InterfaceDeclaration)?.getName() ?? IFACE;
}

/** The policy's axes: the RESOLVED type's properties, each keeping its own declaring interface. */
function readAxes(iface: InterfaceDeclaration): readonly Axis[] {
  assertHeritageResolves(iface);
  return iface
    .getType()
    .getProperties()
    .map((property) => {
      const declaration = property.getDeclarations()[0];
      if (declaration === undefined) {
        throw new Error(`axis "${property.getName()}" of ${IFACE} resolves to no declaration — its arity cannot be established`);
      }
      return {
        name: property.getName(),
        declaration,
        offset: Math.max(declaration.getText().indexOf(property.getName()), 0),
        singleArm: declaration.asKind(SyntaxKind.PropertySignature)?.getTypeNode()?.getKind() === SyntaxKind.LiteralType,
        declaredIn: declaringInterface(declaration),
      };
    });
}

/** Every property name read above one record reference, across dotted and indexed spellings. */
function accessedNames(identifier: MorphNode): readonly string[] {
  const names: string[] = [];
  let current: MorphNode = identifier;
  let parent = current.getParent();
  while (parent !== undefined && (Node.isPropertyAccessExpression(parent) || Node.isElementAccessExpression(parent)) && parent.getExpression() === current) {
    if (Node.isPropertyAccessExpression(parent)) {
      names.push(parent.getName());
    }
    current = parent;
    parent = current.getParent();
  }
  return names;
}

/** The top-level exported const one record reference is authored inside, or undefined. */
function enclosingCarrier(identifier: MorphNode): VariableDeclaration | undefined {
  const declaration = identifier.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  return declaration !== undefined && declaration.getName() !== RECORD && declaration.getVariableStatement()?.isExported() === true ? declaration : undefined;
}

/** Is this reference the CANONICAL record, proven through the shared module-origin reader? */
function isCanonicalRecordReference(identifier: MorphNode): boolean {
  const origin = resolveModuleMemberOrigin(identifier);
  return origin.kind === "resolved" && origin.value.canonical.exportedName === RECORD;
}

interface RecordReference {
  readonly identifier: MorphNode;
  readonly path: string;
}

/** Home-file consts that DERIVE from the record: their names are the axes' carrier symbols. */
function homeCarriers(references: readonly RecordReference[]): ReadonlyMap<string, ReadonlySet<string>> {
  const carriers = new Map<string, Set<string>>();
  for (const reference of references.filter(({ path }) => path === HOME)) {
    const carrier = enclosingCarrier(reference.identifier);
    if (carrier === undefined) {
      continue;
    }
    const axes = carriers.get(carrier.getName()) ?? new Set<string>();
    for (const name of accessedNames(reference.identifier)) {
      axes.add(name);
    }
    carriers.set(carrier.getName(), axes);
  }
  return carriers;
}

/** Axes a behavior tier reads straight off the canonical record. */
function directAxes(references: readonly RecordReference[]): ReadonlySet<string> {
  const names = new Set<string>();
  for (const reference of references.filter(({ path }) => isReaderScope(path))) {
    if (isCanonicalRecordReference(reference.identifier)) {
      for (const name of accessedNames(reference.identifier)) {
        names.add(name);
      }
    }
  }
  return names;
}

/** Everything one shared walk collects for this policy. No project, walk, or cache crosses this boundary. */
interface Collected {
  readonly interfaces: InterfaceDeclaration[];
  readonly records: VariableDeclaration[];
  readonly references: RecordReference[];
  readonly importedNames: Set<string>;
  /** Local names that could denote the record — a candidate filter; every one is confirmed by origin. */
  readonly recordNames: Set<string>;
}

function collectImport(node: import("ts-morph").ImportSpecifier, path: string, state: Collected): void {
  if (node.getName() === RECORD) {
    state.recordNames.add(node.getAliasNode()?.getText() ?? node.getName());
  }
  if (isReaderScope(path)) {
    state.importedNames.add(node.getName());
  }
}

function collectNode(node: MorphNode, path: string, state: Collected): void {
  if (Node.isInterfaceDeclaration(node)) {
    if (node.getName() === IFACE && path === HOME) {
      state.interfaces.push(node);
    }
  } else if (Node.isVariableDeclaration(node)) {
    if (node.getName() === RECORD && path === HOME) {
      state.records.push(node);
    }
  } else if (Node.isImportSpecifier(node)) {
    collectImport(node, path, state);
  } else if (Node.isIdentifier(node) && state.recordNames.has(node.getText())) {
    state.references.push({ identifier: node, path });
  }
}

/** Axes a behavior tier reads by importing a home-file carrier const. */
function carriedAxes(carriers: ReadonlyMap<string, ReadonlySet<string>>, importedNames: ReadonlySet<string>): ReadonlySet<string> {
  const names = new Set<string>();
  for (const [carrier, axes] of carriers) {
    if (importedNames.has(carrier)) {
      for (const name of axes) {
        names.add(name);
      }
    }
  }
  return names;
}

export const gate = defineGate({
  id: "message-kind-policy-coverage",
  family: "message-kind-policy-coverage",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@contracts", "@server", "@client"] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const state: Collected = { interfaces: [], records: [], references: [], importedNames: new Set(), recordNames: new Set([RECORD]) };

    /** Every axis a behavior tier proves it reads — directly off the canonical record, or by importing a
     *  home-file carrier const that derives from it. */
    const coveredAxes = (): ReadonlySet<string> =>
      new Set([...directAxes(state.references), ...carriedAxes(homeCarriers(state.references), state.importedNames)]);

    return {
      visitors: [
        {
          kinds: [SyntaxKind.InterfaceDeclaration, SyntaxKind.VariableDeclaration, SyntaxKind.Identifier, SyntaxKind.ImportSpecifier],
          visit: (node, sourceFile: SourceFile) => collectNode(node, ctx.relativePath(sourceFile), state),
        },
      ],
      evaluate: () => {
        const iface = state.interfaces.length === 1 ? state.interfaces[0] : undefined;
        if (iface === undefined || state.records.length !== 1) {
          // The home file, the record, or the interface is gone or doubled: the axis denominator is zero
          // and the runtime withholds this verdict rather than rendering a clean pass over nothing.
          ctx.receipt({ kind: "population", source: AXIS_POPULATION, members: 0, unresolved: 0 });
          return;
        }
        const axes = readAxes(iface);
        ctx.receipt({ kind: "population", source: AXIS_POPULATION, members: axes.length, unresolved: 0 });
        const covered = coveredAxes();
        for (const axis of axes) {
          if (!(axis.singleArm || covered.has(axis.name))) {
            ctx.report.node(axis.declaration, {
              token: axis.name,
              offset: axis.offset,
              message: `${MESSAGE} Axis: \`${axis.name}\`, declared on ${axis.declaredIn}.`,
              fix: FIX,
            });
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/policy-base.ts": "export interface CoreMessageKindPolicy {\n  readonly memory: 'ingest' | 'exclude';\n}\n",
        [HOME]:
          'import type { CoreMessageKindPolicy } from "./policy-base.ts";\n' +
          "export interface MessageKindPolicy extends CoreMessageKindPolicy {\n  readonly prompt: 'conversation' | 'never';\n}\n" +
          "export const MESSAGE_KIND_POLICY = { standard: { memory: 'ingest', prompt: 'conversation' } };\n",
        "packages/server/src/domain/chat/assembly/shape.ts":
          'import { MESSAGE_KIND_POLICY } from "../../../../../contracts/src/chat/participants.ts";\nexport const p = MESSAGE_KIND_POLICY.standard.prompt;\n',
      },
      expect: { count: 1, token: "memory", messageIncludes: "declared on CoreMessageKindPolicy" },
      why: "THE #947 SPLIT RED: the locally-written axis has its reader and the INHERITED multi-arm axis has none — law with no enforcer, invisible to a reader that reads the local declaration's own members. The finding names the base contract that owns the axis",
    },
    {
      mode: "types",
      files: {
        [HOME]:
          "export interface MessageKindPolicy {\n  readonly prompt: 'conversation' | 'never';\n  readonly wire: 'carry' | 'drop';\n}\n" +
          "export const MESSAGE_KIND_POLICY = { standard: { prompt: 'conversation', wire: 'carry' } };\n",
        "packages/server/src/domain/chat/assembly/shape.ts":
          'import { MESSAGE_KIND_POLICY } from "../../../../../contracts/src/chat/participants.ts";\nexport const p = MESSAGE_KIND_POLICY.standard.prompt;\n',
      },
      expect: { count: 1, token: "wire" },
      why: "the founding disease one axis over: a NEW multi-arm axis with no reader is RED at birth, while `prompt` has a direct production reader right here — proving exactly one finding",
    },
    {
      mode: "types",
      files: {
        [HOME]:
          "export interface MessageKindPolicy {\n  readonly prompt: 'conversation' | 'never';\n}\n" +
          "export const MESSAGE_KIND_POLICY = { standard: { prompt: 'conversation' } };\n",
        "packages/server/src/domain/chat/assembly/shape.ts":
          "const MESSAGE_KIND_POLICY = { standard: { prompt: 'conversation' } };\nexport const p = MESSAGE_KIND_POLICY.standard.prompt;\n",
      },
      expect: { count: 1, token: "prompt" },
      why: "THE SEMANTIC UPGRADE: a LOCAL object that merely shares the record's name is not the canonical record, so it proves no reader. A text match on the receiver counted it and reported a covered axis",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/policy-base.ts": "export interface CoreMessageKindPolicy {\n  readonly memory: 'ingest' | 'exclude';\n}\n",
        [HOME]:
          'import type { CoreMessageKindPolicy } from "./policy-base.ts";\n' +
          "export interface MessageKindPolicy extends CoreMessageKindPolicy {\n  readonly prompt: 'conversation' | 'never';\n}\n" +
          "export const MESSAGE_KIND_POLICY = { standard: { memory: 'ingest', prompt: 'conversation' } };\n",
        "packages/server/src/domain/chat/assembly/shape.ts":
          'import { MESSAGE_KIND_POLICY } from "../../../../../contracts/src/chat/participants.ts";\nexport const p = MESSAGE_KIND_POLICY.standard.prompt;\nexport const m = MESSAGE_KIND_POLICY.standard.memory;\n',
      },
      why: "the SPLIT's green half: the inherited axis HAS a production reader — resolving inherited members widens the law, never the accusation",
    },
    {
      mode: "types",
      files: {
        [HOME]:
          "export interface MessageKindPolicy {\n  readonly memory: 'ingest' | 'exclude';\n  readonly reading: 'show';\n}\n" +
          "export const MESSAGE_KIND_POLICY = { standard: { memory: 'ingest', reading: 'show' } };\n" +
          "export const MEMORY_INGEST_KINDS = ['standard'].filter(() => MESSAGE_KIND_POLICY.standard.memory === 'ingest');\n",
        "packages/server/src/domain/chat/memory/persistence/queries.ts":
          'import { MEMORY_INGEST_KINDS } from "../../../../../../contracts/src/chat/participants.ts";\nexport const k = MEMORY_INGEST_KINDS;\n',
      },
      why: "the healthy shape: `memory` is read through its imported home-file carrier, and `reading` is a single-LITERAL axis — vacuously exempt until it widens, which is this policy's one declared limit",
    },
    {
      mode: "types",
      files: {
        [HOME]:
          "export interface MessageKindPolicy {\n  readonly memory: 'ingest' | 'exclude';\n}\n" +
          "export const MESSAGE_KIND_POLICY = { standard: { memory: 'ingest' } };\n",
        "packages/client/src/features/chat/lib/read.ts":
          'import { MESSAGE_KIND_POLICY as POLICY } from "../../../../../contracts/src/chat/participants.ts";\nexport const m = POLICY.standard.memory;\n',
      },
      why: "THE ALIAS CONTROL: the record imported under another local name in a client behavior tier is the same reader — the module-origin reader sees it where a receiver-text match does not",
    },
    {
      mode: "types",
      files: {
        [HOME]:
          "export interface MessageKindPolicy {\n  readonly memory: 'ingest' | 'exclude';\n}\n" +
          "export const MESSAGE_KIND_POLICY = { standard: { memory: 'ingest' } };\n" +
          "export const SELF = MESSAGE_KIND_POLICY.standard.memory;\n",
        "packages/server/src/domain/chat/x.ts":
          'import { MESSAGE_KIND_POLICY } from "../../../../contracts/src/chat/participants.ts";\nexport const m = MESSAGE_KIND_POLICY.standard.memory;\n',
      },
      why: "the CONTRACTS-INTERNAL derivation is a carrier, not an enforcer: `SELF` alone would not cover the axis, and the behavior-tier read here is what does — so this row pins that a home-file read is never counted as production coverage on its own",
    },
    {
      mode: "types",
      files: {
        [HOME]:
          "export interface MessageKindPolicy {\n  readonly prompt: 'conversation' | 'never';\n" +
          "  // @orb-waive message-kind-policy-coverage(wire): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          "  readonly wire: 'carry' | 'drop';\n}\n" +
          "export const MESSAGE_KIND_POLICY = { standard: { prompt: 'conversation', wire: 'carry' } };\n",
        "packages/server/src/domain/chat/assembly/shape.ts":
          'import { MESSAGE_KIND_POLICY } from "../../../../../contracts/src/chat/participants.ts";\nexport const p = MESSAGE_KIND_POLICY.standard.prompt;\n',
      },
      why: "POSITIONAL IDENTITY: the finding is anchored on the axis PropertySignature but OFFSET to the axis NAME, so the marker names `wire` — not `readonly`, which is where a signature-anchored position would land. Built on the no-reader mustFlag row — a ONE-finding fixture, since `prompt` has its direct production reader in the same map",
    },
  ],
});
