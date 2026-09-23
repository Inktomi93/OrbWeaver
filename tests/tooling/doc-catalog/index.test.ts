// The frontmatter/authority/ratchet RULES — the pure half of the legacy inventory, driven through the
// tool's front door with hand-built rows (no git, no tree). The hash-bound attestation rules this file
// used to pin are gone with the attestation.
import { debtPathErrors, frontmatterErrors, migrationDebt, parseFrontmatter, validateReceiptEntry } from "../../../tooling/src/doc-catalog/index.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

test("frontmatter parser keeps the deliberately flat schema machine-readable", () => {
  expect(parseFrontmatter("---\nkind: law\nstatus: active\nupdated: 2026-08-14\n---\n# Law\n")).toEqual({
    present: true,
    malformed: false,
    fields: { kind: "law", status: "active", updated: "2026-08-14" },
    errors: [],
  });
});

test("frontmatter parser rejects an unterminated or nested header instead of guessing", () => {
  expect(parseFrontmatter("---\nkind: law\n# Law\n").malformed).toBe(true);
  expect(parseFrontmatter("---\nmetadata:\n  owner: nate\n---\n").malformed).toBe(true);
});

test("the legacy schema demands the three keys, a known kind and status, and no foreign key", () => {
  const path = "docs/design/x.md";
  expect(frontmatterErrors(path, parseFrontmatter("---\nkind: law\nstatus: active\nupdated: 2026-08-14\n---\n", path))).toEqual([]);
  expect(frontmatterErrors(path, parseFrontmatter("---\nkind: bug\nstatus: doing\nlane: cb-x\n---\n", path))).toEqual([
    `${path}: missing frontmatter key updated`,
    `${path}: unsupported frontmatter key lane`,
    `${path}: invalid frontmatter kind bug`,
    `${path}: invalid frontmatter status doing`,
  ]);
});

test("a row is one path and one authority from the closed set", () => {
  expect(validateReceiptEntry({ path: "docs/example.md", authority: "normative" })).toEqual([]);
  expect(validateReceiptEntry({ path: "docs/example.md", authority: "verified" })).toEqual(["docs/example.md: invalid authority verified"]);
});

test("frontmatter debt is derived per category", () => {
  const debt = migrationDebt([
    { path: "docs/a.md", frontmatter: { present: false, malformed: false, fields: {}, errors: [] } },
    { path: "docs/c.md", frontmatter: { present: true, malformed: false, fields: {}, errors: ["docs/c.md: missing frontmatter key kind"] } },
    { path: "docs/d.md", frontmatter: { present: true, malformed: true, fields: {}, errors: ["docs/d.md: no fence"] } },
  ]);
  expect(debt).toEqual({ missingFrontmatter: ["docs/a.md"], invalidFrontmatter: ["docs/c.md", "docs/d.md"], malformedFrontmatter: ["docs/d.md"] });
});

test("the debt ratchet rejects substitution even when the total count stays flat", () => {
  const oldDebt = { missingFrontmatter: ["docs/old.md"], invalidFrontmatter: [], malformedFrontmatter: [] };
  const substituted = { missingFrontmatter: ["docs/new.md"], invalidFrontmatter: [], malformedFrontmatter: [] };
  expect(debtPathErrors(oldDebt, oldDebt)).toEqual([]);
  expect(debtPathErrors(substituted, oldDebt)).toEqual([
    "missingFrontmatter: new debt path docs/new.md is not in the ratchet allowance",
    "missingFrontmatter: stale debt path docs/old.md remains in the ratchet allowance",
  ]);
});

test("the debt ratchet rejects stale allowances in every debt category, and a count-only state is refused", () => {
  const current = { missingFrontmatter: [], invalidFrontmatter: [], malformedFrontmatter: [] };
  const stale = { missingFrontmatter: ["docs/missing.md"], invalidFrontmatter: ["docs/invalid.md"], malformedFrontmatter: ["docs/malformed.md"] };
  expect(debtPathErrors(current, stale)).toEqual([
    "missingFrontmatter: stale debt path docs/missing.md remains in the ratchet allowance",
    "invalidFrontmatter: stale debt path docs/invalid.md remains in the ratchet allowance",
    "malformedFrontmatter: stale debt path docs/malformed.md remains in the ratchet allowance",
  ]);
  expect(debtPathErrors(current, undefined)).toEqual(["docs/catalog/state.json: legacy count-only state must be upgraded with pnpm doc-catalog:ratchet"]);
});
