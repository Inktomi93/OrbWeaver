// @orb/contracts/automation — the automation prose slot table (PROSE-1 §4.1, census row 91). One census row,
// TWO slots: the `set_chat_background` (BG-F) quiet pick composes a lead INSTRUCTION and a trailing REPLY
// CONTRACT around three interpolated blocks (the capped scene, the candidate names, the rendered guidance).
// Those three are the prompt's grammar + its data — the two authored clauses are its voice, and they sit at
// clean, substitution-free positions, so each is a first-class `text` slot with no §4.5 template machinery.
//
// HOME = per-USER, resolved against the ROOM HOST (owner ruling on PROSE-1 owner-decision 8, option (a)) —
// the arm fires on a room's turn, so it reads the same host prose the room's other side generations do.
// MACRO MODE = "none": the pick runs over a transcript excerpt, not a character context.
//
// The slot SHAPE comes from `#prose-slot`, never `#prose` (a `#prose` import here closes a `no-circular`
// cycle — `#prose` imports this table to compose `PROSE_SLOTS`).

import type { ProseSlotDef, ProseSlotId } from "#prose-slot";

export const AUTOMATION_PROSE_SLOTS = {
  "automation.autobg.task": {
    id: "automation.autobg.task",
    home: "user",
    version: 1,
    text: "Choose the single background that best fits the current scene.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Background pick — task",
    fires: "Heads the `/autobg` quiet pick, above the scene excerpt and the candidate names.",
  },
  "automation.autobg.reply": {
    id: "automation.autobg.reply",
    home: "user",
    version: 1,
    // The reply contract is what makes the returned text MATCHABLE against a candidate name. A host who
    // loosens it gets a chattier reply the name-match may miss — the arm then no-ops, never guesses.
    text: "Reply with ONLY the exact name of the chosen background, nothing else.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Background pick — reply contract",
    fires: "Closes the `/autobg` quiet pick — the contract the name-match depends on.",
  },
} as const satisfies Partial<Record<ProseSlotId, ProseSlotDef>>;
