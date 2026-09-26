// IMP-1 probe — bleed scoring.
//
// Scored TWICE per generation: on the RAW model output, and on the text after production's receive clean
// (`cleanPerSpeakerReply` via `engine/pipeline.ts` cleanPerSpeakerContent — the impersonate path runs it
// whether or not anyone meant it to). Both cleans are mirrored here: `applyProductionClean` is the current
// (post-IMP-1) configuration, `applyLegacyClean` the one it replaced — the gap between them on the SAME
// bytes is the laundering the fix removed.
//
// The flags are MECHANICAL and deliberately conservative — every flagged sample is kept verbatim in the
// results JSON so the verdict can be re-read by hand rather than trusted on a regex's word.
//
// THE FLAGS ARE NOT THE VERDICT. Measured on the first local run: the worst bleed this probe found is a full
// character takeover written in the FIRST person ("…walk out of my ledger — and my waystation…") — no label,
// no third-person narration, so every mechanical flag here passes it. The verdict is the blind JUDGE pass in
// `run.ts` (whose "who is speaking?" call is what a human read of the transcripts agrees with); these flags
// remain useful for the one thing they measure exactly — LABEL leakage, which is what production's existing
// receive clean acts on.

import { cleanPerSpeakerReply } from "@orb/kit/speaker-label";

/** Third-person narration verbs — a character NAME immediately followed by one of these is the model
 *  narrating that character's actions/dialogue, which the nudge explicitly forbids. */
const NARRATION_VERBS = [
  "says",
  "said",
  "replies",
  "replied",
  "answers",
  "answered",
  "asks",
  "asked",
  "smiles",
  "smiled",
  "nods",
  "nodded",
  "laughs",
  "laughed",
  "grins",
  "grinned",
  "shrugs",
  "shrugged",
  "leans",
  "leaned",
  "steps",
  "stepped",
  "turns",
  "turned",
  "whispers",
  "whispered",
  "murmurs",
  "murmured",
  "sighs",
  "sighed",
  "watches",
  "watched",
  "looks",
  "looked",
  "sets",
  "pours",
  "poured",
  "taps",
  "tapped",
  "closes",
  "closed",
  "opens",
  "opened",
].join("|");

const FIRST_PERSON_RE = /\b(?:I|I'm|I'll|I've|I'd|me|my|mine|myself)\b/;

/** A `Name:` speaker label at the start of any line (markdown emphasis tolerated) — the ST `wrongName` tell. */
function lineLabelRe(name: string): RegExp {
  return new RegExp(`(?:^|\\n)[ \\t>]*(?:\\*\\*|\\*|__|_)?${RegExp.escape(name)}(?:\\*\\*|\\*|__|_)?[ \\t]*:`);
}

/** `Name … <narration verb>` within one clause — the model writing that character's actions or dialogue. */
function narrationRe(name: string): RegExp {
  return new RegExp(`\\b${RegExp.escape(name)}\\b[^.!?\\n]{0,40}?\\b(?:${NARRATION_VERBS})\\b`);
}

export interface BleedFlags {
  /** A cast member's `Name:` label at a line start (the character self-label ST deletes the reply for). */
  readonly charSelfLabel: boolean;
  /** The model narrated a cast member's actions/dialogue in the third person. */
  readonly charNarration: boolean;
  /** No first-person pronoun anywhere — the nudge asked for first-person AS the persona. */
  readonly noFirstPerson: boolean;
  /** The persona's OWN `Name:` label (a label habit, not a voice takeover — reported, not counted as bleed). */
  readonly personaSelfLabel: boolean;
}

export interface Scored {
  readonly flags: BleedFlags;
  /** charSelfLabel || charNarration || noFirstPerson. */
  readonly bleed: boolean;
  /** The matched substrings behind each true flag — the receipt. */
  readonly hits: readonly string[];
}

/** The matched text at a hit, for the receipt — `search` (not `exec`) because the typed linter reads
 *  `RegExp.exec` as never-null (the same false positive `truncateAtForeignLabel` works around in kit).
 *  Returns null on a miss. */
const HIT_RECEIPT_CHARS = 48;
function hitAt(body: string, re: RegExp): string | null {
  const idx = body.search(re);
  if (idx < 0) {
    return null;
  }
  return (
    body
      .slice(idx, idx + HIT_RECEIPT_CHARS)
      .split(/\r?\n/u)[0]
      ?.trim() ?? ""
  );
}

export function scoreBleed(text: string, characterNames: readonly string[], personaName: string): Scored {
  const body = text.trim();
  const others = characterNames.filter((n) => n !== personaName);
  const hits: string[] = [];
  let charSelfLabel = false;
  let charNarration = false;
  for (const name of others) {
    const label = hitAt(body, lineLabelRe(name));
    if (label !== null) {
      charSelfLabel = true;
      hits.push(`label:${label}`);
    }
    const narration = hitAt(body, narrationRe(name));
    if (narration !== null) {
      charNarration = true;
      hits.push(`narration:${narration}`);
    }
  }
  const noFirstPerson = body.length > 0 && !FIRST_PERSON_RE.test(body);
  if (noFirstPerson) {
    hits.push("no-first-person");
  }
  const personaLabel = hitAt(body, lineLabelRe(personaName));
  if (personaLabel !== null) {
    hits.push(`persona-label:${personaLabel}`);
  }
  return {
    flags: { charSelfLabel, charNarration, noFirstPerson, personaSelfLabel: personaLabel !== null },
    bleed: charSelfLabel || charNarration || noFirstPerson,
    hits,
  };
}

/** The PRE-IMP-1 receive clean, kept to measure what it did: an impersonate `TurnPrep` carries no `shape`,
 *  so `cleanPerSpeakerContent` fell back to `output: "per-speaker"` with `speakerName = ctx.character.name`
 *  (the PRIMARY CHARACTER). That configuration strips a leading `Seren:` off a line SEREN wrote and hands
 *  the character's words to the composer as the user's own — the laundering this probe measured at 2/36. */
export function applyLegacyClean(text: string, characterNames: readonly string[]): string {
  const primary = characterNames[0] ?? "";
  return cleanPerSpeakerReply(
    text,
    primary,
    characterNames.filter((n) => n !== primary),
  );
}

/** Production's receive clean for an impersonate draft POST-IMP-1 (`engine/pipeline.ts`
 *  cleanPerSpeakerContent, the `kind === "impersonate"` arm): self is the PERSONA, and every cast member is
 *  foreign. */
export function applyProductionClean(text: string, characterNames: readonly string[], personaName: string): string {
  return cleanPerSpeakerReply(text, personaName, characterNames);
}
