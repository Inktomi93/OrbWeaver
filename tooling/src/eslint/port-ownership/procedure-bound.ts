// A hand-written type a library binds to a tRPC procedure's input or output: the second home of a wire shape.
// The procedure is found by the tRPC client's TypeHelper protocol (`~types`), the one `inferInput` and `inferOutput`
// read, at an options factory call inside the generic call's arguments. A type argument with no procedure behind it
// is never judged, so a client-only vars type stays legal.
import ts from "typescript";

// The decorated procedure's options factories: each binds the procedure's input and output to the query library's
// variables and data.
const OPTION_FACTORIES: ReadonlySet<string> = new Set(["mutationOptions", "queryOptions", "infiniteQueryOptions"]);
const TYPE_HELPER = "~types";
const PROCEDURE_SIDES = ["input", "output"] as const;
type ProcedureSide = (typeof PROCEDURE_SIDES)[number];

interface Procedure {
  /** The procedure as the call spells it: `trpc.chat.reapHusk`. */
  readonly path: string;
  readonly sides: Readonly<Record<ProcedureSide, ts.Type>>;
}

/** A type argument that hand-restates one side of a procedure its call binds. */
export interface ProcedureRestatement {
  readonly typeArgument: ts.TypeNode;
  readonly procedure: string;
  readonly side: ProcedureSide;
  /** The procedure's fields the type argument declares by hand. */
  readonly fields: readonly string[];
}

function procedureOf(checker: ts.TypeChecker, call: ts.CallExpression): Procedure | null {
  if (!(ts.isPropertyAccessExpression(call.expression) && OPTION_FACTORIES.has(call.expression.name.text))) {
    return null;
  }
  const receiver = call.expression.expression;
  const helper = checker.getPropertyOfType(checker.getTypeAtLocation(receiver), TYPE_HELPER);
  if (helper === undefined) {
    return null;
  }
  const types = checker.getTypeOfSymbolAtLocation(helper, receiver);
  const [input, output] = PROCEDURE_SIDES.map((side) => {
    const member = checker.getPropertyOfType(types, side);
    return member === undefined ? undefined : checker.getTypeOfSymbolAtLocation(member, receiver);
  });
  return input === undefined || output === undefined ? null : { path: receiver.getText(), sides: { input, output } };
}

// The initializer of the `const` an identifier names: an options factory hoisted out of the call still binds it.
// A `let` can be reassigned, so its initializer is not the value the call sees.
function constInitializer(checker: ts.TypeChecker, node: ts.Identifier): ts.Expression | undefined {
  const declaration = checker.getSymbolAtLocation(node)?.valueDeclaration;
  if (declaration === undefined || !ts.isVariableDeclaration(declaration) || !ts.isVariableDeclarationList(declaration.parent)) {
    return undefined;
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: NodeFlags is a compiler-owned bitfield.
  return (declaration.parent.flags & ts.NodeFlags.Const) === 0 ? undefined : declaration.initializer;
}

function proceduresIn(checker: ts.TypeChecker, call: ts.CallExpression): readonly Procedure[] {
  const found: Procedure[] = [];
  const followed = new Set<ts.Expression>();
  const visit = (node: ts.Node): void => {
    const procedure = ts.isCallExpression(node) ? procedureOf(checker, node) : null;
    if (procedure !== null) {
      found.push(procedure);
    }
    const hoisted = ts.isIdentifier(node) ? constInitializer(checker, node) : undefined;
    if (hoisted !== undefined && !followed.has(hoisted)) {
      followed.add(hoisted);
      visit(hoisted);
    }
    ts.forEachChild(node, visit);
  };
  call.arguments.forEach(visit);
  return found;
}

// The element of an array type, else the type itself.
function elementOrSelf(checker: ts.TypeChecker, type: ts.Type): ts.Type {
  const bare = checker.getNonNullableType(type);
  return checker.isArrayLikeType(bare) ? (checker.getIndexTypeOfType(bare, ts.IndexKind.Number) ?? bare) : bare;
}

// A field derives from the procedure's when it is that symbol or shares one of its declarations: a mapped type
// (`Pick`, `Omit`) and an intersection (`inferInput<P> & { chatId: ChatId }`) carry the original declaration.
function derives(written: ts.Symbol, owned: ts.Symbol): boolean {
  const declarations = new Set(owned.declarations ?? []);
  return written === owned || (written.declarations ?? []).some((declaration) => declarations.has(declaration));
}

// A field typed `unknown` or as an open record carries no shape: the consumer's own type there is the only shape
// guard, and intersecting the record would re-admit every key.
function carriesShape(checker: ts.TypeChecker, field: ts.Symbol, at: ts.Node): boolean {
  const type = checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(field, at));
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeFlags is a compiler-owned bitfield.
  if ((type.flags & (ts.TypeFlags.Unknown | ts.TypeFlags.Any)) !== 0) {
    return false;
  }
  return !(checker.getIndexInfosOfType(type).length > 0 && checker.getPropertiesOfType(type).length === 0);
}

// Which declarations the consumer wrote by hand: its own package's, never a contract's, a library's or the server's.
type HandWritten = (declaration: ts.Declaration) => boolean;

interface Judging {
  readonly checker: ts.TypeChecker;
  /** The call the type arguments sit on. */
  readonly at: ts.Node;
  readonly handWritten: HandWritten;
}

// biome-ignore lint/suspicious/noBitwiseOperators: SymbolFlags is a compiler-owned bitfield.
const isOptional = (field: ts.Symbol): boolean => (field.flags & ts.SymbolFlags.Optional) !== 0;

// The procedure's fields `written` declares by hand, when it carries every required shaped field of that side; else
// none. A type that leaves a required field out is a subset the client picks, never the side's second home; leaving
// out an optional one still restates the rest. A side with no required field needs every field, or any one field a
// client picks would count. A primitive side's apparent members (`valueOf`) are the standard library's.
function handDeclared({ checker, at, handWritten }: Judging, written: ts.Type, side: ts.Type): readonly string[] {
  const shape = elementOrSelf(checker, side);
  const own = elementOrSelf(checker, written);
  const fields = checker
    .getPropertiesOfType(shape)
    .filter((field) => carriesShape(checker, field, at))
    .map((field) => ({ field, written: checker.getPropertyOfType(own, field.name) }));
  const required = fields.some(({ field }) => !isOptional(field)) ? fields.filter(({ field }) => !isOptional(field)) : fields;
  if (fields.length === 0 || required.some(({ written: found }) => found === undefined)) {
    return [];
  }
  const covered = fields.flatMap(({ field, written: found }) => (found === undefined ? [] : [{ field, found }]));
  return covered.filter(({ field, found }) => !derives(found, field) && (found.declarations ?? []).every(handWritten)).map(({ field }) => field.name);
}

/** Every explicit type argument of `call` that hand-restates a side of a procedure the call's arguments bind. */
export function procedureRestatements(checker: ts.TypeChecker, call: ts.CallExpression, handWritten: HandWritten): readonly ProcedureRestatement[] {
  const typeArguments = call.typeArguments ?? [];
  const procedures = typeArguments.length === 0 ? [] : proceduresIn(checker, call);
  return typeArguments.flatMap((typeArgument) => {
    const written = checker.getTypeFromTypeNode(typeArgument);
    return procedures.flatMap(({ path, sides }) =>
      PROCEDURE_SIDES.flatMap((side) => {
        const fields = handDeclared({ checker, at: call, handWritten }, written, sides[side]);
        return fields.length === 0 ? [] : [{ typeArgument, procedure: path, side, fields }];
      }),
    );
  });
}
