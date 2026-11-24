// Rewrites `new DomainNotFoundError(label, value)` and `super(label, value)` in a class extending it to the kind-keyed
// ref the constructor takes: `{ kind, id }`, `{ kind, key }` for a kind found by a plain key, or `{ kind }` for the
// invite lookup that names nothing. This transform has no type information: it renames a label to its kind and moves the
// value into the ref, and `pnpm typecheck` then judges every site, so a value of the wrong brand fails there. A site whose
// second argument is a string literal other than "" passes a word, not an id, and is skipped for a hand fix.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";
import { useMetricAtom } from "codemod:metrics";

const STRING_KIND = "string";
const EMPTY_LITERAL = '""';
const QUOTE_LENGTH = 1;

/** The labels callers wrote before the ref, mapped to the kind that names the id they pass. A label with no entry is already a kind. */
const KIND_OF_LABEL: ReadonlyMap<string, string> = new Map([
  ["refinery session", "refinery_session"],
  ["refinery run", "refinery_run"],
  ["refinery schema", "refinery_schema"],
  ["roster preset", "roster_preset"],
  ["journal", "rpg_journal"],
  ["checkpoint", "rpg_checkpoint"],
  ["snapshot", "rpg_snapshot"],
  // Both sites that spell `game` hold the chat's id: a game is found by its chat.
  ["game", "chat"],
  // Both sites that spell `chat_participant` hold the id of a character an import has not seated: the seat is missing.
  ["chat_participant", "chat seat"],
]);

/** The kinds found by a plain key, not a branded id. */
const KEY_KINDS: ReadonlySet<string> = new Set(["tool", "quest objective"]);

const NOT_FOUND_CALLS: RuleConfig<TS> = {
  rule: {
    any: [
      { pattern: "new DomainNotFoundError($$$ARGS)" },
      {
        pattern: "super($$$ARGS)",
        inside: { kind: "class_declaration", stopBy: "end", has: { kind: "class_heritage", regex: "\\bDomainNotFoundError\\b" } },
      },
    ],
  },
};

export const getSelector: GetSelector<TS> = () => NOT_FOUND_CALLS;

const rewritten = useMetricAtom("domain-not-found-ref.rewritten");
const skipped = useMetricAtom("domain-not-found-ref.skipped");

// A string literal's text without its quotes: the labels are plain words, so no escape is read.
function unquoted(literal: SgNode<TS>): string {
  return literal.text().slice(QUOTE_LENGTH, -QUOTE_LENGTH);
}

// The first argument's kind: a literal label renamed to its kind, or an identifier or member the caller already holds.
function kindOf(label: SgNode<TS>): string {
  if (label.kind() !== STRING_KIND) {
    return label.text();
  }
  const word = unquoted(label);
  return JSON.stringify(KIND_OF_LABEL.get(word) ?? word);
}

function refEdit(call: SgNode<TS>): Edit | null {
  const argumentList = call.field("arguments");
  const args = argumentList?.children().filter((child) => child.isNamed()) ?? [];
  const [label, value] = args;
  if (argumentList === null || args.length !== 2 || label === undefined || value === undefined) {
    skipped.increment({ reason: "not-two-arguments" });
    return null;
  }
  const kind = kindOf(label);
  if (value.kind() === STRING_KIND) {
    if (value.text() !== EMPTY_LITERAL) {
      skipped.increment({ reason: "string-literal-value" });
      return null;
    }
    rewritten.increment({ arm: "bare" });
    return argumentList.replace(`({ kind: ${kind} })`);
  }
  const field = label.kind() === STRING_KIND && KEY_KINDS.has(unquoted(label)) ? "key" : "id";
  rewritten.increment({ arm: field });
  return argumentList.replace(`({ kind: ${kind}, ${field}: ${value.text()} })`);
}

const codemod: Codemod<TS> = (root) => {
  const rootNode = root.root();
  const edits = rootNode
    .findAll(NOT_FOUND_CALLS)
    .map(refEdit)
    .filter((edit): edit is Edit => edit !== null);
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
