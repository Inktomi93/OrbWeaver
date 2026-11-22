// Variant tables: each `tv()` table's axes and values, the values consumers select, and the axes a wide value feeds.
//
// - A table is confirmed by the call's resolved signature declaration in tailwind-variants, so a wrapped `tv` (the ui
//   package's Proxy typed `TV`) is still a table.
// - A value reaches an axis as a literal, a typed value (a literal union, a boolean's two), a default, or through a
//   forward: a parameter, or a binding inside a parameter's pattern, handing a prop on to the axis. A wide value makes
//   the axis dynamic, and a dynamic axis is never reported.
// - tailwind-variants selects `values[key || "false"]` (dist getVariantValue): an axis a call omits, with no default,
//   takes its `false` arm, so that arm is live wherever the table is applied.
import type { CallExpression, Node, ObjectLiteralExpression } from "@typescript/native/ast";
import { isObjectLiteralExpression, isPropertyAssignment, isSpreadAssignment, SyntaxKind } from "@typescript/native/ast";
import type { Signature } from "@typescript/native/sync";
import { tracing } from "./options.ts";
import type { DeclKey } from "./resolve.ts";
import { keyText } from "./resolve.ts";
import { keyLiterals } from "./sites.ts";
import type { BuildSession, GraphState } from "./state.ts";

const TAILWIND_VARIANTS = "tailwind-variants";

/** Whether each resolved signature's declaration is tailwind-variants' own: a `tv()` table or a recipe it returns. */
export const variantsDeclarations = (state: GraphState, signatures: readonly (Signature | undefined)[]): boolean[] =>
  state.world.fromPackage(
    signatures.map((signature) => (signature?.declaration === undefined ? [] : [signature.declaration])),
    TAILWIND_VARIANTS,
  );
const VARIANTS = "variants";
const DEFAULT_VARIANTS = "defaultVariants";
const FALSE_ARM = "false";
const TRUE_ARM = "true";

/** A value written into a slot: its syntax, or the literals its type can be (null for a wide type). */
export type AxisValue = Node | undefined | { readonly typed: readonly string[] | null };

/** One axis of a variant table. */
export interface VariantAxis {
  readonly key: DeclKey;
  readonly name: string;
  readonly file: string;
  /** Each value's name, its declaration and whether a consumer selects it. */
  readonly values: readonly { readonly name: string; readonly decl: DeclKey; readonly used: boolean }[];
  readonly dynamic: boolean;
  /** What made a dynamic axis dynamic: each wide value's syntax kind, or a wide typed value. */
  readonly causes: readonly string[];
}

const TYPED_WIDE = "a wide typed value";
const NO_VALUE = "no value";

// A wide value's cause, and where it sits when it is syntax.
function causeOf(value: AxisValue): { readonly cause: string; readonly at: string | null } {
  if (value === undefined) {
    return { cause: NO_VALUE, at: null };
  }
  if (isTyped(value)) {
    return { cause: TYPED_WIDE, at: null };
  }
  const source = value.getSourceFile();
  return { cause: SyntaxKind[value.kind], at: `${source.fileName}:${String(source.getLineAndCharacterOfPosition(value.pos).line + 1)}` };
}

const isTyped = (value: AxisValue): value is { readonly typed: readonly string[] | null } => value !== undefined && "typed" in value;

/** The literals a written value names: `size="lg"`, `size={big ? "lg" : "sm"}`, a boolean axis's bare `flag`. */
export function writtenLiterals(value: Node | undefined): readonly string[] | null {
  if (value === undefined || value.kind === SyntaxKind.TrueKeyword) {
    return [TRUE_ARM];
  }
  return value.kind === SyntaxKind.FalseKeyword ? [FALSE_ARM] : keyLiterals(value);
}

export class Variants {
  readonly #axes = new Map<DeclKey, { readonly name: string; readonly file: string; readonly values: Map<string, DeclKey> }>();
  readonly #used = new Set<DeclKey>();
  /** Each dynamic axis and the causes of its wide values. */
  readonly #dynamic = new Map<DeclKey, Set<string>>();
  readonly #log: (line: string) => void;
  readonly #traceAxis: string | null;
  readonly #traceTv: boolean;
  /** Members whose values feed another member, target to sources: a forward. */
  readonly #feeds = new Map<DeclKey, DeclKey[]>();
  /** The literal values written into members that are not axes, which a forward may carry to one. */
  readonly #memberValues = new Map<DeclKey, Set<string>>();
  /** A write can meet an axis before its table is read (the table's file comes later), so uses wait for the end. */
  readonly #pending: (readonly [DeclKey, AxisValue])[] = [];

  constructor({ options, log }: BuildSession) {
    this.#log = log;
    this.#traceAxis = tracing(options, "axis")?.prop ?? null;
    this.#traceTv = tracing(options, "tv") !== undefined;
  }

  /** Whether a declaration is a table's axis now, or may be one once its table is read (an object literal's key). */
  mayBeAxis(key: DeclKey): boolean {
    return this.#axes.has(key) || key.endsWith(`.${String(SyntaxKind.PropertyAssignment)}`);
  }

  /** Read the tables among a file's `tv(…)` calls, confirmed by their resolved signature. */
  readTables(state: GraphState, calls: readonly CallExpression[], file: string): void {
    const { checker } = state.world;
    const signatures = state.batch(calls.map((call) => checker.getResolvedSignature.gen(call)));
    const tables = variantsDeclarations(state, signatures);
    for (const [at, call] of calls.entries()) {
      const [options] = call.arguments;
      if (tables[at] === true && options !== undefined && isObjectLiteralExpression(options)) {
        this.#readTable(state, options, file);
      }
    }
  }

  #readTable(state: GraphState, options: ObjectLiteralExpression, file: string): void {
    const axesByName = new Map<string, DeclKey>();
    const variants = propertyValue(options, VARIANTS);
    for (const axis of variants !== undefined && isObjectLiteralExpression(variants) ? variants.properties : []) {
      if (!(isPropertyAssignment(axis) && isObjectLiteralExpression(axis.initializer))) {
        continue;
      }
      const values = new Map(
        axis.initializer.properties.flatMap((value) => {
          const name = isSpreadAssignment(value) ? undefined : keyText(value.name);
          return name === undefined ? [] : [[name, state.resolver.keyOf(value)] as const];
        }),
      );
      const key = state.resolver.keyOf(axis);
      const name = keyText(axis.name) ?? "";
      this.#axes.set(key, { name, file, values });
      axesByName.set(name, key);
    }
    this.#defaults(options, axesByName);
  }

  // A default variant is a value the table itself selects.
  #defaults(options: ObjectLiteralExpression, axesByName: ReadonlyMap<string, DeclKey>): void {
    const defaults = propertyValue(options, DEFAULT_VARIANTS);
    for (const choice of defaults !== undefined && isObjectLiteralExpression(defaults) ? defaults.properties : []) {
      const axis = isPropertyAssignment(choice) ? axesByName.get(keyText(choice.name) ?? "") : undefined;
      if (axis !== undefined && isPropertyAssignment(choice)) {
        this.use(axis, choice.initializer);
      }
    }
  }

  /** A value written into a member: an axis takes it now; any other member keeps its literals for a later forward. */
  use(key: DeclKey, value: AxisValue): void {
    const axis = this.#axes.get(key);
    if (axis === undefined) {
      const own = this.#memberValues.get(key) ?? new Set<string>();
      for (const literal of (isTyped(value) ? value.typed : writtenLiterals(value)) ?? []) {
        own.add(literal);
      }
      this.#memberValues.set(key, own);
      return;
    }
    const literals = isTyped(value) ? value.typed : writtenLiterals(value);
    this.#traceTake(axis, literals, value);
    if (literals === null) {
      this.#wide(key, axis, value);
      return;
    }
    for (const literal of literals) {
      const declared = axis.values.get(literal);
      if (declared !== undefined) {
        this.#used.add(declared);
      }
    }
  }

  #traceTake(axis: { readonly name: string; readonly file: string }, literals: readonly string[] | null, value: AxisValue): void {
    if (axis.name === this.#traceAxis) {
      this.#log(`trace axis ${axis.name} (${axis.file}) takes ${literals === null ? causeOf(value).cause : literals.join("|")}`);
    }
  }

  // A wide value makes its axis dynamic; the cause is kept for the profile and the tv trace.
  #wide(key: DeclKey, axis: { readonly name: string; readonly file: string }, value: AxisValue): void {
    const { cause, at } = causeOf(value);
    this.#dynamic.set(key, (this.#dynamic.get(key) ?? new Set()).add(cause));
    if (this.#traceTv) {
      this.#log(`trace tv ${axis.name} (${axis.file}) dynamic: ${cause}${at === null ? "" : ` at ${at}`}`);
    }
  }

  defer(key: DeclKey, value: AxisValue): void {
    this.#pending.push([key, value]);
  }

  feed(target: DeclKey, source: DeclKey): void {
    if (this.#traceAxis !== null && this.#axes.get(target)?.name === this.#traceAxis) {
      this.#log(`trace axis ${this.#traceAxis} is fed by ${source}`);
    }
    if (target !== source) {
      this.#feeds.set(target, [...(this.#feeds.get(target) ?? []), source]);
    }
  }

  /** Settle every deferred use, the false arms and the forwards, and hand back the axes. */
  finish(): readonly VariantAxis[] {
    for (const [key, value] of this.#pending) {
      this.use(key, value);
    }
    for (const axis of this.#axes.values()) {
      const arm = axis.values.get(FALSE_ARM);
      if (arm !== undefined) {
        this.#used.add(arm);
      }
    }
    // forwards carry values to a fixpoint: an axis reads every value written into a member that forwards into it
    for (const [key, axis] of this.#axes) {
      for (const literal of this.#valuesOf(key, new Set())) {
        const declared = axis.values.get(literal);
        if (declared !== undefined) {
          this.#used.add(declared);
        }
      }
    }
    const axes = [...this.#axes].map(([key, axis]) => ({
      key,
      name: axis.name,
      file: axis.file,
      values: [...axis.values].map(([name, decl]) => ({ name, decl, used: this.#used.has(decl) })),
      dynamic: this.#dynamic.has(key),
      causes: [...(this.#dynamic.get(key) ?? [])].sort(),
    }));
    for (const axis of axes.filter(({ name }) => name === this.#traceAxis)) {
      this.#log(
        `trace axis ${axis.name} (${axis.file}) selects ${
          axis.values
            .filter(({ used }) => used)
            .map(({ name }) => name)
            .join("|") || "nothing"
        }${axis.dynamic ? ", dynamic" : ""}`,
      );
    }
    return axes;
  }

  #valuesOf(key: DeclKey, seen: Set<DeclKey>): ReadonlySet<string> {
    if (seen.has(key)) {
      return new Set();
    }
    seen.add(key);
    const out = new Set(this.#memberValues.get(key) ?? []);
    for (const source of this.#feeds.get(key) ?? []) {
      for (const literal of this.#valuesOf(source, seen)) {
        out.add(literal);
      }
    }
    return out;
  }
}

function propertyValue(literal: ObjectLiteralExpression, name: string): Node | undefined {
  const found = literal.properties.find((property) => isPropertyAssignment(property) && keyText(property.name) === name);
  return found !== undefined && isPropertyAssignment(found) ? found.initializer : undefined;
}
