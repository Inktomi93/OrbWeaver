// @orb/contracts/preset — the per-PRESET prose slot table (PROSE-1 §4.1, census rows 38-49). The ONE home
// for the BYTES of every guided-action template, format string, and the compaction steering: `index.ts`
// DERIVES `guidedActionsSchema`'s defaults, `DEFAULT_GUIDED_ACTIONS`, `DEFAULT_FORMAT_STRINGS` and
// `DEFAULT_COMPACT_INSTRUCTIONS` from these rows, so a default is authored exactly once and the registry can
// never disagree with what the assembler actually ships.
//
// The slot SHAPE comes from `#prose-slot`, never `#prose`: `#prose` imports this table at runtime to compose
// `PROSE_SLOTS`, so importing it here — even for a type — would close a `no-circular` cycle.
//
// Storage note (PROSE-1 §4.6): these slots are ADAPTED, not re-homed. The override still lives in the
// existing `promptConfig.guidedActions.*.prompt` / `promptConfig.formatStrings.*` fields — the wire, the ST
// import mapper and the existing editors are untouched. The slot row is what gives them a version, a
// staleness signal and a required-macro lint from ONE place.

import type { ProseSlotDef, ProseSlotId } from "#prose-slot";

/** `response` and `swipe` are ONE slot: they ship byte-identical text and always have (census row 40 is a
 *  single constant serving both kinds). Forking them is a product decision, not a migration. */
export const PRESET_PROSE_SLOTS = {
  "preset.guided.opening": {
    id: "preset.guided.opening",
    home: "preset",
    version: 1,
    text: "[Open the scene: write your first message to me, in character — set the scene and greet me as {{char}} would. Stay fully in character. {{input}}]",
    macros: "full",
    requiredMacros: ["{{input}}"],
    requiredTokens: [],
    title: "Opening scene",
    fires: "The wand's Opening action, on a chat with no messages yet.",
  },
  "preset.guided.continue": {
    id: "preset.guided.continue",
    home: "preset",
    version: 1,
    text: "[Take the following into special consideration while continuing your previous message: {{input}}]",
    macros: "full",
    requiredMacros: ["{{input}}"],
    requiredTokens: [],
    title: "Steered continue",
    fires: "A Continue fired with steering text.",
  },
  "preset.guided.response": {
    id: "preset.guided.response",
    home: "preset",
    version: 1,
    text: "[Take the following into special consideration for your next message: {{input}}]",
    macros: "full",
    requiredMacros: ["{{input}}"],
    requiredTokens: [],
    title: "Steered response / swipe",
    fires: "A Response or a Swipe fired with steering text (both kinds read this one template).",
  },
  "preset.guided.impersonate": {
    id: "preset.guided.impersonate",
    home: "preset",
    version: 1,
    text: "[Forget all other previous instructions. For this turn only, write in the {{person}}-person perspective AS {{user}} (not {{char}}). Limit yourself strictly to {{user}}'s voice and actions; do NOT narrate {{char}}'s reaction or the surrounding scene. Guidance: {{input}}]",
    macros: "full",
    requiredMacros: ["{{input}}", "{{user}}", "{{char}}"],
    requiredTokens: [],
    title: "Steered impersonate",
    fires: "The wand's Impersonate action, fired with steering text.",
  },
  "preset.guided.rewrite": {
    id: "preset.guided.rewrite",
    home: "preset",
    version: 1,
    text: "[OOC: Answer me out of character. Don't continue the RP. Instead, rewrite {{char}}'s last response to reflect the following: {{input}}. Don't make any other changes besides this.]",
    macros: "full",
    requiredMacros: ["{{input}}", "{{char}}"],
    requiredTokens: [],
    title: "Rewrite",
    fires: "The Rewrite modal, on the last assistant message.",
  },
  "preset.guided.greetingRewrite": {
    id: "preset.guided.greetingRewrite",
    home: "preset",
    version: 1,
    text: "Revise the existing greeting for {{char}} using ONLY the requested adjustments below.\n\nRequested adjustments: {{input}}\n\nOriginal greeting:\n{{base}}\n\nRules:\n- Keep the greeting content, structure, formatting, links, and length as close as possible unless a requested adjustment requires a specific change.\n- Do NOT add new story events, new actions, or extra continuation text.\n- Do NOT expand the greeting.\n- Return ONLY the revised greeting text — no commentary, no quotes.",
    macros: "full",
    requiredMacros: ["{{input}}", "{{base}}"],
    requiredTokens: [],
    title: "Greeting rewrite",
    fires: "The greeting studio, revising an existing greeting.",
  },
  "preset.guided.greetingNew": {
    id: "preset.guided.greetingNew",
    home: "preset",
    version: 1,
    text: "Write a single opening greeting for {{char}}, in character, based on the following requirements: {{input}}\n\nRules:\n- Set the scene and greet {{user}} as {{char}} would.\n- Output ONLY the greeting text — no commentary, no quotes.\n- Do NOT continue beyond the greeting or add extra sections or explanations.",
    macros: "full",
    requiredMacros: ["{{input}}", "{{char}}"],
    requiredTokens: [],
    title: "New greeting",
    fires: "The greeting studio, writing a fresh greeting from requirements.",
  },
  "preset.format.continueNudge": {
    id: "preset.format.continueNudge",
    home: "preset",
    version: 1,
    text: "[OOC: Continue your previous response exactly where it left off. Pick up mid-sentence if needed. Do NOT restate the existing text, do NOT rephrase, do NOT add a preamble or recap. Output ONLY the continuation, starting from where your previous reply ended.]",
    macros: "full",
    requiredMacros: [],
    requiredTokens: [],
    title: "Continue nudge",
    fires: "Appended to the user turn on an UNSTEERED Continue.",
  },
  "preset.format.impersonateNudge": {
    id: "preset.format.impersonateNudge",
    home: "preset",
    version: 1,
    // The voice-lock measured by the IMP-1 probe harness (`scripts/probes/impersonate/`): the "Ignore all
    // previous instructions" lead + the explicit write-only-{{user}}/never-{{char}} constraint held the
    // user's voice 6/6 on the weak 8B at full production sampling. The probe harness — not a hand edit — is
    // the instrument for revising these bytes; a revision bumps `version` in the same commit.
    text: "[Ignore all previous instructions. For this message only, write in the {{person}}-person perspective AS {{user}} (not {{char}}). Write ONLY {{user}}'s single next message, in {{user}}'s own voice. Do NOT write, voice, narrate, or roleplay {{char}}, {{char}}'s dialogue or actions, or the surrounding scene. Write only {{user}}'s reply, then stop.]",
    macros: "full",
    requiredMacros: ["{{user}}", "{{char}}"],
    requiredTokens: [],
    title: "Impersonate nudge",
    fires: "Appended to the user turn on an UNSTEERED Impersonate — the measured voice-lock.",
  },
  "preset.format.responseNudge": {
    id: "preset.format.responseNudge",
    home: "preset",
    version: 1,
    text: "[Continue the scene: write the next reply, moving the story forward from where it stands. Do not restate or recap.]",
    macros: "full",
    requiredMacros: [],
    requiredTokens: [],
    title: "Response nudge",
    fires: "Appended when a Response fires on an ASSISTANT tail (a reply with nothing to reply to).",
  },
  "preset.format.wiFormat": {
    id: "preset.format.wiFormat",
    home: "preset",
    version: 1,
    text: "{{entry}}",
    macros: "full",
    requiredMacros: ["{{entry}}"],
    requiredTokens: [],
    title: "World-info entry format",
    fires: "Wraps every injected world-info entry.",
  },
  "preset.compaction.instructions": {
    id: "preset.compaction.instructions",
    home: "preset",
    version: 1,
    // The RP-tuned `/compact` steering (vs the SDK's generic coding-agent summary). `macros:"none"`: it is
    // summarizer steering handed to `runCompaction`, run over the TRANSCRIPT with no character context — no
    // `{{char}}` binding at this seam, so a `{{…}}` in an override ships verbatim rather than rendering empty
    // (the CHAT side-generation posture, not the guided/format `full` posture).
    text: "Summarize the roleplay so far for continuation: preserve each character's voice and persona, the relationships and their current state, established facts and world details, unresolved threads, and the present scene/location. Be concise but lossless on canon — names, commitments, and specific details must survive.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Compaction steering",
    fires: "Each managed-compaction pass — the chat's own model rebuilding the portable summary marker.",
  },
} as const satisfies Partial<Record<ProseSlotId, ProseSlotDef>>;

/** `formatStrings` key → slot id. The ONE map every `formatStrings` reader funnels through (`turn.ts`'s
 *  nudges, the assembler's `wiFormat`), so no reader can re-spell an id or re-spell a fallback. */
export const PRESET_FORMAT_SLOT_IDS = {
  continueNudge: "preset.format.continueNudge",
  impersonateNudge: "preset.format.impersonateNudge",
  responseNudge: "preset.format.responseNudge",
  wiFormat: "preset.format.wiFormat",
  // `formatStrings.newChatMarker` (G9) is deliberately NOT here: a PROSE-1 slot is AUTHORED BYTES (the
  // registry's own invariant is that no slot ships empty text), and this field's shipped default is BLANK —
  // "no boundary marker" is the product behavior, not a default sentence someone wrote. It becomes a slot the
  // day it ships bytes.
} as const satisfies Record<string, ProseSlotId>;

/** The compaction-steering slot id. A single slot (not a keyed family like guided/format), so a plain const
 *  rather than a map — but it is a legacy-ADAPTED preset slot for the same reason they are (§4.6): the
 *  override is the existing `promptConfig.compaction.instructions` field, so it is excluded from the
 *  `promptConfig.prose` editable set. `DEFAULT_COMPACT_INSTRUCTIONS` derives its bytes from this slot. */
export const PRESET_COMPACTION_SLOT_ID = "preset.compaction.instructions" as const satisfies ProseSlotId;

/** Guided-action kind → slot id. `response` and `swipe` intentionally share ONE slot. */
export const PRESET_GUIDED_SLOT_IDS = {
  opening: "preset.guided.opening",
  continue: "preset.guided.continue",
  response: "preset.guided.response",
  swipe: "preset.guided.response",
  impersonate: "preset.guided.impersonate",
  rewrite: "preset.guided.rewrite",
  // Computed-key form (the `DEFAULT_MARKER_TEMPLATES` precedent): the keys ARE the `GuidedActionKind`
  // strings, and that vocabulary is snake_case (audit §3).
  ["greeting_rewrite"]: "preset.guided.greetingRewrite",
  ["greeting_new"]: "preset.guided.greetingNew",
} as const satisfies Record<string, ProseSlotId>;
