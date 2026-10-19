// The existing invocation atom graph validates every ordinary captured question and returned source.
import { SyntaxKind } from "ts-morph";
import { z } from "zod";
import type { DrizzleWriteRootVerb } from "./drizzle-vocabulary.ts";
import { DRIZZLE_WRITE_ROOT_VERBS } from "./drizzle-vocabulary.ts";
import type { OrdinaryObservationDemand } from "./ordinary-observations-contract.ts";
import type { InventoryTypeProjection, InventoryTypeSelections } from "./projection-inventory-contract.ts";
import { typeProjectionSchema, typeSelectionsSchema } from "./projection-inventory-contract.ts";
import type { SchemaFactStatus } from "./schema-model-contract.ts";
import { SCHEMA_FACT_STATUSES } from "./schema-model-contract.ts";
import type { InventoryCallableDeclarationValue, InventoryInvocationReference, InventorySpan } from "./semantic-inventory-contract.ts";

export function ordinaryObservationDemandSchema<Anchor>(anchor: z.ZodType<Anchor>): z.ZodType<OrdinaryObservationDemand<Anchor>> {
  return z.strictObject({
    roots: z.array(anchor),
    reads: z.array(z.strictObject({ node: anchor, path: z.array(z.string()) })),
    terminals: z.strictObject({
      packageName: z.string(),
      packageMethods: z.array(z.string()),
      projectHome: z.string().nullable(),
      projectMethods: z.array(z.string()),
    }),
  });
}

export function ordinaryObservationsSchema(
  span: z.ZodType<InventorySpan>,
  reference: <Value>(value: z.ZodType<Value>) => z.ZodType<InventoryInvocationReference<Value>>,
  origin: z.ZodType<InventoryOrdinaryOrigin>,
  callableDeclaration: z.ZodType<InventoryCallableDeclarationValue>,
): z.ZodType<InventoryOrdinaryObservations> {
  const bindings = z.array(z.tuple([span, span]));
  const member = z.strictObject({ name: z.string(), nameNode: span, declarations: z.array(span) });
  const root = z.strictObject({ node: span, member: reference(member), table: span });
  const selection = z.strictObject({
    root: span,
    source: span.nullable(),
    projection: span.nullable(),
    output: z.enum(["row", "rows"]),
    calls: z.array(span),
    sqlOperands: z.array(span),
  });
  const callable = z.strictObject({
    invocation: z.enum(["call", "construct"]),
    target: origin,
    callee: span,
  });
  const writerMember: z.ZodType<WireWriterMember> = z.lazy(() =>
    z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("spread"), source: writer }),
      z.strictObject({ kind: z.literal("named"), name: z.string(), node: span, value: span.nullable() }),
    ]),
  );
  const writer: z.ZodType<WireWriter> = z.lazy(() =>
    z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("empty"), node: span.nullable() }),
      z.strictObject({ kind: z.literal("object"), node: span, members: z.array(writerMember) }),
      z.strictObject({ kind: z.literal("choice"), node: span, values: z.array(writer) }),
      z.strictObject({ kind: z.literal("call"), node: span, owner: span, returns: z.array(writer), assignments: z.array(writerMember) }),
      z.strictObject({ kind: z.literal("unresolved"), node: span, detail: z.string() }),
    ]),
  );
  const returned = z.strictObject({
    value: span,
    present: z.boolean(),
    path: z.array(z.string()),
    bindings,
    selectedDescriptors: z.array(z.strictObject({ value: span, bindings })).optional(),
    nativeIteration: z.strictObject({ call: span, collection: span, parameter: span }).optional(),
    nativeLookup: z.strictObject({ call: span, key: span }).optional(),
  });
  return z.strictObject({
    anchor: span.refine((node) => node.kind === SyntaxKind.SourceFile),
    schemaStatus: z.enum([...SCHEMA_FACT_STATUSES, "unavailable"]),
    schemaReason: z.string().nullable(),
    demand: ordinaryObservationDemandSchema(span),
    profileNodes: z.array(span),
    keys: z.array(span),
    closureCalls: z.array(span),
    initialCalls: z.array(span),
    terminals: z.array(span),
    returned: z.array(z.strictObject({ node: span, path: z.array(z.string()), fact: reference(z.array(returned)) })),
    nodes: z.array(
      z.strictObject({
        node: span,
        type: typeProjectionSchema(span, reference),
        members: z.array(z.strictObject({ name: z.string(), type: typeProjectionSchema(span, reference) })),
        callable: reference(callable),
        declaration: reference(callableDeclaration),
        table: reference(z.string()).nullable(),
        column: reference(z.string()).nullable(),
        valueDeclaration: span.nullable(),
        rowIdentity: z.discriminatedUnion("kind", [
          z.strictObject({ kind: z.literal("value"), value: span.nullable() }),
          z.strictObject({ kind: z.literal("refusal"), message: z.string() }),
        ]),
        writer,
        roots: z.array(z.strictObject({ verb: z.enum(DRIZZLE_WRITE_ROOT_VERBS), fact: reference(z.array(root)) })),
      }),
    ),
    calls: z.array(
      z.strictObject({
        call: span,
        target: reference(span),
        returns: reference(z.array(span)),
        calledMember: reference(member),
        memberOrigin: reference(z.array(span)),
        selection: selection.nullable(),
        bindings: z.array(z.strictObject({ owner: span, clears: z.array(span), values: bindings })),
      }),
    ),
    references: z.array(z.strictObject({ node: span, scope: span, uses: z.array(span) })),
    exports: z.array(z.strictObject({ source: span, names: z.array(z.string()) })),
    types: typeSelectionsSchema(span).nullable(),
  });
}

export type WireWriterMember =
  | { readonly kind: "spread"; readonly source: WireWriter }
  | { readonly kind: "named"; readonly name: string; readonly node: InventorySpan; readonly value: InventorySpan | null };
export type WireWriter =
  | { readonly kind: "empty"; readonly node: InventorySpan | null }
  | { readonly kind: "object"; readonly node: InventorySpan; readonly members: readonly WireWriterMember[] }
  | { readonly kind: "choice"; readonly node: InventorySpan; readonly values: readonly WireWriter[] }
  | {
      readonly kind: "call";
      readonly node: InventorySpan;
      readonly owner: InventorySpan;
      readonly returns: readonly WireWriter[];
      readonly assignments: readonly WireWriterMember[];
    }
  | { readonly kind: "unresolved"; readonly node: InventorySpan; readonly detail: string };

export interface InventoryOrdinaryMember {
  readonly name: string;
  readonly nameNode: InventorySpan;
  readonly declarations: readonly InventorySpan[];
}
type WireBindings = readonly (readonly [InventorySpan, InventorySpan])[];
interface InventoryOrdinaryReturnedSource {
  readonly value: InventorySpan;
  readonly present: boolean;
  readonly path: readonly string[];
  readonly bindings: WireBindings;
  readonly selectedDescriptors?: readonly { readonly value: InventorySpan; readonly bindings: WireBindings }[] | undefined;
  readonly nativeIteration?: { readonly call: InventorySpan; readonly collection: InventorySpan; readonly parameter: InventorySpan } | undefined;
  readonly nativeLookup?: { readonly call: InventorySpan; readonly key: InventorySpan } | undefined;
}

export interface InventoryOrdinaryObservations {
  readonly anchor: InventorySpan;
  readonly schemaStatus: SchemaFactStatus | "unavailable";
  readonly schemaReason: string | null;
  readonly demand: OrdinaryObservationDemand<InventorySpan>;
  readonly profileNodes: readonly InventorySpan[];
  readonly keys: readonly InventorySpan[];
  readonly closureCalls: readonly InventorySpan[];
  readonly initialCalls: readonly InventorySpan[];
  readonly terminals: readonly InventorySpan[];
  readonly returned: readonly {
    readonly node: InventorySpan;
    readonly path: readonly string[];
    readonly fact: InventoryInvocationReference<readonly InventoryOrdinaryReturnedSource[]>;
  }[];
  readonly nodes: readonly {
    readonly node: InventorySpan;
    readonly type: InventoryTypeProjection;
    readonly members: readonly { readonly name: string; readonly type: InventoryTypeProjection }[];
    readonly callable: InventoryInvocationReference<{
      readonly invocation: "call" | "construct";
      readonly target: InventoryOrdinaryOrigin;
      readonly callee: InventorySpan;
    }>;
    readonly declaration: InventoryInvocationReference<InventoryCallableDeclarationValue>;
    readonly table: InventoryInvocationReference<string> | null;
    readonly column: InventoryInvocationReference<string> | null;
    readonly valueDeclaration: InventorySpan | null;
    readonly rowIdentity: { readonly kind: "value"; readonly value: InventorySpan | null } | { readonly kind: "refusal"; readonly message: string };
    readonly writer: WireWriter;
    readonly roots: readonly {
      readonly verb: DrizzleWriteRootVerb;
      readonly fact: InventoryInvocationReference<
        readonly { readonly node: InventorySpan; readonly member: InventoryInvocationReference<InventoryOrdinaryMember>; readonly table: InventorySpan }[]
      >;
    }[];
  }[];
  readonly calls: readonly {
    readonly call: InventorySpan;
    readonly target: InventoryInvocationReference<InventorySpan>;
    readonly returns: InventoryInvocationReference<readonly InventorySpan[]>;
    readonly calledMember: InventoryInvocationReference<InventoryOrdinaryMember>;
    readonly memberOrigin: InventoryInvocationReference<readonly InventorySpan[]>;
    readonly selection: {
      readonly root: InventorySpan;
      readonly source: InventorySpan | null;
      readonly projection: InventorySpan | null;
      readonly output: "row" | "rows";
      readonly calls: readonly InventorySpan[];
      readonly sqlOperands: readonly InventorySpan[];
    } | null;
    readonly bindings: readonly { readonly owner: InventorySpan; readonly clears: readonly InventorySpan[]; readonly values: WireBindings }[];
  }[];
  readonly references: readonly { readonly node: InventorySpan; readonly scope: InventorySpan; readonly uses: readonly InventorySpan[] }[];
  readonly exports: readonly { readonly source: InventorySpan; readonly names: readonly string[] }[];
  readonly types: InventoryTypeSelections | null;
}

export type InventoryOrdinaryOrigin =
  | import("./module-origin-inventory-contract.ts").InventoryModuleOrigin
  | { readonly kind: "global"; readonly globalName: string; readonly memberPath: readonly string[]; readonly declarations: readonly InventorySpan[] };
