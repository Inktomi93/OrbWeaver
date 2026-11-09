// The literal stage keeps a dead row dead when every hit of its name is a comment: TSDoc on a declaration, a same-line
// trailing comment and a JSX comment container are mentions, while a string and a code read beside them still save.
import { expect, test } from "@orb/testkit/tooling";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { Sources } from "../../../tooling/src/unwired/classify.ts";
import { literalStage } from "../../../tooling/src/unwired/literal-hits.ts";

const DECLARATION = "packages/a/src/decl.ts";
const DECLARED = ["export interface Row { readonly wired: number }", "export const read = (row: Row): number => row.wired;"].join("\n");

test("a comment in TSDoc, trailing a line or alone in a JSX container is a mention; a string or code hit saves", async ({ plantedTree }) => {
  const root = await plantedTree({
    [DECLARATION]: DECLARED,
    "packages/a/src/doc.ts": ["/** zqTsdoc in tsdoc */", "export const y = 1;"].join("\n"),
    "packages/a/src/trail.ts": "export const z = 1; // zqTrail trailing\n",
    "packages/a/src/view.tsx": ["export const View = () => (", "  <div>", "    {/* zqJsx jsx comment */}", "  </div>", ");"].join("\n"),
    "packages/a/src/own.ts": ["export const w = 1;", "// zqOwnLine on its own line", "export const v = 2;"].join("\n"),
    "packages/a/src/saved.ts": ['export const s = "zqString";', "export const t = (o: { zqCode: number }): number => o.zqCode; // zqString again"].join("\n"),
  });
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  const members = ["zqTsdoc", "zqTrail", "zqJsx", "zqOwnLine", "zqString", "zqCode"];
  const rows = members.map((member) => ({ member, verdict: "dead" as const, known: [], neverWritten: false }));
  const wired = DECLARED.indexOf("wired");
  const { rows: staged } = literalStage(root, new Sources(root), rows, { key: "Row.wired", member: "wired", known: [`${DECLARATION}:${String(wired)}`] });
  expect(staged.map(({ member, verdict, literal }) => `${member} ${verdict} ${Object.keys(literal?.counts ?? {}).join(",")}`)).toEqual([
    "zqTsdoc dead tsdoc",
    "zqTrail dead comment",
    "zqJsx dead comment",
    "zqOwnLine dead comment",
    "zqString ask string,comment",
    "zqCode ask type,code",
  ]);
});
