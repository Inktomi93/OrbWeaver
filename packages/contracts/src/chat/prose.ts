// @orb/contracts/chat — the APP-TIER chat prose slot table (PROSE-1 §4.1, census rows 74-81). The ONE home
// for the BYTES of every chat SIDE-generation prompt: the anchor-persona identity lead-in, the smart-arbiter
// director prompt, the compaction summarizer, and the memory digest/consolidation prompts. The server
// substrate reads these through `resolveProse` — it authors none of them.
//
// HOME = per-USER, resolved against the ROOM HOST (owner ruling on PROSE-1 owner-decision 8, option (a)):
// these are ROOM-level side generations, so a chat's memory corpus and its director stay internally
// consistent no matter which member spoke. The threading seam is `ChatContext.resolveChatProse(chatId)`,
// which resolves the present host exactly as `resolveChatPresetParams` does (`resolveChatHostUserId` →
// `loadUserSettings(host).prose`); a hostless/stale room degrades to `{}` ⇒ the shipped defaults.
//
// MACRO MODE = "none" for every row (PROSE-1 §6.1): a summarizer / arbiter / digest prompt runs over a
// TRANSCRIPT, not a character context — there is no `{{char}}` binding at these seams, so a `{{…}}` in an
// override ships verbatim rather than silently rendering empty.
//
// The `chat.group.*` / `chat.injection.*` rows carry ONE caller-supplied PRE-SUBSTITUTION token each
// (`{{name}}` = the roster member / speaker this frame is about; `{{note}}` = the injection's own content).
// Still `macros:"none"`: the token is spliced by `resolveProseText`'s `tokens` argument as a plain string
// replace — the `{{person}}`/`{{base}}` guided precedent — never through the macro engine, because these
// frames are composed AROUND already-macro-resolved text and re-running the engine would resolve it twice.
// The token is listed in `requiredMacros` so the editor warns a host who deletes it (dropping `{{name}}`
// makes every co-speaker heading read the same; dropping `{{note}}` drops the injection's whole payload).
//
// The slot SHAPE comes from `#prose-slot`, never `#prose`: `#prose` imports this table at runtime to compose
// `PROSE_SLOTS`, so importing it here — even for a type — would close a `no-circular` cycle.

import type { ProseSlotDef, ProseSlotId } from "#prose-slot";

/** The tier-0 digest system prompt's three-part contract, authored line-by-line and joined — the shape it has
 *  always had, so the composed bytes are identical to the pre-PROSE-1 constant. */
const DIGEST_SYSTEM_TEXT = [
  "You distill a block of roleplay transcript into a retrieval-optimized memory unit.",
  "Output EXACTLY three parts, in order:",
  "1. A topic anchor as the MANDATORY first line, in the form: [entities — scene]",
  "2. Significance-filtered facts — only what will plausibly matter later; drop turn-by-turn small talk.",
  '3. A final line beginning "keywords:" followed by 15-30 concrete, distinctive keywords',
  "   (named entities, places, objects, specifics), comma-separated.",
  "Do not add any commentary, preamble, or markdown headers.",
].join("\n");

/** The tier-(k+1) consolidation system prompt — the "synthesize, do not concatenate" delta framing. */
const CONSOLIDATION_SYSTEM_TEXT = [
  "You consolidate several memory digests from EARLIER in a story into ONE higher-level digest",
  "capturing the overall arc across them.",
  "Use the SAME three-part format: a [entities — scene] topic-anchor first line, significance-filtered",
  'facts, and a final "keywords:" line of 15-30 keywords.',
  "The prior digests are provided so you do NOT repeat each verbatim — SYNTHESIZE the arc, do not concatenate.",
].join("\n");

export const CHAT_PROSE_SLOTS = {
  "chat.assembly.anchorIdentity": {
    id: "chat.assembly.anchorIdentity",
    home: "user",
    version: 1,
    // Composed as `[<text> <anchor name>: <description>]` — the brackets, the name and the description are
    // the injection's GRAMMAR (§2.11) and stay in the assembler; only the lead-in clause is the voice.
    text: "The person the character knows as the user is",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Anchor-persona identity lead-in",
    fires: "Card context, on a turn where the speaking persona differs from the chat's anchor persona.",
  },
  "chat.arbiter.system": {
    id: "chat.arbiter.system",
    home: "user",
    version: 1,
    text:
      "You are a turn director for a multi-character roleplay. Read the recent conversation and the list of " +
      "characters who may speak next, then choose the single character who should speak next. Respond with " +
      "ONLY that character's exact name from the list — no punctuation, no explanation.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Turn-director prompt",
    fires: "Every group round under the `smart` speaker policy, on the summarize rail.",
  },
  "chat.compaction.system": {
    id: "chat.compaction.system",
    home: "user",
    version: 1,
    text:
      "You are a precise conversation summarizer. Produce a faithful, compact summary of the roleplay so far " +
      "that preserves the key facts, character states, decisions, locations, and unresolved threads. Do not " +
      "invent details and do not add commentary — output only the summary.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Compaction summarizer",
    fires: "Each compaction pass — the chat's own model rebuilding the portable summary marker.",
  },
  "chat.memory.digestSystem": {
    id: "chat.memory.digestSystem",
    home: "user",
    version: 1,
    text: DIGEST_SYSTEM_TEXT,
    macros: "none",
    requiredMacros: [],
    // The retrieval unit's PARSE contract (`memory/build/substrate/parse`): the topic-anchor brackets and the
    // `keywords:` line are what the parser keys on. An override that drops either still stores — it just
    // stores an anchorless, keywordless digest — so this is a warn, exactly like every other required token.
    requiredTokens: ["[entities — scene]", "keywords:"],
    title: "Memory digest prompt",
    fires: "Every aged-out transcript block the memory build distills into a tier-0 digest.",
  },
  "chat.memory.consolidationSystem": {
    id: "chat.memory.consolidationSystem",
    home: "user",
    version: 1,
    text: CONSOLIDATION_SYSTEM_TEXT,
    macros: "none",
    requiredMacros: [],
    requiredTokens: ["[entities — scene]", "keywords:"],
    title: "Memory consolidation prompt",
    fires: "Each upward consolidation pass, folding a fan-out of digests into one higher-tier digest.",
  },
  "chat.memory.consolidationLead": {
    id: "chat.memory.consolidationLead",
    home: "user",
    version: 1,
    // The user-prompt LEAD only. The numbered child facets that follow it are data the builder appends —
    // they are not authorable, and homing them here would need §4.5's template machinery (S4).
    text: "Prior digests to consolidate (synthesize the arc across these — do not repeat each):",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Memory consolidation lead-in",
    fires: "Heads the consolidation user prompt, above the numbered child digests.",
  },
  "chat.group.alsoPresent": {
    id: "chat.group.alsoPresent",
    home: "user",
    version: 1,
    // The co-speaker card block's opening frame. The member's rendered description/personality follows on
    // the next line — that half is card data, never authorable here.
    text: "[Also present — {{name}}]",
    macros: "none",
    requiredMacros: ["{{name}}"],
    requiredTokens: [],
    title: "Merged co-speaker heading",
    fires: 'A `cardScope:"merged"` group turn, once per other present roster member.',
  },
  "chat.group.scenarioHeading": {
    id: "chat.group.scenarioHeading",
    home: "user",
    version: 1,
    text: "[{{name}}'s scenario]",
    macros: "none",
    requiredMacros: ["{{name}}"],
    requiredTokens: [],
    title: "Merged co-speaker scenario heading",
    fires: "A merged group turn, for each present member whose card carries a scenario.",
  },
  "chat.group.exampleHeading": {
    id: "chat.group.exampleHeading",
    home: "user",
    version: 1,
    text: "[{{name}}'s example dialogue]",
    macros: "none",
    requiredMacros: ["{{name}}"],
    requiredTokens: [],
    title: "Merged co-speaker example-dialogue heading",
    fires: "A merged group turn, for each present member whose card carries example dialogue.",
  },
  "chat.group.roundNudge": {
    id: "chat.group.roundNudge",
    home: "user",
    version: 1,
    // The per-speaker fence on a MULTI-speaker round — the one line that stops the model voicing the whole
    // cast in one reply. Delivered as the round's trailing user row.
    text: "[Write the next reply only as {{name}}.]",
    macros: "none",
    requiredMacros: ["{{name}}"],
    requiredTokens: [],
    title: "Group round speaker nudge",
    fires: "Every speaker of a MULTI-speaker group round (a solo/one-speaker round sends no nudge).",
  },
  "chat.injection.systemNote": {
    id: "chat.injection.systemNote",
    home: "user",
    version: 1,
    // A system-authority injection the resolved model cannot take as a real system row demotes to a USER
    // row wearing this frame — the framing IS the demotion's honesty (the reader sees it is a system note).
    text: "[Note from system: {{note}}]",
    macros: "none",
    requiredMacros: ["{{note}}"],
    requiredTokens: [],
    title: "Demoted system-note frame",
    fires: "Any system-role injection the model can't deliver as a real system row (the TURNS_FLOOR default).",
  },
  "chat.injection.userNote": {
    id: "chat.injection.userNote",
    home: "user",
    version: 1,
    // A user-role injection is the OPERATOR speaking through the user channel, not an in-character turn —
    // the frame is what keeps the model from reading it as dialogue.
    text: "[Note from user: {{note}}]",
    macros: "none",
    requiredMacros: ["{{note}}"],
    requiredTokens: [],
    title: "User-note frame",
    fires: "Every user-role injection — author's note, host steering, a prefix-adjacent re-framed injection.",
  },
} as const satisfies Partial<Record<ProseSlotId, ProseSlotDef>>;
