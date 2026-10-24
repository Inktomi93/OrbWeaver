// Rewrites verb-suite reads of a door seed's old row result to the verb outcome the seed now returns.
// Only reads whose answer is an id or a whole value move here; a column assertion becomes a verb read by hand.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";

// Persistence suites read the rows twins, whose results keep the row shapes.
const PERSISTENCE_DIR = "/persistence/";

/** A bound result's member that moved: `name.<from>` reads `name.<to>`. */
const MOVED_MEMBERS: Readonly<Record<string, { readonly from: string; readonly to: string; readonly onlyBefore?: string }>> = {
  // The install and grant verbs return the plugin view; only its id was ever read off the old row.
  seedInstalledPlugin: { from: "plugin", to: "outcome", onlyBefore: "id" },
  seedPluginGrant: { from: "plugin", to: "outcome", onlyBefore: "id" },
  // createInvite returns { invite, token }; the old result was the invite row itself.
  seedChatInvite: { from: "id", to: "invite.id" },
};

/** A destructured key that moved: `{ <key>: x }` becomes `<pattern with x>`. */
const MOVED_KEYS: Readonly<Record<string, { readonly key: string; readonly pattern: (binding: string) => string; readonly whole: boolean }>> = {
  seedCharacter: { key: "row", pattern: (binding) => `view: ${binding}`, whole: false },
  seedChat: { key: "row", pattern: (binding) => `view: { chat: ${binding} }`, whole: false },
  // commitMessage returns the message view itself, so the one-key pattern collapses to the binding.
  seedMessage: { key: "slot", pattern: (binding) => binding, whole: true },
};

const SEEDS = [...Object.keys(MOVED_MEMBERS), ...Object.keys(MOVED_KEYS)];

const SEED_BINDING: RuleConfig<TS> = {
  rule: {
    kind: "variable_declarator",
    has: {
      field: "value",
      kind: "await_expression",
      has: { kind: "call_expression", has: { field: "function", kind: "identifier", regex: `^(${SEEDS.join("|")})$` } },
    },
  },
};

/** Every `const x = await <seed>(...)` binding; the tables decide what changes. */
export const getSelector: GetSelector<TS> = () => SEED_BINDING;

function seedOf(declarator: SgNode<TS>): string | undefined {
  // The awaited call's callee is the first identifier in a function position under the value.
  return declarator
    .field("value")
    ?.find({ rule: { kind: "identifier", inside: { field: "function", kind: "call_expression" } } })
    ?.text();
}

// `name.<from>` (only before `.<onlyBefore>` when set) everywhere the file reads the binding.
function memberEdits(rootNode: SgNode<TS>, name: string, move: (typeof MOVED_MEMBERS)[string]): readonly Edit[] {
  const reads = rootNode.findAll({
    rule: {
      kind: "member_expression",
      has: { field: "object", kind: "identifier", regex: `^${name}$` },
      all: [{ has: { field: "property", kind: "property_identifier", regex: `^${move.from}$` } }],
    },
  });
  return reads
    .filter((read) => {
      if (move.onlyBefore === undefined) {
        return true;
      }
      const parent = read.parent();
      return parent?.kind() === "member_expression" && parent.field("property")?.text() === move.onlyBefore;
    })
    .map((read) => read.replace(`${name}.${move.to}`));
}

function keyEdits(declarator: SgNode<TS>, move: (typeof MOVED_KEYS)[string]): readonly Edit[] {
  const pattern = declarator.field("name");
  if (pattern?.kind() !== "object_pattern") {
    return [];
  }
  const pairs = pattern.children().filter((child) => child.kind() === "pair_pattern");
  const pair = pairs.find((candidate) => candidate.field("key")?.text() === move.key);
  const binding = pair?.field("value");
  if (pair === undefined || binding === null || binding === undefined) {
    return [];
  }
  if (move.whole) {
    return pairs.length === 1 && pattern.children().filter((child) => child.isNamed()).length === 1 ? [pattern.replace(move.pattern(binding.text()))] : [];
  }
  return [pair.replace(move.pattern(binding.text()))];
}

const codemod: Codemod<TS> = (root, options) => {
  if (root.filename().includes(PERSISTENCE_DIR)) {
    return Promise.resolve(null);
  }
  const rootNode = root.root();
  const edits: Edit[] = [];
  for (const declarator of options.matches ?? rootNode.findAll(SEED_BINDING)) {
    const seed = seedOf(declarator) ?? "";
    const member = MOVED_MEMBERS[seed];
    const key = MOVED_KEYS[seed];
    const name = declarator.field("name");
    if (member !== undefined && name?.kind() === "identifier") {
      edits.push(...memberEdits(rootNode, name.text(), member));
    }
    if (key !== undefined) {
      edits.push(...keyEdits(declarator, key));
    }
  }
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
