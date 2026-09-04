// db/kit/check-list — the CHECK-constraint DDL fragment builder. A CHECK is static DDL and cannot carry
// bound parameters, so a tuple's members are rendered into raw SQL literals here, once, for ~45 call sites
// across the schema files. The values are compile-time TS tuples (contracts/db enums), never user input —
// so this is a DDL-CORRECTNESS floor, not an injection surface — but an unescaped quote in a future member
// silently produces broken DDL at migration time, which is the one moment nothing is watching (#1377 #2).

import { checkList } from "@orb/db/kit";
import { expect, test } from "../../support/fixtures.ts";

test("renders a tuple as a comma-separated quoted literal list", () => {
  expect(checkList(["user", "admin", "owner"])).toBe("'user', 'admin', 'owner'");
  expect(checkList(["only"])).toBe("'only'");
  expect(checkList([])).toBe("");
});

test("BYTE-IDENTICAL for every shape today's tuples actually take (the no-regression pin)", () => {
  // Every live member is ASCII with hyphens/underscores — nothing the escape touches, so the emitted DDL
  // is unchanged by the escaping landing. This is the check the row's hazard note asked for.
  const live = ["foreign-key", "not_null", "two-stage", "chara_card_v3", "AI_OUTPUT"];
  expect(checkList(live)).toBe("'foreign-key', 'not_null', 'two-stage', 'chara_card_v3', 'AI_OUTPUT'");
});

test("a single quote is DOUBLED — the SQL string-literal escape, not a broken statement", () => {
  // Pre-fix this produced `'it's'`, which terminates the literal early and makes the whole CREATE TABLE
  // unparseable — at migration time, in generated DDL nobody reads.
  expect(checkList(["it's"])).toBe("'it''s'");
  expect(checkList(["a", "b'c", "d"])).toBe("'a', 'b''c', 'd'");
  expect(checkList(["''"])).toBe("''''''");
});

test("no other character is transformed — the escape is the SQL rule and nothing more", () => {
  // A backslash is NOT an escape character in a SQLite string literal; doubling it would corrupt a member
  // that legitimately contains one. Only the quote is special.
  expect(checkList(["a\\b"])).toBe("'a\\b'");
  expect(checkList(['e"f'])).toBe(`'e"f'`);
});
