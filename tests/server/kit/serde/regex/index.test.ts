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
