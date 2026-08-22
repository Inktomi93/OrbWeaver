// The heavy-fixture transcript builder + the two arg parsers — PURE, so the deterministic bytes are
// assertable without a database. DETERMINISM is the whole point: every line is numbered (`[#0000] …`) so a
// reviewer can assert ORDERING and offset math against the rendered list, and a re-run with the same args
// produces the SAME bytes, which the import-hash oracle then skips instead of duplicating.
import type { ChatArgs, DemoArgs } from "../contract/types.ts";

const DEFAULT_MESSAGES = 120;
const DEFAULT_CHARACTERS = 3;
const DEFAULT_TITLE = "Heavy transcript fixture";
/** The synthesized card handles — reused across runs (findByHandle before create), so the library never dupes. */
export const SEED_HANDLE_PREFIX = "seed-cast";
// Alternate user↔assistant every other row; zero-pad the line index to this width for stable sort/grep.
const ROLE_STRIDE = 2;
const SEQ_PAD = 4;
const NON_LEAF_CHARS = /[^\w-]+/gu;

export function parseDemoArgs(argv: readonly string[]): DemoArgs {
  return { fresh: argv.includes("--fresh"), force: argv.includes("--force") };
}

function numFlag(argv: readonly string[], flag: string, fallback: number): number {
  const i = argv.indexOf(flag);
  const raw = i === -1 ? undefined : argv[i + 1];
  const n = Number(raw ?? fallback);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function strFlag(argv: readonly string[], flag: string, fallback: string): string {
  const i = argv.indexOf(flag);
  const raw = i === -1 ? undefined : argv[i + 1];
  return raw !== undefined && !raw.startsWith("--") ? raw : fallback;
}

export function parseChatArgs(argv: readonly string[]): ChatArgs {
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
 *  numbered so a reviewer can assert ordering. Assistant lines round-robin the cast NAMES (group flavour). */
export function buildTranscript(args: { readonly title: string; readonly messageCount: number; readonly castNames: readonly string[] }): string {
  const { title, messageCount, castNames } = args;
  // The ST keys are a FOREIGN wire vocabulary (snake_case), spelled as array-literal pairs so the shape
  // stays verbatim without a naming-convention suppression.
  const header = Object.fromEntries([
    ["user_name", "You"],
    ["character_name", castNames[0] ?? "Cast 1"],
    ["create_date", sendDate(0)],
    ["chat_metadata", { seedTitle: title }],
  ]);
  const lines: string[] = [JSON.stringify(header)];
  for (let seq = 0; seq < messageCount; seq += 1) {
    const isUser = seq % ROLE_STRIDE === 0;
    const speaker = isUser ? "You" : (castNames[Math.floor(seq / ROLE_STRIDE) % Math.max(castNames.length, 1)] ?? "Cast 1");
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
