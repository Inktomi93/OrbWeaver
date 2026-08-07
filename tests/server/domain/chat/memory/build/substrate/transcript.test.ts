import type { CharacterId, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RowMacroNameContext } from "@orb/kit/macro";
import { DEFAULT_PERSONA_NAME } from "@orb/kit/persona";
import { describe } from "vitest";
import {
  blockHash,
  blockSpeakerIds,
  renderTranscript,
  sliceBlocks,
  speakerLabel,
} from "../../../../../../../packages/server/src/domain/chat/memory/build/substrate/transcript.ts";
import type { MsgRow } from "../../../../../../../packages/server/src/domain/chat/memory/types.ts";
import { expect, test } from "../../../../../../support/fixtures.ts";

const aria = castId<CharacterId>("character_aria");
const cole = castId<CharacterId>("character_cole");
const nate = castId<UserId>("user_nate");
const bram = castId<UserId>("user_bram");
const mara = castId<PersonaId>("persona_mara");
const vex = castId<PersonaId>("persona_vex");

function row(seq: number, over: Partial<MsgRow> = {}): MsgRow {
  return {
    seq,
    role: "assistant",
    characterId: aria,
    authorUserId: null,
    personaId: null,
    content: `m${seq}`,
    ...over,
  };
}

/** Build a `resolveRowMacros` producer context from entry lists (the test analog of the live per-chat
 *  producer the engine/backfill thread into the build). */
function macroCtx(over?: {
  readonly chars?: readonly (readonly [CharacterId, string])[];
  readonly personas?: readonly (readonly [PersonaId, string, string?])[];
}): RowMacroNameContext {
  return {
    characterNamesById: new Map((over?.chars ?? []).map(([id, name]) => [id, { name }])),
    personaNamesById: new Map((over?.personas ?? []).map(([id, name, description]) => [id, { name, description: description ?? "" }])),
  };
}

const EMPTY_CTX = macroCtx();

describe("memory/build/substrate/transcript", () => {
  test("sliceBlocks yields only COMPLETE fixed-width blocks (the trailing partial is dropped)", () => {
    const rows = Array.from({ length: 5 }, (_, i) => row(i + 1));
    const blocks = sliceBlocks(rows, 2);
    expect(blocks).toHaveLength(2); // 5 / 2 → 2 complete blocks, last msg dropped
    expect(blocks[0]).toMatchObject({ blockIdx: 0, seqStart: 1, seqEnd: 2 });
    expect(blocks[1]).toMatchObject({ blockIdx: 1, seqStart: 3, seqEnd: 4 });
  });

  test("speakerLabel resolves a character name, else a role label", () => {
    const ctx = macroCtx({ chars: [[aria, "Aria"]] });
    expect(speakerLabel(row(1), ctx)).toBe("Aria");
    expect(speakerLabel(row(1, { characterId: cole }), ctx)).toBe(cole); // unknown → id fallback
    expect(speakerLabel(row(1, { characterId: null, authorUserId: nate }), ctx)).toBe("User");
    expect(speakerLabel(row(1, { characterId: null, authorUserId: null, role: "system" }), ctx)).toBe("System");
  });

  test("renderTranscript renders Label: body lines oldest→newest", () => {
    const ctx = macroCtx({ chars: [[aria, "Aria"]] });
    const out = renderTranscript([row(1), row(2, { content: "hi" })], ctx);
    expect(out).toBe("Aria: m1\nAria: hi");
  });

  test("G1: the BODY resolves {{char}}→the row's character and {{user}}→the row's persona (never the raw macro or typeid)", () => {
    const ctx = macroCtx({
      chars: [[aria, "Aria"]],
      personas: [[mara, "Mara", "a wandering knight"]],
    });
    const rows = [
      // an AI line owns its `{{char}}`; a user line owns its `{{user}}`/`{{persona}}` (per-row stamps).
      row(1, { characterId: aria, content: "I am {{char}}." }),
      row(2, {
        characterId: null,
        authorUserId: nate,
        personaId: mara,
        content: "and I am {{user}} — {{persona}}.",
      }),
    ];
    const out = renderTranscript(rows, ctx);
    expect(out).toBe("Aria: I am Aria.\nUser: and I am Mara — a wandering knight.");
    // the summarizer/embedding NEVER sees the literal macro or the id typeid.
    expect(out).not.toContain("{{");
    expect(out).not.toContain("persona_mara");
    expect(out).not.toContain("character_aria");
  });

  test("G1 multi-human: two humans' rows resolve to their OWN persona names (not both the generic 'User')", () => {
    const ctx = macroCtx({
      personas: [
        [mara, "Mara"],
        [vex, "Vex"],
      ],
    });
    const rows = [
      row(1, {
        characterId: null,
        authorUserId: nate,
        personaId: mara,
        content: "{{user}} enters",
      }),
      row(2, {
        characterId: null,
        authorUserId: bram,
        personaId: vex,
        content: "{{user}} follows",
      }),
    ];
    const out = renderTranscript(rows, ctx);
    // both LABELS are the generic "User" (label is role-based), but the BODIES distinguish the two humans.
    expect(out).toBe("User: Mara enters\nUser: Vex follows");
    expect(out).toContain("Mara enters");
    expect(out).toContain("Vex follows");
  });

  test("blockHash is deterministic + name-INDEPENDENT but re-attribution-SENSITIVE (character axis)", () => {
    const ctx1 = macroCtx({ chars: [[aria, "Aria"]] });
    const ctx2 = macroCtx({ chars: [[aria, "Renamed"]] });
    const rows = [row(1), row(2)];
    const h = blockHash("0:0", rows);
    // a rename does NOT change the hash (it folds the stable id, not the name)
    expect(blockHash("0:0", rows)).toBe(h);
    expect(renderTranscript(rows, ctx1)).not.toBe(renderTranscript(rows, ctx2)); // names differ…
    // …but a genuine re-attribution (different characterId) DOES bust the hash
    const reattributed = [row(1, { characterId: cole }), row(2)];
    expect(blockHash("0:0", reattributed)).not.toBe(h);
  });

  test("G2: PERSONA reattribution busts the hash (memory self-heals — was persona-blind before)", () => {
    const base = [row(1, { characterId: null, authorUserId: nate, personaId: mara, content: "hi" })];
    const h = blockHash("0:0", base);
    // same speaker (authorUserId) + same content, only the authoring persona re-stamped → the hash MUST change
    // (pre-fix this was a silent no-op: personaId was not folded, so the digest never re-embedded).
    const reattributed = [row(1, { characterId: null, authorUserId: nate, personaId: vex, content: "hi" })];
    expect(blockHash("0:0", reattributed)).not.toBe(h);
    // and a null-persona row hashes distinctly from a stamped one (the fold distinguishes absence).
    const unstamped = [row(1, { characterId: null, authorUserId: nate, personaId: null, content: "hi" })];
    expect(blockHash("0:0", unstamped)).not.toBe(h);
  });

  test("blockHash folds the scope prefix (shared vs scoped buckets stay distinct)", () => {
    const rows = [row(1), row(2)];
    expect(blockHash(":0:0", rows)).not.toBe(blockHash(`${aria}:0:0`, rows));
  });

  test("blockHash folds an AGENT's authorUserId as its stable speaker id (D60, doc 02 §5)", () => {
    const buddy = castId<UserId>("user_buddy");
    const other = castId<UserId>("user_other");
    const agentRow = row(1, { characterId: null, authorUserId: buddy });
    const h = blockHash("0:0", [agentRow]);
    // Same agent + same content → stable hash (the userId is the folded stable id).
    expect(blockHash("0:0", [row(1, { characterId: null, authorUserId: buddy })])).toBe(h);
    // A DIFFERENT agent authoring the same text busts the hash (re-attribution across agents is real).
    expect(blockHash("0:0", [row(1, { characterId: null, authorUserId: other })])).not.toBe(h);
    // An agent's line hashes differently from a character speaking the identical text (distinct stable ids).
    expect(blockHash("0:0", [row(1, { characterId: aria, authorUserId: null })])).not.toBe(h);
  });

  test("renderTranscript with an empty producer floors every macro (no raw id leak on {{user}})", () => {
    const rows = [row(1, { characterId: null, authorUserId: nate, personaId: mara, content: "{{user}}" })];
    // TWO different floors, deliberately: the LABEL is the transcript's ROLE prefix (`USER_LABEL` — "who is
    // speaking on this line", the twin of "Aria:"), while the BODY's `{{user}}` is the unresolved-PERSONA
    // name (`DEFAULT_PERSONA_NAME`). They used to be the same literal by coincidence; they are not the same
    // question, and the identity floor now has ONE spelling everywhere it means "this human's name".
    expect(renderTranscript(rows, EMPTY_CTX)).toBe(`User: ${DEFAULT_PERSONA_NAME}`);
  });

  test("blockSpeakerIds returns distinct character ids in first-seen order", () => {
    const rows = [row(1, { characterId: aria }), row(2, { characterId: cole }), row(3, { characterId: aria })];
    expect(blockSpeakerIds(rows)).toEqual([aria, cole]);
  });

  test("blockSpeakerIds excludes agent-authored rows (character-only index — doc 02 §5 recorded limit)", () => {
    const buddy = castId<UserId>("user_buddy");
    const rows = [row(1, { characterId: aria }), row(2, { characterId: null, authorUserId: buddy })];
    expect(blockSpeakerIds(rows)).toEqual([aria]); // the agent line is not speaker-indexed (by design, v1)
  });
});
