// Living-document and named-ledger acquisition.
//
// THE MARKDOWN GRAMMAR THIS READER CLAIMS, AND THE ONE IT DOES NOT. It resolves ATX headings, inline
// `[text](target)` links and `[label]: target` reference definitions, and it is FENCE-AWARE: a `#` or a
// bracket pair inside a ``` or ~~~ block is sample text, not a heading or a cite, and treating it as one is
// how a documentation example becomes a dangling-reference finding. Setext headings, autolinks, bare URLs
// and HTML anchors are deliberately NOT claimed: no consumer cites through them, and a census that counted
// them would be larger than the thing it describes. Nothing here judges — a heading's presence is a fact,
// whether a cite RESOLVES is the consuming policy's ruling.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ResourceLoad, ResourceReader } from "../contract/resource.ts";
import type {
  DocumentFacts,
  DocumentIndex,
  DocumentRefusal,
  LedgerDefinition,
  LedgerFacts,
  LedgerId,
  MarkdownDocument,
  MarkdownHeading,
  MarkdownLink,
} from "../contract/resource-document.ts";
import { DOCUMENT_CATALOG_PATH, DOCUMENT_CORPUS_ROOT, LEDGER_DEFINITIONS } from "../contract/resource-document.ts";
import type { JsonValue } from "../contract/resource-json.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:structure");

const FENCE_RE = /^ {0,3}(?<marker>```+|~~~+)/u;
const HEADING_RE = /^ {0,3}(?<hashes>#{1,6})\s+(?<title>.*?)\s*#*\s*$/u;
const INLINE_LINK_RE = /\[(?<text>[^\]]*)\]\((?<target>[^()\s]+)(?:\s+"[^"]*")?\)/gu;
const REFERENCE_LINK_RE = /^ {0,3}\[(?<label>[^\]]+)\]:\s*(?<target>\S+)/u;
const ANCHOR_STRIP_RE = /[^a-z0-9 _-]/gu;

/** GitHub's heading slug: case-folded, punctuation dropped, spaces hyphenated. */
function markdownAnchor(title: string): string {
  return title.toLowerCase().replaceAll(ANCHOR_STRIP_RE, "").trim().replaceAll(/\s+/gu, "-");
}

function closesFence(line: string, marker: string): boolean {
  const fence = FENCE_RE.exec(line)?.groups?.["marker"];
  return (fence?.startsWith(marker[0] ?? "") ?? false) && (fence?.length ?? 0) >= marker.length;
}

function headingAt(line: string, lineNumber: number): MarkdownHeading | undefined {
  const groups = HEADING_RE.exec(line)?.groups;
  const hashes = groups?.["hashes"];
  const title = groups?.["title"];
  return hashes === undefined || title === undefined
    ? undefined
    : Object.freeze({ depth: hashes.length, text: title, anchor: markdownAnchor(title), line: lineNumber });
}

function linksAt(line: string, lineNumber: number): readonly MarkdownLink[] {
  const links: MarkdownLink[] = [];
  const reference = REFERENCE_LINK_RE.exec(line)?.groups;
  const label = reference?.["label"];
  const referenceTarget = reference?.["target"];
  if (label !== undefined && referenceTarget !== undefined) {
    links.push(Object.freeze({ target: referenceTarget, text: label, form: "reference-definition", line: lineNumber }));
  }
  for (const match of line.matchAll(INLINE_LINK_RE)) {
    const target = match.groups?.["target"];
    if (target !== undefined) {
      links.push(Object.freeze({ target, text: match.groups?.["text"] ?? "", form: "inline", line: lineNumber }));
    }
  }
  return links;
}

export function readMarkdownFacts(path: string, text: string): MarkdownDocument {
  const headings: MarkdownHeading[] = [];
  const links: MarkdownLink[] = [];
  let fence: string | undefined;
  for (const [index, line] of text.split("\n").entries()) {
    if (fence !== undefined) {
      fence = closesFence(line, fence) ? undefined : fence;
      continue;
    }
    const opened = FENCE_RE.exec(line)?.groups?.["marker"];
    if (opened !== undefined) {
      fence = opened;
      continue;
    }
    const heading = headingAt(line, index + 1);
    if (heading !== undefined) {
      headings.push(heading);
    }
    links.push(...linksAt(line, index + 1));
  }
  return Object.freeze({ path, text, headings: Object.freeze(headings), links: Object.freeze(links) });
}

function treeMembersWithSuffix(reader: ResourceReader, root: string, suffix: string): ResourceLoad<readonly string[]> {
  const tree = reader.tree(root);
  if (tree.status !== "ready") {
    return tree;
  }
  const paths = tree.value.filter((entry) => entry.kind === "file" && entry.path.endsWith(suffix)).map((entry) => entry.path);
  return { status: "ready", value: paths.toSorted((left, right) => left.localeCompare(right)), paths: tree.paths, members: paths.length };
}

/** Read one field out of parsed JSON without asserting a shape the catalog has not been checked to have.
 *  `Reflect.get` rather than an index because a `readonly JsonValue[]` does not narrow out of the union. */
function fieldOf(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

function catalogPaths(reader: ResourceReader): ResourceLoad<ReadonlySet<string>> {
  const loaded = reader.read(DOCUMENT_CATALOG_PATH);
  if (loaded.status !== "ready") {
    return { status: loaded.status, paths: loaded.paths, members: 0, reason: `the living-document catalog is unavailable: ${loaded.reason}` };
  }
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(loaded.value) as JsonValue;
  } catch (error) {
    return {
      status: "unresolved",
      paths: loaded.paths,
      members: 0,
      reason: `the living-document catalog did not parse as strict JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const rows = fieldOf(parsed, "documents");
  if (!Array.isArray(rows)) {
    return { status: "malformed", paths: loaded.paths, members: 0, reason: "the living-document catalog has no documents array" };
  }
  const listed = rows.map((row) => fieldOf(row, "path")).filter((path): path is string => typeof path === "string");
  return { status: "ready", value: new Set(listed), paths: loaded.paths, members: listed.length };
}

/** The corpus door. A member the reader refuses becomes a ROW; the CATALOG failing refuses the whole fact,
 *  because a catalog that did not load would make `unlisted` a lie about every document in the tree. */
export function loadDocumentIndex(reader: ResourceReader): ResourceLoad<DocumentIndex> {
  const corpus = treeMembersWithSuffix(reader, DOCUMENT_CORPUS_ROOT, ".md");
  if (corpus.status !== "ready") {
    return {
      status: corpus.status,
      paths: corpus.paths,
      members: 0,
      reason: `the living-document corpus ${DOCUMENT_CORPUS_ROOT} is unavailable: ${corpus.reason}`,
    };
  }
  const catalog = catalogPaths(reader);
  if (catalog.status !== "ready") {
    return catalog;
  }
  const documents: DocumentFacts[] = [];
  const refusals: DocumentRefusal[] = [];
  for (const path of corpus.value) {
    const text = reader.read(path);
    if (text.status === "ready") {
      documents.push(Object.freeze({ ...readMarkdownFacts(path, text.value), catalog: catalog.value.has(path) ? "listed" : "unlisted" }));
    } else {
      refusals.push(Object.freeze({ path, status: text.status, reason: text.reason }));
    }
  }
  const present = new Set(corpus.value);
  const catalogMisses = [...catalog.value].filter((path) => !present.has(path)).toSorted((left, right) => left.localeCompare(right));
  const value: DocumentIndex = {
    documents: Object.freeze(documents),
    refusals: Object.freeze(refusals),
    catalogMisses: Object.freeze(catalogMisses),
  };
  // `members` is the denominator WALKED — every corpus member, served or refused — never the ones that read.
  return { status: "ready", value, paths: [...corpus.value, DOCUMENT_CATALOG_PATH], members: documents.length + refusals.length };
}

function ledgerMarkdown(reader: ResourceReader, id: LedgerId, paths: readonly string[]): ResourceLoad<LedgerFacts> {
  const documents: MarkdownDocument[] = [];
  for (const path of paths) {
    const text = reader.read(path);
    // A NAMED registry member that is absent or unreadable REFUSES: every judgment built on a half-read
    // registry is inverted, not merely incomplete (`resource-gate-access-patterns.md` §5).
    if (text.status !== "ready") {
      return { status: text.status, paths, members: documents.length, reason: `ledger ${id} member ${path} is unavailable: ${text.reason}` };
    }
    documents.push(readMarkdownFacts(path, text.value));
  }
  return { status: "ready", value: { id, nature: "markdown", documents: Object.freeze(documents) }, paths, members: documents.length };
}

/** A tree ledger's members: the flat files under its root whose names match its grammar. An absent root
 *  refuses like an absent named file; a root with no member is a ready, EMPTY population, which the
 *  declaration resolver refuses as empty rather than reading as a clean zero. */
function treeLedgerMembers(reader: ResourceReader, tree: string, member: RegExp): ResourceLoad<readonly string[]> {
  const listed = treeMembersWithSuffix(reader, tree, ".md");
  if (listed.status !== "ready") {
    return listed;
  }
  const members = listed.value.filter((path) => member.test(path.slice(tree.length + 1)));
  return { status: "ready", value: members, paths: members, members: members.length };
}

export function loadLedger(reader: ResourceReader, id: LedgerId): ResourceLoad<LedgerFacts> {
  if (!Object.hasOwn(LEDGER_DEFINITIONS, id)) {
    return { status: "unresolved", paths: [], members: 0, reason: `unknown ledger id: ${String(id)}` };
  }
  const definition: LedgerDefinition = LEDGER_DEFINITIONS[id];
  if ("paths" in definition) {
    return ledgerMarkdown(reader, id, definition.paths);
  }
  const members = treeLedgerMembers(reader, definition.tree, definition.member);
  if (members.status !== "ready") {
    return { status: members.status, paths: members.paths, members: 0, reason: `ledger ${id} tree ${definition.tree} is unavailable: ${members.reason}` };
  }
  return ledgerMarkdown(reader, id, members.value);
}
