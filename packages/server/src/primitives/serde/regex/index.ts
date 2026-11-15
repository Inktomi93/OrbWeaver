// The one orb-native regex-script serde core: both directions in one home, with raw SillyTavern detection
// beside the native body. Pure: zero I/O, zero db — it maps a `PortableRegexScript` (one library script +
// its GLOBAL attachment) to/from the portable `regex/*.json` bytes. It also holds `readStScriptList`, the one reader
// of a SillyTavern script list (a preset's, a card's, the global list), so every door names a refused script, and a
// script that lost a placement or was imported switched off, the same way; all of them read ST through the ONE
// `regexScriptCardSchema` normalization.
//
// Build emits the uniform envelope and parse accepts envelope-less files FOREVER (`envelopeOptional`) —
// the ruled external-artifact repair. Round-trip drift guard:
// buildRegexScriptFile(parseRegexScriptFile(buildRegexScriptFile(s))) deep-equals buildRegexScriptFile(s).

import { clipImportText } from "@orb/contracts/import";
import type { PortableParse } from "@orb/contracts/portability";
import { REGEX_SCRIPT_SCHEMA_KIND } from "@orb/contracts/portability";
import type { PortableRegexScript, RegexScriptCard, RegexScriptLimitBreak } from "@orb/contracts/regex";
import {
  portableRegexScriptSchema,
  regexScriptCardSchema,
  regexScriptLimitBreak,
  stPlacementsWithoutTarget,
  stRegexScriptFields,
  stScriptPatternCompiles,
} from "@orb/contracts/regex";
import { isPlainObject } from "@orb/kit/guards";
import { decodePortableObject, defineJsonObjectSerde } from "#primitives/serde/lib";

export { REGEX_SCRIPT_SCHEMA_KIND } from "@orb/contracts/portability";

const REGEX_SCRIPT_SCHEMA_VERSION = 1;

const LIMIT_SUBJECT: Readonly<Record<RegexScriptLimitBreak["limit"], string>> = { "find-length": "find pattern", "replace-length": "replacement" };

// A file's script name, clipped and quoted as plain text, for the sentences below.
function quotedName(raw: unknown): string {
  return typeof raw === "string" ? JSON.stringify(clipImportText(raw)) : "";
}

/** One thing an import left behind, by where it sits in the file. */
export interface StScriptNote {
  readonly field: string;
  readonly reason: string;
}

/** A SillyTavern script an import does not land, by its position under `field`: its name (its position when it has
 *  none) and why, in words that follow "not imported: ". */
export interface StScriptRefusal extends StScriptNote {
  readonly name: string;
}

// Why a SillyTavern script did not parse. A script over a stored-length cap is named with the cap it broke, so the
// owner can find it in SillyTavern.
function stScriptDropReason(candidate: unknown): string {
  const broken = regexScriptLimitBreak(candidate);
  return broken === null
    ? "not a recognizable regex script (malformed)"
    : `its ${LIMIT_SUBJECT[broken.limit]} is ${broken.actual} characters, over the ${broken.max} character limit`;
}

// A refusal as one note line: the script by name, then why.
function stScriptRefusalNote({ field, name, reason }: StScriptRefusal): StScriptNote {
  return { field, reason: `script ${JSON.stringify(name)} not imported: ${reason}` };
}

// What a parsed SillyTavern script lost on the way in, each under the field it sits in: a placement with no target
// here, and a find pattern that does not compile. The lift switches off a script left with no target or with a
// pattern that does not compile, and the reason says so.
function stScriptLossNotes(candidate: unknown, script: Pick<RegexScriptCard, "name" | "targets">, field: string): StScriptNote[] {
  const name = quotedName(script.name);
  const notes: StScriptNote[] = [];
  const lost = stPlacementsWithoutTarget(candidate);
  if (lost.length > 0) {
    const placements = `SillyTavern placement ${lost.join(", ")}`;
    notes.push({
      field: `${field}.placement`,
      reason:
        script.targets.length === 0
          ? `script ${name} has nothing to run on here (${placements}), so it is imported switched off`
          : `script ${name} keeps its other targets; ${placements} has no target here`,
    });
  }
  if (!stScriptPatternCompiles(candidate)) {
    notes.push({ field: `${field}.findRegex`, reason: `script ${name} is imported switched off: its find pattern does not compile` });
  }
  return notes;
}

/** One SillyTavern script list read: the scripts that parsed, each script it refuses, and the notes for what a parsed
 *  script lost, each by its position under `field`. Every door that reads a list of SillyTavern scripts (a preset, a
 *  card, the global list) reads it here. */
export function readStScriptList(
  list: readonly unknown[],
  field: string,
): { readonly scripts: RegexScriptCard[]; readonly refused: StScriptRefusal[]; readonly notes: StScriptNote[] } {
  const scripts: RegexScriptCard[] = [];
  const refused: StScriptRefusal[] = [];
  const notes: StScriptNote[] = [];
  for (const [i, candidate] of list.entries()) {
    const at = `${field}[${i}]`;
    const parsed = regexScriptCardSchema.safeParse(candidate);
    if (!parsed.success) {
      const raw = isPlainObject(candidate) ? (candidate["scriptName"] ?? candidate["name"]) : undefined;
      const name = typeof raw === "string" && raw !== "" ? clipImportText(raw) : at;
      refused.push({ field: at, name, reason: stScriptDropReason(candidate) });
      continue;
    }
    scripts.push(parsed.data);
    notes.push(...stScriptLossNotes(candidate, parsed.data, at));
  }
  return { scripts, refused, notes };
}

/** {@link readStScriptList} as one list of notes, each refusal first by name: a door that reports all of them as one. */
export function stScriptListNotes(read: Pick<ReturnType<typeof readStScriptList>, "refused" | "notes">): StScriptNote[] {
  return [...read.refused.map(stScriptRefusalNote), ...read.notes];
}

const regexScriptSerde = defineJsonObjectSerde<PortableRegexScript, PortableRegexScript>({
  schemaKind: REGEX_SCRIPT_SCHEMA_KIND,
  schemaVersion: REGEX_SCRIPT_SCHEMA_VERSION,
  envelopeOptional: true,
  bodySchema: portableRegexScriptSchema,
  // Spelled out in a FIXED order rather than passed through: zod re-emits an object in SCHEMA key order, so
  // a pass-through `toWire` makes build(parse(build(x))) reorder the keys and the round-trip stop being
  // byte-identical (caught by this family's fixed-point pin).
  toWire: (script) => ({
    name: script.name,
    enabled: script.enabled,
    findRegex: script.findRegex,
    replaceString: script.replaceString,
    targets: [...script.targets],
    passes: [...script.passes],
    ...(script.depth === undefined ? {} : { depth: { ...script.depth } }),
    ...(script.authors === undefined ? {} : { authors: structuredClone(script.authors) }),
    runOnEdit: script.runOnEdit,
    trimStrings: [...script.trimStrings],
    substituteRegex: script.substituteRegex,
    global: script.global,
    // SillyTavern imports this file as it is and reads only its own spelling, which an import here reads first too.
    ...stRegexScriptFields(script),
  }),
  fromWire: (body) => body,
});

/** Serialize one portable regex script to the `regex/*.json` bytes (the inverse of
 *  `parseRegexScriptFile`). */
export function buildRegexScriptFile(script: PortableRegexScript): Uint8Array {
  return regexScriptSerde.build(script);
}

/** A raw SillyTavern regex export onto the portable shape: the card `id` is ST's own and is dropped (the
 *  library mints its row id), and an ST export carries no global attachment. */
function fromStScript(card: RegexScriptCard): PortableRegexScript {
  const { id: _id, ...script } = card;
  return { ...script, global: false };
}

/** Parse untrusted regex-script bytes — the orb-native body (enveloped or not) or a raw SillyTavern regex
 *  export (`scriptName`, numeric `placement`, `disabled`, read through the one ST normalization) — or the
 *  typed reason they were refused. */
export function parseRegexScriptFile(bytes: Uint8Array): PortableParse<PortableRegexScript> {
  const native = regexScriptSerde.parse(bytes);
  if (native.ok || native.reason !== "malformed") {
    return native;
  }
  const decoded = decodePortableObject(bytes);
  if (!decoded.ok || decoded.value["schemaKind"] !== undefined) {
    return native;
  }
  const st = regexScriptCardSchema.safeParse(decoded.value);
  return st.success ? { ok: true, value: fromStScript(st.data) } : native;
}

/** What a parsed regex file lost on the way in: a SillyTavern placement with no target here, or a find pattern that
 *  does not compile. */
export function regexScriptFileNotes(bytes: Uint8Array, script: PortableRegexScript): readonly string[] {
  const decoded = decodePortableObject(bytes);
  return decoded.ok ? stScriptLossNotes(decoded.value, script, "").map(({ reason }) => reason) : [];
}
