// PROSE-1 §10 contract suite for `@orb/contracts/prose` — the resolution machinery, the versioned-defaults
// mechanism, and the default-identity discipline that makes every migration stage a no-op until a host types
// something. These are the tests that make an unbumped default revision, a duplicated slot and a
// half-registered id impossible rather than merely discouraged.
import { createHash } from "node:crypto";
import { DEFAULT_CAPTION_INSTRUCTIONS, DEFAULT_PROMPT_TEMPLATES, IMAGERY_CAPTION_SLOT_IDS, IMAGERY_TEMPLATE_SLOT_IDS } from "@orb/contracts/imagery";
import {
  DEFAULT_COMPACT_INSTRUCTIONS,
  DEFAULT_FORMAT_STRINGS,
  DEFAULT_GUIDED_ACTIONS,
  PRESET_COMPACTION_SLOT_ID,
  PRESET_FORMAT_SLOT_IDS,
  PRESET_GUIDED_SLOT_IDS,
  TEMPLATE_DEFS,
} from "@orb/contracts/preset";
import type { ProseOverride, ProseOverrides, ProseSlotId } from "@orb/contracts/prose";
import {
  composeProse,
  isPresetProseSlotId,
  isProseSlotId,
  legacyProseOverrides,
  PRESET_PROSE_SLOT_IDS,
  PROSE_HOMES,
  PROSE_MACRO_MODES,
  PROSE_MAX_CHARS,
  PROSE_SLOT_IDS,
  PROSE_SLOTS,
  proseFooterState,
  resolveProse,
  resolveProseText,
  USER_PROSE_SLOT_IDS,
} from "@orb/contracts/prose";
import baseline from "../../../packages/contracts/src/prose/prose-baseline.json" with { type: "json" };
import { expect, test } from "../../support/fixtures.ts";

const FIRST_ID: ProseSlotId = "preset.format.impersonateNudge";
const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

// ── Resolution: two rungs, no cascade (§4.3) ────────────────────────────────────────────────────────
test("resolveProse: an absent override resolves to the shipped default, never stale", () => {
  for (const id of PROSE_SLOT_IDS) {
    const resolved = resolveProse(id, {});
    expect(resolved.text).toBe(PROSE_SLOTS[id].text);
    expect(resolved.source).toBe("default");
    expect(resolved.stale).toBe(false);
  }
});

test("resolveProse: an override at the CURRENT version wins and is not stale", () => {
  const overrides: ProseOverrides = { [FIRST_ID]: { text: "mine", baseVersion: PROSE_SLOTS[FIRST_ID].version } };
  expect(resolveProse(FIRST_ID, overrides)).toStrictEqual({ text: "mine", source: "override", stale: false });
  expect(resolveProseText(FIRST_ID, overrides)).toBe("mine");
});

test("resolveProse: an override authored against an OLDER version still wins, and reports stale", () => {
  // The whole upgrade story (§4.4 rung 3): a revised default NEVER lands behind a host's back — the edit
  // surface offers it, resolution keeps serving the host's bytes.
  const stale = resolveProse(FIRST_ID, { [FIRST_ID]: { text: "mine", baseVersion: PROSE_SLOTS[FIRST_ID].version - 1 } });
  expect(stale).toStrictEqual({ text: "mine", source: "override", stale: true });
});

test("resolveProse: one slot's override never leaks into a sibling slot", () => {
  const overrides: ProseOverrides = { [FIRST_ID]: { text: "mine", baseVersion: 1 } };
  expect(resolveProse("preset.format.responseNudge", overrides).source).toBe("default");
});

test("a legacy bare-string field resolves through the SAME two rungs as a first-class override", () => {
  expect(legacyProseOverrides(FIRST_ID, undefined)).toStrictEqual({});
  expect(resolveProse(FIRST_ID, legacyProseOverrides(FIRST_ID, undefined)).source).toBe("default");
  expect(resolveProse(FIRST_ID, legacyProseOverrides(FIRST_ID, "mine"))).toStrictEqual({ text: "mine", source: "override", stale: false });
});

// ── Registry integrity (§7.3, §7.4) ────────────────────────────────────────────────────────────────
test("registry totality: every id has a row whose `id` matches its key, and every row is well-formed", () => {
  expect(Object.keys(PROSE_SLOTS).toSorted()).toStrictEqual([...PROSE_SLOT_IDS].toSorted());
  for (const id of PROSE_SLOT_IDS) {
    const slot = PROSE_SLOTS[id];
    expect(slot.id).toBe(id);
    expect(PROSE_HOMES).toContain(slot.home);
    expect(PROSE_MACRO_MODES).toContain(slot.macros);
    expect(slot.version).toBeGreaterThan(0);
    // No slot ships empty text, and every slot carries the editor copy the surfaces render.
    expect(slot.text.length).toBeGreaterThan(0);
    expect(slot.title.length).toBeGreaterThan(0);
    expect(slot.fires.length).toBeGreaterThan(0);
  }
});

test("a slot's own default satisfies its requiredMacros/requiredTokens — the lint can never accuse the shipped text", () => {
  for (const id of PROSE_SLOT_IDS) {
    const slot = PROSE_SLOTS[id];
    for (const macro of [...slot.requiredMacros, ...slot.requiredTokens]) {
      expect(slot.text).toContain(macro);
    }
  }
});

test("no two slots ship byte-identical default text (the copy-paste-row detector, §7.4)", () => {
  const byText = new Map<string, ProseSlotId>();
  for (const id of PROSE_SLOT_IDS) {
    const prior = byText.get(PROSE_SLOTS[id].text);
    expect(prior, `${id} ships the same default text as ${String(prior)} — one of them is an unfinished copy-paste row`).toBeUndefined();
    byText.set(PROSE_SLOTS[id].text, id);
  }
});

// ── The versioned-defaults MECHANISM (§4.4) ─────────────────────────────────────────────────────────
test("prose-baseline.json covers exactly the registry", () => {
  expect(Object.keys(baseline.slots).toSorted()).toStrictEqual([...PROSE_SLOT_IDS].toSorted());
});

test("a default-text change without a version bump is RED (and a version bump without a regen is RED)", () => {
  const committed: Record<string, { version: number; sha256: string } | undefined> = baseline.slots;
  // Collected, then asserted ONCE: a per-slot `expect` behind a branch is a conditional-expect, and the
  // failure list is more useful than the first offender anyway.
  const desynced = PROSE_SLOT_IDS.flatMap((id) => {
    const slot = PROSE_SLOTS[id];
    const row = committed[id];
    if (row === undefined) {
      return [`${id}: missing from prose-baseline.json — run \`pnpm prose:baseline\``];
    }
    const textChanged = sha256(slot.text) !== row.sha256;
    if (textChanged && slot.version <= row.version) {
      return [`${id}: the shipped default text changed at version ${slot.version} — bump \`version\`, then run \`pnpm prose:baseline\``];
    }
    if (!textChanged && slot.version !== row.version) {
      return [`${id}: version moved (${row.version} → ${slot.version}) but the text did not — run \`pnpm prose:baseline\``];
    }
    return [];
  });
  expect(desynced).toStrictEqual([]);
});

// ── Default identity: the adapted slots still ship today's exact bytes (§4.3) ───────────────────────
test("adapted preset slots are byte-identical to the constants the assembler already shipped", () => {
  for (const [key, id] of Object.entries(PRESET_FORMAT_SLOT_IDS)) {
    expect(resolveProseText(id, {})).toBe(DEFAULT_FORMAT_STRINGS[key as keyof typeof DEFAULT_FORMAT_STRINGS]);
  }
  for (const [kind, id] of Object.entries(PRESET_GUIDED_SLOT_IDS)) {
    expect(resolveProseText(id, {})).toBe(DEFAULT_GUIDED_ACTIONS[kind as keyof typeof DEFAULT_GUIDED_ACTIONS].prompt);
  }
  // Census 49 — the compaction steering, adapted the same way (override = `promptConfig.compaction.instructions`).
  expect(resolveProseText(PRESET_COMPACTION_SLOT_ID, {})).toBe(DEFAULT_COMPACT_INSTRUCTIONS);
});

// The frozen literal `DEFAULT_COMPACT_INSTRUCTIONS` shipped as a source const before census 49 slotted it —
// re-typed here independently of the slot table. A FENCE (it passes both sides of the migration, because the
// migration is byte-preserving by construction), so it guards the default-identity discipline, not a defect:
// a drift in the slot text OR the derived const REDs and names the seam. Bytes at `e495855de`.
test("the adapted compaction slot ships the exact bytes DEFAULT_COMPACT_INSTRUCTIONS carried as a source const", () => {
  const frozen =
    "Summarize the roleplay so far for continuation: preserve each character's voice and persona, the " +
    "relationships and their current state, established facts and world details, unresolved threads, and " +
    "the present scene/location. Be concise but lossless on canon — names, commitments, and specific " +
    "details must survive.";
  expect(resolveProseText(PRESET_COMPACTION_SLOT_ID, {})).toBe(frozen);
  expect(DEFAULT_COMPACT_INSTRUCTIONS).toBe(frozen);
  // Adapted like guided/format: preset-homed, but NOT offered a `promptConfig.prose` door (its override is the
  // pre-PROSE-1 field), so it stays OUT of the editable preset-prose set.
  expect(PROSE_SLOTS[PRESET_COMPACTION_SLOT_ID].home).toBe("preset");
  expect(PRESET_PROSE_SLOT_IDS).not.toContain(PRESET_COMPACTION_SLOT_ID);
});

// ── S1: the app-tier cohort's defaults are the PRE-migration constants, byte for byte ───────────────
// The frozen fixture the spec's §10 default-identity discipline demands: these literals are the bytes each
// constant had at `9f7345b3`, re-typed independently of the slot table. A drift in either direction REDs,
// which is what makes "migrating a slot changes nothing until a host types something" a fact, not a claim.
const S1_FROZEN_DEFAULTS: Readonly<Partial<Record<ProseSlotId, string>>> = {
  // packages/server/src/domain/chat/assembly/context.ts — ANCHOR_IDENTITY_PREFIX
  "chat.assembly.anchorIdentity": "The person the character knows as the user is",
  // packages/server/src/domain/chat/engine/smart-arbitrate.ts — SYSTEM_PROMPT. v2 is a one-word VOCABULARY
  // fix ("turn director" → "turn arbiter", the name every id/symbol/control around this slot already uses);
  // the rest of the bytes are the pre-PROSE-1 constant verbatim.
  "chat.arbiter.system":
    "You are a turn arbiter for a multi-character roleplay. Read the recent conversation and the list of " +
    "characters who may speak next, then choose the single character who should speak next. Respond with " +
    "ONLY that character's exact name from the list — no punctuation, no explanation.",
  // packages/server/src/domain/chat/verbs/compaction.ts — COMPACTION_SYSTEM_PROMPT
  "chat.compaction.system":
    "You are a precise conversation summarizer. Produce a faithful, compact summary of the roleplay so far " +
    "that preserves the key facts, character states, decisions, locations, and unresolved threads. Do not " +
    "invent details and do not add commentary — output only the summary.",
  // packages/server/src/domain/chat/memory/generate/substrate/prompts.ts — DIGEST_SYSTEM_PROMPT
  "chat.memory.digestSystem": [
    "You distill a block of roleplay transcript into a retrieval-optimized memory unit.",
    "Output EXACTLY three parts, in order:",
    "1. A topic anchor as the MANDATORY first line, in the form: [entities — scene]",
    "2. Significance-filtered facts — only what will plausibly matter later; drop turn-by-turn small talk.",
    '3. A final line beginning "keywords:" followed by 15-30 concrete, distinctive keywords',
    "   (named entities, places, objects, specifics), comma-separated.",
    "Do not add any commentary, preamble, or markdown headers.",
  ].join("\n"),
  // …same file — CONSOLIDATION_SYSTEM_PROMPT
  "chat.memory.consolidationSystem": [
    "You consolidate several memory digests from EARLIER in a story into ONE higher-level digest",
    "capturing the overall arc across them.",
    "Use the SAME three-part format: a [entities — scene] topic-anchor first line, significance-filtered",
    'facts, and a final "keywords:" line of 15-30 keywords.',
    "The prior digests are provided so you do NOT repeat each verbatim — SYNTHESIZE the arc, do not concatenate.",
  ].join("\n"),
  // …same file — the `consolidationUserPrompt` lead line (the numbered facets stay data)
  "chat.memory.consolidationLead": "Prior digests to consolidate (synthesize the arc across these — do not repeat each):",
  // packages/server/src/domain/imagery/substrate/templates.ts — DEFAULT_NEGATIVE
  "imagery.negative.base":
    "text, letters, captions, subtitles, UI, watermark, logo, signature, speech bubble, " +
    "split screen, panel, collage, grid, duplicated face, extra head, extra person, " +
    "bad anatomy, low quality",
  // packages/server/src/domain/automation/engine/arm-executors.ts — buildAutobgPrompt's two authored clauses
  "automation.autobg.task": "Choose the single background that best fits the current scene.",
  "automation.autobg.reply": "Reply with ONLY the exact name of the chosen background, nothing else.",
};

test("S1 app-tier slots resolve, unset, to the exact bytes their pre-PROSE-1 constants shipped", () => {
  for (const [id, frozen] of Object.entries(S1_FROZEN_DEFAULTS) as [ProseSlotId, string][]) {
    expect(resolveProseText(id, {}), id).toBe(frozen);
  }
});

test("every S1 app-tier slot's stored override wins over its shipped default", () => {
  for (const id of Object.keys(S1_FROZEN_DEFAULTS) as ProseSlotId[]) {
    const overrides: ProseOverrides = { [id]: { text: `host copy for ${id}`, baseVersion: PROSE_SLOTS[id].version } };
    expect(resolveProse(id, overrides), id).toStrictEqual({ text: `host copy for ${id}`, source: "override", stale: false });
  }
});

test("the S1 cohort ships under the app-tier posture: home=user, macros=none (a `{{…}}` in an override is literal)", () => {
  for (const id of Object.keys(S1_FROZEN_DEFAULTS) as ProseSlotId[]) {
    expect(PROSE_SLOTS[id].home, id).toBe("user");
    // §6.1: a summarizer/arbiter/digest prompt runs over a transcript, not a character context — there is no
    // registry to resolve against, so the bytes must ship verbatim rather than silently rendering empty.
    expect(PROSE_SLOTS[id].macros, id).toBe("none");
  }
});

// ── S1b: the inline stragglers (group frames, injection frames, discovery's three whole prompts) ─────
// Same frozen-fixture discipline as S1, with one addition: four of these slots interpolate a caller value,
// so the fixture freezes the RENDERED bytes — `resolveProseText(id, {}, tokens)` must reproduce exactly the
// template literal the server used to author inline.
const S1B_FROZEN_RENDERS: readonly { readonly id: ProseSlotId; readonly tokens: Record<string, string>; readonly rendered: string }[] = [
  // packages/server/src/domain/chat/assembly/assemble.ts — renderCoSpeakerBlock's three headings
  { id: "chat.group.characterHeading", tokens: { name: "Niko" }, rendered: "[Character — Niko]" },
  { id: "chat.group.scenarioHeading", tokens: { name: "Niko" }, rendered: "[Niko's scenario]" },
  { id: "chat.group.exampleHeading", tokens: { name: "Niko" }, rendered: "[Niko's example dialogue]" },
  // packages/server/src/domain/chat/engine/round.ts — buildSpeakerPrep's multi-speaker fence. v2 keeps the
  // original opening bytes verbatim and appends the two failure modes the receive-side clean handles.
  {
    id: "chat.group.roundNudge",
    tokens: { name: "Niko" },
    rendered:
      "[Write the next reply only as Niko. Stay in Niko's voice — their dialogue, actions and thoughts only. " +
      "Do not write lines for the other characters or for the user, and do not open the reply with a name label.]",
  },
  // packages/server/src/domain/chat/engine/round.ts — buildNarratorNudge's two narrator-round parts.
  {
    id: "chat.group.narratorNudge",
    tokens: { names: "Niko, Aria" },
    rendered:
      "[Continue the scene, voicing the present characters (Niko, Aria) as the moment calls for. This is ONE " +
      "reply covering the whole scene — voice as many or as few of them as it needs, in any order, with " +
      "narration in between. Never write lines or actions for the user.]",
  },
  // packages/server/src/domain/chat/assembly/injections.ts — frameInjection's two note frames
  { id: "chat.injection.systemNote", tokens: { note: "stay in scene" }, rendered: "[Take the following into special consideration: stay in scene]" },
  { id: "chat.injection.userNote", tokens: { note: "stay in scene" }, rendered: "[Note from user: stay in scene]" },
  {
    id: "chat.injection.assistantNote",
    tokens: { note: "stay in scene" },
    rendered: "[Take the following into special consideration for your next message: stay in scene]",
  },
];

test("S1b framing slots render, unset, to the exact bytes their inline template literals produced", () => {
  for (const { id, tokens, rendered } of S1B_FROZEN_RENDERS) {
    expect(resolveProseText(id, {}, tokens), id).toBe(rendered);
  }
});

// The three discovery system prompts were file-local template literals in `analyze.ts` / `distill.ts` with no
// catalog entry at all. Re-typed here from those files at `72e10422`.
const DISCOVERY_FROZEN_DEFAULTS: Readonly<Partial<Record<ProseSlotId, string>>> = {
  "discovery.compare.system": `You compare two roleplay characters for a user browsing their own library. You are given a precomputed facet diff (genres, tones, shared vs distinct tags). Ground your read in ONLY that diff — do not invent traits.

Respond with ONLY a JSON object of this exact shape (no prose, no markdown, no <think>):
{"summary":"...","overlap":"...","distinction":"..."}

- summary: ONE sentence — how alike these two are overall.
- overlap: what they genuinely share (from the shared genre/tone/tags).
- distinction: what sets them apart (from the distinct tags + differing genre/tone).`,
  "discovery.ask.system": `You answer a user's question about ONE of their roleplay characters, using ONLY the recent scenes provided. Do not invent facts not present in the scenes.

Respond with ONLY a JSON object of this exact shape (no prose, no markdown, no <think>):
{"answer":"...","grounded":true}

- answer: a direct answer to the question, drawn from the scenes.
- grounded: true if the scenes actually support the answer; false if they don't and you had to guess or the scenes were empty.`,
  "discovery.distill.system": `You distill a roleplay character card into a compact, FILTERABLE summary so a large library can be browsed at a glance.

Respond with ONLY a JSON object of this exact shape (no prose, no markdown, no <think>):
{"genre":"...","subGenres":["..."],"tone":"...","setting":"...","tags":["..."],"elevatorPitch":"...","overview":"..."}

- genre: the single best-fit primary genre (you will be constrained to a fixed list).
- subGenres: 0-3 secondary genres/modes.
- tone: the dominant tone (constrained to a fixed list).
- setting: a short phrase for the world/place ("modern urban fantasy", "feudal Japan").
- tags: 3-8 concrete, distinctive theme/content tags someone would filter by (not generic words).
- elevatorPitch: ONE sentence, broad strokes — who this character is and the hook.
- overview: 2-3 sentences — the character's premise, dynamic, and what RP with them is like. Concrete, no fluff.`,
};

test("discovery's three system prompts resolve, unset, to the exact bytes they had as file-local constants", () => {
  for (const [id, frozen] of Object.entries(DISCOVERY_FROZEN_DEFAULTS) as [ProseSlotId, string][]) {
    expect(resolveProseText(id, {}), id).toBe(frozen);
  }
});

// ── S3: the per-GAME steering-reminder cohort (census 1-10) — frozen at the bytes each constant carried in
// `domain/rpg/substrate/reminder.ts` + `delta.ts` at `48e679d02`, re-typed independently of the slot table.
// A drift in EITHER the slot text OR the reminder-derived const (`RPG_STEERING_LICENSE = PROSE_SLOTS[…].text`)
// REDs, which is what makes "the reminder ships the same bytes it always did" a fact, not a claim. The card
// example's LEADING BLANK LINE is load-bearing (it separates the example from the ask) — the resolver must not
// trim it, which is why `resolveTeach` (reminder.ts) does not route macro-free text through the trimming
// guided resolver.
const RPG_FROZEN_DEFAULTS: Readonly<Partial<Record<ProseSlotId, string>>> = {
  "rpg.reminder.steeringLicense":
    "These tracked values are live state for THIS story — let them visibly shape behaviour, dialogue, and the scene as you narrate. When a value changes, let the change land in the fiction. Never recite the raw numbers back at the player; weave them into the prose.",
  "rpg.reminder.deceptionTeach":
    'DECEPTION: a character may deceive the player. When a character states something they know to be false, emit — on its own, right after the spoken lie — a self-closing tag recording the truth: <lie character="who is lying" type="the kind of lie" truth="what is actually true" reason="why they lie" />. This tag is INVISIBLE to the player but you REMEMBER it, so keep the deception consistent and let it have consequences later. Never reveal the truth in your prose or narration — only in the tag.',
  "rpg.reminder.omniscienceTeach":
    'PERCEPTION: the player perceives only what their character can. When something happens beyond their perception (offscreen, hidden, a secret another character keeps), emit a self-closing tag recording it: <ofilter event="what happened out of their perception" reason="why they cannot perceive it" />. This tag is INVISIBLE to the player but you REMEMBER it — narrate only what the player CAN perceive, and let the unperceived event shape the world consistently.',
  "rpg.card.askInteractive":
    'When it fits the scene — an in-world screen, letter, poster, sign, book page, map, UI panel, or any visual the characters would encounter — you may render an immersive card. Open with `:::card title="a short label"` on its own line, then your HTML/CSS/JS, then `:::` on its own line. Make whatever fits the moment — animations, layouts, interactive bits are all welcome. Everything must be self-contained markup and CSS — no images at all (external URLs and inline data: URIs are BOTH blocked by the platform security policy; a card with an <img> renders with a hole in it). Paint textures, shapes and iconography with CSS instead. Do not wrap it in a code fence. Close the card with its own `:::` line BEFORE you open any other directive (a `:::choices` block never goes inside a card). Cards are for things the CHARACTERS see in the world — never a status readout, stat block, or tracker display; the tracked values stay woven into your prose, never recited.',
  "rpg.card.askStatic":
    'When it fits the scene — an in-world screen, letter, poster, sign, book page, map, UI panel, or any visual the characters would encounter — you may render an immersive card. Open with `:::card title="a short label"` on its own line, then your HTML/CSS, then `:::` on its own line. Keep it a still visual — no scripts or animations, just an in-world page for the reader. Everything must be self-contained markup and CSS — no images at all (external URLs and inline data: URIs are BOTH blocked by the platform security policy; a card with an <img> renders with a hole in it). Paint textures, shapes and iconography with CSS instead. Do not wrap it in a code fence. Close the card with its own `:::` line BEFORE you open any other directive (a `:::choices` block never goes inside a card). Cards are for things the CHARACTERS see in the world — never a status readout, stat block, or tracker display; the tracked values stay woven into your prose, never recited.',
  "rpg.card.example": `

For example, a three-line sign is enough:
:::card title="Crossing sign"
<div style="font-family:monospace;text-align:center;padding:14px;border:2px solid #6b5c3e;background:#e9e1cb;color:#3a2f1c;letter-spacing:2px">
  <div>EAST CROSSING</div><div>CLINIC — 2 KM</div><div>NO ENTRY AFTER DARK</div>
</div>
:::`,
  "rpg.reminder.cyoaTeach":
    "CHOICES: end every response with a set of choices for the player. After your narration, add a line containing exactly :::choices then 3-5 numbered options (1. ...), each a distinct action the player could take next, then a line containing exactly ::: on its own. Keep each option one sentence, concrete, and meaningfully different from the others.",
  "rpg.reminder.castHeader":
    "Present (appearance/outfit are standing — describe them consistently, not re-invented; thoughts are UNSPOKEN inner state, never said aloud):",
  "rpg.reminder.offstageHeader": "Known, offstage (established characters not in this scene — bring them back consistently, never re-introduce them):",
  "rpg.delta.changesHeading": "CHANGES SINCE LAST BEAT",
  "rpg.delta.sceneOpensHeading": "SCENE OPENS",
};

test("S3 rpg reminder slots resolve, unset, to the exact bytes their pre-PROSE-1 constants shipped", () => {
  for (const [id, frozen] of Object.entries(RPG_FROZEN_DEFAULTS) as [ProseSlotId, string][]) {
    expect(resolveProseText(id, {}), id).toBe(frozen);
  }
});

test("the whole rpg cohort is PRESET-homed; the teaches are names-only, the headers/headings are none", () => {
  // RE-HOMED 2026-08-08 (owner: "we are putting everything in presets"). This row asserted `home:"game"` for one
  // merge; the game storage — `config.prose`, the `updateConfig.patch.prose` arm, the fork strip — is deleted, so
  // `preset` is not a relabel: it is what routes each slot into `promptConfig.prose`, `composeProse`'s preset
  // source, and a Templates-tab row. The BYTES are untouched (the frozen cohort above is the proof).
  const namesOnly = new Set<ProseSlotId>([
    "rpg.reminder.steeringLicense",
    "rpg.reminder.deceptionTeach",
    "rpg.reminder.omniscienceTeach",
    "rpg.card.askInteractive",
    "rpg.card.askStatic",
    "rpg.card.example",
    "rpg.reminder.cyoaTeach",
  ]);
  for (const id of Object.keys(RPG_FROZEN_DEFAULTS) as ProseSlotId[]) {
    expect(PROSE_SLOTS[id].home, id).toBe("preset");
    expect(PROSE_SLOTS[id].macros, id).toBe(namesOnly.has(id) ? "names-only" : "none");
    // Editable through the preset door — and only that one (the user editor must not offer a second door into a
    // storage this slot does not use, which is the same no-two-doors rule the legacy-adapted slots ride).
    expect(PRESET_PROSE_SLOT_IDS, id).toContain(id);
    expect(USER_PROSE_SLOT_IDS, id).not.toContain(id);
  }
});

test("the `game` prose HOME is retired — no slot claims it and the vocabulary no longer offers it", () => {
  // The storage a slot's `home` names must exist. `game` named `rpg_games.config.prose`, deleted by the same
  // ruling; leaving the member would let a future table row re-open the storage the ruling closed, with nothing
  // in the type system to stop it (`ProseHome` is the only gate `composeProse`'s source map has).
  expect(PROSE_HOMES).toStrictEqual(["preset", "user"]);
  expect(PROSE_SLOT_IDS.filter((id) => (PROSE_SLOTS[id].home as string) === "game")).toStrictEqual([]);
});

test("every rpg cohort slot's stored override wins over its shipped default", () => {
  for (const id of Object.keys(RPG_FROZEN_DEFAULTS) as ProseSlotId[]) {
    const overrides: ProseOverrides = { [id]: { text: `host copy for ${id}`, baseVersion: PROSE_SLOTS[id].version } };
    expect(resolveProse(id, overrides), id).toStrictEqual({ text: `host copy for ${id}`, source: "override", stale: false });
  }
});

test("every S1b slot's stored override wins, and the whole cohort ships an editable home / macros=none", () => {
  const ids = [...S1B_FROZEN_RENDERS.map((r) => r.id), ...(Object.keys(DISCOVERY_FROZEN_DEFAULTS) as ProseSlotId[])];
  for (const id of ids) {
    const overrides: ProseOverrides = { [id]: { text: `host copy for ${id}`, baseVersion: PROSE_SLOTS[id].version } };
    expect(resolveProse(id, overrides), id).toStrictEqual({ text: `host copy for ${id}`, source: "override", stale: false });
    // Was `toBe("user")` for the whole cohort until the 2026-08-07 ruling split the two injection frames off to
    // the PRESET home, and the 2026-08-08 F4 re-home moved the seven group framings there too — so today only
    // the discovery slots take the `user` arm. The invariant this row actually guards is "a host can reach these
    // bytes SOMEWHERE", and the per-home membership is pinned exactly by the two derivation tests below —
    // asserting `user` here as well only re-spelled one of them, wrongly.
    expect(PROSE_SLOTS[id].home === "user" || isPresetProseSlotId(id), id).toBe(true);
    // The framing slots carry a `{{name}}`/`{{note}}` PRE-SUBSTITUTION token, not a macro: the caller splices
    // it, the engine never runs. `none` is what makes that honest (and keeps any other `{{…}}` literal).
    expect(PROSE_SLOTS[id].macros, id).toBe("none");
  }
});

// ── The pre-substitution token mechanism (the `{{person}}`/`{{base}}` guided precedent) ─────────────
test("a host override's own token is substituted too — the frame stays editable, the value stays the caller's", () => {
  const overrides: ProseOverrides = { "chat.injection.userNote": { text: "<<from the table: {{note}}>>", baseVersion: 1 } };
  expect(resolveProseText("chat.injection.userNote", overrides, { note: "look up" })).toBe("<<from the table: look up>>");
});

test("an override that DROPS the token loses the value it carried — the documented cost of the warn-not-block lint", () => {
  // Not a bug to fix here: PROSE-1 §6.3 is explicit that `requiredMacros` is an editor WARN, never a server
  // rejection. This test pins the consequence so the editor surface knows exactly what it is warning about.
  const overrides: ProseOverrides = { "chat.group.roundNudge": { text: "[Next speaker only.]", baseVersion: 1 } };
  expect(resolveProseText("chat.group.roundNudge", overrides, { name: "Niko" })).toBe("[Next speaker only.]");
});

test("a `$&`/`$1` inside a substituted value is LITERAL — the replacement is a function, not a pattern", () => {
  // A character name or an injection body is user data; `String.replace`'s `$` patterns would silently
  // duplicate the frame's own bytes into the prompt.
  expect(resolveProseText("chat.group.characterHeading", {}, { name: "$& $1 $$" })).toBe("[Character — $& $1 $$]");
});

test("omitting `tokens` ships the text verbatim — every token-free slot and every legacy caller is untouched", () => {
  expect(resolveProseText("chat.group.characterHeading", {})).toBe("[Character — {{name}}]");
  expect(resolveProseText("chat.arbiter.system", {}, { name: "Niko" })).toBe(PROSE_SLOTS["chat.arbiter.system"].text);
});

test("adapted imagery slots are byte-identical to the shipped catalog", () => {
  for (const [mode, id] of Object.entries(IMAGERY_TEMPLATE_SLOT_IDS)) {
    expect(resolveProseText(id, {})).toBe(DEFAULT_PROMPT_TEMPLATES[mode as keyof typeof DEFAULT_PROMPT_TEMPLATES]);
  }
  for (const [mode, id] of Object.entries(IMAGERY_CAPTION_SLOT_IDS)) {
    expect(resolveProseText(id, {})).toBe(DEFAULT_CAPTION_INSTRUCTIONS[mode as keyof typeof DEFAULT_CAPTION_INSTRUCTIONS]);
  }
});

// ── The editable cohort (S2) — what the Prose settings section offers a host ─────────────────────────
test('USER_PROSE_SLOT_IDS is every `home:"user"` slot whose override is stored in `UserSettings.prose`', () => {
  // DERIVED, never hand-listed: the day a user-home table row lands, the editor offers it. The six
  // legacy-adapted imagery fields are excluded because their override storage is `UserSettings.imagery`
  // (§4.6 — adapt, never duplicate), and a second door would write bytes the resolver never reads.
  const legacy = new Set<ProseSlotId>([...Object.values(IMAGERY_TEMPLATE_SLOT_IDS), ...Object.values(IMAGERY_CAPTION_SLOT_IDS)]);
  const expected = PROSE_SLOT_IDS.filter((id) => PROSE_SLOTS[id].home === "user" && !legacy.has(id));
  expect(USER_PROSE_SLOT_IDS).toStrictEqual(expected);
  expect(USER_PROSE_SLOT_IDS.some((id) => legacy.has(id))).toBe(false);
  expect(USER_PROSE_SLOT_IDS).toContain("imagery.negative.base");
});

test("no editable slot id NESTS inside another — the settings key-partition would throw at the door", () => {
  // `UserSettings.prose` keys ARE slot ids, so the section claims dotted keys. The partition's nesting arm
  // reads `a.b` beside `a.b.c` as a parent/child pair (it is one, for every other namespace), which would
  // throw at composition-root init — a white screen at boot. Keep ids sibling-shaped.
  for (const id of USER_PROSE_SLOT_IDS) {
    expect(USER_PROSE_SLOT_IDS.filter((other) => other.startsWith(`${id}.`))).toStrictEqual([]);
  }
});

// ── The PRESET-homed framings (owner ruling 2026-08-07) ─────────────────────────────────────────────
test('PRESET_PROSE_SLOT_IDS is every `home:"preset"` slot whose override is stored in `promptConfig.prose`', () => {
  // The mirror of the USER derivation above, excluding the same class for the same reason: the eleven
  // guided/format slots are `home:"preset"` too, but their override storage is the pre-PROSE-1
  // `guidedActions.*.prompt` / `formatStrings.*` field (§4.6), so giving them a `prose` key as well would be
  // the two-doors defect with the resolver reading only one of them.
  const legacyAdapted = new Set<ProseSlotId>([...Object.values(PRESET_GUIDED_SLOT_IDS), ...Object.values(PRESET_FORMAT_SLOT_IDS), PRESET_COMPACTION_SLOT_ID]);
  const expected = PROSE_SLOT_IDS.filter((id) => PROSE_SLOTS[id].home === "preset" && !legacyAdapted.has(id));
  expect(PRESET_PROSE_SLOT_IDS).toStrictEqual(expected);
  // Spelled out so a slot JOINING or LEAVING the preset-editable set is a decision somebody reads, not a silent
  // derivation shift: the GROUP-ROOM framings (the F4 re-home, 2026-08-08, plus the multi-human person heading —
  // they precede the injection frames in the tuple), the three turn-wire framings (2026-08-07), the eleven rpg game-turn teaches (the
  // 2026-08-08 re-home), the forty-one EXTRACTION-seam slots (PROSE-1 S4 + census row 27, wired by the
  // 2026-08-08 decision-6 ruling), and the seven BORN-STATE round slots (the populate census rows 1-7), in
  // `PROSE_SLOT_IDS` tuple order. The twenty-one ONE-CLICK STEER slots lead: census 53-73, the templating
  // fork's ARM B (owner 2026-08-09) — the Rewrite modal's seven toggle sentences and the greeting studio's
  // fourteen transform sentences, which used to be `as const` catalog data joined in the browser.
  expect(PRESET_PROSE_SLOT_IDS).toStrictEqual([
    "preset.rewriteToggle.concise",
    "preset.rewriteToggle.expand",
    "preset.rewriteToggle.novella",
    "preset.rewriteToggle.internetRp",
    "preset.rewriteToggle.literary",
    "preset.rewriteToggle.pastTense",
    "preset.rewriteToggle.presentTense",
    "preset.greetingTransform.firstPersonStandard",
    "preset.greetingTransform.firstPersonByName",
    "preset.greetingTransform.firstPersonAsYou",
    "preset.greetingTransform.secondPerson",
    "preset.greetingTransform.thirdPerson",
    "preset.greetingTransform.pastTense",
    "preset.greetingTransform.presentTense",
    "preset.greetingTransform.novellaStyle",
    "preset.greetingTransform.internetRpStyle",
    "preset.greetingTransform.literaryStyle",
    "preset.greetingTransform.scriptStyle",
    "preset.greetingTransform.heHim",
    "preset.greetingTransform.sheHer",
    "preset.greetingTransform.theyThem",
    "chat.group.characterHeading",
    "chat.group.scenarioHeading",
    "chat.group.exampleHeading",
    "chat.group.personaHeading",
    "chat.group.roundNudge",
    "chat.group.narratorNudge",
    "chat.group.speakerTags",
    "chat.injection.systemNote",
    "chat.injection.userNote",
    "chat.injection.assistantNote",
    "chat.assembly.continuationNudge",
    "rpg.reminder.steeringLicense",
    "rpg.reminder.deceptionTeach",
    "rpg.reminder.omniscienceTeach",
    "rpg.card.askInteractive",
    "rpg.card.askStatic",
    "rpg.card.example",
    "rpg.reminder.cyoaTeach",
    "rpg.reminder.castHeader",
    "rpg.reminder.offstageHeader",
    "rpg.delta.changesHeading",
    "rpg.delta.sceneOpensHeading",
    "rpg.extract.deceptionSurface",
    "rpg.extract.party.resources",
    "rpg.extract.party.states",
    "rpg.extract.party.trackerScope",
    "rpg.extract.scene.core",
    "rpg.extract.scene.clock",
    "rpg.extract.scene.weather",
    "rpg.extract.scene.dayStructured",
    "rpg.extract.scene.dayNarrated",
    "rpg.extract.scene.present",
    "rpg.extract.scene.mood",
    "rpg.extract.scene.emoji",
    "rpg.extract.scene.plot",
    "rpg.extract.plane.party",
    "rpg.extract.plane.inventory",
    "rpg.extract.plane.trackers",
    "rpg.extract.plane.quests",
    "rpg.extract.plane.journal",
    "rpg.extract.journal.customType",
    "rpg.extract.journal.customLabels",
    "rpg.extract.stateTrackingGuide",
    "rpg.extract.reconcileDoctrine",
    "rpg.extract.tool.updateParty",
    "rpg.extract.tool.partyExample",
    "rpg.extract.tool.updateInventory",
    "rpg.extract.tool.updateScene",
    "rpg.extract.tool.setTracker",
    "rpg.extract.tool.upsertQuest",
    "rpg.extract.tool.addJournalEntry",
    "rpg.extract.tool.noChanges",
    "rpg.extract.systemHeader",
    "rpg.extract.toolRoundHeader",
    "rpg.extract.reconcilePass",
    "rpg.extract.foldedReconcile",
    "rpg.extract.lockedPaths",
    "rpg.extract.refs.targets",
    "rpg.extract.refs.playerToken",
    "rpg.extract.refs.trackerGroup",
    "rpg.extract.refs.gameTrackerKeys",
    "rpg.extract.refs.conditions",
    "rpg.extract.refs.closing",
    // JOINED 2026-08-23: the #578 debt-prose burn homed the latest-beat label and the roll_dice tool
    // description as preset-editable slots — both land in the Templates tab (TEMPLATE_DEFS rows added
    // in the same change; drain-time coupled-fixture reconcile after the wave-2/3 merges).
    "rpg.extract.userPrompt.latestBeatLabel",
    "rpg.extract.tool.rollDice",
    "rpg.populate.systemHeader",
    "rpg.populate.identity",
    "rpg.populate.doctrine",
    "rpg.populate.cardBlock",
    "rpg.populate.emptyCard",
    "rpg.populate.openingBlock",
    "rpg.populate.targetLine",
  ]);
});

test("every preset-homed prose slot has a Templates-tab row, and every prose-armed row is one of them", () => {
  // THE TWO-SIDED COVERAGE the `TemplateDefId` prose arm cannot express in the type system (`#preset` cannot
  // import `#prose`, which is where `home` lives).
  //
  // The right-to-left arm filters by `isProseSlotId`, NOT `isPresetProseSlotId` — that distinction is the
  // whole arm. Filtering by the PRESET predicate would EXCLUDE the very row this is meant to catch (a def
  // pointing at a user-homed or legacy-adapted slot simply falls out of the collection and the assertion
  // passes vacuously). Widening to "is a prose slot id at all" makes a mis-homed row show up on the left of
  // the comparison, where it fails. Verified by planting one: a row id of `chat.arbiter.system` (user-homed)
  // is caught here, and was NOT caught by the earlier `isPresetProseSlotId` spelling.
  const framingRows = TEMPLATE_DEFS.filter((def) => isProseSlotId(def.id));
  expect(framingRows.map((def) => def.id).toSorted()).toStrictEqual([...PRESET_PROSE_SLOT_IDS].toSorted());
  // …and every one of them really is preset-homed and prose-stored (the same fact stated as the property,
  // so a failure names the home rather than just a set difference).
  expect(framingRows.filter((def) => !isPresetProseSlotId(def.id)).map((def) => def.id)).toStrictEqual([]);
  // A framing row ghosts ITS OWN slot: its id IS its storage key, so a `defaultSlot` pointing elsewhere would
  // print one template's bytes as the placeholder over another template's field. Collected then asserted once
  // — an `expect` inside the filter's branch is a conditional expectation that can vacuously pass.
  expect(framingRows.filter((def) => def.defaultSlot !== def.id).map((def) => def.id)).toStrictEqual([]);
});

test("composeProse merges the homes and DROPS a key stored in the wrong one (no cascade)", () => {
  const userBlob: ProseOverrides = {
    "chat.arbiter.system": { text: "user-tier arbiter", baseVersion: 1 },
    // The stale key a RE-HOME leaves behind: written while the frame was user-homed, inert ever since. It
    // must not win, and it must not throw — pre-launch NO-LEGACY means nothing migrated it away.
    "chat.injection.userNote": { text: "STALE user-tier frame", baseVersion: 1 },
  };
  const presetBlob: ProseOverrides = {
    "chat.injection.userNote": { text: "((preset frame: {{note}}))", baseVersion: 1 },
    // The mirror case: an app-tier slot key sitting in a preset blob resolves from neither storage.
    "chat.compaction.system": { text: "WRONG HOME", baseVersion: 1 },
  };
  const composed = composeProse({ user: userBlob, preset: presetBlob });
  expect(resolveProseText("chat.injection.userNote", composed, { note: "hi" })).toBe("((preset frame: hi))");
  expect(resolveProseText("chat.arbiter.system", composed)).toBe("user-tier arbiter");
  expect(resolveProseText("chat.compaction.system", composed)).toBe(PROSE_SLOTS["chat.compaction.system"].text);
});

// ── A BLANK override is ABSENT (the empty-bytes hole) ───────────────────────────────────────────────
// `{text:""}` PARSES — `proseOverrideSchema` has no min length — so it can reach the resolver from an
// imported preset file, a direct API write, or a blob written before the editors normalized. Resolving it
// literally puts EMPTY BYTES on the wire: `frameInjection` returns the frame with the injection's content
// gone, and the continuation cue appends an empty user row. The editors drop the key on save; this is the
// read-side heal that covers everything that never came through an editor.
test("a blank / whitespace-only override resolves to the shipped default, not to empty bytes", () => {
  for (const text of ["", "   ", "\n\t "]) {
    const blank: ProseOverrides = { "chat.injection.userNote": { text, baseVersion: 1 } };
    expect(resolveProse("chat.injection.userNote", blank).source, JSON.stringify(text)).toBe("default");
    // The rendered proof, at the seam that matters: the note's own content still reaches the wire.
    expect(resolveProseText("chat.injection.userNote", blank, { note: "keep it short" })).toBe("[Note from user: keep it short]");
  }
});

test("a blank override never reports STALE either — it is not an authored edit to keep or replace", () => {
  // Reporting stale on a blank would offer a host "keep mine" over bytes that are not theirs and do not run.
  expect(resolveProse("chat.injection.userNote", { "chat.injection.userNote": { text: "  ", baseVersion: 0 } })).toStrictEqual({
    text: PROSE_SLOTS["chat.injection.userNote"].text,
    source: "default",
    stale: false,
  });
});

// ── The shared editor FOOTER (moved here from `features/chat/lib/prose-settings-model` on 2026-08-07) ──
// Two client features render it (the Prose settings cards and the preset Templates drill-in) and a feature
// may not import another (D70), so the derivation lives in contracts and its tests live with it.
test("the footer reads Default while the field is empty, whatever is still stored (the next save clears it)", () => {
  const stored: ProseOverride = { text: "an override about to be cleared", baseVersion: 1 };
  expect(proseFooterState("chat.arbiter.system", "", stored)).toEqual({ isDefault: true, stale: false, missing: [], over: 0 });
});

test("`over` counts the TRIMMED excess over PROSE_MAX_CHARS — the one BLOCKING signal in the footer", () => {
  // WHY the footer carries a BLOCKING signal at all, when `missing`/`stale` are ruled warn-never-block:
  // `proseOverridesSchema`'s per-key `.catch(undefined)` makes an over-cap override VANISH rather than fail
  // (pinned in `tests/contracts/prose-slot/`), so a save at this length does not error — it deletes the
  // host's text and lets the shipped default ride. `over` is what the two editors refuse on.
  expect(proseFooterState("chat.arbiter.system", "x".repeat(PROSE_MAX_CHARS), undefined).over).toBe(0);
  // Measured on what gets STORED: both editors trim at their save boundary, so padding must never be what
  // refuses a save whose actual payload fits.
  expect(proseFooterState("chat.arbiter.system", `   ${"x".repeat(PROSE_MAX_CHARS)}   `, undefined).over).toBe(0);
  expect(proseFooterState("chat.arbiter.system", "x".repeat(PROSE_MAX_CHARS + 7), undefined).over).toBe(7);
});

test("the required-token lint bites only text the host actually wrote, and names the missing token", () => {
  expect(proseFooterState("chat.group.roundNudge", "Write the next reply.", undefined).missing).toEqual(["{{name}}"]);
  expect(proseFooterState("chat.group.roundNudge", "[Write the next reply only as {{name}}.]", undefined).missing).toEqual([]);
  // The shipped default carries every required token by construction, so an empty field never lints.
  expect(proseFooterState("chat.group.roundNudge", "", undefined).missing).toEqual([]);
});

test("a framing override that drops {{note}} LINTS — the token is the payload carrier, and it is a warn", () => {
  // The preset drill-in's whole reason for carrying this footer: dropping `{{note}}` renders the wrapper with
  // the injection's content GONE, and nothing in the field itself shows it. Warn, never block (§6.3) — the
  // deliberate contrast with `FORMAT_STRING_CARRIER_TOKENS`, which refuses at the write boundary.
  expect(proseFooterState("chat.injection.userNote", "((the table says something))", undefined).missing).toEqual(["{{note}}"]);
  expect(proseFooterState("chat.injection.userNote", "((the table says: {{note}}))", undefined).missing).toEqual([]);
  // The chip must not lie: `{{ note }}` (spaced) and `{{NOTE}}` (cased) are exactly what `spliceProseTokens`
  // fills — the recognizer here is `hasProseToken`, the SAME regex the splice uses, not a raw `.includes`.
  expect(proseFooterState("chat.injection.userNote", "((the table says: {{ note }}))", undefined).missing).toEqual([]);
  expect(proseFooterState("chat.injection.userNote", "((the table says: {{NOTE}}))", undefined).missing).toEqual([]);
});

test("stale = the shipped default moved on since this override was authored, and only while it is unedited", () => {
  // Every slot ships at version 1 today, so `baseVersion: 0` is the only way to express "authored against an
  // older version" until a default is first revised — which is exactly the state a real `baseVersion: 1`
  // override lands in the day a slot bumps to 2.
  const older: ProseOverride = { text: "my own arbiter prompt", baseVersion: 0 };
  expect(proseFooterState("chat.arbiter.system", older.text, older).stale).toBe(true);
  // Mid-edit the pending save re-stamps the version, so the chip must not linger over unsaved text.
  expect(proseFooterState("chat.arbiter.system", `${older.text} plus a thought`, older).stale).toBe(false);
  expect(proseFooterState("chat.arbiter.system", older.text, { text: older.text, baseVersion: PROSE_SLOTS["chat.arbiter.system"].version }).stale).toBe(false);
});

test("composeProse over empty/absent sources is byte-identical to the shipped defaults", () => {
  for (const source of [composeProse({}), composeProse({ user: {}, preset: undefined })]) {
    for (const id of PROSE_SLOT_IDS) {
      expect(resolveProse(id, source).source, id).toBe("default");
    }
  }
});
