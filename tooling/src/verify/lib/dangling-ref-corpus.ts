import { DOC_TOOL_TREES, parseFrontmatter } from "#doc";
import type { DocumentIndex } from "../contract/resource-document.ts";
import type { AuthoredTextCorpus } from "../contract/resource-text.ts";

const LIVING_STATUS = "active";
/** The kinds `docs/law/*.md` and `docs/Mission.md` carry when they are standing law. */
const LIVING_LAW_KINDS: ReadonlySet<string> = new Set(["law", "reference"]);
const LINK_SCAN_DIRS: readonly string[] = [DOC_TOOL_TREES.law];
/** Live program designs: each plan's `design.md`. A finished plan is deleted, so every one present is living. */
const PLANS_DIR = DOC_TOOL_TREES.plans;
const PLAN_DESIGN_FILE = "design.md";
/** The D-ledger (`docs/adr/`) is law and admitted by directory, unconditional on frontmatter. */
const AUDIT_SCAN_DIRS: readonly string[] = [DOC_TOOL_TREES.law, DOC_TOOL_TREES.adr];
const MISSION_PATH = "docs/Mission.md";

export const LAW_OUTSIDE_DOCS: readonly string[] = ["tooling/src/verify/gates/GATE-AUTHORING.md", "tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md"];

/** A path guaranteed to exist so a resource door demanded of ZERO selectors has one to read instead of
 *  refusing outright — its identity is never inspected, only its presence. */
export const ANCHOR_PATH = "docs/Mission.md";

export interface DanglingRefCorpora {
  readonly links: readonly string[];
  readonly audit: readonly string[];
  readonly symbols: readonly string[];
  readonly law: number;
  readonly design: number;
  readonly lawOutsideDocs: number;
  readonly lawOutsideDocsMissing: readonly string[];
}

function inDirectories(paths: readonly string[], dirs: readonly string[]): readonly string[] {
  return paths.filter((path) => dirs.some((dir) => path.startsWith(dir)));
}

/** A doc is living law when its own frontmatter says so — no separate census to go stale against the tree. */
function isLivingLaw(text: string): boolean {
  const fields = parseFrontmatter(text).fields;
  return fields["status"] === LIVING_STATUS && LIVING_LAW_KINDS.has(fields["kind"] ?? "");
}

export function danglingRefCorpora(documents: readonly { readonly path: string; readonly text: string }[], outside: readonly string[]): DanglingRefCorpora {
  const docPaths = documents.map((document) => document.path);
  const textOf = new Map(documents.map((document) => [document.path, document.text] as const));
  const lawCandidates = [...inDirectories(docPaths, [DOC_TOOL_TREES.law]), ...(docPaths.includes(MISSION_PATH) ? [MISSION_PATH] : [])];
  const law = lawCandidates.filter((path) => isLivingLaw(textOf.get(path) ?? ""));
  const design = inDirectories(docPaths, [PLANS_DIR]).filter((path) => path.endsWith(`/${PLAN_DESIGN_FILE}`));
  const symbols = [...new Set([...inDirectories(docPaths, AUDIT_SCAN_DIRS), ...law, ...outside])].toSorted();
  const audit = [...new Set([...symbols, ...design])].toSorted();
  const links = [...new Set([...inDirectories(docPaths, LINK_SCAN_DIRS), ...audit])].toSorted();
  return {
    links,
    audit,
    symbols,
    law: law.length,
    design: design.length,
    lawOutsideDocs: outside.length,
    lawOutsideDocsMissing: LAW_OUTSIDE_DOCS.filter((path) => !outside.includes(path)),
  };
}

export function danglingRefTextIndex(documents: DocumentIndex, outside: AuthoredTextCorpus): ReadonlyMap<string, string> {
  for (const refusal of documents.refusals) {
    if (refusal.status !== "empty") {
      throw new Error(`document ${refusal.path} was refused (${refusal.status}): ${refusal.reason}`);
    }
  }
  for (const refusal of outside.refusals) {
    if (refusal.status !== "empty" && refusal.status !== "missing") {
      throw new Error(`law document ${refusal.path} was refused (${refusal.status}): ${refusal.reason}`);
    }
  }
  return new Map([
    ...documents.documents.map((document) => [document.path, document.text] as const),
    ...outside.files.map((file) => [file.path, file.text] as const),
  ]);
}
