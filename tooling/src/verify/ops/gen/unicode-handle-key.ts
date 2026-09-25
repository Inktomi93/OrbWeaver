// Vendors the case folding, default-ignorable, UTS 39 confusable and script-code tables handle keys read, pinned to the
// engine's Unicode version (the key mixes them with the engine's NFKC/NFD), each source's SHA-256 pinned. A bump
// re-keys every `users.handle_key` row in the same change. No `--check` arm: freshness would need the network.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { emitLine, warn } from "@orb/tooling/_shared/log";

export const UNICODE_HANDLE_KEY_BASELINE = "unicode-handle-key";
const REGEN = `pnpm exec node tooling/src/verify/cli.ts baseline ${UNICODE_HANDLE_KEY_BASELINE}`;

refuseDirectInvocation(import.meta.url, REGEN);

const UNICODE_HANDLE_KEY_DATA_REL = "packages/kit/src/handle-key/unicode-data.ts";
const UNICODE_DATA_VERSION = "17.0.0";
const PUBLIC = `https://www.unicode.org/Public/${UNICODE_DATA_VERSION}`;
const UNICODE_SOURCES = {
  caseFolding: `${PUBLIC}/ucd/CaseFolding.txt`,
  derivedCore: `${PUBLIC}/ucd/DerivedCoreProperties.txt`,
  confusables: `${PUBLIC}/security/confusables.txt`,
  aliases: `${PUBLIC}/ucd/PropertyValueAliases.txt`,
} as const;

type UnicodeSources = { readonly [K in keyof typeof UNICODE_SOURCES]: string };

/** The SHA-256 of each pinned source file. A download that differs is refused before anything is written, so
 *  the vendored tables change only with a deliberate bump of this table and `UNICODE_DATA_VERSION`. */
export const UNICODE_SOURCE_PINS: UnicodeSources = {
  caseFolding: "ff8d8fefbf123574205085d6714c36149eb946d717a0c585c27f0f4ef58c4183",
  derivedCore: "24c7fed1195c482faaefd5c1e7eb821c5ee1fb6de07ecdbaa64b56a99da22c08",
  confusables: "091c7f82fc39ef208faf8f94d29c244de99254675e09de163160c810d13ef22a",
  aliases: "64e9a5f76f7a1e8b5a47d6a1f9a26522a251208f5276bdfa1559dac7cf2e827a",
};

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

/** Pure: the sources whose SHA-256 differs from its pin, by name. Empty means every source is the pinned one. */
export function sourcesMismatchingPins(sources: UnicodeSources, pins: UnicodeSources): readonly string[] {
  return (Object.keys(pins) as (keyof UnicodeSources)[]).filter((name) => sha256(sources[name]) !== pins[name]);
}

const CASE_FOLDING_KEPT_STATUSES: ReadonlySet<string> = new Set(["C", "F"]);
const DEFAULT_IGNORABLE = "Default_Ignorable_Code_Point";
const SCRIPT_PROPERTY = "sc";
// `Hrkt` (Katakana_Or_Hiragana) is a Script value no code point carries, and `\p{scx=Hrkt}` does not compile.
const UNCARRIED_SCRIPTS: ReadonlySet<string> = new Set(["Hrkt"]);
const ENTRIES_PER_LINE = 64;
const HEX_RADIX = 16;

// The data lines of a UCD file: comments and blanks gone, fields split on `;` and trimmed.
function fields(text: string): readonly (readonly string[])[] {
  return text
    .split("\n")
    .map((line) => (line.split("#")[0] ?? "").trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(";").map((field) => field.trim()));
}

// A space-separated code point sequence, re-spelled in the one hex form the kit parser reads.
function sequence(field: string): string {
  return field
    .split(/\s+/u)
    .map((hex) => Number.parseInt(hex, HEX_RADIX).toString(HEX_RADIX))
    .join(" ");
}

// Pure: the three tables as `source>target` / `first-last` entries, each checked against the pinned version a
// file announces, so a stale or mismatched download refuses instead of writing.
function parseUnicodeTables(sources: UnicodeSources): {
  readonly caseFolding: readonly string[];
  readonly defaultIgnorable: readonly string[];
  readonly confusables: readonly string[];
  readonly scripts: readonly string[];
} {
  const versions = [
    [UNICODE_SOURCES.caseFolding, sources.caseFolding, `CaseFolding-${UNICODE_DATA_VERSION}.txt`],
    [UNICODE_SOURCES.derivedCore, sources.derivedCore, `DerivedCoreProperties-${UNICODE_DATA_VERSION}.txt`],
    [UNICODE_SOURCES.confusables, sources.confusables, `Version: ${UNICODE_DATA_VERSION}`],
    [UNICODE_SOURCES.aliases, sources.aliases, `PropertyValueAliases-${UNICODE_DATA_VERSION}.txt`],
  ] as const;
  for (const [url, text, marker] of versions) {
    if (!text.includes(marker)) {
      throw new Error(`${url} does not announce ${marker}; refusing to vendor a table from another Unicode version`);
    }
  }
  const caseFolding = fields(sources.caseFolding)
    .filter(([, status]) => CASE_FOLDING_KEPT_STATUSES.has(status ?? ""))
    .map(([code, , mapping]) => `${sequence(code ?? "")}>${sequence(mapping ?? "")}`);
  const defaultIgnorable = fields(sources.derivedCore)
    .filter(([, property]) => property === DEFAULT_IGNORABLE)
    .map(([range]) => (range ?? "").split("..").map(sequence).join("-"));
  const confusables = fields(sources.confusables).map(([source, target]) => `${sequence(source ?? "")}>${sequence(target ?? "")}`);
  const scripts = fields(sources.aliases)
    .filter(([property, code]) => property === SCRIPT_PROPERTY && !UNCARRIED_SCRIPTS.has(code ?? ""))
    .map(([, code]) => code ?? "");
  for (const [name, table] of [
    ["case folding", caseFolding],
    ["default ignorable", defaultIgnorable],
    ["confusables", confusables],
    ["script", scripts],
  ] as const) {
    if (table.length === 0) {
      throw new Error(`the ${name} table parsed empty; refusing to write a key that folds nothing`);
    }
  }
  return { caseFolding, defaultIgnorable, confusables, scripts };
}

// One exported array of `;`-joined entry lines, so the file stays diffable and inside the formatter's width.
function constant(name: string, doc: string, entries: readonly string[]): string {
  const lines: string[] = [];
  for (let at = 0; at < entries.length; at += ENTRIES_PER_LINE) {
    lines.push(`  ${JSON.stringify(entries.slice(at, at + ENTRIES_PER_LINE).join(";"))},`);
  }
  return `/** ${doc} */\nexport const ${name}: readonly string[] = [\n${lines.join("\n")}\n];\n`;
}

/** Pure: the whole generated module for the parsed tables and the raw sources they came from. */
export function renderUnicodeHandleKeyData(sources: UnicodeSources): string {
  const tables = parseUnicodeTables(sources);
  const digest = sha256;
  return [
    `// GENERATED by \`${REGEN}\`; do not hand-edit. Unicode ${UNICODE_DATA_VERSION}, from:`,
    `//   ${UNICODE_SOURCES.caseFolding} sha256 ${digest(sources.caseFolding)}`,
    `//   ${UNICODE_SOURCES.derivedCore} sha256 ${digest(sources.derivedCore)}`,
    `//   ${UNICODE_SOURCES.confusables} sha256 ${digest(sources.confusables)}`,
    `//   ${UNICODE_SOURCES.aliases} sha256 ${digest(sources.aliases)}`,
    "// Entries are hex code points: `source>target` (a target may be a space-separated sequence), or `first-last`.",
    "",
    `export const UNICODE_DATA_VERSION = ${JSON.stringify(UNICODE_DATA_VERSION)};`,
    "",
    constant("CASE_FOLDING", "CaseFolding.txt, statuses C and F: the full case folding.", tables.caseFolding),
    constant("DEFAULT_IGNORABLE", "DerivedCoreProperties.txt `Default_Ignorable_Code_Point` ranges.", tables.defaultIgnorable),
    constant("CONFUSABLE_PROTOTYPES", "UTS 39 confusables.txt: each source code point's prototype.", tables.confusables),
    constant("SCRIPT_CODES", "PropertyValueAliases.txt: every Script short code a code point can carry.", tables.scripts),
  ].join("\n");
}

async function fetchSource(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} answered ${String(res.status)}`);
  }
  return await res.text();
}

/** `baseline unicode-handle-key`: fetch the pinned sources and write the module. A failed or mismatched
 *  download is a tool error that writes nothing. */
export async function generateUnicodeHandleKeyData(root: string): Promise<number> {
  const engine = process.versions["unicode"] ?? "unknown";
  if (!UNICODE_DATA_VERSION.startsWith(`${engine}.`)) {
    warn(
      `unicode-handle-key: the engine speaks Unicode ${engine} but the pinned data is ${UNICODE_DATA_VERSION}; bump UNICODE_DATA_VERSION to the engine's and re-key users.handle_key`,
    );
    return EXIT.misuse;
  }
  const [caseFolding, derivedCore, confusables, aliases] = await Promise.all([
    fetchSource(UNICODE_SOURCES.caseFolding),
    fetchSource(UNICODE_SOURCES.derivedCore),
    fetchSource(UNICODE_SOURCES.confusables),
    fetchSource(UNICODE_SOURCES.aliases),
  ]);
  const sources = { caseFolding, derivedCore, confusables, aliases };
  const mismatched = sourcesMismatchingPins(sources, UNICODE_SOURCE_PINS);
  if (mismatched.length > 0) {
    warn(`unicode-handle-key: ${mismatched.join(", ")} differ from their pinned SHA-256; refusing to write. A deliberate bump updates UNICODE_SOURCE_PINS.`);
    return EXIT.toolError;
  }
  writeFileSync(join(root, UNICODE_HANDLE_KEY_DATA_REL), renderUnicodeHandleKeyData(sources));
  emitLine(`unicode-handle-key: wrote ${UNICODE_HANDLE_KEY_DATA_REL} from Unicode ${UNICODE_DATA_VERSION}`);
  return EXIT.clean;
}
