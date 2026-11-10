// Refine the same stripped object in place: unknown guest keys keep their existing strip semantics and
// each leaf owns the source arity its new output type expresses.
import type { Codemod, Edit, GetSelector, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { useMetricAtom } from "codemod:metrics";

const SELECTOR = { rule: { pattern: "z.object($SHAPE).strip()" } } as const;
export const getSelector: GetSelector<TS> = () => SELECTOR;
const HERO = ["assetId", "assetFrom", "bundleAsset", "alt"];
const LEAVES = new Map([
  ["keyValue", "PluginKeyValueNode"],
  ["image", "PluginImageNode"],
  ["select", "PluginSelectNode"],
  ["tabs", "PluginTabsNode"],
  ["grid", "PluginGridNode"],
]);

function target(shape: SgNode<TS>): { kind: string; type: string } | undefined {
  const fields = new Map(
    shape
      .children()
      .filter((child) => child.kind() === "pair")
      .map((pair) => [pair.field("key")?.text(), pair.field("value")]),
  );
  const kind = fields
    .get("kind")
    ?.find({ rule: { kind: "string_fragment" } })
    ?.text();
  if (kind !== undefined) {
    const type = LEAVES.get(kind);
    return type === undefined ? undefined : { kind, type };
  }
  if (fields.size === HERO.length && HERO.every((key) => fields.has(key))) {
    return { kind: "hero", type: "PluginPageHero" };
  }
  if (["id", "title", "actionId", "assetId", "bundleAsset", "tags"].every((key) => fields.has(key))) {
    return { kind: "tile", type: "PluginGridTile" };
  }
  return undefined;
}

function refinement(node: { kind: string; type: string }): string {
  const field = node.kind === "hero" ? "image" : node.kind;
  const keys = `PLUGIN_SOURCE_KEYS.${field}`;
  const count = node.kind === "tile" ? "<= 1" : "=== 1";
  const type = node.kind === "grid" ? `PluginOneSource<typeof node, (typeof ${keys})[number]>` : `typeof node & ${node.type}`;
  let addition = `.refine((node): node is ${type} => sourceCount(node, ${keys}) ${count}, { error: PLUGIN_SOURCE_ERRORS.${node.kind} })`;
  if (node.kind === "grid") {
    addition +=
      ".refine((node): node is typeof node & PluginGridNode => node.tileAction === undefined || node.tilesFrom !== undefined, { error: PLUGIN_SOURCE_ERRORS.tileAction })";
  }
  return addition;
}

const codemod: Codemod<TS> = (root, { matches }) => {
  const edits: Edit[] = [];
  const top = root.root();
  const changed = useMetricAtom("plugin source validators");
  for (const call of matches ?? top.findAll(SELECTOR)) {
    const parent = call.parent();
    if (parent?.kind() === "member_expression" && parent.field("property")?.text() === "refine") {
      continue;
    }
    const shape = call.getMatch("SHAPE");
    const node = shape === null ? undefined : target(shape);
    if (node === undefined) {
      continue;
    }
    const addition = refinement(node);
    edits.push({ startPos: call.range().end.index, endPos: call.range().end.index, insertedText: addition });
    changed.increment({ node: node.type });
  }
  return Promise.resolve(edits.length === 0 ? null : top.commitEdits(edits));
};
export default codemod;
