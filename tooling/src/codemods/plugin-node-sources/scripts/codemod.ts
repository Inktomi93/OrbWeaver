// The exported contract uses its runtime key tuples. The standalone SDK cannot import the host and spells
// those same source keys in its ambient declaration, as the SDK conformance contract requires.
import type { Codemod, Edit, GetSelector } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { useMetricAtom } from "codemod:metrics";

const SOURCES = new Map<string, { readonly family: string; readonly fields: readonly string[] }>([
  ["PluginKeyValueNode", { family: "keyValue", fields: ["rows", "rowsFrom"] }],
  ["PluginImageNode", { family: "image", fields: ["assetId", "assetFrom", "bundleAsset"] }],
  ["PluginPageHero", { family: "image", fields: ["assetId", "assetFrom", "bundleAsset"] }],
  ["PluginSelectNode", { family: "select", fields: ["options", "optionsFrom", "optionsFromHost"] }],
  ["PluginTabsNode", { family: "tabs", fields: ["options", "optionsFrom"] }],
  ["PluginGridNode", { family: "grid", fields: ["tiles", "tilesFrom"] }],
  ["PluginGridTile", { family: "tile", fields: ["assetId", "bundleAsset"] }],
]);
const SELECTOR = { rule: { kind: "interface_declaration", has: { field: "name", regex: `^(${[...SOURCES.keys()].join("|")})$` } } } as const;
export const getSelector: GetSelector<TS> = () => SELECTOR;

const codemod: Codemod<TS> = (root, { matches }) => {
  const top = root.root();
  const edits: Edit[] = [];
  const changed = useMetricAtom("plugin source arms");
  for (const node of matches ?? top.findAll(SELECTOR)) {
    const name = node.field("name")?.text() ?? "";
    const shape = node.field("body");
    const choice = SOURCES.get(name);
    if (choice === undefined || shape === null) {
      continue;
    }
    const present = new Set(
      shape
        .children()
        .filter((child) => child.kind() === "property_signature")
        .map((child) => child.field("name")?.text()),
    );
    if (!choice.fields.every((key) => present.has(key))) {
      throw new Error(`Missing source key on ${name}`);
    }
    const keys =
      node.parent()?.kind() === "export_statement"
        ? `(typeof PLUGIN_SOURCE_KEYS.${choice.family})[number]`
        : choice.fields.map((key) => JSON.stringify(key)).join(" | ");
    const variant = choice.family === "tile" ? "PluginOptionalSource" : "PluginOneSource";
    const grid = choice.family === "grid" ? " & ({ readonly tiles?: undefined } | { readonly tileAction?: undefined })" : "";
    edits.push(node.replace(`type ${name} = ${variant}<${shape.text()}, ${keys}>${grid};`));
    changed.increment({ node: name });
  }
  return Promise.resolve(edits.length === 0 ? null : top.commitEdits(edits));
};
export default codemod;
