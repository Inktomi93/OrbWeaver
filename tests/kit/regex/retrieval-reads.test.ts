// Whether a save call's scripts can read the turn's memory recall or databank retrieval decides whether a greeting or
// an edit gathers them at all. A read counts wherever the executor renders macros: the replacement, a trim string, and
// a find pattern whose substitution is on. A read whose value is discarded still counts, and so does text the
// analysis cannot see, such as card prose that renders its own macros. A script the call does not run never counts.
// @subject packages/kit/src/regex/index.ts
// @subject packages/kit/src/macro/cache-safety.ts

import type { RegexPassCall, RegexScriptInput } from "@orb/kit/regex";
import { regexCallReadsRetrieval, SubstituteFindRegex } from "@orb/kit/regex";
import { expect, test } from "@orb/testkit/node";

const SAVE_REPLY: RegexPassCall = { pass: "save", target: "AI_OUTPUT", edit: false };
const EDIT_REPLY: RegexPassCall = { pass: "save", target: "AI_OUTPUT", edit: true };
const SAVE_SCRIPT: RegexScriptInput = { enabled: true, targets: ["AI_OUTPUT"], passes: ["save"], findRegex: "lamp", replaceString: "lantern" };

interface ReadCase {
  readonly name: string;
  readonly script: Partial<RegexScriptInput>;
  readonly call?: RegexPassCall;
  readonly reads: boolean;
}

test.for<ReadCase>([
  { name: "a plain replacement", script: {}, reads: false },
  { name: "a replacement that places the memory", script: { replaceString: "lantern {{memory}}" }, reads: true },
  { name: "a replacement that places the databank in any case", script: { replaceString: "{{DataBank}}" }, reads: true },
  { name: "a trim string that reads the databank", script: { trimStrings: ["{{databank}}"] }, reads: true },
  { name: "a find pattern with substitution off", script: { findRegex: "{{memory}}" }, reads: false },
  { name: "a raw-substituted find pattern", script: { findRegex: "{{memory}}", substituteRegex: SubstituteFindRegex.raw }, reads: true },
  { name: "an escaped-substituted find pattern", script: { findRegex: "{{memory}}", substituteRegex: SubstituteFindRegex.escaped }, reads: true },
  { name: "a read stored in a variable", script: { replaceString: "{{setvar::kept::{{memory}}}}lantern{{getvar::kept}}" }, reads: true },
  {
    name: "a read stored from an argument the handler discards",
    script: { replaceString: "{{noop::{{setvar::kept::{{memory}}}}}}{{getvar::kept}}" },
    reads: true,
  },
  {
    name: "a read stored from a body the handler discards",
    script: { replaceString: "{{banned}}{{setvar::kept::{{databank}}}}{{/banned}}{{getvar::kept}}" },
    reads: true,
  },
  { name: "a read inside a branch a room value picks", script: { replaceString: '{{if::custom == "named"}}{{memory}}{{else}}lantern{{/if}}' }, reads: true },
  {
    name: "a branch a room value picks that reads neither",
    script: { replaceString: '{{if::custom == "named"}}{{char}}{{else}}lantern{{/if}}' },
    reads: false,
  },
  { name: "card prose, which renders macros its author wrote", script: { replaceString: "{{description}}" }, reads: true },
  { name: "names, variables and an unknown macro", script: { replaceString: "{{char}} {{user}} {{getvar::kept}} {{lampLight}}" }, reads: false },
  { name: "a switched-off script that reads the memory", script: { enabled: false, replaceString: "{{memory}}" }, reads: false },
  { name: "a display script that reads the memory", script: { passes: ["display"], replaceString: "{{memory}}" }, reads: false },
  { name: "a script on another target that reads the memory", script: { targets: ["USER_INPUT"], replaceString: "{{memory}}" }, reads: false },
  { name: "an edit, where a script without run-on-edit sits out", script: { replaceString: "{{memory}}" }, call: EDIT_REPLY, reads: false },
  { name: "an edit, where a run-on-edit script reads the memory", script: { replaceString: "{{memory}}", runOnEdit: true }, call: EDIT_REPLY, reads: true },
])("$name reads retrieval: $reads", ({ script, call, reads }) => {
  expect(regexCallReadsRetrieval([SAVE_SCRIPT, { ...SAVE_SCRIPT, ...script }], call ?? SAVE_REPLY)).toBe(reads);
});
