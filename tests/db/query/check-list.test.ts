// @subject packages/db/src/query/check-list.ts

import { USER_ROLES } from "@orb/contracts/identity";
import { expect, test } from "@orb/testkit/node";
import { checkList } from "#db/query/check-list.ts";

test("canonical enum members retain their SQL literal spelling", () => {
  expect(checkList(USER_ROLES)).toBe("'owner', 'admin', 'user'");
  expect(checkList(["hyphenated-value", "underscored_value", "UPPERCASE"])).toBe("'hyphenated-value', 'underscored_value', 'UPPERCASE'");
});

test("single quotes are doubled without rewriting backslashes or double quotes", () => {
  expect(checkList(["it's", "a'b'c", "path\\segment", 'say "hello"'])).toBe("'it''s', 'a''b''c', 'path\\segment', 'say \"hello\"'");
  expect(checkList(["''"])).toBe("''''''");
});

test("singleton and empty lists do not add separators", () => {
  expect(checkList(["only"])).toBe("'only'");
  expect(checkList([])).toBe("");
});
