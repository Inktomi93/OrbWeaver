// The recipe table each exported `@orb/ui` component applies: its own `tv()` axes and arms, limited to the axes it forwards.
import { dirname } from "node:path";
import ts from "typescript";
import type { Source } from "./source.ts";
import { visit } from "./source.ts";
import type { ArmClasses, ScaleIndex, ValueList } from "./variants.ts";
import { axesIn, doorDirs, scaleIndex } from "./variants.ts";

/** Door to component to axis to the arms that axis declares for that component. */
export type ComponentTables = ReadonlyMap<string, ReadonlyMap<string, ReadonlyMap<string, ArmClasses>>>;

type Table = ReadonlyMap<string, ValueList>;

const isTvCall = (node: ts.Node): node is ts.CallExpression => ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "tv";
const COMPONENT_NAME = /^[A-Z]/u;

/** The `tv()` tables a variants file declares, by the name of the const that holds each. */
function tablesIn(sf: ts.SourceFile, index: ScaleIndex): ReadonlyMap<string, Table> {
  const tables = new Map<string, Table>();
  visit(sf, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined && isTvCall(node.initializer)) {
      tables.set(node.name.text, axesIn(node.initializer, index));
    }
  });
  return tables;
}

/** The exported or local components a file declares: an uppercase function, or an uppercase const holding a function. */
function componentsIn(sf: ts.SourceFile): readonly (readonly [string, ts.Node])[] {
  return sf.statements.flatMap((statement): readonly (readonly [string, ts.Node])[] => {
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined && COMPONENT_NAME.test(statement.name.text)) {
      return [[statement.name.text, statement]];
    }
    if (!ts.isVariableStatement(statement)) {
      return [];
    }
    return statement.declarationList.declarations.flatMap((declaration) =>
      ts.isIdentifier(declaration.name) && COMPONENT_NAME.test(declaration.name.text) && declaration.initializer !== undefined
        ? [[declaration.name.text, declaration.initializer] as const]
        : [],
    );
  });
}

/** The axis names a call writes in its first object literal argument; null when the call passes the whole props (a spread or no object). */
function forwardedBy(call: ts.CallExpression): ReadonlySet<string> | null {
  const object = call.arguments.find(ts.isObjectLiteralExpression);
  if (object === undefined || object.properties.some(ts.isSpreadAssignment)) {
    return null;
  }
  const names = object.properties.flatMap((property) =>
    (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) && !ts.isComputedPropertyName(property.name)
      ? [property.name.getText()]
      : [],
  );
  return new Set(names);
}

/** The call that applies a table: `fooVariants({ ... })`, or `helper(fooVariants, { ... })`. */
function applyingCall(identifier: ts.Identifier): ts.CallExpression | null {
  const parent = identifier.parent;
  return ts.isCallExpression(parent) ? parent : null;
}

/** The axes of each table a component applies, limited to what it forwards. */
function appliedAxes(body: ts.Node, tables: ReadonlyMap<string, Table>): ReadonlyMap<string, ArmClasses> {
  const applied = new Map<string, ArmClasses>();
  visit(body, (node) => {
    const table = ts.isIdentifier(node) ? tables.get(node.text) : undefined;
    if (!ts.isIdentifier(node) || table === undefined) {
      return;
    }
    const call = applyingCall(node);
    const forwarded = call === null ? null : forwardedBy(call);
    for (const [axis, list] of table) {
      if (forwarded === null || forwarded.has(axis)) {
        applied.set(axis, list.arms);
      }
    }
  });
  return applied;
}

/** The components of one door directory, each with the axes its own table writes and it forwards. */
function doorComponents(inDoor: readonly Source[], index: ScaleIndex): ReadonlyMap<string, ReadonlyMap<string, ArmClasses>> {
  const tables = new Map<string, Table>();
  for (const source of inDoor.filter((candidate) => /variants\.ts$/u.test(candidate.path))) {
    for (const [name, table] of source.sf === null ? [] : tablesIn(source.sf, index)) {
      tables.set(name, table);
    }
  }
  const components = new Map<string, ReadonlyMap<string, ArmClasses>>();
  for (const source of inDoor.filter((candidate) => candidate.path.endsWith(".tsx"))) {
    for (const [name, body] of source.sf === null ? [] : componentsIn(source.sf)) {
      const axes = appliedAxes(body, tables);
      if (axes.size > 0) {
        components.set(name, axes);
      }
    }
  }
  return components;
}

/**
 * Per door and component, the axes and arms the component's own `tv()` table writes and the component forwards. A component that
 * applies no table in its own file, such as one that renders another door's core, has no entry.
 */
export function componentTables(root: string, sources: readonly Source[]): ComponentTables {
  const index = scaleIndex(sources);
  const result = new Map<string, ReadonlyMap<string, ReadonlyMap<string, ArmClasses>>>();
  for (const [door, dir] of doorDirs(root)) {
    const components = doorComponents(
      sources.filter((source) => source.layer === "ui" && source.sf !== null && dirname(source.path) === dir),
      index,
    );
    if (components.size > 0) {
      result.set(door, components);
    }
  }
  return result;
}
