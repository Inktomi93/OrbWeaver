// @subject packages/server/src/entry/auth/csrf-exemptions.ts
// Every CSRF exemption rests on a ruling, by construction: each `CSRF_EXEMPT_ROUTES` entry names the law or ledger
// file that rules it, and that file must hold one paragraph naming the route and stating it carries no CSRF check.
// A proof case alone never admits an entry.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CSRF_EXEMPT_ROUTES } from "@orb/server/entry/auth";
import { expect, test } from "@orb/testkit/tooling";

// The words the ruling paragraph states, beside the route it names.
const EXEMPTION_STATEMENT = "no CSRF check";
// A law file that rules no CSRF exemption, so the check below is shown to refuse a file that does not state one.
const UNRELATED_LAW = "docs/law/Spine-Testing.md";

/** Does a paragraph of `markdown` name `route` in code and state the exemption? Paragraphs split on blank lines. */
function statesExemption(markdown: string, route: string): boolean {
  return markdown.split(/\n\s*\n/u).some((paragraph) => paragraph.replaceAll(/\s+/gu, " ").includes(`\`${route}\``) && paragraph.includes(EXEMPTION_STATEMENT));
}

test("each CSRF-exempt route's cited ruling states its exemption", async ({ repoRoot }) => {
  const entries = Object.entries(CSRF_EXEMPT_ROUTES);
  expect(entries.length).toBeGreaterThan(0);
  for (const [key, { method, path, ruling }] of entries) {
    const route = `${method} ${path}`;
    expect(statesExemption(await readFile(join(repoRoot, ruling), "utf8"), route), `${key} cites ${ruling}`).toBe(true);
    expect(statesExemption(await readFile(join(repoRoot, UNRELATED_LAW), "utf8"), route), `${key} against ${UNRELATED_LAW}`).toBe(false);
  }
});
