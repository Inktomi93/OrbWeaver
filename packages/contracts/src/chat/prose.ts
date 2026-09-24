// @orb/contracts/chat — the APP-TIER chat prose slot table (PROSE-1 §4.1, census rows 74-81). The ONE home
// for the BYTES of every chat SIDE-generation prompt: the anchor-persona identity lead-in, the smart-arbiter
// prompt, the compaction summarizer, and the memory digest/consolidation prompts. The server
// substrate reads these through `resolveProse` — it authors none of them.
//
// HOME — TWO of them, and the split is the point (the table is one home for the BYTES; `home` names the
// STORAGE per row, PROSE-1 §3.1):
//
//   • per-USER, resolved against the ROOM HOST (owner ruling on PROSE-1 owner-decision 8, option (a)): the
//     SIDE-GENERATION prompts — arbiter, compaction, memory digest/consolidation, the recovery ask, the
//     anchor identity lead-in. These are ROOM-level generations that resolve where NO preset is in scope, so a
//     chat's memory corpus and its arbiter stay internally consistent no matter which member spoke. Threading
//     seam: `ChatContext.resolveChatProse(chatId)`, which resolves the present host exactly as
//     `resolveChatPresetParams` does (`resolveChatHostUserId` → `loadUserSettings(host).prose`); a
//     hostless/stale room degrades to `{}` ⇒ the shipped defaults.
//   • per-PRESET (owner ruling 2026-08-07, verbatim: "templates need to have one home in presets not
//     scattered between that and settings or hiding in code"): the TURN-WIRE FRAMINGS — the two injection note
//     frames, the continuation cue, and (F4 re-home, 2026-08-08, ruling arm (a) + D132(B) amendment) the
//     GROUP-ROOM FRAMINGS: the co-speaker headings (`characterHeading`/
//     `scenarioHeading`/`exampleHeading`), the person heading (`personaHeading`), the per-speaker and narrator
//     round nudges (`roundNudge`/`narratorNudge`), and the speaker-tag instruction (`speakerTags`). Storage `promptConfig.prose`; authored
//     in the preset Templates tab beside every other template. Decision 8 is NOT reversed by this: it answers
//     "WHICH user when a slot is user-homed", and these framings are not side generations at all — they are
//     wrappers spliced into the MAIN turn's prompt (the co-speaker card walk, the round's trailing user row),
//     where the resolved preset IS in scope, so §3.2's per-USER rationale ("a property of how YOU run the app,
//     not of one preset") never covered them. D132(B)'s own test — "does this text resolve where a preset is in
//     scope?" — answers YES here, which is exactly why the F4 review found the old user-home enumeration
//     self-contradictory. Threading seam: `composeProse` at `assembly/context`, which merges the host's user
//     blob with the resolved preset's blob FILTERED BY HOME, so a slot still resolves from exactly one storage
//     and the no-cascade law holds.
//
// NO DATA MIGRATION for the re-homed frames (pre-launch NO-LEGACY): a `UserSettings.prose` override written
// against the two injection frames (before 2026-08-07) or the seven group framings (before the F4 re-home)
// stops applying — D132(D) leaves the stale user-blob key inert — and is re-entered in the preset Templates tab.
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
    version: 2,
    // v2 is a VOCABULARY fix, not a behavior change: the default text called the model a "turn director"
    // while every control, id and symbol around it says ARBITER (`chat.arbiter.system`, `ArbiterCandidate`,
    // `smartArbitrate`, the slot's own "Turn-arbiter prompt" title). Model-facing bytes are still bytes, so
    // the change rides the lawful re-version path (D132(A)/§4.4) rather than a silent edit that would strand
    // every host's `baseVersion` stamp.
    text:
      "You are a turn arbiter for a multi-character roleplay. Read the recent conversation and the list of " +
      "characters who may speak next, then choose the single character who should speak next. Respond with " +
      "ONLY that character's exact name from the list — no punctuation, no explanation.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Turn-arbiter prompt",
    // Editor copy is read as PLAIN TEXT (no markdown pass), so it carries no backticks and no internal
    // nouns — the room's own control label and the model-role slot name instead of "`smart` policy" / "rail".
    fires: 'Every group round while the room\'s speaker order is "Smart (side-LLM)" — the pick runs on the Summarize model.',
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
    // The retrieval unit's PARSE contract (`memory/generate/substrate/parse`): the topic-anchor brackets and the
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
  "chat.group.characterHeading": {
    id: "chat.group.characterHeading",
    home: "preset",
    version: 2,
    // The heading over every roster member's card beside the primary, on both roster layouts: a narrator round
    // and a per-speaker merged turn. The merged turn's `[Also present — X]` frame is retired (owner ruling): its
    // system block is now the same roster for every speaker, so no card is framed as a bystander, and the round
    // cue names who speaks.
    //
    // v2 is a VOCABULARY fix on the `chat.arbiter.system` v2 / `chat.group.speakerTags` v2 precedent, not a
    // behavior change: #901 Fork 1 retired "cast" for the room's seated characters, and this heading spent it.
    // Owner-ruled 2026-08-30 to a direct swap ("[Character — {{name}}]") rather than dropping the label — the
    // explicit "this block is a character" signal is what weaker local models lean on. Model-facing bytes are
    // still bytes, so it rides the lawful re-version path (D132(A)/§4.4); a silent edit would strand every
    // host's `baseVersion` stamp.
    //
    // THE ID ITSELF WAS `chat.group.castMember` UNTIL 2026-09-05 (#1737, owner-ruled arm (a)). The 2026-08-30
    // ruling above SURVIVES — its INPUT changed: the warning it records is about a SILENT id edit, and this one
    // is not silent. `migrateProseSlotVocab` (`domain/preset/persistence/migrate-prose-slot-vocab.ts`, run as a
    // boot step) re-keys every stored `promptConfig.prose` override onto the new id CARRYING its `baseVersion`
    // stamp, so no host's staleness signal is stranded and `version` stays 2 (the TEXT did not change). The id
    // was the last `cast` spelling left in `contracts/src/chat` — the `alsoPresent` twin, the `title` and the
    // preset Templates `label` had all said "character" since v2, and only the persisted key disagreed.
    //
    // WHY `characterHeading` AND NOT `…Member`: `docs/law/vocabulary-map.md` gives `character` for the concept this
    // slot names (the seated characters the arbiter may drive) and gives **Member** to the HUMANS in a room
    // (`chat_participants.kind='human'`) — so a `Member` suffix on a character-only slot would swap one
    // crossed word for another. `Heading` is not a concept word at all; it is the suffix this slot's own group
    // siblings already carry (`chat.group.scenarioHeading` / `chat.group.exampleHeading`). Nothing minted.
    text: "[Character — {{name}}]",
    macros: "none",
    requiredMacros: ["{{name}}"],
    requiredTokens: [],
    title: "Character heading",
    fires: "A narrator round or a per-speaker merged turn, once per character whose card rides beside the primary.",
  },
  "chat.group.scenarioHeading": {
    id: "chat.group.scenarioHeading",
    home: "preset",
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
    home: "preset",
    version: 1,
    text: "[{{name}}'s example dialogue]",
    macros: "none",
    requiredMacros: ["{{name}}"],
    requiredTokens: [],
    title: "Merged co-speaker example-dialogue heading",
    fires: "A merged group turn, for each present member whose card carries example dialogue.",
  },
  "chat.group.personaHeading": {
    id: "chat.group.personaHeading",
    home: "preset",
    version: 1,
    // The heading over each OTHER present human's persona in the `persona` marker's people block. The voice
    // persona (the one `{{user}}` names) stays unheaded and first, so position alone marks the addressee.
    text: "[Person — {{name}}]",
    macros: "none",
    requiredMacros: ["{{name}}"],
    requiredTokens: [],
    title: "Person heading",
    fires: "A room with more than one present human, once per other human whose seat holds a persona.",
  },
  "chat.group.roundNudge": {
    id: "chat.group.roundNudge",
    home: "preset",
    version: 2,
    // The per-speaker fence on a MULTI-speaker round — the one line that stops the model voicing all the seated
    // characters in one reply. Delivered as the round's trailing user row.
    // v2 spells out the two failure modes the RECEIVE side otherwise has to clean up after
    // (`cleanPerSpeakerReply`): the echoed `Name:` self-label, and drifting on into another character's
    // lines. Saying them here is cheaper than repairing them, and a small local model needs them said.
    text:
      "[Write the next reply only as {{name}}. Stay in {{name}}'s voice — their dialogue, actions and " +
      "thoughts only. Do not write lines for the other characters or for the user, and do not open the " +
      "reply with a name label.]",
    macros: "none",
    requiredMacros: ["{{name}}"],
    requiredTokens: [],
    title: "Group round speaker nudge",
    fires: "Every speaker of a MULTI-speaker group round, and any other turn whose system prompt does not name the speaking character.",
  },
  "chat.group.narratorNudge": {
    id: "chat.group.narratorNudge",
    home: "preset",
    version: 1,
    // The NARRATOR twin of `roundNudge`. A narrator round is ONE generation voicing all the seated characters, so the
    // per-speaker fence would be exactly wrong here — this line names the seated characters instead. Delivered as the
    // round's trailing user row, joined with the speaker-tag instruction below when both toggles are on.
    text:
      "[Continue the scene, voicing the present characters ({{names}}) as the moment calls for. This is ONE " +
      "reply covering the whole scene — voice as many or as few of them as it needs, in any order, with " +
      "narration in between. Never write lines or actions for the user.]",
    macros: "none",
    requiredMacros: ["{{names}}"],
    requiredTokens: [],
    title: "Narrator round nudge",
    fires: "Every MULTI-member narrator round with the group nudge on (a one-character round sends no nudge).",
  },
  "chat.group.speakerTags": {
    id: "chat.group.speakerTags",
    home: "preset",
    version: 2,
    // v2 is a VOCABULARY fix on the `chat.arbiter.system` v2 precedent, not a behavior change: the default
    // said "as it is spelled in the cast" and #901 Fork 1 retired "cast" for the room's seated characters.
    // Owner-ruled 2026-08-30 to read "in the room" rather than "in the character list" — the string is read
    // by a MODEL, never shown as chrome, so it owes unambiguity, not agreement with a UI label. Model-facing
    // bytes are still bytes, so it rides the lawful re-version path (D132(A)/§4.4) instead of a silent edit
    // that would strand every host's `baseVersion` stamp.
    // The PRODUCE half of per-speaker color in a merged bubble: the renderer splits a narrator body on
    // `<speaker>NAME</speaker>` markers and tints each span with that character's theme, so the markers
    // have to be ASKED FOR. The `<speaker>`/`</speaker>` literals are the renderer's parse contract, hence
    // requiredTokens — an override that drops them silently costs the room its per-speaker coloring
    // (the display side still tolerates the plain `Name:` form models emit unprompted; this slot is what
    // makes the exact, unambiguous form available). Host-facing name for the toggle: "Label each speaker".
    text:
      "[Wrap each character's spoken lines and actions in <speaker>Name</speaker> tags: put the character's " +
      "exact name between the tags, then what they say and do. Open a new tag every time the speaker " +
      "changes. Use the name exactly as it is spelled in the room — never a nickname, a pronoun or a title. " +
      "Leave narration, scene description and anything not attributable to one character OUTSIDE the tags. " +
      "Never write lines for the user.]",
    macros: "none",
    requiredMacros: [],
    requiredTokens: ["<speaker>", "</speaker>"],
    title: "Narrator speaker-tag instruction",
    fires: 'Every MULTI-member narrator round with "Label each speaker" on (`GroupConfig.speakerTags`, on by default in narrator mode).',
  },
  "chat.injection.userNote": {
    id: "chat.injection.userNote",
    home: "preset",
    version: 1,
    // A user-role injection is the OPERATOR speaking through the user channel, not an in-character turn —
    // the frame is what keeps the model from reading it as dialogue.
    text: "[Note from user: {{note}}]",
    macros: "none",
    requiredMacros: ["{{note}}"],
    requiredTokens: [],
    title: "User-note frame",
    fires: "Every user-role injection — author's note, host steering.",
  },
  "chat.injection.assistantNote": {
    id: "chat.injection.assistantNote",
    home: "preset",
    version: 1,
    // An assistant-role injection just above the tail re-roles to USER text so it never merges into the model's
    // last committed reply (the cached prefix). The frame names no speaker: the line is not the user's words.
    // Modelled on Guided Generations' `[Take the following into special consideration for your next message: …]`.
    text: "[Take the following into special consideration for your next message: {{note}}]",
    macros: "none",
    requiredMacros: ["{{note}}"],
    requiredTokens: [],
    title: "Re-roled assistant-note frame",
    fires: "An assistant-role injection just above the tail, re-roled to user text to keep the cached reply intact.",
  },
  "chat.assembly.continuationNudge": {
    id: "chat.assembly.continuationNudge",
    home: "preset",
    version: 1,
    // The trailing-user CUE for a turn the operator did not type into: a force/auto/empty-opening round whose
    // canon ends on an assistant row. The delivered history must end on a user turn (a trailing assistant row
    // is response prefill), so SHAPE appends this. It is the only sentence in the delivered prompt that no
    // one — not the seated characters, not the operator — actually said, which is exactly why its wording is a preset's
    // business: a terse table and a florid one want different words for "your move".
    text: "[Continue the conversation.]",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Continuation cue",
    fires: "A force/auto/empty-opening round with no user input whose history would otherwise end on the model's own reply.",
  },
  "chat.recovery.narrativeContinuation": {
    id: "chat.recovery.narrativeContinuation",
    home: "user",
    version: 1,
    // The ONE ask of the recovery pass (dogfood EMPTYGEN-REASONING, owner ruling 2026-08-07 — RECOVER, do not
    // discard). A reasoning turn on a tool-attached game can conclude that its tool calls discharged the beat
    // and emit ZERO prose; the state writes are good, the reply is missing, and the turn used to be thrown
    // away whole. The recovery pass re-runs the SAME turn with the tools removed and this line as the trailing
    // user row, so the model writes the narrative it skipped.
    //
    // Two things it must say and one it must not. It must name that the state is ALREADY RECORDED (or the
    // model narrates the bookkeeping it just did — "I updated your HP" — which is the exact prose this feature
    // exists to avoid), and it must ask for the beat itself. It must NOT re-issue the turn's original
    // instructions: the whole prompt is still in front of the model, so repeating them earns a re-run of the
    // reasoning that produced no prose the first time. Short, on purpose.
    text: "[The state changes for this beat are already recorded — do not describe them or mention updating anything. Now write the scene itself: continue the story from where it stands, in your usual voice.]",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Prose-less turn recovery ask",
    fires: "A completion that produced tool calls and no prose — the recovery pass that rescues the turn instead of discarding it.",
  },
  "chat.tool.reactDescription": {
    id: "chat.tool.reactDescription",
    home: "user",
    version: 1,
    // The B7 `react` tool's model-facing contract (the `imagery.tool.generateImageDescription` shape:
    // resolved to its shipped default at compose registration — no user in scope there). The description
    // IS the teach: the tool-use posture ships no prose injection beside a wire description, so everything
    // the model needs — who may react, what to target, restraint — lives in this one text.
    text:
      "React to the newest message with an emoji, as one of the present characters. Use it sparingly — only " +
      "when a character would visibly react in the moment (amusement, shock, delight, dread). `character` is " +
      "the reacting character's exact name; `emoji` is one emoji from the offered set; `toSpeaker` " +
      "optionally names whose lines within that message the reaction points at (omit it to react to the " +
      "whole message). The reaction appears as a small chip on the message for everyone in the room; it " +
      "posts no text and does not replace your reply.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "react tool description",
    fires: "The `react` tool's model-facing description, on every turn the room's characters-can-react toggle resolves on.",
  },
} as const satisfies Partial<Record<ProseSlotId, ProseSlotDef>>;

/** The `react` tool's registered description — the slot's SHIPPED default, resolved at module load (the
 *  `IMAGERY_GENERATE_IMAGE_TOOL_DESCRIPTION` posture: compose-time registration has no user in scope). */
export const CHAT_REACT_TOOL_DESCRIPTION = CHAT_PROSE_SLOTS["chat.tool.reactDescription"].text;
