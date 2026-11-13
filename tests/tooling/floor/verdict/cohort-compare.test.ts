import { expect, test } from "@orb/testkit/tooling";
import type { Cohort, Member } from "../../../../tooling/src/floor/verdict/cohort-compare.ts";
import { compareCohort } from "../../../../tooling/src/floor/verdict/cohort-compare.ts";

const RULED = "packages/client/src/ruled.tsx";
const member = (path: string, value: string, line: number): Member => ({ path, section: "probe", label: "file", cells: { mode: { value, line } } });

test("a site ruling keeps only the first member holding its value; a second one, another value at the ruled path, and a defect value there are judged", () => {
  const cohort: Cohort = {
    name: "probe",
    what: "planted members",
    columns: ["mode"],
    defects: { mode: ["broken"] },
    keptSites: { mode: { [RULED]: { value: "special", reason: "the planted ruling" } } },
    members: [
      member("packages/client/src/a.tsx", "usual", 1),
      member("packages/client/src/b.tsx", "usual", 1),
      member("packages/client/src/c.tsx", "usual", 1),
      member(RULED, "special", 3),
      member(RULED, "other", 7),
      member(RULED, "broken", 9),
      member(RULED, "special", 11),
    ],
  };
  const [mode] = compareCohort(cohort);
  expect(mode?.kept).toEqual([{ value: "special", at: `${RULED}:3`, count: 1, reason: "the planted ruling" }]);
  expect(mode?.outliers.map((outlier) => [outlier.at, outlier.value])).toEqual([
    [`${RULED}:7`, "other"],
    [`${RULED}:9`, "broken"],
    [`${RULED}:11`, "special"],
  ]);
  expect(mode?.defects.map((defect) => defect.at)).toEqual([`${RULED}:9`]);
});
