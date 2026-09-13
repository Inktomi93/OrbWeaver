// THE §4.6 CONVERSION-DIFFERENTIAL HARNESS — one home for "replay a frozen legacy `GateDescriptor` and
// the final policies over the SAME BYTES, and compare findings, populations and tool errors" (#2000).
//
// WHY THIS IS A SHARED MODULE AND NOT A THIRD COPY. `tests/tooling/verify/gates/split-arm-parity.test.ts`
// (Tier 2a) carries its own inline copy; the schema-fact family (Tier 2b/2c) and the Tier 3 exceptions
// needed the same machinery, and three spellings of one mechanism is the "two homes for one concept"
// shape the constitution forbids. A later lane folding split-arm-parity onto this module is a separate,
// welcome change; this file does not touch it.
//
// WHAT A CALLER OWES, and why each piece exists:
//
// · A FROZEN SHA. `frozenLegacyGate` extracts the pre-conversion module with `git show` and runs it from a
//   scratch directory OUTSIDE the checkout, so every specifier it carries — relative, `@orb/tooling/…`, or
//   a bare package — is rewritten to an absolute file URL. `ts-morph` goes through `createRequire` so the
//   frozen module and the harness share ONE instance; two copies give the two engines different
//   `SyntaxKind` identities and the comparison becomes noise.
//
// · A LINE-ANCHORED SHIM, PROVEN. `shimHeaderImports` rewrites ONLY the header import block and asserts
//   the body is byte-identical afterwards. A blanket `String.replace` also patches the module's embedded
//   FIXTURE STRINGS — gate modules carry authored source containing `import … from "./x"` — and then BOTH
//   engines judge a broken specifier and report a matching pair of WRONG numbers, which a count comparison
//   structurally cannot detect.
//
// · ALL THREE COMPARISONS, DECLARED. A `Scenario` names the legacy findings, the final findings, both
//   populations and both tool-error sets. A population table alone is one third of §4.6, and a published
//   receipt has been a population-only table before.
//
// · A TOTAL TOOL-ERROR CLASSIFIER. `classifyToolError` may compress a message to a code for readability,
//   but it must THROW on a shape it does not recognise. A differential that silently absorbs a new refusal
//   shape is the vacuity this whole mechanism exists to prevent.
//
// · AN INERTNESS CONTROL ON EVERY CONSTRUCTED TWIN. Where a legacy fixture is too under-declared for the
//   final engine's readers to reach a verdict, the caller supplies a `repair` that completes it. The
//   harness then asserts the LEGACY engine's verdict on the twin equals its verdict on the raw example
//   (compared without line numbers, since a prepended declaration shifts every line below it). Without
//   that control a "twin" is simply a different example and proves nothing about catch parity.
//
// · AN IN-MEMORY-ONLY LEGACY GATE, AND THE HARNESS NOW REFUSES ANYTHING ELSE (#2119). Both replays run
//   over `useInMemoryFileSystem: true`, so a legacy gate that reads the REAL filesystem — `readFileSync`,
//   `existsSync`, a `node:child_process` shell-out, `process.cwd()` — cannot be replayed faithfully: its
//   fs arm answers about the running checkout rather than about the fixture, and §4.6's own guidance is
//   that such a gate needs a real tmpdir. This was verified harmless for the eleven blobs this repo
//   replays today (all pure in-memory AST readers), which is exactly why it had to become a REFUSAL
//   rather than a note: a future caller freezing a filesystem-reading descriptor would otherwise get a
//   confident, wrong differential. `frozenLegacyGate` scans the extracted source and throws, naming the
//   reach it found. A caller whose legacy gate genuinely needs disk owes a real-tmpdir harness, not a
//   relaxed scan here.
//
// · ONE GUARDED WRITE SITE, AND NOTHING WRITES AROUND IT. Both doors put bytes on disk — the tmpdir door
//   materializes a fixture map, the loader extracts a frozen closure — and both go through
//   `stagedReplayTarget`: the caller's staging root is refused if it lies inside the checkout, every path
//   is judged by the runtime's own strict repo-relative POSIX grammar, and the resolved target is contained
//   after symlink resolution. See the CONTAINMENT band below for the two boundaries this closed and the
//   measured escape behind each.
import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, sep } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../tooling/src/verify/contract/gate.ts";
import type { CoordinatedGateFinding, ReviewedGateGrant } from "../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../tooling/src/verify/contract/policy.ts";
import { runPass } from "../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../tooling/src/verify/lib/policy-pass.ts";
import { assertPolicyRepoPath } from "../../tooling/src/verify/lib/policy-repo-inventory.ts";
import { isPolicySourceCandidate } from "../../tooling/src/verify/lib/policy-source-candidate.ts";
import { GIT_READ_PREFIX, repoGitEnvironment } from "../../tooling/src/verify/lib/repo-paths.ts";
import { expect } from "./tool-fixtures.ts";

const REQUIRE = createRequire(join(process.cwd(), "package.json"));

export type Files = Readonly<Record<string, string>>;

export interface Seen {
  readonly file: string;
  readonly line: number;
  readonly token: string | undefined;
  readonly message: string;
  readonly policyId: string | undefined;
}

/** What one replay produced. All three halves of §4.6, never just the population. */
export interface Replay {
  readonly findings: readonly string[];
  readonly population: number;
  readonly toolErrors: readonly string[];
}

export type Label = (seen: Seen) => string;

/** Compress a tool error to a declarable code, or THROW. Totality is the contract. */
export type ClassifyToolError = (owner: string, phase: string, message: string) => string;

/** The default vocabulary both engines are compared in: who reported, where, on which token, and enough of
 *  the message to tell the arms apart. */
export const label: Label = (seen) => `${seen.policyId ?? "legacy"} | ${seen.file}:${seen.line} | ${seen.token ?? "-"} | ${seen.message.slice(0, 46)}`;
/** The same finding WITHOUT its line — what a twin's inertness control compares in. */
export const unlined: Label = (seen) => `${seen.policyId ?? "legacy"} | ${seen.file} | ${seen.token ?? "-"} | ${seen.message.slice(0, 46)}`;

export function sorted(values: readonly string[]): readonly string[] {
  return [...values].toSorted((left, right) => left.localeCompare(right));
}

/** ONE in-memory workspace per differential file, cleared between scenarios — the same substrate
 *  `ops/policy-conformance.ts` uses, and for the same reason: a fresh `Project` per scenario re-parses the
 *  default lib files on every `getTypeChecker()`, which is most of a differential's wall clock. */
export interface Differential {
  /** Complete production result for assertions the compact replay summary cannot express. */
  readonly finalPass: (policies: readonly GatePolicy[], files: Files) => ReturnType<typeof runPolicyPass>;
  readonly legacyReplay: (gate: GateDescriptor, files: Files, shape: Label) => Replay;
  readonly finalReplay: (policies: readonly GatePolicy[], files: Files, shape: Label) => Replay;
  readonly runScenarios: (legacy: GateDescriptor, policies: readonly GatePolicy[], fallback: string, scenarios: readonly Scenario[]) => number;
}

/** A minimal, DECLARED completion of a legacy fixture. It exists only to make the fixture resolvable to
 *  the final engine's readers; `runScenarios` proves it never moved the legacy verdict. */
export interface Repair {
  readonly prepend?: Readonly<Record<string, string>>;
  readonly add?: Files;
  readonly replace?: Readonly<Record<string, readonly (readonly [string, string])[]>>;
}

/** One legacy example: both engines, all three comparisons, plus the twin where one is owed. */
export interface Scenario {
  readonly why: string;
  readonly legacyPopulation: number;
  readonly finalPopulation: number;
  readonly legacy: readonly string[];
  readonly final: readonly string[];
  readonly legacyErrors?: readonly string[];
  readonly finalErrors?: readonly string[];
  readonly repair?: Repair;
  readonly twinFinalPopulation?: number;
  readonly twinFinal?: readonly string[];
  readonly twinFinalErrors?: readonly string[];
}

export function repairedFiles(files: Files, repair: Repair): Files {
  const out: Record<string, string> = { ...files, ...(repair.add ?? {}) };
  for (const [path, text] of Object.entries(repair.prepend ?? {})) {
    const existing = out[path];
    if (existing === undefined) {
      throw new Error(`repair prepends to a path the example does not carry: ${path}`);
    }
    out[path] = `${text}${existing}`;
  }
  for (const [path, pairs] of Object.entries(repair.replace ?? {})) {
    for (const [from, to] of pairs) {
      const existing = out[path];
      if (existing === undefined || !existing.includes(from)) {
        throw new Error(`repair replaces text the example does not carry: ${path} ${from}`);
      }
      out[path] = existing.replaceAll(from, to);
    }
  }
  return out;
}

export function exampleFiles(example: GateExample, fallback: string): Files {
  return typeof example.files === "string" ? { [example.at ?? fallback]: example.files } : example.files;
}

export function legacyScenarios(legacy: GateDescriptor, fallback: string): readonly Files[] {
  return [...legacy.mustFlag, ...legacy.mustPass].map((example) => exampleFiles(example, fallback));
}

/** Every specifier a frozen module can carry, resolved to an absolute file URL — or `null` for a NODE
 *  BUILTIN, which is already absolute and must be left exactly as authored. `createRequire.resolve("node:fs")`
 *  returns the specifier unchanged, so the old unconditional `pathToFileURL` produced `file:///node:fs` and
 *  the frozen module died at import with "Cannot find module '/node:fs'". Invisible until #2319's real-tmpdir
 *  door, because every blob the in-memory door replays is a pure AST reader that imports no builtin — which is
 *  the same shape as the refusal above it: the substrate decided which bug could exist. */
function resolveSpecifier(specifier: string): string | null {
  return resolveWith(specifier, (relative) => pathToFileURL(join(process.cwd(), "tooling/src/verify/gates", relative)).href);
}

/** THE SPECIFIER POLICY, with the RELATIVE arm left to the caller. Non-relative specifiers ALWAYS resolve
 *  against TODAY's installation and that is load-bearing, not laziness: `ts-morph` must be the SAME instance
 *  the harness holds, or the two engines carry different `SyntaxKind` identities and the whole comparison
 *  becomes noise (this file's header states that as the founding constraint). Node builtins are already
 *  absolute. Only the relative arm — the frozen module's own `lib/`, `contract/` and sibling reads — is a
 *  question about WHICH ERA to resolve in, and `frozenClosureResolver` answers it with the frozen one. */
function resolveWith(specifier: string, relativeArm: (relative: string) => string): string | null {
  if (specifier.startsWith("node:")) {
    return null;
  }
  if (specifier.startsWith("../") || specifier.startsWith("./")) {
    return relativeArm(specifier);
  }
  if (specifier.startsWith("@orb/tooling/_shared/")) {
    return pathToFileURL(join(process.cwd(), "tooling/src/_shared", `${specifier.slice("@orb/tooling/_shared/".length)}.ts`)).href;
  }
  return pathToFileURL(REQUIRE.resolve(specifier)).href;
}

const IMPORT_LINE = /^(?<head>(?:import|export)\s.*?\sfrom\s)"(?<specifier>[^"]+)";$/u;
/** The MULTI-LINE named-import form's two ends. A brace list that biome wrapped is still ONE import, and the
 *  single-line matcher above saw its opening brace as the first line of the BODY — so everything below it,
 *  including the `} from "../lib/…"` that carries the specifier, was left unshimmed and the frozen module
 *  died at import. Found by #2319's first real replay: `tsconfig-entry-liveness` imports seven names from
 *  `lib/grant-liveness.ts`, which is exactly wide enough for the formatter to wrap it. */
// THE OPENER IS THE EXACT GRAMMAR, AND THE LOOSE ONE WAS A LATENT CORRUPTION (LD-2319-8, found by the
// independent security review of `6144f3183`). `/^(?:import|export)\s[^"]*\{\s*$/u` also matches
// `export const gate: GateDescriptor = {`, `export function f(a: string) {`, `export interface X {` and
// `export type T = {`. The FIRST such line put the scanner in block mode for the REST of the module, and
// two things followed: the body byte-identity assertion went VACUOUS (everything was "header", so
// `body === ""` and the check compared "" to ""), and any column-0 `} from "…";` in the swallowed region —
// INCLUDING one inside an authored FIXTURE TEMPLATE LITERAL — was rewritten to an absolute `file:///` URL.
// That is precisely the failure this file's header says the line-anchored shim exists to prevent: both
// engines then judge the same corrupted fixture and report a matching pair of WRONG numbers.
//
// MEASURED over `tooling/src/verify/gates/*.ts` (309 files): 14 real wrapped-import openers, every one
// terminated, and **329 lines** the loose expression opens on that this one does not. No CURRENT table was
// wrong (the 22 frozen blobs the suites load are clean), which is exactly why it had to be fixed before
// family 3 walks ~133 more examples.
//
// These four are the whole grammar: `import {`, `import type {`, `export {`, `export type {`, plus the
// default-plus-named form `import Default, {` — zero instances in today's corpus, but the harness reads
// HISTORY, the form is valid TypeScript, and a missing opener fails LOUDLY (`Cannot find module`) while a
// spurious one corrupts silently. That asymmetry is why this list errs strict and carries the one extra arm.
const IMPORT_BLOCK_OPEN = /^(?:import\s+(?:type\s+)?|import\s+[A-Za-z_$][\w$]*\s*,\s*|export\s+(?:type\s+)?)\{\s*$/u;
/** ONE member of a brace list: a name, optionally `type`-prefixed, optionally `as`-aliased. A line inside a
 *  block that is not a comma-separated list of these is not a brace-list interior at all, and the scanner
 *  REFUSES rather than swallowing it — that refusal is what stops a mis-opened block from consuming the
 *  module. Measured: it rejects zero of the 14 real openers' interiors in today's corpus. */
const IMPORT_BLOCK_MEMBER = /^(?:type\s+)?[A-Za-z_$][\w$]*(?:\s+as\s+[A-Za-z_$][\w$]*)?$/u;
const IMPORT_BLOCK_CLOSE = /^(?<head>\}\s+from\s)"(?<specifier>[^"]+)";$/u;
const HEADER_LINE = /^(?:\/\/|\/\*|\s*\*|$)/u;

/** Is this line the INTERIOR of a wrapped brace list? The trailing comma is allowed; a blank line, a quote,
 *  a brace or anything else is not a member and ends the scanner's patience. */
function isBraceListInterior(line: string): boolean {
  const trimmed = line.trim();
  return trimmed !== "" && trimmed.split(",").every((piece) => piece.trim() === "" || IMPORT_BLOCK_MEMBER.test(piece.trim()));
}

/** One matched import line's disposition. `shimmed` is set only when a SPECIFIER was rewritten — a node
 *  builtin is carried verbatim and owes no absolute-URL assertion. Whether a line CLOSES a wrapped block is
 *  no longer carried here: the scanner asks the closing matcher directly, so a `null` from it is now a
 *  question about the brace-list interior rather than a silent "carry on". */
interface ShimmedLine {
  readonly text: string;
  readonly shimmed: string | null;
}

/** How one frozen module's specifiers resolve. `shimHeaderImports` defaults to TODAY's tree; the frozen
 *  closure passes its own so a relative read lands on the extracted era-matched copy. */
export type SpecifierResolver = (specifier: string) => string | null;

function shimSpecifierLine(line: string, pattern: RegExp, resolve: SpecifierResolver): ShimmedLine | null {
  // Biome's type service drops the `| null` from `RegExp.prototype.exec`'s lib signature when the regex
  // arrives as a PARAMETER (it does not on a module-const regex, which is why this only appeared once the
  // matcher became an argument). The null is real and is the ORDINARY case: this runs on every line of the
  // frozen module and most lines are not imports.
  // biome-ignore lint/suspicious/noUnnecessaryConditions: `RegExp.exec` returns `RegExpExecArray | null`; the receiver is nullish on every non-matching line.
  const groups = pattern.exec(line)?.groups;
  if (groups === undefined) {
    return null;
  }
  const resolved = resolve(groups["specifier"] as string);
  if (resolved === null) {
    return { text: line, shimmed: null };
  }
  const text = `${groups["head"] as string}"${resolved}";`;
  return { text, shimmed: text };
}

/** What the header scan has accumulated so far. `end` is the index of the first BODY line — every line
 *  below it is carried byte-for-byte — and `openedAt` is the line a wrapped import block began on, or
 *  `null` outside a block. Mutable and passed by reference so the per-line dispositions below stay small
 *  enough to read: this scanner's last defect (LD-2319-8) hid in one over-long branch. */
interface HeaderScan {
  readonly rewritten: string[];
  readonly imports: string[];
  end: number;
  openedAt: number | null;
}

/** Carry one matched header line, recording a rewritten specifier for the absolute-URL proof. */
function carryHeaderLine(scan: HeaderScan, index: number, carried: ShimmedLine): void {
  scan.rewritten.push(carried.text);
  if (carried.shimmed !== null) {
    scan.imports.push(carried.shimmed);
  }
  scan.end = index + 1;
}

/** One line INSIDE a wrapped import block: its closing `} from "…";`, or a brace-list interior — or a
 *  REFUSAL. THE SCANNER CANNOT CROSS A LINE THAT IS NOT PART OF THE HEADER: a "block" whose next line is
 *  neither is not a block at all, and carrying on is exactly how a mis-opened block swallowed a module,
 *  rewrote a specifier inside an authored FIXTURE STRING, and left the body identity proof with nothing to
 *  compare (LD-2319-8). */
function scanBlockLine(scan: HeaderScan, index: number, lines: readonly string[], resolve: SpecifierResolver): void {
  const openedAt = scan.openedAt ?? 0;
  const line = lines[index] ?? "";
  const closing = shimSpecifierLine(line, IMPORT_BLOCK_CLOSE, resolve);
  if (closing !== null) {
    carryHeaderLine(scan, index, closing);
    scan.openedAt = null;
    return;
  }
  if (!isBraceListInterior(line)) {
    throw new Error(
      `the frozen module's header scan opened a wrapped import at line ${String(openedAt + 1)} ` +
        `(${JSON.stringify(lines[openedAt] ?? "")}) and line ${String(index + 1)} (${JSON.stringify(line)}) is ` +
        'neither a brace-list member nor its closing `} from "…";`. The scan REFUSES rather than treating the ' +
        "rest of the module as header: that is how a mis-opened block rewrites a specifier inside an authored " +
        "FIXTURE STRING and makes the body identity proof vacuous (tests/support/legacy-differential.ts).",
    );
  }
  carryHeaderLine(scan, index, { text: line, shimmed: null });
}

/** Walk the header, stopping at the first line that cannot belong to it. Returns the accumulated scan; the
 *  identity proof is the caller's. */
function scanHeader(lines: readonly string[], resolve: SpecifierResolver): HeaderScan {
  const scan: HeaderScan = { rewritten: [], imports: [], end: 0, openedAt: null };
  for (const [index, line] of lines.entries()) {
    if (scan.openedAt !== null) {
      scanBlockLine(scan, index, lines, resolve);
      continue;
    }
    const shim = shimSpecifierLine(line, IMPORT_LINE, resolve);
    if (shim !== null) {
      carryHeaderLine(scan, index, shim);
      continue;
    }
    if (IMPORT_BLOCK_OPEN.test(line)) {
      carryHeaderLine(scan, index, { text: line, shimmed: null });
      scan.openedAt = index;
      continue;
    }
    if (HEADER_LINE.test(line)) {
      scan.rewritten.push(line);
      continue;
    }
    scan.end = index;
    break;
  }
  if (scan.openedAt !== null) {
    throw new Error(
      `the frozen module's header scan opened a wrapped import at line ${String(scan.openedAt + 1)} ` +
        `(${JSON.stringify(lines[scan.openedAt] ?? "")}) and reached the end of the module without its closing ` +
        '`} from "…";`. An unterminated block means the opener matched something that is not an import ' +
        "(tests/support/legacy-differential.ts).",
    );
  }
  return scan;
}

/** Rewrite ONLY the header import block, and prove it. See this file's header for the failure it prevents.
 *  `resolve` defaults to TODAY's tree; `frozenClosureGate` supplies the era-matched one. */
export function shimHeaderImports(source: string, resolve: SpecifierResolver = resolveSpecifier): string {
  const lines = source.split("\n");
  const scan = scanHeader(lines, resolve);
  const boundary = `line ${String(scan.end + 1)} (${JSON.stringify(lines[scan.end] ?? "(end of module)")})`;
  const body = lines.slice(scan.end).join("\n");
  const out = `${scan.rewritten.slice(0, scan.end).join("\n")}\n${body}`;
  // THE IDENTITY PROOF NAMES ITS BOUNDARY, so it can never again pass by having nothing to compare. When the
  // scan over-ran, `body` was `""` and the assertion below compared "" to "" — green, while every rewritten
  // fixture line inside the swallowed region went unnoticed.
  const stopped = `the header scan must STOP at the module BODY; it stopped at ${boundary}, leaving nothing below it to prove identical`;
  expect(body.length, stopped).toBeGreaterThan(0);
  expect(out.slice(out.length - body.length), `the frozen module's BODY must be byte-identical after the header shim (boundary: ${boundary})`).toBe(body);
  for (const line of scan.imports) {
    expect(line, "every shimmed import must resolve to an absolute file URL").toMatch(/ from "file:\/\/\//u);
  }
  return out;
}

/** Every spelling by which a legacy gate could reach the REAL filesystem or a subprocess. Deliberately a
 *  literal-text scan over the frozen SOURCE: this runs before the module is imported, and a scan that
 *  under-reports here is worse than one that over-reports — a false refusal costs a caller an explicit
 *  real-tmpdir harness, a false clean costs it a confident wrong differential. */
const FILESYSTEM_REACH: readonly string[] = [
  "node:fs",
  "node:child_process",
  "readFileSync",
  "writeFileSync",
  "existsSync",
  "readdirSync",
  "statSync",
  "realpathSync",
  "process.cwd(",
  "runNiced",
];

/** THE IN-MEMORY-ONLY OBLIGATION, ENFORCED (#2119). See the header: both replays run on a virtual project,
 *  so a legacy gate that touches disk answers about the running checkout rather than about the fixture.
 *  Exported so its own planted controls can drive it in both directions without importing a git blob. */
export function filesystemReach(source: string): readonly string[] {
  return FILESYSTEM_REACH.filter((spelling) => source.includes(spelling));
}

const FROZEN_BLOB_CEILING = 8 * 1024 * 1024;

// ── CONTAINMENT: THE ONE WRITE SITE ────────────────────────────────────────────────────────────────────
//
// EVERY byte this module puts on disk goes through `stagedReplayTarget` — the real-tmpdir door's
// materialized fixture files AND the loader's extracted frozen closure. There is no other `writeFileSync`
// here, and adding one is the defect this band exists to prevent.
//
// THE TWO BOUNDARIES IT CLOSES (codex's security review of `df2cda4c8`) are the SAME defect twice: a write
// that happened before the guard meant to fence it.
//
//  · A FIXTURE KEY IS A PATH, AND `Files` REFINES NOTHING. `materialize` filtered keys for the four
//    non-authored segment names and for nothing else, so `{ "../escaped.txt": … }` — a syntactically valid
//    `GateExample` map — normalized to a SIBLING of the mkdtemp root and was written there. The `finally`
//    that reaps the root cannot reach outside it, and the ResourceHost's own refusal fires later, on the
//    overlay, after the bytes have landed. Measured before the repair: the escaped write OVERWROTE a
//    sentinel and survived the reap. Keys are repository-authored data rather than remote input, so this is
//    host integrity — but the door's own comment advertises an auto-cleaned tmpdir, and a future authored
//    key would have falsified that quietly.
//  · A CALLER-SUPPLIED STAGING ROOT IS A PATH TOO. `loadFrozenGate` wrote the frozen module into whatever
//    directory it was handed and then imported it, and `assertReplayRootIsScratch` — this door's own
//    advertised anti-live-tree refusal — was bound to nothing: it had exactly one caller, inside
//    `materialize`, AFTER that function had made its own root. `frozenFilesystemLegacyGate(process.cwd(), …)`
//    would therefore have written a `.ts` file into the CHECKOUT. Only every current caller's choice to pass
//    Vitest's `scratch` kept the tree clean, and "the callers happen to be careful" is not a boundary.
//
// THE GRAMMAR IS IMPORTED, NEVER RE-SPELLED. `assertPolicyRepoPath` (`lib/policy-repo-inventory.ts`) is the
// rule the final runtime already applies to every policy scope path: nonempty, control-free, no absolute /
// drive-letter / backslash syntax, no trailing slash, and no empty, `.` or `..` segment. A fourth hand-rolled
// path grammar — in the one module that writes files, no less — is exactly the drift one-home exists to stop.
//
// AND THE RESOLVED TARGET IS CONTAINED, not merely the lexical one. `writeFileSync` FOLLOWS a symlink and
// `mkdirSync` will happily materialize a subtree behind one, so every segment that already exists is checked
// and its realpath must still be inside the realpath'd root. That is the same two-test argument
// `ops/resource-path.ts` makes for the READ side, in the same order and for the same reason.

/** Containment between two ABSOLUTE, already-canonical paths — the root itself, or a descendant of it. The
 *  `${root}${sep}` prefix is what keeps `/repo-other` from reading as inside `/repo`; it is the same test
 *  `assertReplayRootIsScratch` below applies to the checkout, deliberately spelled once. */
function containedIn(root: string, target: string): boolean {
  return target === root || target.startsWith(`${root}${sep}`);
}

/** THE ANTI-LIVE-TREE REFUSAL — the #2119 obligation one direction over: a real-tmpdir replay driven over
 *  the live checkout answers about THIS repository rather than about the fixture. It lives HERE, above the
 *  write site, because that is now what binds it: every staged write and the frozen `import()` go through
 *  `stagedReplayTarget`, which calls this first. Exported so its own controls can drive it both ways
 *  without materializing anything. */
export function assertReplayRootIsScratch(root: string): void {
  // THE THREE QUESTIONS, IN THIS ORDER, AND THE ORDER IS THE DESIGN. Does it resolve · is it outside the
  // checkout · is it a DIRECTORY. Identity answers BEFORE kind so a regular file INSIDE the checkout still
  // refuses with the live-tree sentence — that is the higher-severity boundary and the one the controls pin.
  // Kind is asked at all because of LD-2319-10: without it a regular file OUTSIDE the checkout passed this
  // guard and refused one call later as a bare `ENOTDIR` naming no boundary, and "it threw eventually" is
  // not the same claim as "the guard holds".
  let resolved: string;
  try {
    resolved = realpathSync(root);
  } catch (error) {
    throw new Error(
      `a real-tmpdir replay root must be an existing directory, and ${root} does not resolve at all — an absent ` +
        "path or a DANGLING symlink. Every staged write is resolved under this root, so it is refused here " +
        "rather than as a raw ENOENT from the first write (tests/support/legacy-differential.ts).",
      { cause: error },
    );
  }
  const checkout = realpathSync(process.cwd());
  if (containedIn(checkout, resolved)) {
    throw new Error(
      `a real-tmpdir replay root must live OUTSIDE the running checkout, and ${resolved} is inside ${checkout} — ` +
        "a frozen legacy descriptor's existsSync/readdirSync arm driven there answers about THIS repository " +
        "rather than about the fixture, which is the wrong-substrate differential #2119 refuses in the other " +
        "direction (tests/support/legacy-differential.ts).",
    );
  }
  if (!statSync(resolved).isDirectory()) {
    throw new Error(
      `a real-tmpdir replay root must be a DIRECTORY, and ${resolved} is not one. Staged writes resolve segment ` +
        "by segment under this root, so a regular file, a socket or a device node here would surface as a bare " +
        "ENOTDIR from the first write — a refusal that names no boundary and proves nothing about this guard " +
        "(tests/support/legacy-differential.ts).",
    );
  }
}

/** The strict repo-relative POSIX grammar, IMPORTED rather than re-spelled, wrapped in this door's own
 *  sentence so the refusal says what the grammar is protecting. */
function assertStagedRelativePath(role: string, relativePath: string): void {
  try {
    assertPolicyRepoPath(relativePath, `${role} ${JSON.stringify(relativePath)}`);
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} — every path this harness writes is resolved under ` +
        "a scratch root, so an absolute key or one carrying a `..` segment would land OUTSIDE the root the replay " +
        "reaps and would outlive the run (tests/support/legacy-differential.ts).",
      { cause: error },
    );
  }
}

/** One already-existing path segment's canonical identity. A segment that does not exist yet is carried
 *  lexically — it will be created inside a parent this walk has already contained. One that exists and is a
 *  SYMLINK is resolved and re-contained, because that is the escape a lexical check structurally cannot see. */
function containedSegment(canonicalRoot: string, target: string, relativePath: string): string {
  let link: ReturnType<typeof lstatSync>;
  try {
    link = lstatSync(target);
  } catch (error) {
    // ENOENT is the ORDINARY case — the segment does not exist yet and will be created inside a parent this
    // walk has already contained. Anything else is a refusal of THIS write and says so in the door's own
    // words: a raw rethrow here is where the `{ "a": …, "a/b.ts": … }` file/dir collision used to surface as
    // a bare ENOTDIR naming no boundary (LD-2319-10).
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return target;
    }
    throw new Error(
      `the replay harness cannot walk the staging path ${JSON.stringify(relativePath)} at ${target}: ` +
        `${error instanceof Error ? error.message : String(error)}. A staged write resolves segment by segment ` +
        "from the root, so a non-ENOENT failure here — an existing FILE where a directory is needed, or a " +
        "permission wall — refuses this write; it is not a containment verdict " +
        "(tests/support/legacy-differential.ts).",
      { cause: error },
    );
  }
  if (!link.isSymbolicLink()) {
    return target;
  }
  let canonical: string;
  try {
    canonical = realpathSync(target);
  } catch (error) {
    throw new Error(
      `the replay harness refuses to write ${JSON.stringify(relativePath)} through the DANGLING symlink ${target}: ` +
        "its target cannot be resolved, so containment cannot be decided and the write would create the link's " +
        "target wherever it points (tests/support/legacy-differential.ts).",
      { cause: error },
    );
  }
  if (!containedIn(canonicalRoot, canonical)) {
    throw new Error(
      `the replay harness refuses to write ${JSON.stringify(relativePath)}: the staging path crosses the symlink ` +
        `${target}, which resolves to ${canonical} — OUTSIDE the staging root ${canonicalRoot}. writeFileSync ` +
        "follows a link, so a lexical containment check alone would have written outside the root " +
        "(tests/support/legacy-differential.ts).",
    );
  }
  return canonical;
}

/** Resolve one staged write's absolute target, or THROW. PURE — it creates nothing, which is exactly what
 *  lets a control drive the red side of this boundary without performing the unsafe write it refuses. */
export function stagedReplayTarget(root: string, relativePath: string): string {
  assertReplayRootIsScratch(root);
  assertStagedRelativePath("the replay harness's staged write path", relativePath);
  const canonicalRoot = realpathSync(root);
  let current = canonicalRoot;
  for (const segment of relativePath.split("/")) {
    current = containedSegment(canonicalRoot, join(current, segment), relativePath);
  }
  // THE SECOND, INDEPENDENT TEST — and it is not redundant with the grammar above. A grammar is a claim
  // about a STRING; this is a claim about the COMPUTED TARGET, and the two fail differently. Without it the
  // whole boundary would rest on one refusal, which is how F1 happened: the non-authored filter was the only
  // thing reading the key, and it was never a containment check.
  if (!containedIn(canonicalRoot, current)) {
    throw new Error(
      `the replay harness refuses to write ${JSON.stringify(relativePath)}: it resolves to ${current}, OUTSIDE the ` +
        `staging root ${canonicalRoot} (tests/support/legacy-differential.ts).`,
    );
  }
  return current;
}

/** THE ONE WRITE SITE. Guard, grammar and containment all resolve first; only then do bytes move. */
function writeStagedReplayFile(root: string, relativePath: string, contents: string): string {
  const target = stagedReplayTarget(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
  return target;
}

/** THE FROZEN READ, PINNED TO THIS REPOSITORY (LD-2319-9). `git show` is a read, but until this helper the
 *  three frozen reads inherited the ambient `GIT_*` environment and named no repository — and the bytes it
 *  returns are WRITTEN into scratch and `import()`ed, so the object store they come from is the store whose
 *  code executes. A run under a git HOOK is the concrete case: git exports `GIT_DIR`/`GIT_INDEX_FILE` to
 *  hooks, and `tests/tooling/**` runs on the `--full` tier. `-C` names the repository, `repoGitEnvironment()`
 *  strips every inherited `GIT_*` (the posture `lib/repo-paths.ts` states for exactly this: *"Explicit
 *  repository roots must not inherit a caller's alternate repository or index"*), and `GIT_READ_PREFIX` keeps
 *  the reader from taking `.git/index.lock` while an operator works. `initRepository` below already does the
 *  environment half; this is the same rule at the other three call sites.
 *
 *  `quiet` drops the child's stderr — the ONE caller that treats a failure as "absent at this SHA" wants no
 *  noise; the callers that THROW keep the default pipe so git's own message survives into the error. */
function frozenShow(base: string, repoPath: string, quiet: boolean): string {
  const argv = ["-C", process.cwd(), ...GIT_READ_PREFIX, "show", `${base}:${repoPath}`];
  const options = { encoding: "utf8", maxBuffer: FROZEN_BLOB_CEILING, env: repoGitEnvironment() } as const;
  return quiet ? execFileSync("git", argv, { ...options, stdio: ["ignore", "pipe", "ignore"] }) : execFileSync("git", argv, options);
}

/** Read one repo-relative path AT a frozen SHA, or `null` when the blob does not exist there. */
function frozenBlob(base: string, repoPath: string): string | null {
  try {
    return frozenShow(base, repoPath, true);
  } catch {
    return null;
  }
}

/** What extracting one frozen module's relative-import closure cost — receipted, never assumed. */
export interface FrozenClosure {
  /** Every repo-relative path extracted at the frozen SHA, in discovery order, the entry module first. */
  readonly extracted: readonly string[];
  /** The deepest relative-import hop from the entry module. */
  readonly depth: number;
  /** Paths reached a second time — the cycle/diamond receipt. Extraction is memoised, so these are reads
   *  that were SERVED from the map rather than re-fetched. */
  readonly revisited: readonly string[];
}

/** THE FROZEN CLOSURE (#2319, the harness's THIRD defect). `resolveSpecifier` sends a frozen module's
 *  RELATIVE imports to TODAY's tree, so a descriptor whose `lib/` dependency was later deleted or renamed
 *  could not be LOADED AT ALL — and it failed as `Cannot find module`, which reads as a broken test rather
 *  than as a missing capability. Measured on `placeholder-copy-registry` at `f5b222e10`, whose
 *  `../lib/section-defs.ts` exists at that SHA and is gone today.
 *
 *  Worse than one blocked module: WHICH modules were replayable was decided by an accident of which `lib/`
 *  refactors happened AFTER each conversion, so the replay backlog was silently bounded by unrelated churn
 *  and got smaller every time the program consolidated a reader.
 *
 *  So the relative arm now resolves into an ERA-MATCHED extraction: every `./`/`../` specifier is fetched at
 *  the SAME frozen SHA, written to `scratch`, and rewritten to point there — recursively, memoised, so a
 *  cycle or a diamond terminates. **Non-relative specifiers deliberately keep TODAY's resolution**: the
 *  frozen module and the harness must share ONE `ts-morph` instance or the two engines carry different
 *  `SyntaxKind` identities and the comparison becomes noise (this file's header, the founding constraint).
 *
 *  It also REFUSES LOUDLY where the old code said "Cannot find module": a relative dep absent at the frozen
 *  SHA too is a naming or era mistake by the caller, and it says so with both paths. */
function extractFrozenClosure(scratch: string, base: string, entryPath: string): { readonly entryFile: string; readonly closure: FrozenClosure } {
  const written = new Map<string, string>();
  const extracted: string[] = [];
  const revisited: string[] = [];
  let depth = 0;

  const scratchNameFor = (repoPath: string): string => `${base.slice(0, 8)}--${repoPath.split("/").join("__")}`;

  const extract = (repoPath: string, hop: number, requestedBy: string): string => {
    const already = written.get(repoPath);
    if (already !== undefined) {
      revisited.push(repoPath);
      return already;
    }
    const source = frozenBlob(base, repoPath);
    if (source === null) {
      throw new Error(
        `the frozen closure of ${entryPath} at ${base} wants ${repoPath} (imported by ${requestedBy}), and that ` +
          "path does not exist at that SHA either — so this is a wrong base or a wrong path, not post-conversion " +
          "churn. Check the conversion commit's parent (tests/support/legacy-differential.ts).",
      );
    }
    // THE TARGET IS RESOLVED THROUGH THE GUARDED WRITE SITE BEFORE THE MAP RECORDS IT: the recursion below
    // hands this path out as an import URL, so a target that is not yet known to be contained must never
    // become a cycle's answer. `stagedReplayTarget` creates nothing, so resolving early costs nothing.
    const name = scratchNameFor(repoPath);
    const target = stagedReplayTarget(scratch, name);
    // RECORDED BEFORE RECURSING — a cycle re-entering this path must find the target, not recurse forever.
    written.set(repoPath, target);
    extracted.push(repoPath);
    depth = Math.max(depth, hop);
    writeStagedReplayFile(
      scratch,
      name,
      shimHeaderImports(source, (specifier) =>
        resolveWith(specifier, (relative) => pathToFileURL(extract(normalizeRepoPath(repoPath, relative), hop + 1, repoPath)).href),
      ),
    );
    return target;
  };

  const entryFile = extract(entryPath, 0, "(the replay harness)");
  return { entryFile, closure: { extracted, depth, revisited } };
}

/** Resolve a relative specifier against the IMPORTING module's own repo directory. */
function normalizeRepoPath(importer: string, relative: string): string {
  return join(dirname(importer), relative).split(sep).join("/");
}

/** Extract the frozen blob AND its era-matched relative closure, then import it from OUTSIDE `gates/`. Both
 *  doors share this: the difference between them is the SUBSTRATE the descriptor is driven over, never how
 *  it is loaded. */
async function loadFrozenGate(
  scratch: string,
  base: string,
  legacyPath: string,
): Promise<{ readonly gate: GateDescriptor; readonly source: string; readonly closure: FrozenClosure }> {
  // THE GUARD IS BOUND AHEAD OF THE FIRST BYTE, not only inside the per-file write below: this is the door
  // that takes a staging directory from a CALLER, and a caller that hands it the checkout must be refused
  // before `git show` has produced anything to write.
  assertReplayRootIsScratch(scratch);
  const source = frozenShow(base, legacyPath, false);
  const { entryFile, closure } = extractFrozenClosure(scratch, base, legacyPath);
  // THE IMPORT IS THE MOMENT FROZEN CODE RUNS, so the last thing established before it is WHERE that code
  // came from. `stagedReplayTarget` already contained every extracted file; this re-states the invariant at
  // the one call that hands bytes to the runtime, where a future edit is most likely to break it.
  if (!containedIn(realpathSync(scratch), entryFile)) {
    throw new Error(
      `the frozen entry module ${entryFile} resolved OUTSIDE the staging root ${scratch} and will not be imported (tests/support/legacy-differential.ts).`,
    );
  }
  const name = basename(entryFile);
  const module_ = (await import(`${pathToFileURL(entryFile).href}?frozen=${name}`)) as { readonly gate: GateDescriptor };
  return { gate: module_.gate, source, closure };
}

/** The closure receipt for a frozen descriptor, without importing it — what the report tables per module. */
export function frozenClosureOf(scratch: string, base: string, legacyPath: string): FrozenClosure {
  return extractFrozenClosure(scratch, base, legacyPath).closure;
}

/** The pre-conversion descriptor, extracted at its frozen SHA and shimmed so it runs from `scratch`. */
export async function frozenLegacyGate(scratch: string, base: string, legacyPath: string): Promise<GateDescriptor> {
  const source = frozenShow(base, legacyPath, false);
  const reach = filesystemReach(source);
  if (reach.length > 0) {
    throw new Error(
      `${legacyPath} at ${base} reaches the real filesystem (${reach.join(", ")}) — this harness replays on ` +
        "an in-memory project, so its fs arm would answer about the running checkout rather than the fixture. " +
        "Replay it on a real tmpdir instead of relaxing this refusal (tests/support/legacy-differential.ts).",
    );
  }
  return (await loadFrozenGate(scratch, base, legacyPath)).gate;
}

// ── THE REAL-TMPDIR DOOR (#2319) ───────────────────────────────────────────────────────────────────────
//
// WHY IT EXISTS. `frozenLegacyGate` above refuses a filesystem-reading descriptor because the in-memory
// substrate would make its fs arm answer about the RUNNING CHECKOUT rather than about the fixture — a
// confident, wrong differential. §4.6's own instruction for that class is *"replay a filesystem-reading
// legacy gate on a REAL TMPDIR, never a virtual root"*, and until this door existed the `grant-liveness`
// config pair's §4.6 records were category 5 with a zero legacy side (liveness-and-outcome receipts, never
// catch parity — `tsconfig-entry-liveness.ts`'s header says so, and #2319 is this residual).
//
// THE REFUSAL IS PRESERVED, NOT RELAXED. `frozenLegacyGate` still refuses; nothing here loosens
// `filesystemReach`. What this door adds is the substrate that makes the refusal's own advice reachable —
// and it carries the OPPOSITE refusal, which is the one that matters once a descriptor is allowed near
// real disk: `assertReplayRootIsScratch` throws if the root a replay is about to be driven over lies
// inside the running checkout. A legacy `existsSync` arm pointed at the live tree answers about this
// repository, which is exactly the wrong-substrate failure #2119 was minted for, one direction over.
//
// THE TWO SUBSTRATES IT MIRRORS, deliberately, rather than inventing a third:
//   · LEGACY — `ops/conformance.ts` `runFsBackedExample`: mkdtemp, `git init`, write the example's file
//     map, a real-fs `Project` carrying the TS members, then `runPass`.
//   · FINAL — `ops/policy-conformance.ts` `runResourceExample`: mkdtemp, write, `git init` + `git add
//     --all` (the tracked-file oracle every `grant-liveness` policy reads through), a real-fs `Project`
//     plus the authored overlay and its parser seam, then `runPolicyPass`.
// The ONE difference between them is the git INDEX, and this harness does not assume it is inert: every
// scenario re-runs the legacy side on an UNINDEXED root and asserts the verdict did not move
// (`indexInertness` below). Without that control, adopting `git add` for the shared root would be an
// undeclared substrate port sitting under every number in the table.

/** Every file map the tmpdir door will materialize is an AUTHORED transaction. `ops/resource-reader.ts`'s
 *  non-authored vocabulary is filtered out of the overlay by `ops/policy-conformance.ts`; no caller here has
 *  needed such a fixture, so this door REFUSES one rather than carrying a second copy of that filter which
 *  nothing would ever exercise. */
const NON_AUTHORED_SEGMENT_RE = /(?:^|\/)(?:node_modules|\.git|dist|\.cache)(?:\/|$)/u;

/** One replay's three §4.6 axes plus the two the authority engine added at conversion. `raw` is what the
 *  policy REPORTED and `findings` is what survived reconciliation; on the legacy side they are the same list
 *  because a descriptor had no authority engine to survive. */
export interface TmpdirReplay {
  /** EFFECTIVE findings — what a run would print. */
  readonly findings: readonly string[];
  /** RAW findings — before waivers and reviewed grants. A category-5 delta is visible only here. */
  readonly raw: readonly string[];
  /** Grant ids consumed, sorted. Empty on the legacy side by construction. */
  readonly granted: readonly string[];
  /** The SOURCE population both runtimes publish (`scanRoot` admissions · `effectiveSourcePaths`). */
  readonly population: number;
  /** The SUBJECT set: the legacy `ctx.scan` declaration, or the final `effectiveResourcePaths`. A
   *  `{ of: "none" }` policy's whole population lives here and nowhere in the number above. */
  readonly subjects: readonly string[];
  readonly toolErrors: readonly string[];
  /** Set when population resolution or the pass itself THREW — a refusal, never a verdict. */
  readonly thrown: string | undefined;
}

/** How one example's two sides differ, as a CLOSED vocabulary rather than a prose cell. §4.6's four
 *  categories plus the two `mechanical-gates-1584.md` was missing, plus the two shapes a conversion of a
 *  filesystem gate into a resource policy actually produces. `runTmpdirScenarios` asserts each label
 *  against the numbers, so a mislabelled row reds instead of reading as a record. */
export type DifferentialClass =
  /** Both sides report the same non-empty finding set. The only label that claims CATCH PARITY. */
  | "identical"
  /** Both sides zero. §4.6 vacuity shape 1 — evidence of nothing, and it must say so. */
  | "vacuous-both-zero"
  /** §4.6 category 1: the legacy arm moved to a `-health` sibling, which now reports it. */
  | "split"
  /** §4.6 category 2: the legacy arm has no successor here, and the successor proof is named in `why`. */
  | "retired-arm"
  /** §4.6 category 4: a stronger reader reaches a verdict the legacy reader could not. */
  | "stronger-reader"
  /** §4.6 category 5: a site the legacy exemption table HID is now reported raw and licensed by a grant. */
  | "exemption-mechanism-move"
  /** §4.6 category 6: the same catch at a different reported position. Owed a receipt, not a bucket. */
  | "anchor-move"
  /** The legacy FINDING became the runtime's own refusal — louder than the finding it replaced. */
  | "runtime-refusal";

/** A minimal, DECLARED completion of a legacy fixture for the tmpdir door. Same contract as `Repair`. */
export interface TmpdirScenario {
  readonly why: string;
  readonly classification: DifferentialClass;
  readonly legacy: readonly string[];
  readonly legacyPopulation: number;
  readonly legacySubjects: readonly string[];
  readonly legacyErrors?: readonly string[];
  /** EFFECTIVE findings on the final side. */
  readonly final: readonly string[];
  /** RAW findings, when they differ from `final` — a PORT, declared per fixture with both numbers. */
  readonly finalRaw?: readonly string[];
  readonly finalPopulation: number;
  readonly finalSubjects: readonly string[];
  readonly finalErrors?: readonly string[];
  /** The reviewed grants this fixture is driven with. Declaring one is how a category-5 row proves the
   *  hidden site became exactly ONE live, CONSUMED grant rather than merely a reported one. */
  readonly grants?: readonly ReviewedGateGrant[];
  readonly granted?: readonly string[];
  /** THE SUCCESSOR PROOF, per example — §4.6's *"a retired or merged arm needs a successor proof"* made a
   *  FIELD instead of prose. A substring that must occur in at least one FINAL finding label or tool error;
   *  it is what says WHICH final output carries the legacy catch, and it is the check a count comparison
   *  cannot make (a fixture whose 30 filler globs light up the new glob arm has a large final side and may
   *  still have dropped the one arm the example was written for). `null` only where the legacy catch has NO
   *  successor on this substrate, which then owes `retiredWhy`. */
  readonly successor: string | null;
  /** Required when `successor` is null and the legacy side caught something: why nothing here carries it. */
  readonly retiredWhy?: string;
  /** A refusal the final side THREW, matched by inclusion. */
  readonly finalThrows?: string;
}

export interface TmpdirDifferential {
  readonly legacyReplay: (gate: GateDescriptor, files: Files, shape: Label, options?: { readonly index?: boolean }) => TmpdirReplay;
  readonly finalReplay: (policies: readonly GatePolicy[], files: Files, shape: Label, grants?: readonly ReviewedGateGrant[]) => TmpdirReplay;
  readonly runScenarios: (legacy: GateDescriptor, policies: readonly GatePolicy[], fallback: string, scenarios: readonly TmpdirScenario[]) => number;
}

/** THE CLASSIFICATION IS A CHECKED CLAIM, as a mapped Record over the closed union so a new category is a
 *  `tsc` error rather than a silently unchecked cell. Only the two labels that LIE are decided
 *  arithmetically — `identical` (which claims catch parity) and `vacuous-both-zero` (which must confess
 *  it is evidence of nothing). The rest are carried by the SUCCESSOR field below, deliberately: a count
 *  test cannot tell a carried arm from a lost one on a fixture whose 30 filler globs light up a newly
 *  live arm, and filing a differential under a category its own evidence contradicts is exactly how
 *  `ordinary-visitors-family-1584.md` swept four split arms into one `0 | 0 | 0` cell. */
/** What a classification check reads. Structural rather than `TmpdirReplay`, because the IN-MEMORY door's
 *  `Replay` carries only the effective findings — so a caller on that door adapts with
 *  `{ ...replay, raw: replay.findings, granted: [], thrown: undefined }`, and an `exemption-mechanism-move`
 *  claim then CORRECTLY fails there: the in-memory door cannot observe a consumed grant, so a category-5
 *  differential is not expressible on it and must not be claimable. */
export interface DifferentialSide {
  readonly findings: readonly string[];
  readonly raw: readonly string[];
  readonly granted: readonly string[];
  readonly toolErrors: readonly string[];
  readonly thrown: string | undefined;
}

/** The label plus its successor proof, without the per-row numbers a scenario also declares. */
export interface DifferentialClaim {
  readonly classification: DifferentialClass;
  readonly successor: string | null;
  readonly retiredWhy?: string;
}

const CLASSIFICATION_CLAIMS: Record<DifferentialClass, (before: DifferentialSide, after: DifferentialSide) => readonly string[]> = {
  identical: (before, after) => [
    ...(before.findings.length > 0 ? [] : ['"identical" claims CATCH PARITY, so the LEGACY side must be non-empty']),
    ...(after.findings.length === before.findings.length ? [] : ['"identical" requires the same finding COUNT on both sides']),
  ],
  "vacuous-both-zero": (before, after) => [
    ...(before.findings.length === 0 ? [] : ['"vacuous-both-zero" requires the LEGACY side empty']),
    ...(after.raw.length === 0 ? [] : ['"vacuous-both-zero" requires the FINAL side empty, RAW included']),
  ],
  split: () => [],
  "retired-arm": (before) => (before.findings.length > 0 ? [] : ['"retired-arm" requires the LEGACY side to have caught something']),
  "stronger-reader": (_before, after) => (after.raw.length > 0 ? [] : ['a "stronger-reader" row must REPORT what the legacy reader could not']),
  "exemption-mechanism-move": (_before, after) =>
    after.granted.length > 0 ? [] : ["category 5 is legacy-hidden → final-reported-and-LICENSED, so a grant must be CONSUMED"],
  "anchor-move": (before, after) =>
    after.findings.join("\n") === before.findings.join("\n") ? ['"anchor-move" claims the POSITION moved; identical labels mean nothing moved'] : [],
  "runtime-refusal": (before, after) => [
    ...(before.findings.length > 0 ? [] : ['"runtime-refusal" replaces a legacy FINDING, so the LEGACY side must be non-empty']),
    ...(after.thrown !== undefined || after.toolErrors.length > 0
      ? []
      : ['"runtime-refusal" requires the final side to REFUSE — a throw or a tool error, never a report']),
  ],
};

/** Every check the label and the successor proof together owe, as ONE list so the assertion is
 *  unconditional and a failure names every broken claim rather than the first. Exported because BOTH doors
 *  answer to it: the tmpdir runner calls it per scenario, and a caller on the in-memory door calls it
 *  beside `runScenarios` with an adapted side — one home for what a classification means. */
export function differentialViolations(claim: DifferentialClaim, before: DifferentialSide, after: DifferentialSide): readonly string[] {
  const carriers = [...after.findings, ...after.toolErrors, after.thrown ?? ""].join("\n");
  return [
    ...CLASSIFICATION_CLAIMS[claim.classification](before, after),
    ...(claim.successor !== null && !carriers.includes(claim.successor)
      ? [`the declared SUCCESSOR ${JSON.stringify(claim.successor)} appears in no final finding or tool error`]
      : []),
    ...(claim.successor === null && before.findings.length > 0 && claim.retiredWhy === undefined
      ? ["the legacy side CAUGHT something and no successor is declared — say WHY nothing here carries it"]
      : []),
    ...(claim.successor === null && before.findings.length === 0 && claim.retiredWhy !== undefined
      ? ["`retiredWhy` explains a retired CATCH, and this example's legacy side caught nothing"]
      : []),
  ];
}

/** Adapt an IN-MEMORY `Replay` to the classification checker's side. See `DifferentialSide` on why a
 *  category-5 claim correctly cannot hold on that door. */
export function inMemorySide(replay: Replay): DifferentialSide {
  return { findings: replay.findings, raw: replay.findings, granted: [], toolErrors: replay.toolErrors, thrown: undefined };
}

function materialize(files: Files): { readonly root: string; readonly project: Project } {
  // EVERY KEY IS JUDGED BEFORE THE ROOT EXISTS. A refusal must leave nothing behind, and the cheapest way to
  // own that is to have created nothing yet: the whole map is validated, then one mkdtemp, then the writes.
  // The two refusals are separate on purpose — CONTAINMENT (the grammar) and the door's SEMANTIC fence (the
  // non-authored vocabulary, which `ops/policy-conformance.ts` filters out of the overlay). Neither implies
  // the other: `../escaped.txt` carries no non-authored segment, and `node_modules/x.ts` is perfectly
  // contained.
  for (const path of Object.keys(files)) {
    assertStagedRelativePath("the real-tmpdir door's fixture key", path);
    if (NON_AUTHORED_SEGMENT_RE.test(path)) {
      throw new Error(
        `the real-tmpdir door refuses the non-authored fixture path ${path}: the overlay filter for that class ` +
          "lives in ops/policy-conformance.ts and nothing here has ever needed it, so this door declines to " +
          "carry an unexercised copy of it (tests/support/legacy-differential.ts).",
      );
    }
  }
  const root = mkdtempSync(join(tmpdir(), `orb-legacy-differential-${String(process.pid)}-`));
  try {
    assertReplayRootIsScratch(root);
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    for (const [path, source] of Object.entries(files).toSorted(([left], [right]) => left.localeCompare(right))) {
      const absolute = writeStagedReplayFile(root, path, source);
      if (isPolicySourceCandidate(path)) {
        project.addSourceFileAtPath(absolute);
      }
    }
    return { root, project };
  } catch (error) {
    // A PARTIAL MATERIALIZE IS REAPED HERE. The callers' `finally` can only run once this function has
    // RETURNED a root, so a throw between the mkdtemp and the last write would otherwise leak the whole
    // partial tree — which is the same "the cleanup cannot reach it" shape as the escape above.
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

function initRepository(root: string, index: boolean): void {
  const environment = repoGitEnvironment();
  const steps = index
    ? [
        ["init", "--quiet"],
        ["add", "--all"],
      ]
    : [["init", "--quiet"]];
  for (const args of steps) {
    const git = runNicedSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: root, env: environment });
    if (git.status !== 0) {
      throw new Error(`replay Git ${String(args[0])} failed: ${git.stderr.trim()}`);
    }
  }
}

function declaredSubjects(declared: { readonly unit: string; readonly candidates: number; readonly scanned: number } | undefined): readonly string[] {
  return declared === undefined ? [] : [`${declared.unit}: candidates=${String(declared.candidates)} scanned=${String(declared.scanned)}`];
}

/** Build the two real-tmpdir replay engines and the scenario runner. Every replay gets its OWN root — a
 *  legacy `existsSync` oracle and a `git add --all` index are both whole-root state, so reusing one root
 *  across examples would leak the previous fixture into the next verdict. */
export function createTmpdirDifferential(classifyToolError: ClassifyToolError): TmpdirDifferential {
  const legacyReplay = (gate: GateDescriptor, files: Files, shape: Label, options: { readonly index?: boolean } = {}): TmpdirReplay => {
    const { root, project } = materialize(files);
    try {
      initRepository(root, options.index ?? true);
      const result = runPass([gate], {
        root,
        project,
        scope: { kind: "project" },
        files: project.getSourceFiles(),
        checker: () => project.getTypeChecker(),
      });
      const findings = sorted(
        (result.gates[0]?.findings ?? []).map((finding) =>
          shape({ file: finding.file, line: finding.line, token: finding.token, message: finding.message ?? gate.message, policyId: undefined }),
        ),
      );
      return {
        findings,
        raw: findings,
        granted: [],
        population: Object.keys(files).filter((path) => gate.scanRoot?.(path) ?? true).length,
        subjects: declaredSubjects(result.gates[0]?.scan.declared),
        toolErrors: sorted(result.toolErrors.map((error) => `${error.gate}/${error.phase}`)),
        thrown: undefined,
      };
    } catch (error) {
      return {
        findings: [],
        raw: [],
        granted: [],
        population: 0,
        subjects: [],
        toolErrors: [],
        thrown: error instanceof Error ? error.message : String(error),
      };
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  const finalReplay = (policies: readonly GatePolicy[], files: Files, shape: Label, grants: readonly ReviewedGateGrant[] = []): TmpdirReplay => {
    const { root, project } = materialize(files);
    const parser = new Project({ useInMemoryFileSystem: true });
    try {
      initRepository(root, true);
      const result = runPolicyPass({
        knownPolicies: [...policies],
        policies: [...policies],
        root,
        project,
        reviewedGrants: [...grants],
        failOnWarnings: false,
        resourceOptions: { overlay: { ...files }, parseSource: (path, text) => parser.createSourceFile(`${root}/${path}`, text, { overwrite: true }) },
      });
      const messageOf = new Map(policies.map((policy) => [policy.id, policy.message]));
      const describe = (finding: CoordinatedGateFinding): string =>
        shape({
          file: finding.file.startsWith(`${root}/`) ? finding.file.slice(root.length + 1) : finding.file,
          line: finding.line,
          token: finding.token,
          message: finding.message ?? messageOf.get(finding.policyId) ?? "",
          policyId: finding.policyId,
        });
      const subjects = new Set<string>();
      const population = new Set<string>();
      for (const owner of result.policies) {
        for (const path of owner.population.effectiveSourcePaths) {
          population.add(path);
        }
        for (const path of owner.population.effectiveResourcePaths) {
          subjects.add(path);
        }
      }
      return {
        findings: sorted(result.authority.effectiveFindings.map(describe)),
        raw: sorted(
          [
            ...result.authority.effectiveFindings,
            ...result.authority.waivedFindings.map(({ finding }) => finding),
            ...result.authority.grantedFindings.map(({ finding }) => finding),
          ].map(describe),
        ),
        granted: sorted(result.authority.grantedFindings.map(({ grantId }) => grantId)),
        population: population.size,
        subjects: sorted([...subjects]),
        toolErrors: sorted([
          ...result.toolErrors.map((error) => classifyToolError(error.policyId, error.phase, error.message)),
          ...result.factErrors.map((error) => classifyToolError(error.factId, error.phase, error.message)),
          ...result.authority.toolErrors.map((error) => classifyToolError(error.policyId ?? "authority", "authority", error.message)),
        ]),
        thrown: undefined,
      };
    } catch (error) {
      return {
        findings: [],
        raw: [],
        granted: [],
        population: 0,
        subjects: [],
        toolErrors: [],
        thrown: error instanceof Error ? error.message : String(error),
      };
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  const runScenarios = (legacy: GateDescriptor, policies: readonly GatePolicy[], fallback: string, scenarios: readonly TmpdirScenario[]): number => {
    const examples = legacyScenarios(legacy, fallback);
    expect(scenarios.length, "every legacy example is declared — a dropped row would otherwise be silent").toBe(examples.length);
    for (const [index, scenario] of scenarios.entries()) {
      const files = examples[index] as Files;
      const tag = `#${index} ${scenario.why}`;
      const before = legacyReplay(legacy, files, label);
      const after = finalReplay(policies, files, label, scenario.grants);
      expect(before.thrown, `${tag} — the LEGACY replay must not throw`).toBeUndefined();
      expect(before.findings, `${tag} — LEGACY findings`).toEqual(sorted(scenario.legacy));
      expect(before.population, `${tag} — LEGACY population`).toBe(scenario.legacyPopulation);
      expect(before.subjects, `${tag} — LEGACY subjects`).toEqual(sorted(scenario.legacySubjects));
      expect(before.toolErrors, `${tag} — LEGACY tool errors`).toEqual(sorted(scenario.legacyErrors ?? []));
      // THE SUBSTRATE PORT, MEASURED RATHER THAN ASSUMED: the shared root carries a populated git index
      // because the final side's tracked-file oracle needs one. This is the same legacy replay WITHOUT it.
      expect(legacyReplay(legacy, files, label, { index: false }).findings, `${tag} — the git INDEX is inert on the legacy side`).toEqual(before.findings);
      expect(
        [after.thrown === undefined, (after.thrown ?? "").includes(scenario.finalThrows ?? "")],
        `${tag} — FINAL refusal (${after.thrown ?? "no throw"})`,
      ).toEqual([scenario.finalThrows === undefined, true]);
      expect(after.findings, `${tag} — FINAL effective findings`).toEqual(sorted(scenario.final));
      expect(after.raw, `${tag} — FINAL raw findings (a PORT is declared with BOTH numbers)`).toEqual(sorted(scenario.finalRaw ?? scenario.final));
      expect(after.granted, `${tag} — FINAL consumed grants`).toEqual(sorted(scenario.granted ?? []));
      expect(after.population, `${tag} — FINAL population`).toBe(scenario.finalPopulation);
      expect(after.subjects, `${tag} — FINAL subjects`).toEqual(sorted(scenario.finalSubjects));
      expect(after.toolErrors, `${tag} — FINAL tool errors`).toEqual(sorted(scenario.finalErrors ?? []));
      expect(
        differentialViolations(scenario, before, after),
        `${tag} — the "${scenario.classification}" label and its successor proof must agree with the evidence`,
      ).toEqual([]);
    }
    return scenarios.length;
  };

  return { legacyReplay, finalReplay, runScenarios };
}

/** The pre-conversion descriptor for the REAL-TMPDIR door: no in-memory refusal, because the whole point of
 *  this door is the descriptor that reads disk. It refuses the OPPOSITE mistake instead — a descriptor with
 *  no filesystem reach at all belongs on `frozenLegacyGate`'s cheaper in-memory substrate, and routing it
 *  here spends a mkdtemp + `git init` per example to answer the identical question. */
export async function frozenFilesystemLegacyGate(scratch: string, base: string, legacyPath: string): Promise<GateDescriptor> {
  const { gate, source } = await loadFrozenGate(scratch, base, legacyPath);
  const reach = filesystemReach(source);
  if (reach.length === 0) {
    throw new Error(
      `${legacyPath} at ${base} reaches no filesystem spelling, so the real-tmpdir door is the wrong one — ` +
        "replay it through frozenLegacyGate's in-memory substrate (tests/support/legacy-differential.ts).",
    );
  }
  return gate;
}

/** Build the two replay engines and the scenario runner over ONE shared virtual workspace. `root` is the
 *  virtual root every fixture path is created under; give each differential file its own. */
export function createDifferential(root: string, classifyToolError: ClassifyToolError): Differential {
  const shared = new Project({ useInMemoryFileSystem: true });

  const removeSources = (): void => {
    for (const sourceFile of shared.getSourceFiles()) {
      shared.removeSourceFile(sourceFile);
    }
  };

  const projectOf = (files: Files): Project => {
    removeSources();
    for (const [path, source] of Object.entries(files).toSorted(([left], [right]) => left.localeCompare(right))) {
      shared.createSourceFile(`${root}/${path}`, source);
    }
    return shared;
  };

  const rel = (file: string): string => (file.startsWith(`${root}/`) ? file.slice(root.length + 1) : file);

  const legacyReplay = (gate: GateDescriptor, files: Files, shape: Label): Replay => {
    const project = projectOf(files);
    const result = runPass([gate], {
      root,
      project,
      scope: { kind: "project" },
      files: project.getSourceFiles(),
      checker: () => project.getTypeChecker(),
    });
    return {
      findings: sorted(
        (result.gates[0]?.findings ?? []).map((finding) =>
          shape({ file: rel(finding.file), line: finding.line, token: finding.token, message: finding.message ?? gate.message, policyId: undefined }),
        ),
      ),
      population: Object.keys(files).filter((path) => gate.scanRoot?.(path) ?? true).length,
      toolErrors: sorted(result.toolErrors.map((error) => `${error.gate}/${error.phase}`)),
    };
  };

  const finalPass = (policies: readonly GatePolicy[], files: Files): ReturnType<typeof runPolicyPass> => {
    const project = projectOf(files);
    return runPolicyPass({ knownPolicies: policies, policies: [...policies], root, project, reviewedGrants: [], failOnWarnings: false });
  };

  const finalReplay = (policies: readonly GatePolicy[], files: Files, shape: Label): Replay => {
    const result = finalPass(policies, files);
    const messageOf = new Map(policies.map((policy) => [policy.id, policy.message]));
    const population = new Set<string>();
    for (const owner of result.policies) {
      for (const path of owner.population.effectiveSourcePaths) {
        population.add(path);
      }
    }
    return {
      findings: sorted(
        result.authority.effectiveFindings.map((finding) =>
          shape({
            file: rel(finding.file),
            line: finding.line,
            token: finding.token,
            message: finding.message ?? messageOf.get(finding.policyId) ?? "",
            policyId: finding.policyId,
          }),
        ),
      ),
      population: population.size,
      toolErrors: sorted([
        ...result.toolErrors.map((error) => classifyToolError(error.policyId, error.phase, error.message)),
        ...result.factErrors.map((error) => classifyToolError(error.factId, error.phase, error.message)),
      ]),
    };
  };

  const runScenarios = (legacy: GateDescriptor, policies: readonly GatePolicy[], fallback: string, scenarios: readonly Scenario[]): number => {
    const examples = legacyScenarios(legacy, fallback);
    expect(scenarios.length, "every legacy example is declared — a dropped row would otherwise be silent").toBe(examples.length);
    for (const [index, scenario] of scenarios.entries()) {
      const files = examples[index] as Files;
      const tag = `#${index} ${scenario.why}`;
      const before = legacyReplay(legacy, files, label);
      const after = finalReplay(policies, files, label);
      expect(before.findings, `${tag} — LEGACY findings`).toEqual(sorted(scenario.legacy));
      expect(before.population, `${tag} — LEGACY population`).toBe(scenario.legacyPopulation);
      expect(before.toolErrors, `${tag} — LEGACY tool errors`).toEqual(sorted(scenario.legacyErrors ?? []));
      expect(after.findings, `${tag} — FINAL findings`).toEqual(sorted(scenario.final));
      expect(after.population, `${tag} — FINAL population`).toBe(scenario.finalPopulation);
      expect(after.toolErrors, `${tag} — FINAL tool errors`).toEqual(sorted(scenario.finalErrors ?? []));
      if (scenario.repair === undefined) {
        continue;
      }
      const twin = repairedFiles(files, scenario.repair);
      // THE INERTNESS CONTROL — the reason this is catch parity and not a table of numbers.
      expect(legacyReplay(legacy, twin, unlined).findings, `${tag} — the completion is INERT on the legacy side`).toEqual(
        legacyReplay(legacy, files, unlined).findings,
      );
      const twinAfter = finalReplay(policies, twin, label);
      expect(twinAfter.findings, `${tag} — TWIN final findings`).toEqual(sorted(scenario.twinFinal ?? []));
      expect(twinAfter.population, `${tag} — TWIN final population`).toBe(scenario.twinFinalPopulation);
      expect(twinAfter.toolErrors, `${tag} — TWIN final tool errors`).toEqual(sorted(scenario.twinFinalErrors ?? []));
    }
    return scenarios.length;
  };

  return { legacyReplay, finalReplay, finalPass, runScenarios };
}
