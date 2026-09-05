// domain/chat/memory/build/substrate/transcript — the pure block substrate: slice canon into fixed-width
// blocks, render a block transcript (for the summarizer prompt), and compute the block content-hash (the
// staleness/collapse key). PURE CPU — `node:crypto.createHash` is hashing, not I/O (the embeddings
// substrate/hash.ts precedent); zero clock, zero randomness (D46). Memory rolls its OWN hash (it cannot
// cross-import `embeddings/substrate/hash` — domain boundary), folding the STABLE speaker id + the authoring
// personaId + the scope prefix into the digest (rename-robust, re-attribution-aware on BOTH the character
// AND persona axes, scope-distinct — the self-heal esoteric).
//
// IDENTITY RESOLUTION (§8 / G1): the transcript BODY resolves its `{{char}}`/`{{user}}`/`{{persona}}` macros
// against each row's OWN stamps via the shared `resolveRowMacros` atom (`@orb/kit/macro`) — the SAME atom
// server-assemble + client-display use, so the summarizer/embedding sees the real character + persona names, never
// the literal macro or the raw typeid. VOLATILE macros ({{roll}}/{{time}}/…) re-emit verbatim (names-only
// registry) — byte-stable across builds. The row STAMPS carry `personaId` (D-100) so `{{user}}` resolves to
// the authoring persona per-row (a multi-human block distinguishes two humans by persona name, not "User").

import { createHash } from "node:crypto";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import type { RowCharacterName, RowMacroNameContext, RowPersonaName } from "@orb/kit/macro";
import { resolveRowMacros } from "@orb/kit/macro";
import type { BlockSpan, MsgRow } from "../../types.ts";

const USER_LABEL = "User";
const NARRATOR_LABEL = "Narrator";
const SYSTEM_LABEL = "System";
/** The unnameable-character floor — the same literal `resolveRowMacros` floors an unresolvable `{{char}}` to
 *  (`@orb/kit/macro` row-macros `UNKNOWN_CHARACTER_NAME`, which is file-private there). Kept as a sibling of
 *  the role labels above rather than reached for across the package seam: these four are the TRANSCRIPT's own
 *  label vocabulary, and this one is only ever the last resort. */
const CHARACTER_LABEL = "Character";

/** The zero-name producer (a hand-built/preview/backfill probe with no loaded producer) — every row floors to
 *  its id-string label + the atom's own literal `{{char}}`/`{{user}}` floors ("Character"/"User"). Byte-
 *  identical to the pre-producer path (the `EMPTY_HISTORY_MACRO_NAMES` engine precedent). */
export const EMPTY_MACRO_NAMES: RowMacroNameContext = {
  characterNamesById: new Map<CharacterId, RowCharacterName>(),
  personaNamesById: new Map<PersonaId, RowPersonaName>(),
};

/** The display label for a message's speaker in a transcript: the DECLARED narrator label first, then a
 *  character's resolved name (live identity — D28; falls back to the id when the name map lacks it), else a
 *  human/system role label. NAMES are used for the SUMMARIZER input only — never for the hash (the hash uses
 *  stable ids — see {@link blockHash}), so this dispatch moves no stored hash and re-digests nothing.
 *
 *  THE KIND ARM LEADS, and it is a real fix rather than a re-spelling (D129): a narrator row is authored by the
 *  room's synthetic group card, whose name is the literal string **"Group"** (`buildGroupCard`, a
 *  never-rendered memory bucket), so every narrator recap reached the summarizer labelled `Group:` — and once
 *  that card is deleted its `characterId` SET-NULLs and the row fell through to `NARRATOR_LABEL` by ACCIDENT,
 *  i.e. the label changed because an unrelated card was deleted. Declared purpose answers both.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function speakerLabel(row: MsgRow, macroNames: RowMacroNameContext): string {
  if (row.kind === "narrator") {
    return NARRATOR_LABEL;
  }
  if (row.characterId !== null) {
    return macroNames.characterNamesById.get(row.characterId)?.name ?? row.characterId;
  }
  if (row.authorUserId !== null) {
    // A human post OR an agent-authored assistant row (D60 — both userId-backed, characterId NULL). FLAG[PD-17]:
    // an agent should label as its SOUL name here (summarizer input quality), not the generic "User"; the name
    // source is `resolveAgentSpeaker` (doc 04 §5), which is AP3 — so the name map would need an agent arm then.
    // The HASH is unaffected (blockHash folds the stable userId — rename-robust either way); this is label-only.
    return USER_LABEL;
  }
  // The attribution-LESS floor. It used to answer `NARRATOR_LABEL` here, which was the third ad-hoc spelling of
  // "is this a narrator row?" and the least defensible: it fired for any assistant row whose stamps were all
  // NULL — an ST-imported line, a row whose authoring card was deleted — and told the summarizer a narrator
  // said it. Narrator is DECLARED now (the arm at the top); an unattributed assistant row is just a character
  // this install can no longer name, so it takes the same floor `{{char}}` resolution does.
  return row.role === "system" ? SYSTEM_LABEL : CHARACTER_LABEL;
}

/** Render a block's transcript for the summarizer — `Label: body` per line, oldest→newest. The label is the
 *  speaker's resolved name (a character's live name / a role label); the BODY resolves each row's identity
 *  macros against its OWN stamps (`{{char}}`→the row's character, `{{user}}`/`{{persona}}`→the row's authoring
 *  persona — §8 / G1) so the summarizer + the embedding index carry real names, never literal `{{user}}`. */
export function renderTranscript(rows: readonly MsgRow[], macroNames: RowMacroNameContext): string {
  return rows
    .map((r) => {
      const { label, body } = renderRowLine(r, macroNames);
      return `${label}: ${body}`;
    })
    .join("\n");
}

/** ONE row's transcript line, kept in its two parts. The segment CHUNKER (#172) needs them separately: a
 *  single message too big for the embed window is split into pieces that each RE-CARRY the label, so every
 *  piece stays an attributable transcript fragment instead of anonymous prose. `renderTranscript` composes
 *  the same two parts — one renderer, so a chunked block and a whole one are byte-identical where they
 *  overlap. */
export function renderRowLine(row: MsgRow, macroNames: RowMacroNameContext): { readonly label: string; readonly body: string } {
  return {
    label: speakerLabel(row, macroNames),
    body: resolveRowMacros(row.content, { characterId: row.characterId, personaId: row.personaId }, macroNames),
  };
}

/** Slice canon (oldest→newest, already seq ≤ cutoff) into COMPLETE fixed-width `blockSize` blocks. A partial
 *  trailing block (`< blockSize`) is dropped — only aged-out, complete blocks are digested/segmented. `blockIdx`
 *  is the position-from-start index (stable absent earlier deletions; a deletion re-hashes via {@link blockHash}). */
export function sliceBlocks(rows: readonly MsgRow[], blockSize: number): BlockSpan[] {
  const blocks: BlockSpan[] = [];
  const blockCount = Math.floor(rows.length / blockSize);
  for (let i = 0; i < blockCount; i += 1) {
    const slice = rows.slice(i * blockSize, i * blockSize + blockSize);
    // `blockCount = floor(len/blockSize)` ⇒ every slice is exactly `blockSize` long (≥1), so first/last exist.
    const first = slice.at(0);
    const last = slice.at(-1);
    if (first === undefined || last === undefined) {
      continue;
    }
    blocks.push({
      blockIdx: i,
      seqStart: first.seq,
      seqEnd: last.seq,
      rows: slice,
    });
  }
  return blocks;
}

/** SHA-256 hex of a block, folding the SCOPE prefix + each row's STABLE speaker id + authoring `personaId` +
 *  body (`\x01`-delimited fields — a control byte no id/content carries). Name-INDEPENDENT (a character/persona
 *  RENAME does NOT bust it — the ids are folded, not the names); genuine RE-ATTRIBUTION on EITHER axis DOES: a
 *  different `characterId` (a `{{char}}` re-voice) and a different `personaId` (a `{{user}}` persona
 *  reattribution) each change the hash → the block re-digests → memory self-heals. `personaId` is folded
 *  INDEPENDENTLY of the resolved body bytes, so the staleness gate fires on a persona re-stamp even if the
 *  resolved transcript happened to collide (memory was persona-BLIND before — a persona reattribution was a
 *  silent no-op on the digest). The prefix (`${scopedCharacterId}:${tier}:${blockIdx}` for a digest,
 *  `seg:${blockIdx}` for a segment) keeps the shared + scoped buckets distinct. Deterministic: identical
 *  canon+scope → identical hash (the staleness gate). */
export function blockHash(prefix: string, rows: readonly MsgRow[]): string {
  const h = createHash("sha256");
  h.update(prefix);
  for (const r of rows) {
    h.update("\u0000");
    h.update(r.characterId ?? r.authorUserId ?? r.role);
    h.update("");
    h.update(r.personaId ?? "");
    h.update("");
    h.update(r.content);
  }
  return h.digest("hex");
}

/** SHA-256 hex over a list of child content-hashes (the consolidation staleness key — a tier-(k+1) digest
 *  re-consolidates iff any child re-digested). Order-significant (children pass blockIdx-ascending). */
export function consolidationHash(prefix: string, childHashes: readonly string[]): string {
  const h = createHash("sha256");
  h.update(prefix);
  for (const c of childHashes) {
    h.update("\u0000");
    h.update(c);
  }
  return h.digest("hex");
}

/** The distinct character ids voicing a block, first-seen order (the `chat_digest_speakers` join input —
 *  "which characters this block contains"). Deterministic (canon order). */
export function blockSpeakerIds(rows: readonly MsgRow[]): CharacterId[] {
  const seen = new Set<CharacterId>();
  const out: CharacterId[] = [];
  for (const r of rows) {
    if (r.characterId !== null && !seen.has(r.characterId)) {
      seen.add(r.characterId);
      out.push(r.characterId);
    }
  }
  return out;
}
