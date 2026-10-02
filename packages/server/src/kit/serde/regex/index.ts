// The one orb-native regex-script serde core: both directions in one home, with raw SillyTavern detection
// beside the native body. Pure: zero I/O, zero db — it maps a `PortableRegexScript` (one library script +
// its GLOBAL attachment) to/from the portable `regex/*.json` bytes. The ST card-embedded script path is
// `#kit/serde/card` (`extensions.regex_scripts`) and stays independent; both read ST through the ONE
// `regexScriptCardSchema` normalization.
//
// Build emits the uniform envelope and parse accepts envelope-less files FOREVER (`envelopeOptional`) —
// the ruled external-artifact repair. Round-trip drift guard:
// buildRegexScriptFile(parseRegexScriptFile(buildRegexScriptFile(s))) deep-equals buildRegexScriptFile(s).

import type { PortableParse } from "@orb/contracts/portability";
import type { PortableRegexScript, RegexScriptCard } from "@orb/contracts/regex";
import { portableRegexScriptSchema, regexScriptCardSchema } from "@orb/contracts/regex";
import { decodePortableObject, defineJsonObjectSerde } from "#kit/serde/lib";

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
