// Moves a class token off a JSX attribute's string literal and onto a named prop, at the exact sites a plan lists:
// `<Row className="justify-end x">` → `<Row className="x" justify="end">`. A site moves only when the element's own import
// proves it is the planned component, so an aliased import moves and a local or unimported name of the same text stays.
// Every site ends moved or skipped with a reason; skips go to `codemod:runtime`, `codemod:metrics` and a sidecar the census proof reads.

import type { Codemod, Edit, GetSelector, RuleConfig, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { useMetricAtom } from "codemod:metrics";
import { failStep, warn } from "codemod:runtime";
import { importBindingOf } from "@jssg/utils/javascript/bindings";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const DEFAULT_MAP_FILE = "codemod-class-prop-map.json";

/** One class token on one element, as `tooling/src/ui-facts/migration.ts` plans it. */
interface Site {
  /** The file, relative to the target directory. */
  readonly path: string;
  /** The line, from 1, of the string literal that holds the token. */
  readonly line: number;
  /** The module specifier and exported name the element must be imported as. */
  readonly source: string;
  readonly name: string;
  /** The attribute whose string literals carry the token. */
  readonly attribute: string;
  /** The exact class token to remove. */
  readonly token: string;
  /** The prop to add, and its value: a string, or a JSX expression in braces (`{true}`). */
  readonly prop: string;
  readonly value: string;
}

/** Why a site stays: a code, then the detail. The code is the metric label the run prints. */
interface Skip {
  readonly path: string;
  readonly line: number;
  readonly token: string;
  readonly reason: string;
}

const CODE_SEPARATOR = ": ";

const JSX_ATTRIBUTE: RuleConfig<TSX> = { rule: { kind: "jsx_attribute" } };
const STRING: RuleConfig<TSX> = { rule: { kind: "string" } };
const SITE_KEYS = ["path", "source", "name", "attribute", "token", "prop", "value"] as const;
const CLASS_JOINERS: ReadonlySet<string> = new Set(["cn", "cx", "clsx"]);
const TRANSPARENT_PARENTS: ReadonlySet<string> = new Set(["jsx_expression", "parenthesized_expression", "arguments"]);
const LOOKUP_PARENTS: ReadonlySet<string> = new Set(["subscript_expression", "member_expression", "object", "pair"]);
const CONDITIONAL_REFUSAL: Refusal = { code: "conditional", detail: "the class sits under a condition the prop would lose" };

const moved = useMetricAtom("class-token-to-prop.moved");
const skipped = useMetricAtom("class-token-to-prop.skipped");

export const getSelector: GetSelector<TSX> = () => JSX_ATTRIBUTE;

function readSites(targetDir: string, mapFile: string): readonly Site[] {
  const parsed: unknown = JSON.parse(readFileSync(join(targetDir, mapFile), "utf8"));
  if (parsed === null || typeof parsed !== "object" || !Array.isArray((parsed as { sites?: unknown }).sites)) {
    throw new Error(`${mapFile}: expected { sites: [...] }`);
  }
  return (parsed as { sites: unknown[] }).sites.map((entry) => {
    if (entry === null || typeof entry !== "object") {
      throw new Error(`${mapFile}: a site must be an object`);
    }
    const site = entry as Record<string, unknown>;
    for (const key of SITE_KEYS) {
      if (typeof site[key] !== "string") {
        throw new Error(`${mapFile}: site.${key} must be a string`);
      }
    }
    if (typeof site["line"] !== "number") {
      throw new Error(`${mapFile}: site.line must be a number`);
    }
    return site as unknown as Site;
  });
}

/** The skip folder sits beside the map, named by the rule `sidecarsOf` in `tooling/src/ui-facts/migration.ts` writes. */
const skipFolder = (mapFile: string): string => `${mapFile.replace(/\.json$/u, "")}.skips`;

const startLine = (node: SgNode<TSX>): number => node.range().start.line + 1;

const tokensOf = (literal: SgNode<TSX>): readonly string[] =>
  literal
    .text()
    .slice(1, -1)
    .split(/\s+/u)
    .filter((token) => token !== "");

/** The sites whose token this literal holds, on the line the literal starts. */
const sitesAt = (literal: SgNode<TSX>, sites: readonly Site[]): readonly Site[] =>
  sites.filter((site) => site.line === startLine(literal) && tokensOf(literal).includes(site.token));

interface LiteralRewrite {
  /** The replacement edit, or none when the bare attribute value emptied and the attribute goes instead. */
  readonly edit: Edit | undefined;
  readonly removesAttribute: boolean;
  readonly hit: readonly Site[];
}

/** Rewrite one string literal: drop the planned tokens and report which sites they belonged to. */
function rewriteLiteral(literal: SgNode<TSX>, sites: readonly Site[], isBareValue: boolean): LiteralRewrite {
  const quote = literal.text().slice(0, 1);
  const hit = sitesAt(literal, sites);
  if (hit.length === 0) {
    return { edit: undefined, removesAttribute: false, hit };
  }
  const text = tokensOf(literal)
    .filter((token) => !hit.some((site) => site.token === token))
    .join(" ");
  if (text === "" && isBareValue) {
    return { edit: undefined, removesAttribute: true, hit };
  }
  return { edit: literal.replace(text === "" ? "undefined" : `${quote}${text}${quote}`), removesAttribute: false, hit };
}

/** The prop each hit site adds; `undefined` when two hits want different values for one prop, a judgment site. */
function propsToAdd(hits: readonly Site[]): ReadonlyMap<string, string> | undefined {
  const props = new Map<string, string>();
  for (const site of hits) {
    const current = props.get(site.prop);
    if (current !== undefined && current !== site.value) {
      return undefined;
    }
    props.set(site.prop, site.value);
  }
  return props;
}

/** The attribute names the element already carries, so an added prop never duplicates one. */
function siblingAttributeNames(attribute: SgNode<TSX>): ReadonlySet<string> {
  const siblings = attribute.parent()?.children() ?? [];
  return new Set(siblings.filter((child) => child.kind() === "jsx_attribute").map((child) => child.child(0)?.text() ?? ""));
}

// A plan value wrapped in braces is a JSX expression (`{true}` for a boolean prop); any other value is a string.
function propValueText(value: string): string {
  return value.startsWith("{") && value.endsWith("}") ? value : `"${value}"`;
}

function carriesPlannedToken(node: SgNode<TSX>, sites: readonly Site[]): boolean {
  const literals = node.kind() === "string" ? [node] : node.findAll(STRING);
  return literals.some((literal) => tokensOf(literal).some((token) => sites.some((site) => site.token === token)));
}

const isClassJoin = (call: SgNode<TSX>): boolean => CLASS_JOINERS.has(call.field("function")?.text() ?? "");

/**
 * Why a literal's place stops it moving, or null. The walk admits only the paths where the string is written unconditionally into the
 * class list: a JSX expression, parentheses, an argument of a class joiner, and a ternary whose arms both carry a planned token.
 * Anything else, a lookup, a helper or a shape not named here, could hand the string to something the prop would not reach.
 */
function placeRefusal(literal: SgNode<TSX>, attribute: SgNode<TSX>, sites: readonly Site[]): Refusal | null {
  for (let node = literal.parent(); node !== null && node.id() !== attribute.id(); node = node.parent()) {
    const refusal = stepRefusal(node, sites);
    if (refusal !== null) {
      return refusal;
    }
  }
  return null;
}

function stepRefusal(node: SgNode<TSX>, sites: readonly Site[]): Refusal | null {
  const kind = node.kind();
  if (kind === "binary_expression") {
    return CONDITIONAL_REFUSAL;
  }
  if (kind === "ternary_expression") {
    return [node.field("consequence"), node.field("alternative")].every((arm) => arm !== null && carriesPlannedToken(arm, sites)) ? null : CONDITIONAL_REFUSAL;
  }
  if (kind === "call_expression") {
    return isClassJoin(node) ? null : { code: "helper", detail: `${node.field("function")?.text() ?? "a call"} decides what the string becomes` };
  }
  if (LOOKUP_PARENTS.has(kind)) {
    return { code: "lookup", detail: "the string is one value of a lookup, so the prop would apply it in every state" };
  }
  return TRANSPARENT_PARENTS.has(kind) ? null : { code: "shape", detail: `the string sits under ${kind}` };
}

/** A `{...x}` on the element can carry a `className` or the prop, and which one wins depends on where it sits. */
const carriesSpread = (attribute: SgNode<TSX>): boolean => (attribute.parent()?.children() ?? []).some((child) => child.kind() === "jsx_expression");

/** The detail of why an element is not the planned component, or null when its import proves it is. */
function unproven(attribute: SgNode<TSX>, site: Site): string | null {
  const tag = attribute.parent()?.field("name");
  if (tag === null || tag === undefined || tag.kind() !== "identifier") {
    return "the element name is not a plain identifier";
  }
  const binding = importBindingOf(tag);
  if (binding === null) {
    return `${tag.text()} is not an import`;
  }
  return binding.source === site.source && binding.importedName === site.name ? null : `${tag.text()} is ${binding.importedName} from ${binding.source}`;
}

interface Outcome {
  readonly edits: readonly Edit[];
  readonly moved: readonly Site[];
  readonly skips: readonly Skip[];
}

const skip = (site: Site, code: string, detail: string): Skip => ({
  path: site.path,
  line: site.line,
  token: site.token,
  reason: `${code}${CODE_SEPARATOR}${detail}`,
});

interface Refusal {
  readonly code: string;
  readonly detail: string;
}

interface AttributeRewrite {
  readonly attribute: SgNode<TSX>;
  readonly literals: readonly SgNode<TSX>[];
  readonly rewrites: readonly LiteralRewrite[];
  readonly proven: readonly Site[];
}

/** Rewrite one attribute's literals and append its props. Sites it cannot prove or cannot move safely come back as skips. */
function rewriteAttribute(attribute: SgNode<TSX>, claimed: readonly Site[]): Outcome {
  const proven = claimed.filter((site) => unproven(attribute, site) === null);
  const skips = claimed.flatMap((site) => {
    const detail = unproven(attribute, site);
    return detail === null ? [] : [skip(site, "unproven", detail)];
  });
  const value = attribute.child(2);
  const literals = attribute.findAll(STRING);
  const rewrites = literals.map((literal) => rewriteLiteral(literal, proven, value !== null && literal.id() === value.id()));
  const hit = [...new Set(rewrites.flatMap((rewrite) => rewrite.hit))];
  const refusal = refuse({ attribute, literals, rewrites, proven }, hit);
  if (refusal !== null) {
    return { edits: [], moved: [], skips: [...skips, ...hit.map((site) => skip(site, refusal.code, refusal.detail))] };
  }
  const props = propsToAdd(hit);
  if (props === undefined || props.size === 0) {
    return { edits: [], moved: [], skips };
  }
  const removesAttribute = rewrites.some((rewrite) => rewrite.removesAttribute);
  const added = [...props].map(([prop, propValue]) => `${prop}=${propValueText(propValue)}`).join(" ");
  const range = attribute.range();
  const start = removesAttribute ? range.start.index : range.end.index;
  return {
    edits: [
      ...rewrites.flatMap((rewrite) => (rewrite.edit === undefined ? [] : [rewrite.edit])),
      { startPos: start, endPos: range.end.index, insertedText: removesAttribute ? added : ` ${added}` },
    ],
    moved: hit,
    skips,
  };
}

/** Why the hit sites of one attribute stay: a conflict between their props, the place of a literal, a spread, or a prop the element has. */
function refuse({ attribute, literals, rewrites, proven }: AttributeRewrite, hit: readonly Site[]): Refusal | null {
  const props = propsToAdd(hit);
  if (props === undefined) {
    return { code: "conflict", detail: "two planned tokens want different values for one prop" };
  }
  const placed = literals.flatMap((literal, index) => {
    const refusal = (rewrites[index]?.hit.length ?? 0) > 0 ? placeRefusal(literal, attribute, proven) : null;
    return refusal === null ? [] : [refusal];
  });
  if (placed[0] !== undefined) {
    return placed[0];
  }
  if (carriesSpread(attribute)) {
    return { code: "spread", detail: "a spread on the element can carry className or the prop" };
  }
  const existing = siblingAttributeNames(attribute);
  const present = [...props.keys()].find((prop) => existing.has(prop));
  return present === undefined ? null : { code: "prop-present", detail: `the element already carries ${present}` };
}

function recordSkips(targetDir: string, mapFile: string, file: string, skips: readonly Skip[]): void {
  for (const each of skips) {
    skipped.increment({ reason: each.reason.split(CODE_SEPARATOR)[0] });
    warn(`skipped ${each.path}:${each.line} ${each.token}: ${each.reason}`, { path: each.path, line: each.line, token: each.token, reason: each.reason });
  }
  if (skips.length > 0) {
    const folder = join(targetDir, skipFolder(mapFile));
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, `${file.replaceAll("/", "__")}.json`), `${JSON.stringify(skips, null, 2)}\n`);
  }
}

const codemod: Codemod<TSX> = (root, options) => {
  const mapFile = options.params["map"] ?? DEFAULT_MAP_FILE;
  const file = root.relativeFilename();
  const sites = readSites(options.targetDir, mapFile).filter((site) => site.path === file);
  if (sites.length === 0) {
    return Promise.resolve(null);
  }
  const rootNode = root.root();
  const attributes = options.matches ?? rootNode.findAll(JSX_ATTRIBUTE);
  const outcomes: Outcome[] = [];
  const found = new Set<Site>();
  for (const attribute of attributes) {
    const name = attribute.child(0)?.text();
    const literals = attribute.findAll(STRING);
    const claimed = sites.filter((site) => site.attribute === name && literals.some((literal) => sitesAt(literal, [site]).length > 0));
    for (const site of claimed) {
      found.add(site);
    }
    if (claimed.length > 0) {
      outcomes.push(rewriteAttribute(attribute, claimed));
    }
  }
  const lost = sites.filter((site) => !found.has(site));
  if (lost.length > 0) {
    failStep(`the plan and the tree disagree in ${file}: no ${lost.map((site) => `${site.token} at line ${site.line}`).join(", ")}`, { file });
  }
  const edits = outcomes.flatMap((outcome) => outcome.edits);
  for (const site of outcomes.flatMap((outcome) => outcome.moved)) {
    moved.increment({ prop: site.prop });
  }
  recordSkips(
    options.targetDir,
    mapFile,
    file,
    outcomes.flatMap((outcome) => outcome.skips),
  );
  return Promise.resolve(edits.length === 0 ? null : rootNode.commitEdits([...edits]));
};

export default codemod;
