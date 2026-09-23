// The ADR a migrated ruling becomes. The ruling's text lands under `## Decision` verbatim — the tool
// moves structure and never rewrites prose — and the three other required sections carry one honest
// sentence each, so the migration lane sees exactly what it still owes (writing rule 1 on the body, and
// the ledger-entry style's ban on provenance trails).
import type { Ruling } from "../contract/types.ts";
import { renderFrontmatter } from "./frontmatter-write.ts";

const NOT_RECORDED = "Not recorded in the ledger row.";

export function adrTemplateFromRuling(ruling: Ruling, today: string): string {
  const block = renderFrontmatter({ kind: "adr", status: "active", updated: today });
  const body = ruling.body === "" ? NOT_RECORDED : ruling.body;
  return [
    block,
    `# ${ruling.title}`,
    "",
    "## Context",
    "",
    NOT_RECORDED,
    "",
    "## Decision",
    "",
    body,
    "",
    "## Consequences",
    "",
    NOT_RECORDED,
    "",
    "## Alternatives rejected",
    "",
    NOT_RECORDED,
    "",
  ].join("\n");
}
