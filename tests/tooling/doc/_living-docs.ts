// The living-document corpora the citation suites judge, derived from each document's own frontmatter and place.
// Law is every `docs/law` doc plus the mission doc, kept when its frontmatter says active law or reference; every
// decision is admitted by directory; a plan's design doc is a program's living design. Dated reviews are out by class.
import { DOC_TOOL_TREES } from "../../../tooling/src/doc/contract/vocab.ts";
import { parseFrontmatter } from "../../../tooling/src/doc/lib/frontmatter.ts";
import type { RepoTree } from "./_tree.ts";
import { isMarkdown, underAny } from "./_tree.ts";

const LIVING_STATUS = "active";
const LIVING_LAW_KINDS: ReadonlySet<string> = new Set(["law", "reference"]);
const DESIGN_FILE = "design.md";
const MISSION_PATH = "docs/Mission.md";
const DOCS_DIR = "docs/";
/** The doc every derived corpus is anchored on: a tree holding it is the real one, not a stub. */
export const CORE_ANCHOR = "docs/law/Constitution.md";
/** Law that lives outside `docs/`, where no directory walk finds it. A named member that stops resolving is reported. */
export const LAW_OUTSIDE_DOCS: readonly string[] = ["tooling/src/verify/gates/GATE-AUTHORING.md", "tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md"];

export interface LivingCorpora {
  /** Docs whose markdown links must resolve. */
  readonly links: readonly string[];
  /** Docs whose backticked repository paths must resolve. */
  readonly audit: readonly string[];
  /** Docs whose backticked UPPER_SNAKE symbols must be declared. */
  readonly symbols: readonly string[];
  readonly law: number;
  readonly design: number;
  readonly lawOutsideDocs: number;
  readonly lawOutsideDocsMissing: readonly string[];
  readonly docPaths: readonly string[];
}

function sortedUnique(paths: readonly string[]): readonly string[] {
  return [...new Set(paths)].toSorted((left, right) => left.localeCompare(right));
}

function isLivingLaw(text: string): boolean {
  const fields = parseFrontmatter(text).fields;
  return fields["status"] === LIVING_STATUS && LIVING_LAW_KINDS.has(fields["kind"] ?? "");
}

export function livingCorpora(tree: RepoTree): LivingCorpora {
  const docPaths = tree.paths.filter((path) => isMarkdown(path) && path.startsWith(DOCS_DIR));
  const present = new Set(tree.paths);
  const outside = LAW_OUTSIDE_DOCS.filter((path) => present.has(path));
  const lawCandidates = [...docPaths.filter((path) => path.startsWith(DOC_TOOL_TREES.law)), ...(docPaths.includes(MISSION_PATH) ? [MISSION_PATH] : [])];
  const law = lawCandidates.filter((path) => isLivingLaw(tree.read(path)));
  const design = docPaths.filter((path) => path.startsWith(DOC_TOOL_TREES.plans) && path.endsWith(`/${DESIGN_FILE}`));
  const symbols = sortedUnique([...docPaths.filter((path) => underAny(path, [DOC_TOOL_TREES.law, DOC_TOOL_TREES.adr])), ...law, ...outside]);
  const audit = sortedUnique([...symbols, ...design]);
  const links = sortedUnique([...docPaths.filter((path) => path.startsWith(DOC_TOOL_TREES.law)), ...audit]);
  return {
    links,
    audit,
    symbols,
    law: law.length,
    design: design.length,
    lawOutsideDocs: outside.length,
    lawOutsideDocsMissing: LAW_OUTSIDE_DOCS.filter((path) => !outside.includes(path)),
    docPaths,
  };
}
