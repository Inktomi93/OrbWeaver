// Rewrites hand-typed port members to derive from their owner (`Owner["m"]`, or `Pick<Owner, …>` for a whole port),
// adds the type-only imports and door exports the derive needs. The targets come from `pnpm unwired ports`, which
// matched each member to its owner with the type checker; this transform only edits text at those positions.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { readFileSync } from "fs";
import { join } from "path";

const DEFAULT_TARGETS_FILE = "reports/unwired/port-targets.json";
// Only these kinds are mechanical; the census leaves the others to judgment.
// The census's APPLIED_KINDS; the sandbox cannot import it, so the list is repeated here and the fixtures pin it.
const APPLIED_KINDS = new Set(["derive", "derive-params", "concept", "add-door-export"]);
const EDITED_FORMS = new Set(["member", "collapse"]);

interface TargetExport {
  readonly file: string;
  readonly name: string;
  readonly from: string | null;
}

interface PortTarget {
  readonly kind: string;
  readonly form: string;
  readonly file: string;
  readonly line: number;
  readonly members: readonly string[];
  readonly type: string | null;
  readonly imports: readonly { readonly name: string; readonly from: string }[];
  readonly exports: readonly TargetExport[];
}

const MEMBER: RuleConfig<TS> = { rule: { any: [{ kind: "property_signature" }, { kind: "method_signature" }] } };

/** Every file may hold a target or a door export; the targets file decides. */
export const getSelector: GetSelector<TS> = () => ({ rule: { kind: "program" } });

function readTargets(targetDir: string, file: string): readonly PortTarget[] {
  const parsed = JSON.parse(readFileSync(join(targetDir, file), "utf8")) as { readonly targets?: readonly PortTarget[] };
  if (!Array.isArray(parsed.targets)) {
    throw new Error(`${file}: expected { targets: [...] } from pnpm unwired ports`);
  }
  return parsed.targets;
}

const nameOf = (member: SgNode<TS>): string => member.find({ rule: { kind: "property_identifier" } })?.text() ?? "";

function memberAt(rootNode: SgNode<TS>, line: number, name: string): SgNode<TS> | null {
  return rootNode.findAll(MEMBER).find((member) => member.range().start.line === line - 1 && nameOf(member) === name) ?? null;
}

// `readonly a?: (x) => y` keeps its modifiers and swaps the annotation; a method becomes a property.
function deriveMember(member: SgNode<TS>, type: string): Edit {
  if (member.is("property_signature")) {
    const annotation = member.children().find((child) => child.is("type_annotation"));
    if (annotation !== undefined) {
      return annotation.replace(`: ${type}`);
    }
  }
  const optional = member.children().some((child) => child.text() === "?") ? "?" : "";
  return member.replace(`${nameOf(member)}${optional}: ${type}`);
}

const membersOf = (body: SgNode<TS>): readonly SgNode<TS>[] => body.children().filter((child) => child.isNamed() && child.kind() !== "comment");

// The whole port becomes `Pick<Owner, …>` only when the target names every member it declares and nothing else.
function collapsePort(member: SgNode<TS>, target: PortTarget, type: string): Edit[] | null {
  const body = member.parent();
  if (body === null) {
    return null;
  }
  const declared = membersOf(body);
  const names = new Set(target.members);
  const exact =
    declared.length === names.size && declared.every((child) => (child.is("property_signature") || child.is("method_signature")) && names.has(nameOf(child)));
  if (!exact) {
    return null;
  }
  const readonly = declared.every((child) => child.children().some((part) => part.is("readonly")));
  const slice = readonly ? `Readonly<${type}>` : type;
  const holder = body.parent();
  if (body.is("interface_body") && holder?.is("interface_declaration") === true) {
    const plain = !holder.children().some((child) => child.is("extends_type_clause") || child.is("type_parameters"));
    return plain ? [{ startPos: body.range().start.index, endPos: body.range().end.index, insertedText: `extends ${slice} {}` }] : null;
  }
  return body.is("object_type") ? [body.replace(slice)] : null;
}

// Not the port's whole body: each named member in that body derives on its own.
function memberwise(first: SgNode<TS> | undefined, target: PortTarget, type: string): Edit[] {
  const body = first?.parent() ?? null;
  const home = /^([A-Za-z_$][\w$]*)/u.exec(type.replace(/^Pick</u, ""))?.[1] ?? "";
  return (body === null ? [] : membersOf(body))
    .filter((candidate) => target.members.includes(nameOf(candidate)))
    .map((candidate) => deriveMember(candidate, `${home}["${nameOf(candidate)}"]`));
}

function memberEdits(rootNode: SgNode<TS>, target: PortTarget): Edit[] {
  const { type } = target;
  if (type === null) {
    return [];
  }
  if (target.form === "collapse") {
    const first = rootNode.findAll(MEMBER).find((candidate) => candidate.range().start.line === target.line - 1 && target.members.includes(nameOf(candidate)));
    return (first === undefined ? null : collapsePort(first, target, type)) ?? memberwise(first, target, type);
  }
  const member = memberAt(rootNode, target.line, target.members[0] ?? "");
  return member === null ? [] : [deriveMember(member, type)];
}

const IMPORT_BRACES = /\{([^}]*)\}/u;

const sourceOf = (statement: SgNode<TS>): string =>
  statement
    .find({ rule: { kind: "string" } })
    ?.text()
    .slice(1, -1) ?? "";

const declares = (present: string, name: string): boolean => new RegExp(`(?:^|[\\s,{])(?:type\\s+)?${name}(?:\\s*,|\\s*$)`, "u").test(present);

// Extend an existing import from `from` with the missing names, or return the new statement's text.
function importEdit(statements: readonly SgNode<TS>[], from: string, names: ReadonlySet<string>): Edit | string | null {
  const existing = statements.find((statement) => sourceOf(statement) === from);
  const present = existing === undefined ? "" : (IMPORT_BRACES.exec(existing.text())?.[1] ?? "");
  const missing = [...names].filter((name) => !declares(present, name));
  if (missing.length === 0) {
    return null;
  }
  const clause = existing?.find({ rule: { kind: "named_imports" } }) ?? null;
  if (existing === undefined || clause === null) {
    return `import type { ${missing.join(", ")} } from "${from}";`;
  }
  const typeOnly = existing.text().startsWith("import type");
  const spelled = missing.map((name) => (typeOnly ? name : `type ${name}`)).join(", ");
  return clause.replace(`{ ${[present.trim().replace(/,\s*$/u, ""), spelled].filter((part) => part !== "").join(", ")} }`);
}

// One `import type { … } from "spec"` per specifier: extend an existing import, else add one after the last import.
function importEdits(rootNode: SgNode<TS>, imports: readonly { readonly name: string; readonly from: string }[]): Edit[] {
  const statements = rootNode.children().filter((child) => child.is("import_statement"));
  const bySource = new Map<string, Set<string>>();
  for (const entry of imports) {
    bySource.set(entry.from, (bySource.get(entry.from) ?? new Set()).add(entry.name));
  }
  const results = [...bySource].map(([from, names]) => importEdit(statements, from, names));
  const edits = results.filter((result): result is Edit => result !== null && typeof result !== "string");
  const added = results.filter((result): result is string => typeof result === "string");
  if (added.length > 0) {
    const anchor = statements.at(-1);
    const at = anchor === undefined ? 0 : anchor.range().end.index;
    edits.push({ startPos: at, endPos: at, insertedText: anchor === undefined ? `${added.join("\n")}\n` : `\n${added.join("\n")}` });
  }
  return edits;
}

// A door that already exports the name, directly or as an alias (`X as Name`), gets no second export: TS2300.
function exportsName(rootNode: SgNode<TS>, name: string): boolean {
  const spelled = new RegExp(`(?:[{,]\\s*(?:type\\s+)?|\\bas\\s+)${name}\\s*[,}]`, "u");
  return rootNode.children().some((child) => child.is("export_statement") && spelled.test(child.text()));
}

// `export` on a local declaration, or `export type { Name } from "…"` on a door.
function exportEdits(rootNode: SgNode<TS>, entries: readonly TargetExport[]): Edit[] {
  const edits: Edit[] = [];
  const lines: string[] = [];
  for (const entry of entries) {
    if (entry.from === null) {
      const declaration = rootNode.children().find(
        (child) =>
          (child.is("interface_declaration") || child.is("type_alias_declaration")) &&
          child
            .children()
            .find((part) => part.is("type_identifier"))
            ?.text() === entry.name,
      );
      if (declaration !== undefined) {
        edits.push({ startPos: declaration.range().start.index, endPos: declaration.range().start.index, insertedText: "export " });
      }
      continue;
    }
    if (!exportsName(rootNode, entry.name)) {
      lines.push(`export type { ${entry.name} } from "${entry.from}";`);
    }
  }
  if (lines.length > 0) {
    const anchor = rootNode
      .children()
      .filter((child) => child.is("export_statement") || child.is("import_statement"))
      .at(-1);
    const at = anchor === undefined ? 0 : anchor.range().end.index;
    edits.push({ startPos: at, endPos: at, insertedText: `\n${lines.join("\n")}` });
  }
  return edits;
}

const codemod: Codemod<TS> = (root, options) => {
  const file = root.relativeFilename();
  const targets = readTargets(options.targetDir, options.params["targets"] ?? DEFAULT_TARGETS_FILE).filter((target) => APPLIED_KINDS.has(target.kind));
  const rootNode = root.root();
  const mine = targets.filter((target) => target.file === file && EDITED_FORMS.has(target.form));
  const doors = targets.flatMap((target) => target.exports).filter((entry) => entry.file === file);
  const unique = [...new Map(doors.map((entry) => [`${entry.name}|${entry.from ?? ""}`, entry])).values()];
  const edits = [
    ...mine.flatMap((target) => memberEdits(rootNode, target)),
    ...importEdits(
      rootNode,
      mine.flatMap((target) => target.imports),
    ),
    ...exportEdits(rootNode, unique),
  ];
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
