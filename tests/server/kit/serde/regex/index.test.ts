// Mirror test for @orb/server/kit/serde/regex — the ONE orb-native regex-script serde. The regex descriptor
// shipped writing a bare `JSON.stringify(payload)` with no envelope (F4's class); this pins the repair:
// build EMITS the uniform envelope, parse ACCEPTS the envelope-less files that already exist on disk, and a
// foreign/newer file is still refused by name.

import type { PortableParse } from "@orb/contracts/portability";
import type { PortableRegexScript } from "@orb/contracts/regex";
import { SubstituteFindRegex } from "@orb/kit/regex";
import { buildRegexScriptFile, parseRegexScriptFile, REGEX_SCRIPT_SCHEMA_KIND } from "@orb/server/kit/serde/regex";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

const ENC = new TextEncoder();
const DEC = new TextDecoder();

/** The parse outcome's value — the spine returns a typed refusal reason, never null. */
function refusalOf<T>(result: PortableParse<T>): string {
  if (result.ok) {
    throw new Error("expected the file to be refused, but it parsed");
  }
  return result.reason;
}

function must<T>(result: PortableParse<T>): T {
  if (!result.ok) {
    throw new Error(`portable parse refused: ${result.reason}`);
  }
  return result.value;
}

const SCRIPT: PortableRegexScript = {
  name: "Trim thinking",
  enabled: true,
  findRegex: "<think>[\\s\\S]*?</think>",
  replaceString: "",
  placement: ["AI_OUTPUT"],
  markdownOnly: false,
  promptOnly: false,
  runOnEdit: false,
  trimStrings: [],
  substituteRegex: SubstituteFindRegex.none,
  global: true,
};

describe("buildRegexScriptFile", () => {
  test("stamps the uniform envelope beside the script body", () => {
    const wire = JSON.parse(DEC.decode(buildRegexScriptFile(SCRIPT))) as Record<string, unknown>;
    expect(wire["schemaKind"]).toBe(REGEX_SCRIPT_SCHEMA_KIND);
    expect(wire["schemaVersion"]).toBe(1);
    expect(wire["name"]).toBe("Trim thinking");
    expect(wire["global"]).toBe(true);
  });
});

describe("parseRegexScriptFile", () => {
  test("round-trips the script (build -> parse -> build is a fixed point)", () => {
    const bytes1 = buildRegexScriptFile(SCRIPT);
    const bytes2 = buildRegexScriptFile(must(parseRegexScriptFile(bytes1)));
    expect(DEC.decode(bytes2)).toBe(DEC.decode(bytes1));
  });

  test("an ENVELOPE-LESS legacy file still parses — the shape the descriptor used to emit", () => {
    const legacy = ENC.encode(JSON.stringify(SCRIPT));
    expect(must(parseRegexScriptFile(legacy)).name).toBe("Trim thinking");
  });

  test("a foreign kind and a NEWER writer are each refused by their own reason", () => {
    expect(refusalOf(parseRegexScriptFile(ENC.encode(JSON.stringify({ ...SCRIPT, schemaKind: "orb.theme", schemaVersion: 1 }))))).toBe("foreign-kind");
    expect(refusalOf(parseRegexScriptFile(ENC.encode(JSON.stringify({ ...SCRIPT, schemaKind: REGEX_SCRIPT_SCHEMA_KIND, schemaVersion: 99 }))))).toBe(
      "newer-version",
    );
  });

  test("a body that fails the script schema is `malformed`, never a throw", () => {
    expect(refusalOf(parseRegexScriptFile(ENC.encode(JSON.stringify({ schemaKind: REGEX_SCRIPT_SCHEMA_KIND, schemaVersion: 1, name: "" }))))).toBe("malformed");
  });
});

describe("parseRegexScriptFile — a raw SillyTavern regex export", () => {
  // The genuine ST spelling: `scriptName`, INTEGER placements, `disabled`, and the ST-only depth pair.
  const StExport =
    '{"id":"1a2b","scriptName":"Trim ellipsis","findRegex":"/\\\\.{3}/g","replaceString":"…","trimStrings":["  "],"placement":[1,2],"disabled":true,"markdownOnly":false,"promptOnly":true,"runOnEdit":false,"substituteRegex":0,"minDepth":null,"maxDepth":null}';

  test("parses through the ONE ST normalization: name, find/replace, numeric placements converted, disabled mapped", () => {
    const script = must(parseRegexScriptFile(ENC.encode(StExport)));
    expect(script.name).toBe("Trim ellipsis");
    expect(script.findRegex).toBe("/\\.{3}/g");
    expect(script.replaceString).toBe("…");
    expect(script.placement).toEqual(["USER_INPUT", "AI_OUTPUT"]);
    expect(script.enabled).toBe(false);
    expect(script.promptOnly).toBe(true);
    expect(script.trimStrings).toEqual(["  "]);
    expect(script.global).toBe(false);
    // ST's id is ST's own; the library mints its row id.
    expect("id" in script).toBe(false);
  });

  test("the ST script re-emits as a native file that round-trips (one canonical value under both grammars)", () => {
    const script = must(parseRegexScriptFile(ENC.encode(StExport)));
    const native = must(parseRegexScriptFile(buildRegexScriptFile(script)));
    expect(native).toEqual(script);
  });

  test("an ST script carrying a placement orb has no leg for drops the MEMBER, never the script", () => {
    const withSlash = StExport.replace('"placement":[1,2]', '"placement":[3,2]');
    expect(must(parseRegexScriptFile(ENC.encode(withSlash))).placement).toEqual(["AI_OUTPUT"]);
  });

  test("ST's older BOOLEAN substituteRegex maps onto the kit enum (true = raw, false = none)", () => {
    const raw = JSON.stringify({ id: "1a2b", scriptName: "Sub", findRegex: "a", replaceString: "b", placement: [2], substituteRegex: true });
    expect(must(parseRegexScriptFile(ENC.encode(raw))).substituteRegex).toBe(SubstituteFindRegex.raw);
    const none = raw.replace('"substituteRegex":true', '"substituteRegex":false');
    expect(must(parseRegexScriptFile(ENC.encode(none))).substituteRegex).toBe(SubstituteFindRegex.none);
  });

  test("a JSON object in neither grammar is still `malformed`; an enveloped foreign kind stays `foreign-kind`", () => {
    expect(refusalOf(parseRegexScriptFile(ENC.encode(JSON.stringify({ name: "x", entries: {} }))))).toBe("malformed");
    expect(refusalOf(parseRegexScriptFile(ENC.encode(JSON.stringify({ schemaKind: "orb.theme", schemaVersion: 1, scriptName: "x" }))))).toBe("foreign-kind");
  });
});
