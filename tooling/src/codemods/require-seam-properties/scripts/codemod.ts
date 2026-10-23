// Makes named optional properties required on composition-deps interfaces, so a forgotten seam fails to compile.
// Drops the `?` and a trailing `| undefined`; the reads that defaulted the seam are judgment edits, left to hand.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";

const DEFAULT_PROPERTIES = "timers,random,randomInt,idSource,newOpaqueId,scheduleTimeout,scheduleInterval";
// Deps and compose-input bags only; a domain read model with an optional `random` field is not a seam.
const DEFAULT_INTERFACE = "(Deps|ComposeInput)$";

const OPTIONAL_PROPERTY: RuleConfig<TS> = {
  rule: {
    kind: "property_signature",
    inside: { kind: "interface_body", inside: { kind: "interface_declaration" } },
  },
};

export const getSelector: GetSelector<TS> = () => OPTIONAL_PROPERTY;

function interfaceName(property: SgNode<TS>): string | undefined {
  const declaration = property.ancestors().find((node) => node.is("interface_declaration"));
  return declaration?.field("name").text();
}

// `T | undefined` becomes `T`; a parenthesized sole member such as `(() => number)` loses its parentheses.
function requiredTypeEdit(property: SgNode<TS>): Edit | undefined {
  const union = property.find({ rule: { kind: "union_type", inside: { kind: "type_annotation", inside: { kind: "property_signature" } } } });
  if (union === null || union.parent()?.parent()?.id() !== property.id()) {
    return;
  }
  const members = union.children().filter((child) => child.isNamed());
  const kept = members.filter((member) => !(member.is("literal_type") && member.text() === "undefined"));
  if (kept.length !== 1 || members.length !== 2) {
    return;
  }
  const [only] = kept;
  if (only === undefined) {
    return;
  }
  const inner = only.is("parenthesized_type") ? only.children().find((child) => child.isNamed()) : only;
  return union.replace((inner ?? only).text());
}

const codemod: Codemod<TS> = (root, options) => {
  const names = new Set((options.params["properties"] ?? DEFAULT_PROPERTIES).split(","));
  const interfacePattern = new RegExp(options.params["interface"] ?? DEFAULT_INTERFACE);
  const rootNode = root.root();
  const edits: Edit[] = [];
  for (const property of options.matches ?? rootNode.findAll(OPTIONAL_PROPERTY)) {
    const name = property.field("name")?.text();
    const owner = interfaceName(property);
    if (name === undefined || !names.has(name) || owner === undefined || !interfacePattern.test(owner)) {
      continue;
    }
    const marker = property.children().find((child) => child.is("?"));
    if (marker === undefined) {
      continue;
    }
    edits.push(marker.replace(""));
    const typeEdit = requiredTypeEdit(property);
    if (typeEdit !== undefined) {
      edits.push(typeEdit);
    }
  }
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
