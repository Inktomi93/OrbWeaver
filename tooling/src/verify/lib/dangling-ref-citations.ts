import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ResourceTreeEntry } from "../contract/resource.ts";
import type { PathStatusIndex } from "../contract/resource-path.ts";

export type { PathStatusIndex } from "../contract/resource-path.ts";

export interface DanglingCitation {
  readonly file: string;
  readonly line: number;
  readonly ref: string;
}

export const CORE_ANCHOR = "docs/architecture/core/AGENTS.md";
const GATES_DIR_REL = "tooling/src/verify/gates";
/** THE WHOLE GRANT-TABLE FAMILY, NOT THE BARREL (#2397, 2026-09-18). This was
 *  `"tooling/src/verify/lib/reviewed-grants.ts"` matched with `endsWith`, which fenced exactly one file —
 *  and the table has been SPLIT into `reviewed-grants-<section>.ts` siblings that the barrel re-exports.
 *  Every sibling row spells its own `subject` as an UPPER_SNAKE STRING LITERAL, which the string-literal
 *  arm below credits as a declaration, so each of the 19 `dangling-symbol-cite` grants MANUFACTURED THE
 *  DECLARATION that made its own cited symbol resolve. The finding then never fired, the grant was never
 *  consumed, and central reconciliation alarmed all 19 as stale — a two-sided failure where the alarm was
 *  the only visible symptom and the real loss was 19 unjudged doc citations. Measured: deleting one grant
 *  row (`anth-direct-sampling`) made its finding appear at `Core-Path-Registry.md:192`, which is the
 *  control that the sites are live and the arm is otherwise working. A PREFIX over the family's directory
 *  is the fence that a future split cannot silently widen past. */
const REVIEWED_GRANTS_PREFIX = "tooling/src/verify/lib/reviewed-grants";
const GATE_TESTS_REL = "tests/tooling/verify/gates/";
const BACKTICK_TOKEN_RE = /`([^`\n]+)`/gu;
const STRIKETHROUGH_RE = /~~[^~\n]*~~/gu;
const RIDER_LINE_RE = /rider|truth[- ]audit|purged|\bdead\b(?![-\s]ends?\b)|\bdied\b|the (former|old) `|\bnot an? `|there is no `/iu;
const NON_LITERAL_TOKEN_RE = /[*{}<>]|\.\.\.|…/u;
const HEAD_RIDER_RE = /BUILD-STATE RIDER/u;
const HEAD_RIDER_SCAN_LINES = 20;
const PLACEHOLDER_SEGMENT_RE = /(^|\/)[A-Z](\/|$)/u;
const PATH_PREFIXES: readonly string[] = [
  "packages/",
  "docs/",
  "scripts/",
  "tests/",
  "tooling/",
  "domain/",
  "entry/",
  "infra/",
  "transport/",
  "foundation/",
  "kit/",
  "@orb/",
];
const TRIM_ANCHOR_RE = /#[^)\s]*$/u;
const TRIM_LINEREF_RE = /:\d+(?:-\d+)?(?:[,/]:?\d+(?:-\d+)?)*$/u;
const TRIM_PUNCT_RE = /[:.,;)]+$/u;
const TRIM_CROSSREF_RE = /::.*$/u;
const CODE_EXT_RE = /\.(ts|tsx)$/u;
const SYMBOL_CANDIDATE_RE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/u;

function trimPathToken(raw: string): string {
  const base = raw.trim().replace(TRIM_ANCHOR_RE, "").replace(TRIM_LINEREF_RE, "").replace(TRIM_PUNCT_RE, "");
  return base.replace(TRIM_CROSSREF_RE, "");
}

function pkgRoot(pkg: string): string {
  return pkg === "tooling" ? "tooling" : `packages/${pkg}`;
}

function shorthandTarget(ref: string): string | undefined {
  if (ref.startsWith("packages/") || ref.startsWith("docs/") || ref.startsWith("scripts/") || ref.startsWith("tests/") || ref.startsWith("tooling/")) {
    return ref;
  }
  if (ref.startsWith("domain/") || ref.startsWith("entry/") || ref.startsWith("infra/") || ref.startsWith("transport/") || ref.startsWith("foundation/")) {
    return `packages/server/src/${ref}`;
  }
  if (ref.startsWith("kit/")) {
    return `packages/kit/src/${ref.slice("kit/".length)}`;
  }
  // biome-ignore lint/complexity/noUselessReturn: tooling's TS config enables noImplicitReturns.
  return;
}

function pathCandidates(target: string): readonly string[] {
  return [target, `${target}.ts`, `${target}.tsx`, `${target}.md`, `${target}/index.ts`, `${target}/index.tsx`];
}

function pathExists(index: PathStatusIndex, target: string): boolean {
  return pathCandidates(target).some((candidate) => index.get(candidate) === "file" || index.get(candidate) === "directory");
}

function basenameIndex(entries: readonly ResourceTreeEntry[], pkg: string): ReadonlySet<string> {
  const out = new Set<string>();
  const root = `${pkgRoot(pkg)}/src/`;
  for (const entry of entries) {
    if (!entry.path.startsWith(root)) {
      continue;
    }
    const name = entry.path.slice(entry.path.lastIndexOf("/") + 1);
    if (entry.kind === "directory") {
      out.add(name);
    } else if (CODE_EXT_RE.test(name)) {
      out.add(name.replace(CODE_EXT_RE, ""));
    }
  }
  return out;
}

interface OrbModuleResolution {
  readonly index: PathStatusIndex;
  readonly entries: readonly ResourceTreeEntry[];
  readonly target: string;
  readonly pkg: string;
  readonly mod: string;
}

function orbPkgModExists({ index, entries, target, pkg, mod }: OrbModuleResolution): boolean {
  if (pathExists(index, target)) {
    return true;
  }
  const last = mod.split("/").pop();
  return last !== undefined && basenameIndex(entries, pkg).has(last);
}

export function shorthandExists(index: PathStatusIndex, entries: readonly ResourceTreeEntry[], ref: string): boolean {
  if (ref.startsWith("@orb/")) {
    const rest = ref.slice("@orb/".length);
    const slash = rest.indexOf("/");
    if (slash === -1) {
      return pathExists(index, pkgRoot(rest));
    }
    const pkg = rest.slice(0, slash);
    const mod = rest.slice(slash + 1);
    return orbPkgModExists({ index, entries, target: `${pkgRoot(pkg)}/src/${mod}`, pkg, mod });
  }
  if (ref.startsWith("kit/") && pathExists(index, `packages/server/src/${ref}`)) {
    return true;
  }
  const target = shorthandTarget(ref);
  return target !== undefined && pathExists(index, target);
}

export function shorthandCandidates(ref: string): readonly string[] {
  if (ref.startsWith("@orb/")) {
    const rest = ref.slice("@orb/".length);
    const slash = rest.indexOf("/");
    return slash === -1 ? pathCandidates(pkgRoot(rest)) : pathCandidates(`${pkgRoot(rest.slice(0, slash))}/src/${rest.slice(slash + 1)}`);
  }
  const target = shorthandTarget(ref);
  if (target === undefined) {
    return [];
  }
  return ref.startsWith("kit/") ? [...pathCandidates(target), ...pathCandidates(`packages/server/src/${ref}`)] : pathCandidates(target);
}

function maskStrikethrough(line: string): string {
  return line.replace(STRIKETHROUGH_RE, (matched) => " ".repeat(matched.length));
}

function hasHeadRider(lines: readonly string[]): boolean {
  return lines.slice(0, HEAD_RIDER_SCAN_LINES).some((line) => HEAD_RIDER_RE.test(line));
}

function pathToken(raw: string): string | undefined {
  const ref = trimPathToken(raw);
  return ref.length > 0 && !NON_LITERAL_TOKEN_RE.test(ref) && !PLACEHOLDER_SEGMENT_RE.test(ref) && PATH_PREFIXES.some((prefix) => ref.startsWith(prefix))
    ? ref
    : undefined;
}

export interface PathCitationScan {
  readonly cites: readonly DanglingCitation[];
  readonly referencedRefs: ReadonlySet<string>;
}

export function scanPathCitations(textByPath: ReadonlyMap<string, string>, docs: readonly string[]): PathCitationScan {
  const cites: DanglingCitation[] = [];
  const referencedRefs = new Set<string>();
  for (const rel of docs) {
    const lines = (textByPath.get(rel) ?? "").split("\n");
    if (hasHeadRider(lines)) {
      continue;
    }
    lines.forEach((rawLine, index) => {
      if (RIDER_LINE_RE.test(rawLine)) {
        return;
      }
      const line = maskStrikethrough(rawLine);
      for (const match of line.matchAll(BACKTICK_TOKEN_RE)) {
        const ref = match[1] === undefined ? undefined : pathToken(match[1]);
        if (ref !== undefined) {
          referencedRefs.add(ref);
          cites.push({ file: rel, line: index + 1, ref });
        }
      }
    });
  }
  return { cites, referencedRefs };
}

const NAME_BEARING_KINDS: readonly SyntaxKind[] = [
  SyntaxKind.VariableDeclaration,
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.ClassDeclaration,
  SyntaxKind.InterfaceDeclaration,
  SyntaxKind.TypeAliasDeclaration,
  SyntaxKind.EnumDeclaration,
  SyntaxKind.EnumMember,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.PropertySignature,
  SyntaxKind.GetAccessor,
  SyntaxKind.PropertyAssignment,
  SyntaxKind.ShorthandPropertyAssignment,
];
const PROPERTY_KEY_KINDS: readonly SyntaxKind[] = [SyntaxKind.PropertyAssignment, SyntaxKind.ShorthandPropertyAssignment];

export const DECLARATION_NAME_VISITOR_KINDS: readonly SyntaxKind[] = [...NAME_BEARING_KINDS, SyntaxKind.StringLiteral];

export function collectDeclarationName(names: Set<string>, node: MorphNode, sourceFile: SourceFile): void {
  const path = sourceFile.getFilePath().replaceAll("\\", "/");
  const inGateCorpus = path.includes(`/${GATES_DIR_REL}/`);
  // Authority rows and family fixtures repeat the exact subject they police. Crediting those string values
  // would let the grant or proof manufacture its own production declaration evidence. Identifier
  // declarations in those files still count.
  const inPolicyEvidence = inGateCorpus || path.includes(`/${REVIEWED_GRANTS_PREFIX}`) || path.includes(`/${GATE_TESTS_REL}`);
  if (Node.isStringLiteral(node)) {
    const value = node.getLiteralText();
    if (!inPolicyEvidence && SYMBOL_CANDIDATE_RE.test(value)) {
      names.add(value);
    }
    return;
  }
  if (inGateCorpus && PROPERTY_KEY_KINDS.includes(node.getKind())) {
    return;
  }
  const withName = node as unknown as { getName?: () => string | undefined };
  const name = typeof withName.getName === "function" ? withName.getName() : undefined;
  if (name !== undefined && name.length > 0) {
    names.add(name);
  }
}

export function scanSymbolCitations(
  textByPath: ReadonlyMap<string, string>,
  docs: readonly string[],
  declaredNames: ReadonlySet<string>,
): readonly DanglingCitation[] {
  const out: DanglingCitation[] = [];
  for (const rel of docs) {
    const lines = (textByPath.get(rel) ?? "").split("\n");
    if (hasHeadRider(lines)) {
      continue;
    }
    lines.forEach((rawLine, index) => {
      if (RIDER_LINE_RE.test(rawLine)) {
        return;
      }
      const line = maskStrikethrough(rawLine);
      for (const match of line.matchAll(BACKTICK_TOKEN_RE)) {
        const ref = match[1]?.trim();
        if (ref !== undefined && SYMBOL_CANDIDATE_RE.test(ref) && !declaredNames.has(ref)) {
          out.push({ file: rel, line: index + 1, ref });
        }
      }
    });
  }
  return out;
}
