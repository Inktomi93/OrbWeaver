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

test("adapted imagery slots are byte-identical to the shipped catalog", () => {
  for (const [mode, id] of Object.entries(IMAGERY_TEMPLATE_SLOT_IDS)) {
    expect(resolveProseText(id, {})).toBe(DEFAULT_PROMPT_TEMPLATES[mode as keyof typeof DEFAULT_PROMPT_TEMPLATES]);
  }
  for (const [mode, id] of Object.entries(IMAGERY_CAPTION_SLOT_IDS)) {
    expect(resolveProseText(id, {})).toBe(DEFAULT_CAPTION_INSTRUCTIONS[mode as keyof typeof DEFAULT_CAPTION_INSTRUCTIONS]);
  }
});
