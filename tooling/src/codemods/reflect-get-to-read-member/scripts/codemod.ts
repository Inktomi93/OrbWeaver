// Rewrites `Reflect.get(target, key)`, which is typed `any`, into the `unknown`-returning `readMember` helper.
import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";

// Both paths are relative to the target directory the workflow runs against.
const DEFAULT_HELPER = "floor/instrument/member.ts";
const HELPER_NAME = "readMember";
const SELF_DESCRIBING_GLOBAL = /^globalThis\b/u;
const PAGE_SIDE_CALLEE = /\.(?:evaluate|evaluateAll|evaluateHandle|waitForFunction|addInitScript|\$eval|\$\$eval)$/u;

const REFLECT_GET: RuleConfig<TS> = { rule: { pattern: "Reflect.get($TARGET, $KEY)" } };

export const getSelector: GetSelector<TS> = () => REFLECT_GET;

function specifierFor(fromFile: string, helper: string): string {
  const fromParts = fromFile.split("/").slice(0, -1);
  const helperParts = helper.split("/");
  let shared = 0;
  while (shared < fromParts.length && shared < helperParts.length - 1 && fromParts[shared] === helperParts[shared]) {
    shared++;
  }
  const up = fromParts.length - shared;
  const prefix = up === 0 ? "./" : "../".repeat(up);
  return `${prefix}${helperParts.slice(shared).join("/")}`;
}

/** A function handed to page.evaluate is serialized into the browser, so it cannot call an imported helper. */
function insidePageCallback(call: SgNode<TS>): boolean {
  return call.ancestors().some((ancestor) => {
    const callback = ancestor.is("arrow_function") || ancestor.is("function_expression");
    const invocation = callback ? ancestor.parent()?.parent() : undefined;
    const callee = invocation?.is("call_expression") === true ? invocation.field("function").text() : "";
    return PAGE_SIDE_CALLEE.test(callee);
  });
}

const codemod: Codemod<TS> = (root, options) => {
  const helper = options.params["helper"] ?? DEFAULT_HELPER;
  const relative = root.relativeFilename();
  if (relative === helper) {
    return Promise.resolve(null);
  }
  const rootNode = root.root();
  const edits: Edit[] = [];
  for (const call of rootNode.findAll(REFLECT_GET)) {
    const target = call.getMatch("TARGET");
    const key = call.getMatch("KEY");
    if (target === null || key === null || SELF_DESCRIBING_GLOBAL.test(target.text()) || insidePageCallback(call)) {
      continue;
    }
    // A call nested in another match would overlap its edit; the outer one is rewritten and a second run takes the inner.
    if (call.ancestors().some((ancestor) => ancestor.matches(REFLECT_GET))) {
      continue;
    }
    edits.push(call.replace(`${HELPER_NAME}(${target.text()}, ${key.text()})`));
  }
  if (edits.length === 0) {
    return Promise.resolve(null);
  }
  const imports = rootNode.findAll({ rule: { kind: "import_statement" } });
  const last = imports.at(-1);
  const statement = `import { ${HELPER_NAME} } from "${specifierFor(relative, helper)}";`;
  if (last === undefined) {
    edits.push({ startPos: 0, endPos: 0, insertedText: `${statement}\n` });
  } else {
    edits.push({ startPos: last.range().end.index, endPos: last.range().end.index, insertedText: `\n${statement}` });
  }
  return Promise.resolve(rootNode.commitEdits(edits));
};

export default codemod;
