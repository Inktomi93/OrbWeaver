// `pnpm unwired removed-keys`: a deletion branch's removed contract keys that a sender outside the server still names.
// `z.object` strips an unknown key silently and an `as const` writer passes the compiler, so only a literal search finds them.
import ts from "typescript";
import { execGit } from "../floor/git/git.ts";
import { gitGrep } from "./literal-hits.ts";

/** Where a removed key is declared: the contracts and the server's transport. */
const CONTRACT_PATHS = ["packages/contracts/src", "packages/server/src/transport"] as const;

const RECEIVERS = ["client", "plugins", "e2e"] as const;
/** The senders a stripped key fails silently in. */
type Receiver = (typeof RECEIVERS)[number];

const RECEIVER_PATHS: Readonly<Record<Receiver, readonly string[]>> = {
  client: ["packages/client"],
  plugins: ["packages/showcase-plugins", "packages/plugin-sdk", "packages/plugin-toolchain"],
  e2e: ["tests/e2e"],
};

const COMMENT_LINE = /^\s*(?:\/\/|\/?\*)/u;
// A key with no capital or underscore (`macro`, `minted`, `id`) is an English word: its hits are prose, class names
// and locals as often as senders, so they say nothing about one procedure.
const DISTINCT_KEY = /[A-Z_]/u;
const PARSED = /\.[cm]?tsx?$/u;
// `git cat-file --batch` prints each blob after this mark and its request, so the split needs no byte counts.
const BLOB_MARK = /^@@B (\S+)$/mu;
const BLOB_FORMAT = "--batch=@@B %(rest)";
// Every contract file of a wide deletion fits one batch read.
const BLOB_BUFFER = 268_435_456;

/** One key the branch removes, the receivers that still name it, and whether the contracts still declare the name. */
interface RemovedKey {
  readonly key: string;
  /** The name is a plain word, or another contract declaration still uses it, so a hit may not be this key's: a person reads the procedure. */
  readonly ambiguous: boolean;
  readonly hits: readonly { readonly receiver: Receiver; readonly at: string; readonly text: string }[];
}

/** What the check found between `base` and `head`. */
export interface RemovedKeysReport {
  readonly base: string;
  readonly head: string;
  /** Files searched in each receiver at `head`. */
  readonly scanned: Readonly<Record<Receiver, number>>;
  readonly removed: readonly RemovedKey[];
  /** True when an unambiguous removed key still has a hit. */
  readonly failed: boolean;
}

// How many times a file declares each key: an interface or type member, a schema or literal key, a shorthand. The parser
// sees a key wherever it sits, a one-line `z.object({ a: … })` included.
function declaredKeys(file: string, text: string, into: Map<string, number>): void {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false);
  const visit = (node: ts.Node): void => {
    const named = ts.isPropertySignature(node) || ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node) ? node.name : undefined;
    if (named !== undefined && (ts.isIdentifier(named) || ts.isStringLiteral(named))) {
      into.set(named.text, (into.get(named.text) ?? 0) + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

// Each file's text at `rev`, one batch read. A file the rev lacks (added or deleted on the branch) declares nothing, and
// is left out of the request because `cat-file` answers it with an unmarked `missing` line.
function blobsAt(root: string, rev: string, files: readonly string[]): ReadonlyMap<string, string> {
  if (files.length === 0) {
    return new Map();
  }
  const present = execGit(root, ["ls-tree", "-r", "--name-only", rev, "--", ...files])
    .split("\n")
    .filter(Boolean);
  const input = present.map((file) => `${rev}:${file} ${file}\n`).join("");
  const parts = execGit(root, ["cat-file", BLOB_FORMAT], { input, maxBuffer: BLOB_BUFFER }).split(BLOB_MARK);
  const found = new Map<string, string>();
  for (let at = 1; at < parts.length; at += 2) {
    found.set(parts[at] ?? "", parts[at + 1] ?? "");
  }
  return found;
}

function keyCounts(root: string, rev: string, files: readonly string[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const [file, text] of blobsAt(root, rev, files)) {
    declaredKeys(file, text, counts);
  }
  return counts;
}

// The keys the changed contract files declare fewer times at `head` than at the merge base: a moved or reformatted key
// is still there, and a second declaration of a removed name leaves it removed and listed as still declared.
function removedKeys(root: string, base: string, head: string): readonly string[] {
  const files = execGit(root, ["diff", "--name-only", "--no-renames", `${base}...${head}`, "--", ...CONTRACT_PATHS])
    .split("\n")
    .filter((file) => PARSED.test(file));
  const fork = execGit(root, ["merge-base", base, head]).trim();
  const before = keyCounts(root, fork, files);
  const after = keyCounts(root, head, files);
  return [...before]
    .filter(([key, count]) => (after.get(key) ?? 0) < count)
    .map(([key]) => key)
    .sort();
}

// Whether a contract file at `head` still declares the key: the grep finds candidate files, the parser decides.
function stillDeclared(root: string, head: string, key: string): boolean {
  const files = [...new Set(gitGrep(root, head, ["-w", "-F", key], CONTRACT_PATHS).map((hit) => hit.file))].filter((file) => PARSED.test(file));
  return (keyCounts(root, head, files).get(key) ?? 0) > 0;
}

/** Compare `head` with its merge base against `base` and search every receiver at `head` for each removed key. */
export function checkRemovedKeys(root: string, base: string, head: string): RemovedKeysReport {
  const scanned = Object.fromEntries(
    RECEIVERS.map((receiver) => [
      receiver,
      execGit(root, ["ls-tree", "-r", "--name-only", head, "--", ...RECEIVER_PATHS[receiver]])
        .split("\n")
        .filter(Boolean).length,
    ]),
  ) as Record<Receiver, number>;
  const removed = removedKeys(root, base, head).map((key): RemovedKey => {
    const hits = RECEIVERS.flatMap((receiver) =>
      gitGrep(root, head, ["-w", "-F", key], RECEIVER_PATHS[receiver]).flatMap(({ file, line, text }) =>
        COMMENT_LINE.test(text) ? [] : [{ receiver, at: `${file}:${String(line)}`, text: text.trim() }],
      ),
    );
    return { key, ambiguous: !DISTINCT_KEY.test(key) || stillDeclared(root, head, key), hits };
  });
  return { base, head, scanned, removed, failed: removed.some((entry) => !entry.ambiguous && entry.hits.length > 0) };
}
