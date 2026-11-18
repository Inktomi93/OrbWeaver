// @orb/contracts/chat — the APP-TIER chat prose slot table (D132 clause A). The ONE home for the BYTES of
// every chat SIDE-generation prompt: the anchor-persona identity lead-in, the smart-arbiter prompt, the
// compaction summarizer, and the memory digest/consolidation prompts. The server substrate reads these
// through `resolveProse` — it authors none of them.
//
// TWO storage homes, and the split is the point: the table is one home for the BYTES, while `home` names the
// STORAGE per row.
//
//   • per-USER, resolved against the ROOM HOST: the SIDE-GENERATION prompts — arbiter, compaction, memory
//     digest/consolidation, the recovery ask, the anchor identity lead-in. These are ROOM-level generations
//     that resolve where NO preset is in scope, so a chat's memory corpus and its arbiter stay consistent no
//     matter which member spoke. Seam: `ChatContext.resolveChatProse(chatId)`, resolving the present host
//     exactly as `resolveChatPresetParams` does; a hostless/stale room degrades to `{}` ⇒ shipped defaults.
//   • per-PRESET: the TURN-WIRE FRAMINGS — the two injection note frames, the continuation cue, and the
//     GROUP-ROOM FRAMINGS (the co-speaker headings, the person heading, the round/narrator nudges, the
//     speaker-tag instruction). These are wrappers spliced into the MAIN turn's prompt, where the resolved
//     preset IS in scope. Storage `promptConfig.prose`, authored in the preset Templates tab. Seam:
//     `composeProse` at `assembly/context`, which merges the host's user blob with the preset's blob FILTERED
//     BY HOME, so a slot resolves from exactly one storage and the no-cascade law holds.
//
// A user-blob key for a now-preset slot is inert (D132 clause D) and is re-entered in the preset Templates
// tab.
//
// MACRO MODE = "none" for every row: these prompts run over a TRANSCRIPT, not a character context, so there
// is no `{{char}}` binding and a `{{…}}` in an override ships verbatim rather than silently rendering empty.
//
// The `chat.group.*` / `chat.injection.*` rows carry ONE caller-supplied PRE-SUBSTITUTION token each
// (`{{name}}` = the roster member / speaker this frame is about; `{{note}}` = the injection's own content),
// spliced by `resolveProseText`'s `tokens` argument as a plain string replace — never through the macro
// engine, because these frames are composed AROUND already-macro-resolved text and re-running it would
// resolve twice. The token rides `requiredMacros` so the editor warns a host who deletes it (dropping
// `{{name}}` makes every co-speaker heading read the same; dropping `{{note}}` drops the payload).
//
// The slot SHAPE comes from `#prose-slot`, never `#prose`: `#prose` imports this table at runtime to compose
// `PROSE_SLOTS`, so importing it here — even for a type — would close a `no-circular` cycle.

import type { ProseSlotDef, ProseSlotId } from "#prose-slot";
import { GROUP_POLICY_LABELS, SMART_UTILITY_SWITCH_LABEL } from "./metadata.ts";

/** The tier-0 digest system prompt's three-part contract, authored line-by-line and joined — the parse
 *  contract the digest reader keys on (the topic-anchor brackets and the `keywords:` line). */
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
    home: "user",
    version: 1,
    // Composed as `[<text> <anchor name>: <description>]` — the brackets, the name and the description are
    // the injection's GRAMMAR and stay in the assembler; only the lead-in clause is the voice.
    text: "The person the character knows as the user is",
    requiredMacros: [],
    requiredTokens: [],
    title: "Anchor-persona identity lead-in",
    fires: "Card context, on a turn where the speaking persona differs from the chat's anchor persona.",
  },
  "chat.arbiter.system": {
    home: "user",
    version: 4,
    // The arbiter answers through a structured-output schema whose enum holds only the round's candidates,
    // so the text carries no output format and no "never choose the humans" rule — the schema enforces both.
    // Short on purpose: small Utility models lose a long instruction.
    text:
      "You choose who speaks next in a group roleplay. The human players write their own lines. Choose the " +
      "character the last message is addressed to, by name or by role (a question about the road goes to the " +
      "guide), or else whoever would most naturally answer. Usually choose one. Choose several only when several " +
      "are addressed directly or each has a strong, immediate reason to respond.",
    requiredMacros: [],
    requiredTokens: [],
    title: "Turn-arbiter prompt",
    // Editor copy is read as PLAIN TEXT (no markdown pass), so it carries no backticks and no internal
    // nouns — the room's own control label and the model-role slot name instead of "`smart` policy" / "rail".
    fires: `Every group round while the room's speaker order is "${GROUP_POLICY_LABELS.smart}" with "${SMART_UTILITY_SWITCH_LABEL}" on.`,
  },
  "chat.compaction.system": {
    home: "user",
    version: 1,
    text:
      "You are a precise conversation summarizer. Produce a faithful, compact summary of the roleplay so far " +
      "that preserves the key facts, character states, decisions, locations, and unresolved threads. Do not " +
      "invent details and do not add commentary — output only the summary.",
    requiredMacros: [],
    requiredTokens: [],
    title: "Compaction summarizer",
    fires: "Each compaction pass — the chat's own model rebuilding the portable summary marker.",
  },
  "chat.memory.digestSystem": {
    home: "user",
    version: 1,
    text: DIGEST_SYSTEM_TEXT,
    requiredMacros: [],
    // The retrieval unit's PARSE contract (`memory/generate/substrate/parse`): the topic-anchor brackets and the
    // `keywords:` line are what the parser keys on. An override that drops either still stores — it just
    // stores an anchorless, keywordless digest — so this is a warn, exactly like every other required token.
    requiredTokens: ["[entities — scene]", "keywords:"],
    title: "Memory digest prompt",
    fires: "Every aged-out transcript block the memory build distills into a tier-0 digest.",
  },
  "chat.memory.consolidationSystem": {
    home: "user",
    version: 1,
    text: CONSOLIDATION_SYSTEM_TEXT,
    requiredMacros: [],
    requiredTokens: ["[entities — scene]", "keywords:"],
    title: "Memory consolidation prompt",
    fires: "Each upward consolidation pass, folding a fan-out of digests into one higher-tier digest.",
  },
  "chat.memory.consolidationLead": {
    home: "user",
    version: 1,
    // The user-prompt LEAD only. The numbered child facets that follow it are data the builder appends —
    // they are not authorable.
    text: "Prior digests to consolidate (synthesize the arc across these — do not repeat each):",
    requiredMacros: [],
    requiredTokens: [],
    title: "Memory consolidation lead-in",
    fires: "Heads the consolidation user prompt, above the numbered child digests.",
  },
  "chat.group.characterHeading": {
    home: "preset",
    version: 2,
    // The heading over every roster member's card beside the primary, on both roster layouts: a narrator round
    // and a per-speaker merged turn. No `[Also present — X]` frame is needed: its system block
    // is the same roster for every speaker, so no card is framed as a bystander and the round cue names who
    // speaks.
    //
    // The label is kept rather than dropped (owner ruling): the explicit "this block is a character" signal is
    // what weaker local models lean on. Model-facing bytes are still bytes, so an edit here rides the lawful
    // re-version path (D132(A)); a silent one would strand every host's `baseVersion` stamp.
    //
    // The id is `characterHeading`, NOT `…Member`: `docs/law/vocabulary-map.md` gives `character` for the
    // concept this slot names (the seated characters the arbiter may drive) and **Member** to the HUMANS in a
    // room (`chat_participants.kind='human'`). `Heading` is the suffix this slot's group siblings already
    // carry (`scenarioHeading` / `exampleHeading`).
    //
    // The retired `chat.group.castMember` id is re-keyed onto this one at boot
    // (`migrateProseSlotVocab`), carrying its `baseVersion`, so `version` stays 2 — the TEXT did not change.
    text: "[Character — {{name}}]",
    requiredMacros: ["{{name}}"],
    requiredTokens: [],
    title: "Character heading",
    fires: "A narrator round or a per-speaker merged turn, once per character whose card rides beside the primary.",
  },
  "chat.group.scenarioHeading": {
    home: "preset",
    version: 1,
    text: "[{{name}}'s scenario]",
    requiredMacros: ["{{name}}"],
    requiredTokens: [],
    title: "Merged co-speaker scenario heading",
    fires: "A merged group turn, for each present member whose card carries a scenario.",
  },
  "chat.group.exampleHeading": {
    home: "preset",
    version: 1,
    text: "[{{name}}'s example dialogue]",
    requiredMacros: ["{{name}}"],
    requiredTokens: [],
    title: "Merged co-speaker example-dialogue heading",
    fires: "A merged group turn, for each present member whose card carries example dialogue.",
  },
  "chat.group.personaHeading": {
    home: "preset",
    version: 1,
    // The heading over each OTHER present human's persona in the `persona` marker's people block. The voice
    // persona (the one `{{user}}` names) stays unheaded and first, so position alone marks the addressee.
    text: "[Person — {{name}}]",
    requiredMacros: ["{{name}}"],
    requiredTokens: [],
    title: "Person heading",
    fires: "A room with more than one present human, once per other human whose seat holds a persona.",
  },
  "chat.group.roundNudge": {
    home: "preset",
    version: 2,
    // The per-speaker fence on a MULTI-speaker round — the one line that stops the model voicing all the seated
    // characters in one reply. Delivered as the round's trailing user row. The text spells out the two failure
    // modes the receive side otherwise cleans up after (`cleanPerSpeakerReply`): the echoed `Name:` self-label,
    // and drifting on into another character's lines. Saying them here is cheaper than repairing them.
    text:
      "[Write the next reply only as {{name}}. Stay in {{name}}'s voice — their dialogue, actions and " +
      "thoughts only. Do not write lines for the other characters or for the user, and do not open the " +
      "reply with a name label.]",
    requiredMacros: ["{{name}}"],
    requiredTokens: [],
    title: "Group round speaker nudge",
    fires: "Every speaker of a MULTI-speaker group round, and any other turn whose system prompt does not name the speaking character.",
  },
  "chat.group.narratorNudge": {
    home: "preset",
    version: 1,
    // The NARRATOR twin of `roundNudge`. A narrator round is ONE generation voicing all the seated characters, so the
    // per-speaker fence would be exactly wrong here — this line names the seated characters instead. Delivered as the
    // round's trailing user row, joined with the speaker-tag instruction below when both toggles are on.
    text:
      "[Continue the scene, voicing the present characters ({{names}}) as the moment calls for. This is ONE " +
      "reply covering the whole scene — voice as many or as few of them as it needs, in any order, with " +
      "narration in between. Never write lines or actions for the user.]",
    requiredMacros: ["{{names}}"],
    requiredTokens: [],
    title: "Narrator round nudge",
    fires: "Every MULTI-member narrator round with the group nudge on (a one-character round sends no nudge).",
  },
  "chat.group.speakerTags": {
    home: "preset",
    version: 2,
    // The PRODUCE half of per-speaker color in a merged bubble: the renderer splits a narrator body on
    // `<speaker>NAME</speaker>` markers and tints each span with that character's theme, so the markers have
    // to be ASKED FOR. The literals are the renderer's parse contract, hence requiredTokens — an override that
    // drops them silently costs the room its per-speaker coloring (the display side still tolerates the plain
    // `Name:` form models emit unprompted). The string is read by a MODEL, never shown as chrome, so it owes
    // unambiguity, not agreement with a UI label. Host-facing name for the toggle: "Label each speaker".
    text:
      "[Wrap each character's spoken lines and actions in <speaker>Name</speaker> tags: put the character's " +
      "exact name between the tags, then what they say and do. Open a new tag every time the speaker " +
      "changes. Use the name exactly as it is spelled in the room — never a nickname, a pronoun or a title. " +
      "Leave narration, scene description and anything not attributable to one character OUTSIDE the tags. " +
      "Never write lines for the user.]",
    requiredMacros: [],
    requiredTokens: ["<speaker>", "</speaker>"],
    title: "Narrator speaker-tag instruction",
    fires: 'Every MULTI-member narrator round with "Label each speaker" on (`GroupConfig.speakerTags`, on by default in narrator mode).',
  },
  "chat.injection.userNote": {
    home: "preset",
    version: 1,
    // A user-role injection is the OPERATOR speaking through the user channel, not an in-character turn —
    // the frame is what keeps the model from reading it as dialogue.
    text: "[Note from user: {{note}}]",
    requiredMacros: ["{{note}}"],
    requiredTokens: [],
    title: "User-note frame",
    fires: "Every user-role injection — author's note, host steering.",
  },
  "chat.injection.assistantNote": {
    home: "preset",
    version: 1,
    // An assistant-role injection just above the tail re-roles to USER text so it never merges into the model's
    // last committed reply (the cached prefix). The frame names no speaker: the line is not the user's words.
    text: "[Take the following into special consideration for your next message: {{note}}]",
    requiredMacros: ["{{note}}"],
    requiredTokens: [],
    title: "Re-roled assistant-note frame",
    fires: "An assistant-role injection just above the tail, re-roled to user text to keep the cached reply intact.",
  },
  "chat.assembly.continuationNudge": {
    home: "preset",
    version: 1,
    // The trailing-user CUE for a turn the operator did not type into: a force/auto/empty-opening round whose
    // canon ends on an assistant row. The delivered history must end on a user turn (a trailing assistant row
    // is response prefill), so SHAPE appends this. It is the only sentence in the delivered prompt that no
    // one — not the seated characters, not the operator — actually said, which is exactly why its wording is a preset's
    // business: a terse table and a florid one want different words for "your move".
    text: "[Continue the conversation.]",
    requiredMacros: [],
    requiredTokens: [],
    title: "Continuation cue",
    fires: "A force/auto/empty-opening round with no user input whose history would otherwise end on the model's own reply.",
  },
  "chat.teach.choicesFrame": {
    home: "preset",
    version: 1,
    // The one delimiter around the offer-choices teach. On a model that folds a system note into user text the
    // teach lands in the player's message, so it must never read as the player's words (owner ruling).
    text: "[Instruction for your reply — not part of anyone's message:\n\n{{teach}}\n]",
    requiredMacros: ["{{teach}}"],
    requiredTokens: [],
    title: "Choices-teach frame",
    fires: "Every turn with Offer choices on — wraps the choices teach, unless the game already taught it.",
  },
  "chat.recovery.narrativeContinuation": {
    home: "user",
    version: 1,
    // The ONE ask of the recovery pass (owner ruling — RECOVER, do not discard). A reasoning turn on a
    // tool-attached game can conclude that its tool calls discharged the beat and emit ZERO prose; the state
    // writes are good and the reply is missing. The recovery pass re-runs the SAME turn with the tools
    // removed and this line as the trailing user row.
    //
    // Two things it must say and one it must not. It must name that the state is ALREADY RECORDED (or the
    // model narrates the bookkeeping it just did — "I updated your HP" — which is the exact prose this feature
    // exists to avoid), and it must ask for the beat itself. It must NOT re-issue the turn's original
    // instructions: the whole prompt is still in front of the model, so repeating them earns a re-run of the
    // reasoning that produced no prose the first time. Short, on purpose.
    text: "[The state changes for this beat are already recorded — do not describe them or mention updating anything. Now write the scene itself: continue the story from where it stands, in your usual voice.]",
    requiredMacros: [],
    requiredTokens: [],
    title: "Prose-less turn recovery ask",
    fires: "A completion that produced tool calls and no prose — the recovery pass that rescues the turn instead of discarding it.",
  },
  "chat.tool.reactDescription": {
    home: "user",
    version: 1,
    // The `react` tool's model-facing contract (the `imagery.tool.generateImageDescription` shape: resolved to
    // its shipped default at compose registration — no user in scope there). The description IS the teach: the
    // tool-use posture ships no prose injection beside a wire description, so everything the model needs — who
    // may react, what to target, restraint — lives in this one text.
    text:
      "React to the newest message with an emoji, as one of the present characters. Use it sparingly — only " +
      "when a character would visibly react in the moment (amusement, shock, delight, dread). `character` is " +
      "the reacting character's exact name; `emoji` is one emoji from the offered set; `toSpeaker` " +
      "optionally names whose lines within that message the reaction points at (omit it to react to the " +
      "whole message). The reaction appears as a small chip on the message for everyone in the room; it " +
      "posts no text and does not replace your reply.",
    requiredMacros: [],
    requiredTokens: [],
    title: "react tool description",
    fires: "The `react` tool's model-facing description, on every turn the room's characters-can-react toggle resolves on.",
  },
} as const satisfies Partial<Record<ProseSlotId, ProseSlotDef>>;

/** The `react` tool's registered description — the slot's SHIPPED default, resolved at module load (the
 *  `IMAGERY_GENERATE_IMAGE_TOOL_DESCRIPTION` posture: compose-time registration has no user in scope). */
export const CHAT_REACT_TOOL_DESCRIPTION = CHAT_PROSE_SLOTS["chat.tool.reactDescription"].text;
