// Hands each logging site its root's logger: `getLog()` becomes `getLog(<binder>.<field>)` and a `securityEvent` with
// no base gains `<binder>.<field>`, where the binder is the nearest enclosing function parameter named in `binders`.
// A site with no such parameter in scope is left unchanged; threading a logger into it is a judgment edit.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";

const DEFAULT_BINDERS = "ctx,deps";
const DEFAULT_FIELD = "logger";
// `securityEvent(event, fields, message, base)`: the base is the fourth argument.
const SECURITY_EVENT_BASE_ARITY = 4;
const SECURITY_EVENT_MESSAGE_ARITY = 3;

const LOG_SITE: RuleConfig<TS> = {
  rule: {
    kind: "call_expression",
    has: { field: "function", kind: "identifier", regex: "^(getLog|securityEvent)$" },
  },
};

export const getSelector: GetSelector<TS> = () => LOG_SITE;

const FUNCTION_KINDS = new Set(["function_declaration", "function_expression", "arrow_function", "method_definition", "generator_function_declaration"]);
const PARAMETER_KINDS = new Set(["required_parameter", "optional_parameter"]);

// A parameter binds its own identifier, or the top-level shorthand names of a destructured object (`{ ctx, input }`,
// the tRPC procedure shape). A renamed or nested destructure binds no context object under its name.
function patternNames(pattern: SgNode<TS>): readonly string[] {
  if (pattern.is("identifier")) {
    return [pattern.text()];
  }
  if (pattern.is("object_pattern")) {
    return pattern
      .children()
      .filter((child) => child.is("shorthand_property_identifier_pattern"))
      .map((child) => child.text());
  }
  return [];
}

function parameterNames(fn: SgNode<TS>): readonly string[] {
  const bare = fn.field("parameter");
  if (bare !== null) {
    return patternNames(bare);
  }
  return (fn.field("parameters")?.children() ?? [])
    .filter((child) => PARAMETER_KINDS.has(child.kind()))
    .flatMap((child) => {
      const pattern = child.field("pattern");
      return pattern === null ? [] : patternNames(pattern);
    });
}

function nearestBinder(site: SgNode<TS>, binders: readonly string[]): string | undefined {
  const bound = site
    .ancestors()
    .filter((ancestor) => FUNCTION_KINDS.has(ancestor.kind()))
    .map((fn) => binders.find((binder) => parameterNames(fn).includes(binder)));
  return bound.find((binder) => binder !== undefined);
}

function argumentNodes(call: SgNode<TS>): readonly SgNode<TS>[] {
  return (
    call
      .field("arguments")
      ?.children()
      .filter((child) => child.isNamed()) ?? []
  );
}

function siteEdit(call: SgNode<TS>, base: string): Edit | undefined {
  const args = call.field("arguments");
  const values = argumentNodes(call);
  if (args === null) {
    return;
  }
  if (call.field("function")?.text() === "getLog") {
    return values.length === 0 ? args.replace(`(${base})`) : undefined;
  }
  const last = values.at(-1);
  if (last === undefined || values.length >= SECURITY_EVENT_BASE_ARITY) {
    return;
  }
  // Positional: an absent `fields` or `message` is filled with its default so the base lands fourth.
  const filler = ["{}", "undefined"].slice(values.length - 1, SECURITY_EVENT_MESSAGE_ARITY - 1);
  const end = last.range().end.index;
  return { startPos: end, endPos: end, insertedText: [...filler, base].map((text) => `, ${text}`).join("") };
}

const codemod: Codemod<TS> = (root, options) => {
  const binders = (options.params["binders"] ?? DEFAULT_BINDERS).split(",");
  const field = options.params["field"] ?? DEFAULT_FIELD;
  const rootNode = root.root();
  const edits: Edit[] = [];
  for (const call of options.matches ?? rootNode.findAll(LOG_SITE)) {
    const binder = nearestBinder(call, binders);
    const edit = binder === undefined ? undefined : siteEdit(call, `${binder}.${field}`);
    if (edit !== undefined) {
      edits.push(edit);
    }
  }
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
