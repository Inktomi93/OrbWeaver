// A law or rule file that names an enforcing rule names one that runs. Without this check a doc keeps citing a gate
// that was renamed or never built, and a reader trusts a check that does not exist.
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint } from "eslint";
import dependencyCruiser from "../../.dependency-cruiser.ts";
import stylelintConfig from "../../stylelint.config.ts";

const ROOT = join(import.meta.dirname, "../..");
const LAW_FILES = [...globSync("docs/law/**/*.md", { cwd: ROOT }), ...globSync(".claude/rules/**/*.md", { cwd: ROOT })].toSorted();
const CLIENT_PROBE = "packages/client/src/features/app-shell/probe.tsx";

// A rule name a doc cites, with `*` for a family (`orb/principal-*`) and `<x>` for a templated segment.
const NAME = String.raw`[a-z0-9<>*]+(?:-[a-z0-9<>*]+)*`;
// An `orb/` rule id: not the `@orb/` package scope, and not the tail of a longer path or word.
const ORB_RULE = new RegExp(String.raw`(?<![\w@/.-])orb\/${NAME}`, "gu");
const DEPENDENCY_CRUISER = /dep(?:endency)?-cruiser/giu;
// The names a clause lists after the tool: `dep-cruiser \`a\` and \`b\``. A clause ends at `;`, `)`, `·` or a sentence stop.
const CLAUSE_END = /[;)·]|\.(?:\s|$)/u;
const TICK = "\u0060";
// Every dependency-cruiser rule name has a hyphen, which keeps a bare word such as `tsconfig` out.
const KEBAB_TOKEN = new RegExp(`${TICK}(${NAME}-${NAME})${TICK}`, "gu");
// The same names when the rule is named first: `\`a\` dep-cruiser rule`, `\`a\` rule in \`.dependency-cruiser.ts\``.
const NAMED_FIRST = /`([a-z0-9<>*-]+-[a-z0-9<>*-]+)` (?:dep(?:endency)?-cruiser rule|rule in `\.dependency-cruiser\.ts`)/giu;

interface Citation {
  readonly file: string;
  readonly line: number;
  readonly name: string;
}

function lines(): { file: string; line: number; text: string }[] {
  return LAW_FILES.flatMap((file) =>
    readFileSync(join(ROOT, file), "utf8")
      .split("\n")
      .map((text, index) => ({ file, line: index + 1, text })),
  );
}

function orbCitations(): Citation[] {
  return lines().flatMap(({ file, line, text }) => [...text.matchAll(ORB_RULE)].map((match) => ({ file, line, name: match[0] })));
}

function cruiserCitations(): Citation[] {
  return lines().flatMap(({ file, line, text }) => {
    const named = [...text.matchAll(NAMED_FIRST)].map((match) => match[1] ?? "");
    const listed = [...text.matchAll(DEPENDENCY_CRUISER)].flatMap((tool) => {
      const rest = text.slice(tool.index + tool[0].length);
      const clause = rest.slice(0, CLAUSE_END.exec(rest)?.index ?? rest.length);
      return [...clause.matchAll(KEBAB_TOKEN)].map((match) => match[1] ?? "");
    });
    return [...new Set([...named, ...listed])].map((name) => ({ file, line, name }));
  });
}

/** A cited name matches an existing rule exactly, or as a family or template. */
function exists(name: string, rules: readonly string[]): boolean {
  const pattern = new RegExp(
    `^${name
      .replaceAll(/[.+?^${}()|[\]\\]/gu, String.raw`\$&`)
      .replaceAll("*", "[a-z0-9-]*")
      .replaceAll(/<[^>]+>/gu, "[a-z0-9-]+")}$`,
    "u",
  );
  return rules.some((rule) => pattern.test(rule));
}

function missing(citations: readonly Citation[], rules: readonly string[]): string[] {
  return citations.filter(({ name }) => !exists(name, rules)).map(({ file, line, name }) => `${file}:${line} ${name}`);
}

test("every orb/ rule a law or rule file cites is an ESLint or Stylelint rule that runs", { timeout: 120_000 }, async () => {
  const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });
  const config = await eslint.calculateConfigForFile(join(ROOT, CLIENT_PROBE));
  const eslintRules = Object.keys(config?.plugins?.["orb"]?.rules ?? {}).map((id) => `orb/${id}`);
  const plugins: readonly unknown[] = [stylelintConfig.plugins].flat();
  const stylelintRules = plugins.flatMap((plugin) =>
    typeof plugin === "object" && plugin !== null && "ruleName" in plugin && typeof plugin.ruleName === "string" ? [plugin.ruleName] : [],
  );
  const rules = [...eslintRules, ...stylelintRules];
  // A plugin that loads no rules would pass every citation as missing; fail on that first.
  expect(eslintRules.length).toBeGreaterThan(0);
  expect(stylelintRules.length).toBeGreaterThan(0);
  expect(missing(orbCitations(), rules)).toEqual([]);
});

test("every dependency-cruiser rule a law or rule file cites is a forbidden rule in .dependency-cruiser.ts", () => {
  const rules = dependencyCruiser.forbidden.flatMap(({ name }) => (name === undefined ? [] : [name]));
  expect(rules.length).toBeGreaterThan(0);
  expect(missing(cruiserCitations(), rules)).toEqual([]);
});
