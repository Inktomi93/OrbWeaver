// The heavy-fixture transcript builder + the two arg parsers — PURE, so the deterministic bytes are
// assertable without a database. DETERMINISM is the whole point: every line is numbered (`[#0000] …`) so a
// reviewer can assert ORDERING and offset math against the rendered list, and a re-run with the same args
// produces the SAME bytes, which the import-hash oracle then skips instead of duplicating.
import { UsageError } from "../../_shared/run-tool.ts";
import type { ChatArgs, DemoArgs } from "../contract/types.ts";

const DEFAULT_MESSAGES = 120;
const DEFAULT_CHARACTERS = 3;
const DEFAULT_TITLE = "Heavy transcript fixture";
/** The synthesized card handles — reused across runs (findByHandle before create), so the library never dupes. */
export const SEED_HANDLE_PREFIX = "seed-character";
// Alternate user↔assistant every other row; zero-pad the line index to this width for stable sort/grep.
const ROLE_STRIDE = 2;
const SEQ_PAD = 4;
const NON_LEAF_CHARS = /[^\w-]+/gu;

/** Both parsers REFUSE what they do not recognise (#971). They used to be `includes`/`indexOf` bags: a
 *  typo'd `--frsh` seeded ON TOP of the existing db instead of wiping it, and `--messages abc` silently
 *  built the 120-row default — a seeder answering a request nobody made, with no signal. A flag value is
 *  never itself a `-` token (both readers below refuse one), so every `-` token is a flag POSITION. */
function refuseUnknownFlags(argv: readonly string[], allowed: readonly string[], verb: string): void {
  const unknown = argv.find((token) => token.startsWith("-") && !allowed.includes(token));
  if (unknown !== undefined) {
    throw new UsageError(`seed ${verb} does not recognize ${unknown} — flags: ${allowed.join(" ")}`);
  }
}

const DEMO_FLAGS: readonly string[] = ["--fresh", "--force"];
const CHAT_FLAGS: readonly string[] = ["--messages", "--characters", "--title", "--force"];

export function parseDemoArgs(argv: readonly string[]): DemoArgs {
  refuseUnknownFlags(argv, DEMO_FLAGS, "demo");
  const positional = argv.find((token) => !token.startsWith("-"));
  if (positional !== undefined) {
    throw new UsageError(`seed demo takes no positional argument — got ${JSON.stringify(positional)}`);
  }
  return { fresh: argv.includes("--fresh"), force: argv.includes("--force") };
}

/** A present flag with a missing or non-positive value is MISUSE, never the default: silently seeding the
 *  120-row default for a caller who asked for 5000 is the wrong fixture behind a clean exit. */
function numFlag(argv: readonly string[], flag: string, fallback: number): number {
  const i = argv.indexOf(flag);
  if (i === -1) {
    return fallback;
  }
  const raw = argv[i + 1];
  const n = Number(raw);
  if (raw === undefined || raw.startsWith("-") || !Number.isFinite(n) || n <= 0) {
    throw new UsageError(`${flag} takes a positive number — got ${JSON.stringify(raw ?? "(nothing)")}`);
  }
  return Math.floor(n);
}

function strFlag(argv: readonly string[], flag: string, fallback: string): string {
  const i = argv.indexOf(flag);
  if (i === -1) {
    return fallback;
  }
  const raw = argv[i + 1];
  if (raw === undefined || raw.startsWith("-") || raw.trim() === "") {
    throw new UsageError(`${flag} requires a value`);
  }
  return raw;
}

export function parseChatArgs(argv: readonly string[]): ChatArgs {
  refuseUnknownFlags(argv, CHAT_FLAGS, "chat");
  return {
    messages: numFlag(argv, "--messages", DEFAULT_MESSAGES),
    characters: numFlag(argv, "--characters", DEFAULT_CHARACTERS),
    title: strFlag(argv, "--title", DEFAULT_TITLE),
    force: argv.includes("--force"),
  };
}

/** ST send_date human string (the parser accepts any string; a stable synthetic keeps re-runs byte-identical). */
function sendDate(seq: number): string {
  return `seed message ${String(seq).padStart(SEQ_PAD, "0")}`;
}

/** Build a deterministic ST `.jsonl` transcript: header line + N alternating user/assistant messages, each
 *  numbered so a reviewer can assert ordering. Assistant lines round-robin the character NAMES (group flavour). */
export function buildTranscript(args: { readonly title: string; readonly messageCount: number; readonly characterNames: readonly string[] }): string {
  const { title, messageCount, characterNames } = args;
  // The ST keys are a FOREIGN wire vocabulary (snake_case), spelled as array-literal pairs so the shape
  // stays verbatim without a naming-convention suppression.
  const header = Object.fromEntries([
    ["user_name", "You"],
    ["character_name", characterNames[0] ?? "Character 1"],
    ["create_date", sendDate(0)],
    ["chat_metadata", { seedTitle: title }],
  ]);
  const lines: string[] = [JSON.stringify(header)];
  for (let seq = 0; seq < messageCount; seq += 1) {
    const isUser = seq % ROLE_STRIDE === 0;
    const speaker = isUser ? "You" : (characterNames[Math.floor(seq / ROLE_STRIDE) % Math.max(characterNames.length, 1)] ?? "Character 1");
    const label = `[#${String(seq).padStart(SEQ_PAD, "0")}]`;
    const mes = isUser ? `${label} user line ${seq} — asking about item ${seq}.` : `${label} ${speaker} replies to line ${seq}.`;
    lines.push(
      JSON.stringify(
        Object.fromEntries([
          ["name", speaker],
          ["is_user", isUser],
          ["is_system", false],
          ["mes", mes],
          ["send_date", sendDate(seq + 1)],
        ]),
      ),
    );
  }
  return `${lines.join("\n")}\n`;
}

/** `<primary handle>/<title>.jsonl` — the import path derives `importedFrom` from this, so it is both the
 *  idempotency key and how the seeded chat is found again. */
export function transcriptFilename(primaryHandle: string, title: string): string {
  return `${primaryHandle}/${title.replace(NON_LEAF_CHARS, "-")}.jsonl`;
}
