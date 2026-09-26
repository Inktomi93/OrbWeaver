// The tenancy registry's ownerId-scoped rows and the ownerid-registry classifications must name one table set:
// one policy rules whether a stamp is legal, the other what it means for a read, so a table in only one of them
// is a stamp the two policies disagree about.

import { OWNERID_CLASSIFICATIONS } from "../../../../tooling/src/verify/gates/ownerid-registry.ts";
import { TABLE_SCOPING_ROWS } from "../../../../tooling/src/verify/lib/tenancy-scope-rows.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("the ownerId-scoped tenancy rows are exactly the ownerid-registry classifications", () => {
  const scoped = TABLE_SCOPING_ROWS.filter((row) => row.scope === "ownerId").map((row) => row.table);
  expect(scoped.toSorted()).toEqual(Object.keys(OWNERID_CLASSIFICATIONS).toSorted());
});
