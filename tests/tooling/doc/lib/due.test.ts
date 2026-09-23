// The soft freshness tier as a pure rule: the described paths come from the body's backticked repository
// paths, a directory cite matches below it, and only a change after the review date makes a doc due.
import { changesFromLog, describedDoc, dueDocs, earliestUpdated } from "../../../../tooling/src/doc/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const DOC = {
  path: "docs/law/X.md",
  source:
    "---\nkind: law\nstatus: active\nupdated: 2026-09-10\n---\n\n# X\n\nReads `tooling/src/doc/` and `packages/kit/src/a.ts:12`, twice `packages/kit/src/a.ts`.\n",
};

test("a doc describes the distinct repository paths its body cites, coordinates stripped", () => {
  expect(describedDoc(DOC)).toEqual({ path: DOC.path, updated: "2026-09-10", describes: ["tooling/src/doc", "packages/kit/src/a.ts"] });
  expect(describedDoc({ path: "x.md", source: "# no block\n" })).toBeNull();
});

test("a change after the review date under a cited path makes the doc due; a change on or before it does not", () => {
  const described = describedDoc(DOC) as NonNullable<ReturnType<typeof describedDoc>>;
  const after = new Map([
    ["tooling/src/doc/lib/rules.ts", "2026-09-12"],
    ["packages/kit/src/b.ts", "2026-09-12"],
  ]);
  expect(dueDocs([described], after)).toEqual([
    { path: DOC.path, updated: "2026-09-10", changed: [{ path: "tooling/src/doc/lib/rules.ts", date: "2026-09-12" }] },
  ]);
  const before = new Map([["packages/kit/src/a.ts", "2026-09-10"]]);
  expect(dueDocs([described], before)).toEqual([]);
});

test("the git log pass folds to the latest date per path, and the earliest review date is the --since floor", () => {
  const log = "2026-09-12\n\ntooling/src/doc/lib/rules.ts\npackages/kit/src/a.ts\n\n2026-09-14\n\npackages/kit/src/a.ts\n";
  expect([...changesFromLog(log)]).toEqual([
    ["tooling/src/doc/lib/rules.ts", "2026-09-12"],
    ["packages/kit/src/a.ts", "2026-09-14"],
  ]);
  expect(
    earliestUpdated([
      { path: "a", updated: "2026-09-10", describes: [] },
      { path: "b", updated: "2026-08-01", describes: [] },
    ]),
  ).toBe("2026-08-01");
  expect(earliestUpdated([])).toBeNull();
});
