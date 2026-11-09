// `pnpm unwired removed-keys`: a deletion branch's removed contract keys that a sender outside the server still names.
// `z.object` strips an unknown key silently and an `as const` writer passes the compiler, so only a literal search finds them.
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

// `name: …`, `readonly name?: …` or `"name": …` at the start of a line: an interface member, a schema key or a literal key.
const KEY_LINE = /^\s*(?:readonly\s+)?["']?([A-Za-z_$][\w$]*)["']?\??\s*:/u;
const COMMENT_LINE = /^\s*(?:\/\/|\/?\*)/u;
const NOT_KEYS: ReadonlySet<string> = new Set(["case", "default"]);
// A key with no capital or underscore (`macro`, `minted`, `id`) is an English word: its hits are prose, class names
// and locals as often as senders, so they say nothing about one procedure.
const DISTINCT_KEY = /[A-Z_]/u;

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

function keysOf(lines: readonly string[]): Set<string> {
  const keys = new Set<string>();
  for (const line of lines.filter((candidate) => !COMMENT_LINE.test(candidate))) {
    const key = KEY_LINE.exec(line)?.[1];
    if (key !== undefined && !NOT_KEYS.has(key)) {
      keys.add(key);
    }
  }
  return keys;
}

// The keys removed lines declare that no added line declares again: a moved or reformatted key is still there.
function removedKeys(root: string, base: string, head: string): readonly string[] {
  const diff = execGit(root, ["diff", "--unified=0", "--no-renames", `${base}...${head}`, "--", ...CONTRACT_PATHS]).split("\n");
  const body = diff.filter((line) => !(line.startsWith("---") || line.startsWith("+++")));
  const removed = keysOf(body.filter((line) => line.startsWith("-")).map((line) => line.slice(1)));
  const added = keysOf(body.filter((line) => line.startsWith("+")).map((line) => line.slice(1)));
  return [...removed].filter((key) => !added.has(key)).sort();
}

const stillDeclared = (root: string, head: string, key: string): boolean =>
  gitGrep(root, head, ["-E", `^\\s*(readonly\\s+)?["']?${key}["']?\\??\\s*:`], CONTRACT_PATHS).length > 0;

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
