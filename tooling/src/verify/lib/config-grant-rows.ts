// The shared ROW READER for the two config-liveness families: `biome-grant-liveness` (+ its `-health`
// sibling) and `tsconfig-entry-liveness` (+ its `-health` sibling). Each pair's two policies must classify
// the SAME rows the same way — the ordinary arm reports a dead row, the health arm judges whether the
// classifier derived any row at all — so a classifier living in either module would be one policy reading
// the other's private answer. It is `family: "grant-liveness"`'s per-config half; the arms IDENTICAL across
// all four registries (the exact/glob boundary, the dead-row verdict, the glob matcher) stay in
// `grant-liveness.ts`, which this module consumes rather than re-spells.
//
// PURE BY REQUIREMENT. A final policy receives no root and no filesystem (`contract/policy.ts`), so every
// input here arrives through a declared ResourceHost fact: the parsed `biome.json` through `json`, the
// tsconfig entries through the shared compiler reader over `authored-text`, and the existence oracle
// through `tracked-files`. Nothing in this module opens a file.
import { posix } from "node:path";
import type { CompilerConfigEntries } from "../contract/policy-scope.ts";
import type { ResourceHost } from "../contract/resource-host.ts";
import type { JsonValue } from "../contract/resource-json.ts";
import { isFileExact } from "./grant-liveness.ts";
import { compilerConfigRoster, readCompilerConfigEntries } from "./policy-program-membership.ts";
import { readyResourceValue } from "./resource-declaration.ts";

/** biome's include syntax treats a leading `!` as an EXCLUSION rather than a grant. */
const NEGATION_PREFIX = "!";
/** A `${configDir}`-style template token is not a literal path: TypeScript expands it per INHERITING
 *  config, so the entry denotes a different path in each extender and has no single member set to test. */
const TEMPLATE_RE = /\$\{/u;

/** ONE classified config row. `subject` is BOTH the grant subject and the finding token, and it is the
 *  entry AS AUTHORED — the same key the retired gate-local tables used, so a legacy exemption ports to a
 *  reviewed grant without re-keying. `rooted` is that entry resolved against its own config's directory,
 *  which is what the liveness verdict is actually taken against. */
export interface ConfigGrantRow {
  readonly subject: string;
  readonly rooted: string;
  /** The config file this occurrence is authored in — the finding anchors there. */
  readonly config: string;
  /** 1-based line within `config`, or 0 when the position could not be placed. */
  readonly line: number;
}

export interface ConfigGrantRows {
  /** Rows naming ONE tree node: a literal file or directory path. */
  readonly exact: readonly ConfigGrantRow[];
  /** Rows naming a CLASS of paths, judged by membership in the tracked corpus. */
  readonly globs: readonly ConfigGrantRow[];
  /** Rows whose member set is irreducible — a `${configDir}` template. Empty for biome, which has none. */
  readonly templates: readonly ConfigGrantRow[];
  /** Every row considered, including the ones classified away. The health arm's denominator. */
  readonly candidates: number;
}

/** Repo-relative resolution of an entry authored inside `config`'s directory. `tooling/tsconfig.json`'s
 *  `src` is `tooling/src`; `packages/client/tsconfig.json`'s `../../tests/client/**` is `tests/client/**`.
 *  Expanding against the repo root instead is the silent-wrong-answer trap BOTH ways — the naive
 *  concatenation leaves a `..` segment that matches nothing at all. */
function rootedEntry(config: string, entry: string): string {
  const directory = posix.dirname(config);
  return posix.normalize(directory === "." ? entry : posix.join(directory, entry));
}

/** The one classifier both halves of both families read, so the ordinary arm and its `-health` sibling
 *  cannot disagree about what a row IS. TEMPLATES ARE PARTITIONED OUT FIRST and the exact/glob boundary is
 *  applied only to what is left: `${…}` carries `{` and `}`, so that boundary would already call a template
 *  a glob and the irreducible intent would be invisible. */
function classify(rows: readonly ConfigGrantRow[]): Omit<ConfigGrantRows, "candidates"> {
  const templates = rows.filter((row) => TEMPLATE_RE.test(row.subject));
  const literal = rows.filter((row) => !TEMPLATE_RE.test(row.subject));
  return {
    exact: literal.filter((row) => isFileExact(row.subject)),
    globs: literal.filter((row) => !isFileExact(row.subject)),
    templates,
  };
}

/** Every discovered config's RAW entries, read through the shared compiler reader over the demand text
 *  door. The ROSTER is derived from the tracked inventory rather than walked, so a config authored anywhere
 *  is judged; a roster of ZERO is not a clean tree, it is a policy whose whole subject set is gone, and it
 *  THROWS rather than returning an empty verdict — the same refusal `resolveResourceDeclarations` gives a
 *  non-ready resource, in the one place this family can still reach a blind state. */
export function readTsconfigRoster(resources: Pick<ResourceHost, "authoredText">, repoPaths: readonly string[]): readonly CompilerConfigEntries[] {
  const roster = compilerConfigRoster(repoPaths);
  if (roster.length === 0) {
    throw new Error(
      "tsconfig roster is EMPTY: the tracked corpus admits no tsconfig*.json at all, so every entry-liveness verdict below would be vacuous and a clean result would be a lie",
    );
  }
  const corpus = readyResourceValue(resources.authoredText(roster));
  return corpus.files.map((file) => readCompilerConfigEntries(file.path, file.text));
}

/** The tsconfig family's rows, over the RAW unfolded `include`/`exclude` entries of every discovered config.
 *  An exact row's subject is its REPO-RELATIVE resolution (which is what "names nothing on the tree" means
 *  and what the reader must go fix); a glob row's subject is the entry as authored, because that is the
 *  spelling its grant licenses and the spelling the config carries. */
export function tsconfigGrantRows(configs: readonly CompilerConfigEntries[]): ConfigGrantRows {
  const rows: ConfigGrantRow[] = [];
  let candidates = 0;
  for (const config of configs) {
    if (config.status !== "read") {
      continue;
    }
    candidates += config.entries.length;
    for (const entry of config.entries) {
      const rooted = rootedEntry(config.config, entry.value);
      const exact = isFileExact(entry.value) && !TEMPLATE_RE.test(entry.value);
      rows.push({ subject: exact ? rooted : entry.value, rooted, config: config.config, line: entry.line });
    }
  }
  return { ...classify(rows), candidates };
}

export interface BiomeGrantRows extends ConfigGrantRows {
  /** Negated include entries — they EXCLUDE rather than grant, so their subject may legitimately be absent. */
  readonly negated: number;
}

function isRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `Array.isArray` narrows a `JsonValue` union to `unknown[]`, which loses every element type — so the
 *  predicate is spelled once here rather than cast at each call site. */
function isJsonArray(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function jsonArray(value: JsonValue | undefined): readonly JsonValue[] {
  return isJsonArray(value) ? value : [];
}

function memberOf(value: JsonValue, key: string): JsonValue | undefined {
  return isRecord(value) ? value[key] : undefined;
}

function overrideIncludes(value: JsonValue): readonly string[] {
  return jsonArray(memberOf(value, "overrides")).flatMap((override) =>
    jsonArray(memberOf(override, "includes")).filter((entry): entry is string => typeof entry === "string"),
  );
}

/** The biome family's rows: every POSITIVE `includes` entry of every override, which is the unit the config
 *  AUTHORS a suppression grant on. A biome include is already repo-rooted, so `rooted` equals `subject`. */
export function biomeGrantRows(config: JsonValue, lineOf: (entry: string) => number, configPath: string): BiomeGrantRows {
  const includes = overrideIncludes(config);
  const positive = includes.filter((entry) => !entry.startsWith(NEGATION_PREFIX));
  const rows = positive.map((entry) => ({ subject: entry, rooted: entry, config: configPath, line: lineOf(entry) }));
  return { ...classify(rows), candidates: includes.length, negated: includes.length - positive.length };
}

/** One reported occurrence of one grant SUBJECT, with every site it is authored at. */
export interface ConfigGrantCandidate {
  readonly subject: string;
  /** The config carrying the FIRST occurrence — where the finding anchors. */
  readonly config: string;
  readonly line: number;
  /** `<config>:<line>` for every occurrence, so a finding reported ONCE still points at all of them. */
  readonly sites: readonly string[];
}

/** Collapse rows to ONE candidate per subject. Required, not cosmetic: a reviewed grant is keyed on
 *  `(policyId, subject, operation)` and central reconciliation calls a row matching MORE THAN ONE finding
 *  OVER-BROAD, which then licenses NOTHING — so an entry authored in twelve configs must report once or its
 *  own permission is unrepresentable (`lib/reviewed-grant-findings.ts` states the rule for the node twin). */
export function groupGrantRows(rows: readonly ConfigGrantRow[]): readonly ConfigGrantCandidate[] {
  const grouped = new Map<string, ConfigGrantRow[]>();
  for (const row of rows) {
    grouped.set(row.subject, [...(grouped.get(row.subject) ?? []), row]);
  }
  return [...grouped.values()].flatMap((group) => {
    const [first] = group;
    return first === undefined ? [] : [{ subject: first.subject, config: first.config, line: first.line, sites: group.map(siteOf) }];
  });
}

function siteOf(row: ConfigGrantRow): string {
  return `${row.config}:${String(row.line)}`;
}

/** The path-existence oracle a policy has instead of `existsSync`: membership in the tracked corpus, with
 *  the DIRECTORY arm a config entry needs (`packages/db/src/schema` names a tree node whose members are the
 *  tracked paths beneath it). Tracked rather than on-disk is the same decision the glob half already made —
 *  an FS test answers differently depending on whether node_modules/dist/reports happen to exist. */
export function trackedPathOracle(repoPaths: readonly string[]): (path: string) => boolean {
  const exact = new Set(repoPaths);
  return (path) => exact.has(path) || repoPaths.some((member) => member.startsWith(`${path}/`));
}
