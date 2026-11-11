// Drops issue-number cites and date stamps from comments where the sentence stands without them (the comment law bans
// both). Only a cite or date that is a whole parenthetical, the head or tail of one, a leading tag, or the date after a
// ruling verb is removed; a cite or date that carries the sentence is left for a reader. Code, strings, templates,
// regexes and backtick spans inside a comment are never touched.

import type { Codemod, Edit, GetSelector, RuleConfig } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";

const COMMENT: RuleConfig<TS> = { rule: { kind: "comment" } };

export const getSelector: GetSelector<TS> = () => COMMENT;

// `§4 #11` is a section-and-row reference inside a law doc, not an issue cite. A cite may carry the finding or part
// label its tracker used (`item 2`, `F13`, `seam-11 read half`), which goes with it.
const CITE_PART = String.raw`\s+(?:(?:items?|legs?|seams?|steps?|rows?|riders?)\s+\d+[a-z]?(?:\s*(?:,|and|&|\+)\s*\d+[a-z]?)*|[FPBSUN]-?\d+[a-z]?|f\d+|D-\d+|Finding [A-Z]|seam-\d+(?: read half)?|residual)`;
const CITE = String.raw`(?<![\w&/#§-])(?<!§\d{1,2} )#\d{2,5}(?:\.\d+)?(?:${CITE_PART})*`;
const DATE = String.raw`\b20\d\d-\d\d-\d\d\b`;
// A review or campaign tag: a named reviewer stands alone; a generic word needs its finding label, date or cite.
const TAG_LABEL = String.raw`(?:\s+(?!D\d)(?:${DATE}|§[\d.]+[A-Za-z]?|[A-Z]{1,2}-?[A-Z]?\d+[a-z]?(?:-[A-Za-z0-9]+)*|#\d{2,5}|items?\s+\d+|riders?\s+\d+|legs?\s+\d+))`;
const NAMED_TAG = String.raw`(?:side-eye|stickler|visual-blech|marinara)(?:\s+(?:corpus re-pass|re-pass|audit|pass|review))?${TAG_LABEL}*`;
const GENERIC_TAG = String.raw`(?:security(?:-executor)? (?:pass|review)|audit|review|issue|task|census|verifier)${TAG_LABEL}+`;
const LANE_TAG = String.raw`(?:W\d+[a-z]? lane|R-[A-Z]{3,})`;
const TOKEN = `(?:${CITE}|${DATE}|${NAMED_TAG}|${GENERIC_TAG}|${LANE_TAG})`;
const LIST = String.raw`${TOKEN}(?:\s*(?:,|;|/|·|and|&)\s*${TOKEN})*`;
const DASH = String.raw`(?:—|–|-|,|;|:)`;
const RULING = String.raw`\b(owner[- ](?:ruled|ruling|pick|decision|addition|approved)|ruled|measured|audited)\s+(?:on\s+)?${DATE}`;

// A leading tag's removal leaves the sentence's first word at the line start, so it takes a capital.
const leadCapital = (_match: string, lead: string, first: string): string => `${lead}${first.toUpperCase()}`;

const RULES: readonly (readonly [RegExp, string | ((match: string, ...groups: string[]) => string)])[] = [
  [new RegExp(String.raw`[ \t]*\(\s*${LIST}\s*\)`, "gu"), ""],
  [new RegExp(String.raw`\(\s*${LIST}[ \t]*${DASH}[ \t]*`, "gu"), "("],
  [new RegExp(String.raw`\s*(?:,|;|—|–)\s*${LIST}\s*\)`, "gu"), ")"],
  [new RegExp(String.raw`^([ \t]*(?:\/\/+|\/\*\*?|\*)[ \t]*)${LIST}[ \t]*(?:—|–|:|-)[ \t]+(\S)`, "gmu"), leadCapital],
  [new RegExp(RULING, "gu"), "$1"],
];

// Backtick spans hold code samples and names; only the prose between them is rewritten.
function rewriteProse(prose: string): string {
  let next = prose;
  for (let previous = ""; previous !== next; ) {
    previous = next;
    for (const [pattern, replacement] of RULES) {
      next = typeof replacement === "string" ? next.replace(pattern, replacement) : next.replace(pattern, replacement);
    }
  }
  return next;
}

function rewrite(text: string): string {
  return text
    .split(/(`[^`\n]*`)/u)
    .map((part, index) => (index % 2 === 1 ? part : rewriteProse(part)))
    .join("");
}

const codemod: Codemod<TS> = (root, options) => {
  const rootNode = root.root();
  const comments = options.matches ?? rootNode.findAll(COMMENT);
  const edits: Edit[] = [];
  for (const comment of comments) {
    const text = comment.text();
    const next = rewrite(text);
    if (next !== text) {
      edits.push(comment.replace(next));
    }
  }
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits(edits));
};

export default codemod;
