// Declares `failureShownInline` by a map read from the target directory: on one consumer's hook call, the usual move, or on a
// factory whose failure is right to drop once its line is gone (client-architecture-state-and-gates.md §11).

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { useMetricAtom } from "codemod:metrics";
import { readFileSync } from "fs";
import { join } from "path";

const DEFAULT_MAP_FILE = "codemod-failure-map.json";
const FACTORY = "createEntityMutation";
const TOAST_KEY = "errorToast";
const INLINE_KEY = "failureShownInline";

/** `factories`: hook name to surface. `calls`: `<relative file>#<hook name>` to surface, for one consumer's call. */
interface FailureMap {
  readonly factories: ReadonlyMap<string, string>;
  readonly calls: ReadonlyMap<string, string>;
}

const CALL: RuleConfig<TS> = { rule: { kind: "call_expression", has: { field: "function", kind: "identifier" } } };

export const getSelector: GetSelector<TS> = () => CALL;

function stringMap(value: unknown, field: string): ReadonlyMap<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field}: expected an object of name to surface`);
  }
  return new Map(
    Object.entries(value).map(([name, surface]) => {
      if (typeof surface !== "string" || surface === "") {
        throw new Error(`${field}.${name}: expected a surface name`);
      }
      return [name, surface] as const;
    }),
  );
}

function readMap(targetDir: string, mapFile: string): FailureMap {
  const parsed: unknown = JSON.parse(readFileSync(join(targetDir, mapFile), "utf8"));
  if (parsed === null || typeof parsed !== "object") {
    throw new Error(`${mapFile}: expected { factories, calls }`);
  }
  return { factories: stringMap(Reflect.get(parsed, "factories"), "factories"), calls: stringMap(Reflect.get(parsed, "calls"), "calls") };
}

function firstObjectArgument(call: SgNode<TS>): SgNode<TS> | null {
  const argument = call
    .field("arguments")
    ?.children()
    .find((child) => child.isNamed());
  return argument?.is("object") === true ? argument : null;
}

function hasKey(object: SgNode<TS>, key: string): boolean {
  return object
    .children()
    .some((child) => (child.is("pair") && child.field("key").text() === key) || (child.is("shorthand_property_identifier") && child.text() === key));
}

/** The factory's `errorToast` pair becomes `failureShownInline`, naming the surface. */
function factoryEdit(call: SgNode<TS>, surface: string): Edit | null {
  const config = firstObjectArgument(call);
  const toast = config?.children().find((child) => child.is("pair") && child.field("key").text() === TOAST_KEY);
  return toast === undefined ? null : toast.replace(`${INLINE_KEY}: ${JSON.stringify(surface)}`);
}

/** The consumer's deps object gains `failureShownInline`, naming the surface. */
function callEdit(call: SgNode<TS>, surface: string): Edit | null {
  const deps = firstObjectArgument(call);
  if (deps === null || hasKey(deps, INLINE_KEY)) {
    return null;
  }
  const body = deps.text().slice(1, -1).trim().replace(/,$/u, "");
  return deps.replace(`{ ${body}, ${INLINE_KEY}: ${JSON.stringify(surface)} }`);
}

function declaredName(call: SgNode<TS>): string | null {
  const declarator = call.parent();
  return declarator?.is("variable_declarator") === true ? declarator.field("name").text() : null;
}

/** The edit one call needs, with its kind for the run's count: a mapped factory or a mapped consumer call. */
function editFor(call: SgNode<TS>, file: string, map: FailureMap): { readonly edit: Edit; readonly kind: "factory" | "call" } | null {
  const callee = call.field("function")?.text() ?? "";
  if (callee === FACTORY) {
    const surface = map.factories.get(declaredName(call) ?? "");
    const edit = surface === undefined ? null : factoryEdit(call, surface);
    return edit === null ? null : { edit, kind: "factory" };
  }
  const surface = map.calls.get(`${file}#${callee}`);
  const edit = surface === undefined ? null : callEdit(call, surface);
  return edit === null ? null : { edit, kind: "call" };
}

const codemod: Codemod<TS> = (root, options) => {
  const map = readMap(options.targetDir, options.params["map"] ?? DEFAULT_MAP_FILE);
  const moved = useMetricAtom("failure-shown-inline");
  const file = root.relativeFilename();
  const rootNode = root.root();
  const edits: Edit[] = [];
  for (const call of options.matches ?? rootNode.findAll(CALL)) {
    const planned = editFor(call, file, map);
    if (planned !== null) {
      edits.push(planned.edit);
      moved.increment({ kind: planned.kind });
    }
  }
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
