// The one orb-native regex-script serde core: both directions in one home, so build + parse can never
// drift. Pure: zero I/O, zero db — it maps a `PortableRegexScript` (one library script + its GLOBAL
// attachment) to/from the portable `regex/*.json` bytes. The ST card-embedded script path is
// `#kit/serde/card` (`extensions.regex_scripts`) and stays independent.
//
// Defined through `#kit/serde/lib`. The regex descriptor shipped writing a bare `JSON.stringify(payload)`
// with no envelope (F4's class, one wave later); build now emits the uniform envelope and parse accepts
// envelope-less files FOREVER (`envelopeOptional`) — the ruled external-artifact repair.
//
// Round-trip drift guard: buildRegexScriptFile(parseRegexScriptFile(buildRegexScriptFile(s))) deep-equals
// buildRegexScriptFile(s).

import type { PortableParse } from "@orb/contracts/portability";
import type { PortableRegexScript } from "@orb/contracts/regex";
import { portableRegexScriptSchema } from "@orb/contracts/regex";
import { defineJsonObjectSerde } from "#kit/serde/lib";

export const REGEX_SCRIPT_SCHEMA_KIND = "orb.regex-script";
export const REGEX_SCRIPT_SCHEMA_VERSION = 1;

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
    placement: [...script.placement],
    markdownOnly: script.markdownOnly,
    promptOnly: script.promptOnly,
    runOnEdit: script.runOnEdit,
    trimStrings: [...script.trimStrings],
    substituteRegex: script.substituteRegex,
    global: script.global,
  }),
  fromWire: (body) => body,
});

/** Serialize one portable regex script to the `regex/*.json` bytes (the inverse of
 *  `parseRegexScriptFile`). */
export function buildRegexScriptFile(script: PortableRegexScript): Uint8Array {
  return regexScriptSerde.build(script);
}

/** Parse untrusted regex-script bytes, or the typed reason they were refused. */
export function parseRegexScriptFile(bytes: Uint8Array): PortableParse<PortableRegexScript> {
  return regexScriptSerde.parse(bytes);
}
