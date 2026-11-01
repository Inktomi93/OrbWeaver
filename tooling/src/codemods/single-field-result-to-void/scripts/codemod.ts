// Turns a plan-listed verb whose result is one constant or unread field (`{ deleted: true }`) into a void verb: the verb
// stops returning the object, its service contract member returns `Promise<void>`, and its router procedure's
// `.output(...)` becomes `.output(z.void())`. The plan names each file's role; the judgement of which verbs qualify is
// the plan's. A schema or result type this leaves unused is a hand cleanup.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { readFileSync } from "fs";
import { join } from "path";

const DEFAULT_PLAN_FILE = "codemod-single-field-result.json";
const NEWLINE = 0x0a;
const SPACE = 0x20;

interface Verb {
  /** The service and router member name, e.g. `removeScript`. */
  readonly verb: string;
  /** The single result field the verb returns, e.g. `deleted`. */
  readonly field: string;
  /** The named result type of the service member and the verb's return annotation, e.g. `RemoveResult`. */
  readonly resultType: string;
  /** Paths relative to the target directory. */
  readonly verbFile: string;
  readonly serviceFile: string;
  readonly routerFile: string;
}

const ANY_NODE: RuleConfig<TS> = { rule: { any: [{ kind: "return_statement" }, { kind: "property_signature" }, { kind: "pair" }] } };

/** Files that return an object, declare a member or define a router entry can change; the plan picks. */
export const getSelector: GetSelector<TS> = () => ANY_NODE;

const STRING_FIELDS = ["verb", "field", "resultType", "verbFile", "serviceFile", "routerFile"] as const;

function readPlan(targetDir: string, planFile: string): readonly Verb[] {
  const parsed: unknown = JSON.parse(readFileSync(join(targetDir, planFile), "utf8"));
  if (parsed === null || typeof parsed !== "object" || !("verbs" in parsed) || !Array.isArray(parsed.verbs)) {
    throw new Error(`${planFile}: expected { "verbs": [...] }`);
  }
  return parsed.verbs.map((entry: unknown, index: number): Verb => {
    const record = entry as Record<string, unknown> | null;
    for (const key of STRING_FIELDS) {
      if (record === null || typeof record[key] !== "string") {
        throw new Error(`${planFile}: verb ${index} needs ${key}`);
      }
    }
    const text = (key: (typeof STRING_FIELDS)[number]): string => String((record as Record<string, unknown>)[key]);
    return {
      verb: text("verb"),
      field: text("field"),
      resultType: text("resultType"),
      verbFile: text("verbFile"),
      serviceFile: text("serviceFile"),
      routerFile: text("routerFile"),
    };
  });
}

// `Promise<ResultType>` -> `Promise<void>` on the node that holds the type annotation.
function voidPromise(scope: SgNode<TS>, resultType: string): readonly Edit[] {
  return scope
    .findAll({ rule: { kind: "generic_type", has: { kind: "type_identifier", regex: "^Promise$" } } })
    .filter((generic) => generic.find({ rule: { kind: "type_arguments", has: { kind: "type_identifier", regex: `^${resultType}$` } } }) !== null)
    .map((generic) => generic.replace("Promise<void>"));
}

// A `return { field: <literal> };` statement and its whole line.
function dropReturns(rootNode: SgNode<TS>, verb: Verb, bytes: Uint8Array): readonly Edit[] {
  return rootNode
    .findAll({ rule: { kind: "return_statement", has: { kind: "object", regex: `^\\{\\s*${verb.field}\\s*:\\s*(true|false)\\s*,?\\s*\\}$` } } })
    .map((statement) => {
      const { start, end } = statement.range();
      let startPos = start.index;
      while (bytes[startPos - 1] === SPACE) {
        startPos -= 1;
      }
      return { startPos, endPos: bytes[end.index] === NEWLINE ? end.index + 1 : end.index, insertedText: "" };
    });
}

function serviceMember(rootNode: SgNode<TS>, verb: Verb): readonly Edit[] {
  return rootNode
    .findAll({ rule: { kind: "property_signature", has: { field: "name", kind: "property_identifier", regex: `^${verb.verb}$` } } })
    .flatMap((member) => voidPromise(member, verb.resultType));
}

// `verb: base.output(Schema).input(...)` -> `.output(z.void())`.
function routerOutput(rootNode: SgNode<TS>, verb: Verb): readonly Edit[] {
  const entry = rootNode.find({ rule: { kind: "pair", has: { field: "key", kind: "property_identifier", regex: `^${verb.verb}$` } } });
  const outputs =
    entry?.findAll({
      rule: { kind: "call_expression", has: { field: "function", kind: "member_expression", has: { field: "property", regex: "^output$" } } },
    }) ?? [];
  return outputs.flatMap((call) => {
    const argument = call.field("arguments")?.child(1);
    return argument === null || argument === undefined ? [] : [argument.replace("z.void()")];
  });
}

const codemod: Codemod<TS> = (root, options) => {
  const plan = readPlan(options.targetDir, options.params["plan"] ?? DEFAULT_PLAN_FILE);
  const file = root.relativeFilename();
  const rootNode = root.root();
  const bytes = new TextEncoder().encode(rootNode.text());
  const edits: Edit[] = [];
  for (const verb of plan) {
    if (file === verb.verbFile) {
      edits.push(...dropReturns(rootNode, verb, bytes), ...voidPromise(rootNode, verb.resultType));
    }
    if (file === verb.serviceFile) {
      edits.push(...serviceMember(rootNode, verb));
    }
    if (file === verb.routerFile) {
      edits.push(...routerOutput(rootNode, verb));
    }
  }
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
