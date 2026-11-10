// Each reviewed group is one render mode. Keep the original property declaration in its own mode and
// make the other mode's fields optional-never. Members outside the groups stay on the shared interface.
import type { Codemod, Edit, GetSelector, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { useMetricAtom } from "codemod:metrics";

const GROUPS = new Map<string, readonly (readonly string[])[]>([
  ["ToggleGroupProps", [['"aria-label"'], ['"aria-labelledby"']]],
  ["FileDropzoneProps", [["subject"], ["instructions"]]],
  ["EmptyStateProps", [["decoration"], ["icon"]]],
  ["MediaGridProps", [["selection"], ["onActivate"]]],
  ["SandboxFrameProps", [["heightPx"], ["fill"]]],
  ["TrackBarProps", [["color"], ["accent"]]],
  ["ListRowProps", [["stackActions", "stackActionsAt", "rowTint"], ["actionsFloat"]]],
  ["CompareBlock", [["before", "after", "stateNote"], ["body"]]],
]);
// An inactive Boolean switch or the default ramp can accompany the other mode.
const INACTIVE = new Map<string, ReadonlyMap<string, string>>([
  ["SandboxFrameProps", new Map([["fill", "false"]])],
  ["TrackBarProps", new Map([["accent", '"ramp"']])],
  [
    "ListRowProps",
    new Map([
      ["actionsFloat", "false"],
      ["stackActions", "false"],
      ["rowTint", '"body"'],
    ]),
  ],
]);
const SELECTOR = { rule: { kind: "interface_declaration", has: { field: "name", regex: `^(${[...GROUPS.keys()].join("|")})$` } } } as const;

export const getSelector: GetSelector<TS> = () => SELECTOR;

interface Field {
  readonly name: string;
  readonly allowed: string;
  readonly forbidden: string;
  readonly removal: Edit;
}

const SPACE = 32;
const TAB = 9;
const LINE_FEED = 10;

function removal(start: SgNode<TS>, end: SgNode<TS>, bytes: Uint8Array): Edit {
  const first = start.range().start.index;
  let line = first;
  while (line > 0 && (bytes[line - 1] === SPACE || bytes[line - 1] === TAB)) {
    line--;
  }
  const last = end.range().end.index;
  const ownLine = (line === 0 || bytes[line - 1] === LINE_FEED) && bytes[last] === LINE_FEED;
  return { startPos: ownLine ? line : first, endPos: ownLine ? last + 1 : last, insertedText: "" };
}

function fieldOf(node: SgNode<TS>, inactive: ReadonlyMap<string, string> | undefined, bytes: Uint8Array): Field {
  const name = node.field("name")?.text() ?? "";
  const comment = node.prev();
  const doc = comment?.kind() === "comment" ? comment : null;
  const end = node.next();
  return {
    name,
    allowed: `${doc === null ? "" : `${doc.text()}\n`}${node.text()};`,
    forbidden: `${node.children().some((child) => child.kind() === "readonly") ? "readonly " : ""}${name}?: ${inactive?.get(name) ?? "never"};`,
    removal: removal(doc ?? node, end?.kind() === ";" ? end : node, bytes),
  };
}

const codemod: Codemod<TS> = (root, { matches }) => {
  const top = root.root();
  const edits: Edit[] = [];
  const bytes = new TextEncoder().encode(top.text());
  const changed = useMetricAtom("exclusive prop interfaces");
  for (const declaration of matches ?? top.findAll(SELECTOR)) {
    const parent = declaration.parent();
    const name = declaration.field("name");
    const groups = name === null ? undefined : GROUPS.get(name.text());
    if (parent?.kind() !== "export_statement" || name === null || groups === undefined) {
      continue;
    }
    const keys = new Set(groups.flat());
    const fields =
      declaration
        .field("body")
        ?.children()
        .filter((member) => member.kind() === "property_signature" && keys.has(member.field("name")?.text() ?? ""))
        .map((field) => fieldOf(field, INACTIVE.get(name.text()), bytes)) ?? [];
    if (fields.length !== keys.size) {
      throw new Error(`Missing reviewed field on ${name.text()}`);
    }
    const params = declaration.field("type_parameters");
    const args =
      params
        ?.children()
        .filter((child) => child.kind() === "type_parameter")
        .map((param) => param.field("name")?.text()) ?? [];
    const base = `${name.text()}Base`;
    const arms = groups.map(
      (group) => `  | {\n${fields.map((field) => `      ${group.includes(field.name) ? field.allowed : field.forbidden}`).join("\n")}\n    }`,
    );
    edits.push({ startPos: parent.range().start.index, endPos: declaration.range().start.index, insertedText: "" });
    edits.push(name.replace(base), ...fields.map((field) => field.removal));
    edits.push({
      startPos: declaration.range().end.index,
      endPos: declaration.range().end.index,
      insertedText: `\n\nexport type ${name.text()}${params?.text() ?? ""} = ${base}${args.length === 0 ? "" : `<${args.join(", ")}>`} & (\n${arms.join("\n")}\n);`,
    });
    changed.increment({ owner: name.text() });
  }
  return Promise.resolve(edits.length === 0 ? null : top.commitEdits(edits));
};

export default codemod;
