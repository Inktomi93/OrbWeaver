import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { PRODUCT_STYLESHEETS } from "../contract/css-family.ts";
import type { ResourceLoad, ResourceReader, ResourceTreeEntry } from "../contract/resource.ts";
import type { AuthoredCssFile, AuthoredTreeId } from "../contract/resource-tree.ts";
import { AUTHORED_TREE_PATHS } from "../contract/resource-tree.ts";
import { blankCssComments, commentSpansInText } from "../lib/comment-spans.ts";
import { parseCssStylesheet } from "../lib/css-rules.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:structure");

function unavailable<T>(status: "missing" | "empty" | "unresolved" | "malformed", reason: string, paths: readonly string[], members = 0): ResourceLoad<T> {
  return { status, reason, paths, members };
}

export function loadAuthoredTree(reader: ResourceReader, id: AuthoredTreeId): ResourceLoad<readonly ResourceTreeEntry[]> {
  return reader.tree(AUTHORED_TREE_PATHS[id]);
}

/**
 * The shared CSS rule parser intentionally reads style rules and descends through at-rules; it does not
 * implement the full CSS Syntax grammar. Reject constructs its scanner cannot preserve faithfully instead
 * of returning a partial rule set: unbalanced blocks/comments/quotes and block or statement delimiters in
 * quoted values. Escaped quote characters are also refused because the rule parser's selector scanner does
 * not distinguish an escaped quote from the end of the quoted run.
 */
function commentProblem(text: string): string | undefined {
  const last = commentSpansInText(text, { lineComments: false }).at(-1);
  return last?.text.startsWith("/*") === true && !last.text.endsWith("*/") ? "unterminated comment" : undefined;
}

const QUOTED_VALUE = /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/gu;
const PARSER_DELIMITER = /[{};]/u;
const ESCAPED_QUOTE = /\\["']/u;

function quoteProblem(text: string): string | undefined {
  const blanked = blankCssComments(text);
  const unsupported = [...blanked.matchAll(QUOTED_VALUE)].map((match) => match[0]).find((value) => PARSER_DELIMITER.test(value) || ESCAPED_QUOTE.test(value));
  if (unsupported !== undefined) {
    return "a quoted delimiter or escaped quote is outside the shared CSS parser's supported grammar";
  }
  return blanked.replace(QUOTED_VALUE, "").includes('"') || blanked.replace(QUOTED_VALUE, "").includes("'") ? "unterminated quoted value" : undefined;
}

function blockProblem(text: string): string | undefined {
  let braces = 0;
  for (const ch of blankCssComments(text)) {
    if (ch === "{") {
      braces += 1;
    } else if (ch === "}") {
      braces -= 1;
      if (braces < 0) {
        return "unmatched closing brace";
      }
    }
  }
  return braces === 0 ? undefined : "unclosed rule block";
}

function unsupportedCss(text: string): string | undefined {
  return commentProblem(text) ?? quoteProblem(text) ?? blockProblem(text);
}

function loadCssFiles(reader: ResourceReader, paths: readonly string[]): ResourceLoad<readonly AuthoredCssFile[]> {
  if (paths.length === 0) {
    return unavailable("empty", "authored CSS inventory has no stylesheets", [], 0);
  }
  const files: AuthoredCssFile[] = [];
  for (const path of paths) {
    const loaded = reader.read(path);
    if (loaded.status !== "ready") {
      return unavailable(loaded.status, loaded.reason, paths, files.length);
    }
    const unsupported = unsupportedCss(loaded.value);
    if (unsupported !== undefined) {
      return unavailable("malformed", `unsupported or malformed CSS in ${path}: ${unsupported}`, paths, files.length);
    }
    const parsed = parseCssStylesheet(loaded.value);
    files.push(Object.freeze({ path, text: loaded.value, rules: parsed.rules, atRules: parsed.atRules, statements: parsed.statements }));
  }
  return { status: "ready", value: Object.freeze(files), paths, members: files.length };
}

/** Load every authored CSS file from the shared client/ui source-tree inventories. */
export function loadAuthoredCss(reader: ResourceReader): ResourceLoad<readonly AuthoredCssFile[]> {
  const trees = [
    [AUTHORED_TREE_PATHS["client-source"], loadAuthoredTree(reader, "client-source")],
    [AUTHORED_TREE_PATHS["ui-source"], loadAuthoredTree(reader, "ui-source")],
  ] as const;
  for (const [path, tree] of trees) {
    if (tree.status !== "ready") {
      return unavailable(
        tree.status,
        `${path} CSS inventory: ${tree.reason}`,
        trees.map(([treePath]) => treePath),
        0,
      );
    }
  }
  const paths = [
    ...new Set(
      trees
        .flatMap(([_path, tree]) => (tree.status === "ready" ? tree.value : []))
        .filter((entry) => entry.kind === "file" && entry.path.endsWith(".css"))
        .map((entry) => entry.path),
    ),
  ].toSorted((left, right) => left.localeCompare(right));
  return loadCssFiles(reader, paths);
}

/** Load the exact five-home product CSS identity, independent of ambient tree membership. */
export function loadProductCss(reader: ResourceReader): ResourceLoad<readonly AuthoredCssFile[]> {
  return loadCssFiles(reader, PRODUCT_STYLESHEETS);
}
