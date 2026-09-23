// The frontmatter writer: a whole-block rewrite in canonical key order that never touches the body, a
// file with no block gaining one, and the heading readers the rules use.
import { renderFrontmatter, sectionsOf, splitDocument, titleOf, withFields } from "../../../../tooling/src/doc/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const SOURCE =
  "---\nupdated: 2026-09-01\nkind: adr\nstatus: active\n---\n\n# Title\n\nProse with `code`.\n\n## Context\n\n```md\n## not a heading\n```\n\n## Decision\n";

test("split keeps the body byte-exact and the block as fields", () => {
  const { fields, body } = splitDocument(SOURCE);
  expect(fields).toEqual({ updated: "2026-09-01", kind: "adr", status: "active" });
  expect(body).toBe("\n# Title\n\nProse with `code`.\n\n## Context\n\n```md\n## not a heading\n```\n\n## Decision\n");
  expect(splitDocument("# bare\n")).toEqual({ fields: null, body: "# bare\n" });
});

test("withFields patches, deletes and re-orders the block; the body is untouched", () => {
  const next = withFields(SOURCE, { status: "superseded", "superseded-by": "docs/adr/0170-x.md", updated: null });
  expect(next).toBe(
    "---\nkind: adr\nstatus: superseded\nsuperseded-by: docs/adr/0170-x.md\n---\n\n# Title\n\nProse with `code`.\n\n## Context\n\n```md\n## not a heading\n```\n\n## Decision\n",
  );
  expect(withFields("# bare\n", { kind: "law", status: "active" })).toBe("---\nkind: law\nstatus: active\n---\n\n# bare\n");
  expect(renderFrontmatter({ zeta: "1", kind: "x", alpha: "2" })).toBe("---\nkind: x\nalpha: 2\nzeta: 1\n---\n");
});

test("the title is the first H1 and the sections are the H2s outside fences", () => {
  const { body } = splitDocument(SOURCE);
  expect(titleOf(body)).toBe("Title");
  expect(sectionsOf(body)).toEqual(["Context", "Decision"]);
  expect(titleOf("no heading\n")).toBeNull();
});
