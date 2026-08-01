// PROSE-1 §10 contract suite for `@orb/contracts/prose` — the resolution machinery, the versioned-defaults
// mechanism, and the default-identity discipline that makes every migration stage a no-op until a host types
// something. These are the tests that make an unbumped default revision, a duplicated slot and a
// half-registered id impossible rather than merely discouraged.
import { createHash } from "node:crypto";
import { DEFAULT_CAPTION_INSTRUCTIONS, DEFAULT_PROMPT_TEMPLATES, IMAGERY_CAPTION_SLOT_IDS, IMAGERY_TEMPLATE_SLOT_IDS } from "@orb/contracts/imagery";
import { DEFAULT_FORMAT_STRINGS, DEFAULT_GUIDED_ACTIONS, PRESET_FORMAT_SLOT_IDS, PRESET_GUIDED_SLOT_IDS } from "@orb/contracts/preset";
import type { ProseOverrides, ProseSlotId } from "@orb/contracts/prose";
import { legacyProseOverrides, PROSE_HOMES, PROSE_MACRO_MODES, PROSE_SLOT_IDS, PROSE_SLOTS, resolveProse, resolveProseText } from "@orb/contracts/prose";
import baseline from "../../../packages/contracts/src/prose/prose-baseline.json" with { type: "json" };
import { expect, test } from "../../support/fixtures";

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
});

// ── S1: the app-tier cohort's defaults are the PRE-migration constants, byte for byte ───────────────
// The frozen fixture the spec's §10 default-identity discipline demands: these literals are the bytes each
// constant had at `9f7345b3`, re-typed independently of the slot table. A drift in either direction REDs,
// which is what makes "migrating a slot changes nothing until a host types something" a fact, not a claim.
const S1_FROZEN_DEFAULTS: Readonly<Partial<Record<ProseSlotId, string>>> = {
  // packages/server/src/domain/chat/assembly/context.ts — ANCHOR_IDENTITY_PREFIX
  "chat.assembly.anchorIdentity": "The person the character knows as the user is",
  // packages/server/src/domain/chat/engine/smart-arbitrate.ts — SYSTEM_PROMPT
  "chat.arbiter.system":
    "You are a turn director for a multi-character roleplay. Read the recent conversation and the list of " +
    "characters who may speak next, then choose the single character who should speak next. Respond with " +
    "ONLY that character's exact name from the list — no punctuation, no explanation.",
  // packages/server/src/domain/chat/verbs/compaction.ts — COMPACTION_SYSTEM_PROMPT
  "chat.compaction.system":
    "You are a precise conversation summarizer. Produce a faithful, compact summary of the roleplay so far " +
    "that preserves the key facts, character states, decisions, locations, and unresolved threads. Do not " +
    "invent details and do not add commentary — output only the summary.",
  // packages/server/src/domain/chat/memory/build/substrate/prompts.ts — DIGEST_SYSTEM_PROMPT
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

test("adapted imagery slots are byte-identical to the shipped catalog", () => {
  for (const [mode, id] of Object.entries(IMAGERY_TEMPLATE_SLOT_IDS)) {
    expect(resolveProseText(id, {})).toBe(DEFAULT_PROMPT_TEMPLATES[mode as keyof typeof DEFAULT_PROMPT_TEMPLATES]);
  }
  for (const [mode, id] of Object.entries(IMAGERY_CAPTION_SLOT_IDS)) {
    expect(resolveProseText(id, {})).toBe(DEFAULT_CAPTION_INSTRUCTIONS[mode as keyof typeof DEFAULT_CAPTION_INSTRUCTIONS]);
  }
});
