// The demo corpus + the shared principal/arg helpers. Content lives here (data), the write sequence lives
// in ops/ — so changing what the demo CONTAINS never touches the code that proves the write paths.
import type { Principal } from "@orb/contracts/identity";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

export const SECOND_HUMAN_HANDLE = "companion";
// A fixed dev pepper for invite/session token hashing against the THROWAWAY demo db (real env wins if set).
// Not a secret: the seeded db is disposable and never a launched deployment.
export const SEED_SESSION_SECRET = "orbweaver-demo-seed-session-secret-do-not-ship";
export const CHAT_SEED_SESSION_SECRET = "orbweaver-seed-chat-session-secret-do-not-ship";
export const SOLO_CHAT_TITLE = "Getting started with Assistant";
export const GROUP_CHAT_TITLE = "The refinery crew";
export const WORLD_BOOK_NAME = "Demo World — The Loom";
export const DEMO_DOCUMENT_NAME = "Loom lore (databank demo)";
export const DEMO_PRESET_NAME = "Demo balanced preset";
export const DEMO_TAG_NAME = "demo";

/** The flagship trio the group demo seats ("The Ashen Spire"). */
export const GROUP_CAST_HANDLES = ["sabine", "calamity", "morgatha"] as const;
export const GROUP_CAST_SIZE = GROUP_CAST_HANDLES.length;

// Regex scripts (#1725 boards 04/05 + the #1742 room Regex section) — one per tier so a fresh demo db can
// pixel-match every populated tier without a manual regen. Names carry their own tier hint so the seed log
// and the room's Regex section read the same story.
export const REGEX_FIND_REPLACE_SCRIPT_NAME = "Loom static cleanup";
export const REGEX_DISPLAY_ONLY_SCRIPT_NAME = "Trim host asterisks (display only)";
export const REGEX_PROMPT_ONLY_SCRIPT_NAME = "Redact the vault codeword (prompt only)";
export const REGEX_DISABLED_SCRIPT_NAME = "Legacy line-break fix (disabled)";

// Saved rosters (D61 B6) — one matching the demo group's seated trio, one a different pairing, so the
// rosters library shows more than a single row.
export const ROSTER_PRESET_MATCHING_NAME = "Refinery crew";
export const ROSTER_PRESET_ALT_NAME = "Assistant & Sabine";

// The pasted databank document — long enough to chunk into several pieces so `document_chunks` > 1.
export const DEMO_DOCUMENT_TEXT = [
  "The Loom is the great orbital engine at the heart of the settlement, a lattice of woven light that",
  "binds the drifting habitats into one turning wheel. Its keepers, the Weavers, tend the threads that",
  "carry water, heat, and memory between the rings. When a thread frays, a Weaver must climb the",
  "spokes and re-splice it by hand, singing the old counting songs that keep the tension true.",
  "",
  "Rev runs the card refinery on the third ring, where broken personas are melted down and re-cast.",
  "Mara audits every splice for drift, and Niko keeps the archive of songs no one else remembers.",
  "The Assistant speaks for the Loom itself, translating its slow machine-thoughts into human words.",
  "Together they hold the wheel against the long dark, one thread and one turn at a time.",
].join("\n");

export function principalOf(userId: UserId, handle: string, role: "owner" | "user"): Principal {
  return { userId, role, handle: castId<Handle>(handle), externalId: null, via: "fallback" };
}
