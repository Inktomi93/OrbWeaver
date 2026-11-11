// A law or rule file that names an enforcing rule names one that runs, and so does a code comment's `policy` cite.
// Without this check a doc keeps citing a gate that was renamed or never built, and a reader trusts a check that does
// not exist.
import { globSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint } from "eslint";
import dependencyCruiser from "../../.dependency-cruiser.ts";
import eslintConfig from "../../eslint.config.ts";
import stylelintConfig from "../../stylelint.config.ts";
import { resolvedConfig } from "./_eslint-config.ts";
import type { Source } from "./doc/_sources.ts";
import { readFromRepo, SCRIPT_KINDS, scriptComments, trackedFiles, VENDORED } from "./doc/_sources.ts";

const ROOT = join(import.meta.dirname, "../..");
const LAW_FILES = [...globSync("docs/law/**/*.md", { cwd: ROOT }), ...globSync(".claude/rules/**/*.md", { cwd: ROOT })].toSorted();
const CLIENT_PROBE = "packages/client/src/features/app-shell/probe.tsx";

// A rule name a doc cites, with `*` for a family (`orb/principal-*`) and `<x>` for a templated segment.
const NAME = "[a-z0-9<>*]+(?:-[a-z0-9<>*]+)*";
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
      .replaceAll(/(?<!<)<[^>]+>/gu, "[a-z0-9-]+")}$`,
    "u",
  );
  return rules.some((rule) => pattern.test(rule));
}

function missing(citations: readonly Citation[], rules: readonly string[]): string[] {
  return citations.filter(({ name }) => !exists(name, rules)).map(({ file, line, name }) => `${file}:${line} ${name}`);
}

/** A rule setting that is not `off`: a severity alone or `[severity, ...options]`. */
function isOn(setting: unknown): boolean {
  const level = Array.isArray(setting) ? setting[0] : setting;
  return level !== "off" && level !== 0 && level !== null && level !== false && level !== undefined;
}

const enabledEslintRules = (): Set<string> =>
  new Set(eslintConfig.flatMap((block) => Object.entries(block.rules ?? {}).flatMap(([id, setting]) => (isOn(setting) ? [id] : []))));

const enabledStylelintRules = (): Set<string> => {
  const blocks = [stylelintConfig, ...(stylelintConfig.overrides ?? [])];
  return new Set(blocks.flatMap((block) => Object.entries(block.rules ?? {}).flatMap(([id, setting]) => (isOn(setting) ? [id] : []))));
};

/** The rule names the stylelint config's own plugins register. */
const stylelintPluginRules = (): string[] =>
  [stylelintConfig.plugins]
    .flat()
    .flatMap((plugin: unknown) =>
      typeof plugin === "object" && plugin !== null && "ruleName" in plugin && typeof plugin.ruleName === "string" ? [plugin.ruleName] : [],
    );

test("every orb/ rule a law or rule file cites is registered and enabled in a config block", { timeout: 120_000 }, async () => {
  const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });
  const config = await resolvedConfig(eslint, join(ROOT, CLIENT_PROBE));
  const registered = Object.keys(config.plugins["orb"]?.rules ?? {}).map((id) => `orb/${id}`);
  const stylelintRegistered = stylelintPluginRules();
  // A plugin that loads no rules would pass every citation as missing; fail on that first.
  expect(registered.length).toBeGreaterThan(0);
  expect(stylelintRegistered.length).toBeGreaterThan(0);
  // A rule that is registered but set in no block checks nothing.
  const enabled = [...enabledEslintRules(), ...enabledStylelintRules()];
  const live = [...registered, ...stylelintRegistered].filter((rule) => enabled.includes(rule));
  expect(missing(orbCitations(), live)).toEqual([]);
});

test("every dependency-cruiser rule a law or rule file cites is a forbidden rule in .dependency-cruiser.ts", () => {
  const rules = dependencyCruiser.forbidden.flatMap(({ name, severity }) => (name === undefined || severity === "ignore" ? [] : [name]));
  expect(rules.length).toBeGreaterThan(0);
  expect(missing(cruiserCitations(), rules)).toEqual([]);
});

const POLICY_ROOTS = ["tooling/src/", "packages/", "tests/"] as const;
const POLICY_CITE = /policy `([\w@/-]+)`/gu;
const POLICY_HINT = "policy `";

/** Every dependency-cruiser rule name and every ESLint rule id the loaded configs set or their plugins register. */
function lintRuleNames(): ReadonlySet<string> {
  const cruiser = dependencyCruiser.forbidden.flatMap(({ name }) => (name === undefined ? [] : [name]));
  const eslint = eslintConfig.flatMap((block) => [
    ...Object.keys(block.rules ?? {}),
    ...Object.entries(block.plugins ?? {}).flatMap(([prefix, plugin]: [string, ESLint.Plugin]) =>
      Object.keys(plugin.rules ?? {}).map((rule) => `${prefix}/${rule}`),
    ),
  ]);
  return new Set([...cruiser, ...eslint]);
}

function deadPolicyNames(sources: readonly Source[], rules: ReadonlySet<string>): string[] {
  return sources.flatMap((source) => {
    const kind = SCRIPT_KINDS[extname(source.path)];
    return (kind === undefined ? [] : scriptComments(source, kind)).flatMap(({ line, text }) =>
      [...text.matchAll(POLICY_CITE)].flatMap(([, name = ""]) => (rules.has(name) ? [] : [`${source.path}:${String(line)} policy ${name}`])),
    );
  });
}

test("every policy a code comment cites is a dependency-cruiser rule or an ESLint rule id", () => {
  const rules = lintRuleNames();
  expect([...rules]).toEqual(expect.arrayContaining(["tooling-cli-via-index", "orb/closed-vocabulary"]));
  const sources = [...trackedFiles().paths]
    .filter((path) => SCRIPT_KINDS[extname(path)] !== undefined && !path.startsWith(VENDORED) && POLICY_ROOTS.some((root) => path.startsWith(root)))
    .map((path) => ({ path, text: readFromRepo(path) }))
    .filter(({ text }) => text.includes(POLICY_HINT));
  expect(deadPolicyNames(sources, rules)).toStrictEqual([]);
});

test("a policy cite names a loaded rule or is refused", () => {
  const source: Source = { path: "tooling/src/a.ts", text: "// policy `tooling-cli-via-index` holds; policy `tooling-ghost` does not\nexport {};\n" };
  expect(deadPolicyNames([source], new Set(["tooling-cli-via-index"]))).toStrictEqual(["tooling/src/a.ts:1 policy tooling-ghost"]);
});

const GATE_ROOTS = [...POLICY_ROOTS, "scripts/"] as const;
// A check named as the enforcer: "`x` gate", "gate `x`" or "enforced by `x`". A rule name carries a hyphen, which keeps
// a door such as `#data` or a procedure such as `stream.connect` out.
const GATE_NAME = String.raw`\x60(?:orb\/)?([a-z0-9]+(?:-[a-z0-9]+)+)\x60`;
const GATE_CITE = new RegExp(
  String.raw`${GATE_NAME} (?:gate|door|ratchet)\b|\bgate ${GATE_NAME}|\b(?:enforced|pinned|held|checked) by (?:the )?${GATE_NAME}`,
  "gu",
);
const GATE_HINT = /\bgate\b|\bdoor\b|\bratchet\b|\b(?:enforced|pinned|held|checked) by\b/u;

/** Every name a gate cite may resolve to: a loaded lint or dependency rule, an ESLint rule id without its plugin prefix, or a test file's stem. */
function enforcerNames(paths: ReadonlySet<string>): ReadonlySet<string> {
  const rules = [...lintRuleNames(), ...enabledStylelintRules(), ...stylelintPluginRules()];
  const stems = [...paths].filter((path) => path.startsWith("tests/")).map((path) => basename(path).split(".")[0] ?? "");
  return new Set([...rules, ...rules.map((rule) => rule.slice(rule.lastIndexOf("/") + 1)), ...stems]);
}

function deadGateCites(spans: readonly Citation[], live: ReadonlySet<string>): string[] {
  return spans.flatMap(({ file, line, name: text }) =>
    [...text.matchAll(GATE_CITE)].flatMap((match) => {
      const name = match[1] ?? match[2] ?? match[3] ?? "";
      return live.has(name) ? [] : [`${file}:${String(line)} ${name}`];
    }),
  );
}

/** The comment lines of a script and the lines of a law file, in the shape `deadGateCites` reads. */
function gateSpans(sources: readonly Source[]): Citation[] {
  return sources.flatMap((source) => {
    const kind = SCRIPT_KINDS[extname(source.path)];
    const spans = kind === undefined ? source.text.split("\n").map((text, index) => ({ line: index + 1, text })) : scriptComments(source, kind);
    return spans.flatMap(({ line, text }) => text.split("\n").map((part, offset) => ({ file: source.path, line: line + offset, name: part })));
  });
}

test("every gate a code comment or law file names as an enforcer is a loaded rule or a tracked test", { timeout: 120_000 }, () => {
  const { paths } = trackedFiles();
  const live = enforcerNames(paths);
  // An unread config or tree would pass every cite; the set holds a rule of each tool and a test stem.
  expect([...live]).toEqual(expect.arrayContaining(["no-inline-union-alias", "package-subpath-crossing", "orb/rest-transform-grid", "law-rule-citations"]));
  const sources = [...paths]
    .filter(
      (path) =>
        (LAW_FILES.includes(path) || (SCRIPT_KINDS[extname(path)] !== undefined && GATE_ROOTS.some((root) => path.startsWith(root)))) &&
        !path.startsWith(VENDORED),
    )
    .map((path) => ({ path, text: readFromRepo(path) }))
    .filter(({ text }) => GATE_HINT.test(text));
  expect(deadGateCites(gateSpans(sources), live)).toStrictEqual([]);
});

test("a gate cite names a loaded rule or a test file, or is refused", () => {
  const sources: Source[] = [
    {
      path: "packages/x/src/a.ts",
      text: '// the `ghost-gate` gate reds it; gate `orb/closed-vocabulary` holds; enforced by `law-rule-citations`\n// the `#data` door and the `stream.connect` door are not rules\nexport const s = "gate `string-ghost`";\n',
    },
    { path: "docs/law/Law.md", text: "Pinned by `tooling-cli-via-index`.\nThe `retired-check` ratchet keeps it.\n" },
  ];
  const live = new Set(["closed-vocabulary", "tooling-cli-via-index", "law-rule-citations"]);
  expect(deadGateCites(gateSpans(sources), live)).toStrictEqual(["packages/x/src/a.ts:1 ghost-gate", "docs/law/Law.md:2 retired-check"]);
});
