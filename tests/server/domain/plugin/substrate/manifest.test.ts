// substrate: manifest — the source-agnostic bundle funnel (02 §1 + the owner-ruled hardening riders). Builds
// real zips with fflate and drives parseBundle: the happy path, the strict entry allow-list (extra / traversal
// / missing entries), the decompression-bomb caps, malformed manifest JSON / schema failures, and the
// downgrade-refusal semver helper.

import { strToU8, zipSync } from "fflate";
import { describe } from "vitest";
import { ManifestInvalidError } from "../../../../../packages/server/src/domain/plugin/contract/errors.ts";
import { isVersionDowngrade, parseBundle } from "../../../../../packages/server/src/domain/plugin/substrate/manifest.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const VALID_MANIFEST = {
  id: "my-plugin",
  name: "My Plugin",
  version: "1.0.0",
  hostVersion: 1,
  entry: "main.js",
  description: "does a thing",
  capabilities: ["chat.read"],
};

function makeBundle(entries: Record<string, Uint8Array>): Uint8Array {
  return zipSync(entries);
}

function validBundle(mainJs = "const host = orb.host(1);"): Uint8Array {
  return makeBundle({ "manifest.json": strToU8(JSON.stringify(VALID_MANIFEST)), "main.js": strToU8(mainJs) });
}

describe("parseBundle — happy path", () => {
  test("a well-formed bundle yields the validated manifest + the main.js source", () => {
    const parsed = parseBundle(validBundle("const x = 1;"));
    expect(parsed.manifest.id).toBe("my-plugin");
    expect(parsed.manifest.capabilities).toEqual(["chat.read"]);
    expect(parsed.mainJs).toBe("const x = 1;");
  });
});

describe("parseBundle — strict entry allow-list (traversal impossible by construction)", () => {
  test("an extra entry beyond manifest.json + main.js is refused", () => {
    const bundle = makeBundle({
      "manifest.json": strToU8(JSON.stringify(VALID_MANIFEST)),
      "main.js": strToU8("const x = 1;"),
      "evil.js": strToU8("steal()"),
    });
    expect(() => parseBundle(bundle)).toThrow(ManifestInvalidError);
  });

  test("a path-traversal entry name is refused (never admitted)", () => {
    const bundle = makeBundle({
      "manifest.json": strToU8(JSON.stringify(VALID_MANIFEST)),
      "main.js": strToU8("const x = 1;"),
      "../../etc/passwd": strToU8("root"),
    });
    expect(() => parseBundle(bundle)).toThrow(ManifestInvalidError);
  });

  test("a missing required entry is refused", () => {
    expect(() => parseBundle(makeBundle({ "manifest.json": strToU8(JSON.stringify(VALID_MANIFEST)) }))).toThrow(ManifestInvalidError);
    expect(() => parseBundle(makeBundle({ "main.js": strToU8("const x = 1;") }))).toThrow(ManifestInvalidError);
  });
});

describe("parseBundle — the OPTIONAL third entry (plugin-ui-plane #679 U4)", () => {
  const uiManifest = { ...VALID_MANIFEST, capabilities: ["chat.read", "ui.surface"], uiEntry: "ui.js" };
  const uiSource = "orb.ui(1).render('panel', { kind: 'text', value: 'hi' });";

  test("a declared + present ui.js is admitted and returned", () => {
    const parsed = parseBundle(
      makeBundle({ "manifest.json": strToU8(JSON.stringify(uiManifest)), "main.js": strToU8("const x = 1;"), "ui.js": strToU8(uiSource) }),
    );
    expect(parsed.manifest.uiEntry).toBe("ui.js");
    expect(parsed.uiJs).toBe(uiSource);
  });

  test("a two-entry bundle still parses unchanged, with no uiJs — the field is ADDITIVE-optional", () => {
    // The 01 §3 host-evolution law in practice: every plugin authored before U4 must install byte-for-byte the
    // same way. If this ever goes red, the third entry stopped being optional.
    const parsed = parseBundle(validBundle("const x = 1;"));
    expect(parsed.uiJs).toBeUndefined();
    expect(parsed.manifest.uiEntry).toBeUndefined();
  });

  test("BOTH halves of the biconditional are refused at the trust edge", () => {
    // A declaration with no file: a scripted surface that could only ever fail at mount, AFTER the user granted
    // `ui.surface` on the strength of the declaration.
    expect(() => parseBundle(makeBundle({ "manifest.json": strToU8(JSON.stringify(uiManifest)), "main.js": strToU8("const x = 1;") }))).toThrow(
      ManifestInvalidError,
    );
    // A file with no declaration: guest code inside the consent unit that nothing disclosed and nothing loads.
    expect(() =>
      parseBundle(makeBundle({ "manifest.json": strToU8(JSON.stringify(VALID_MANIFEST)), "main.js": strToU8("const x = 1;"), "ui.js": strToU8(uiSource) })),
    ).toThrow(ManifestInvalidError);
  });

  test("uiEntry without the ui.surface capability is refused (the manifest's own refinement)", () => {
    // Code that could never draw anything — `ui.register` is what a scripted surface is registered through, and
    // the capability gates it. Refused at the schema, before the zip's third entry is even considered.
    const noCapability = { ...VALID_MANIFEST, uiEntry: "ui.js" };
    expect(() =>
      parseBundle(makeBundle({ "manifest.json": strToU8(JSON.stringify(noCapability)), "main.js": strToU8("const x = 1;"), "ui.js": strToU8(uiSource) })),
    ).toThrow(ManifestInvalidError);
  });

  test("the ui.js entry carries the SAME 1 MiB decompressed cap as main.js", () => {
    const huge = "a".repeat(1024 * 1024 + 1);
    expect(() =>
      parseBundle(makeBundle({ "manifest.json": strToU8(JSON.stringify(uiManifest)), "main.js": strToU8("const x = 1;"), "ui.js": strToU8(huge) })),
    ).toThrow(ManifestInvalidError);
  });

  test("a FOURTH entry is still refused — widening to three did not open the allow-list", () => {
    expect(() =>
      parseBundle(
        makeBundle({
          "manifest.json": strToU8(JSON.stringify(uiManifest)),
          "main.js": strToU8("const x = 1;"),
          "ui.js": strToU8(uiSource),
          "evil.js": strToU8("steal()"),
        }),
      ),
    ).toThrow(ManifestInvalidError);
  });
});

describe("parseBundle — decompression-bomb guard", () => {
  test("a main.js whose DECOMPRESSED size exceeds the 1 MiB cap is refused before allocation", () => {
    // 'a' × (1 MiB + 1) compresses to a few KB, so the compressed bundle passes the input cap; the entry's
    // header originalSize trips the per-entry cap.
    const huge = "a".repeat(1024 * 1024 + 1);
    expect(() => parseBundle(validBundle(huge))).toThrow(ManifestInvalidError);
  });

  test("an empty bundle is refused", () => {
    expect(() => parseBundle(new Uint8Array(0))).toThrow(ManifestInvalidError);
  });

  test("non-zip bytes are refused (not a valid archive)", () => {
    expect(() => parseBundle(strToU8("this is not a zip"))).toThrow(ManifestInvalidError);
  });
});

describe("parseBundle — manifest validation", () => {
  test("malformed manifest JSON is refused", () => {
    const bundle = makeBundle({ "manifest.json": strToU8("{ not json"), "main.js": strToU8("const x = 1;") });
    expect(() => parseBundle(bundle)).toThrow(ManifestInvalidError);
  });

  test("a manifest that fails the schema (bad slug) is refused", () => {
    const bundle = makeBundle({
      "manifest.json": strToU8(JSON.stringify({ ...VALID_MANIFEST, id: "BadSlug" })),
      "main.js": strToU8("const x = 1;"),
    });
    expect(() => parseBundle(bundle)).toThrow(ManifestInvalidError);
  });

  test("an unserved hostVersion is refused (schema literal 1)", () => {
    const bundle = makeBundle({
      "manifest.json": strToU8(JSON.stringify({ ...VALID_MANIFEST, hostVersion: 2 })),
      "main.js": strToU8("const x = 1;"),
    });
    expect(() => parseBundle(bundle)).toThrow(ManifestInvalidError);
  });

  test("a builtAgainst provenance block round-trips through the bundle", () => {
    const bundle = makeBundle({
      "manifest.json": strToU8(JSON.stringify({ ...VALID_MANIFEST, builtAgainst: { engineVersion: "0.1.0", engineCommit: "abc1234" } })),
      "main.js": strToU8("const x = 1;"),
    });
    expect(parseBundle(bundle).manifest.builtAgainst).toEqual({ engineVersion: "0.1.0", engineCommit: "abc1234" });
  });
});

describe("isVersionDowngrade", () => {
  test("a lower candidate over a higher installed is a downgrade", () => {
    expect(isVersionDowngrade("1.0.0", "1.2.0")).toBe(true);
    expect(isVersionDowngrade("1.1.9", "1.2.0")).toBe(true);
    expect(isVersionDowngrade("0.9.9", "1.0.0")).toBe(true);
  });

  test("an equal or higher candidate is NOT a downgrade (equal is a legal re-install)", () => {
    expect(isVersionDowngrade("1.2.0", "1.2.0")).toBe(false);
    expect(isVersionDowngrade("1.2.1", "1.2.0")).toBe(false);
    expect(isVersionDowngrade("2.0.0", "1.9.9")).toBe(false);
  });
});
