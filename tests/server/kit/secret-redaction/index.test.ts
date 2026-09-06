// @orb/server/kit/secret-redaction — the ONE by-value credential scrub every diagnostic boundary funnels
// through (the custom-byo wire capture + "Test endpoint" inspector, the `/models` probe, the bug-report
// bundle, the credential decrypt guidance). Its promise is exact-value removal: an endpoint, a log line or a
// report cannot leak a credential we hold the literal for, whatever framing it arrives in.
//
// #1785 — THE FRAMING THAT BEAT IT. Three of those callers SERIALIZE before they scrub
// (`JSON.stringify(body)` in the runner's capture, in the inspector's surfaced request, and in
// `serializeScrubbed`), and a JSON string ESCAPES `"` and `\`. A credential containing either is therefore
// present in the bytes under a spelling the raw-literal search never sees — and the fail-closed containment
// check at the end of `redactKnownSecrets` searched for the same raw literal, so it certified the leak as
// clean. The fix is at THIS home, not per call site: every literal enters the scrub set in both its raw and
// its JSON-escaped spelling, so the removal AND the containment belt cover both.
//
// THE FIXTURES ARE DELIBERATELY SHAPE-BLIND. The providers wrapper (`redactSecretsFromText`) carries
// `Bearer …`/`sk-…` shape sweeps as defense-in-depth, so a fixture shaped like either is masked by the SHAPE
// belt even when the by-value belt is broken — a green that says nothing about the code under test (the
// #1760 instrument-lie). Every credential here is shaped like neither.

import { redactKnownSecrets, secretRedactionLiterals, secretSafeRedactionMarker } from "@orb/server/kit/secret-redaction";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

// Assembled from parts: the SPELLING is the subject, and a contiguous quote-bearing literal in the source
// reads as a pasted credential to a reviewer and to the high-entropy sweeps.
const QUOTE = '"';
const BACKSLASH = "\\";
/** A user-authored credential that contains a JSON metacharacter — matches NEITHER shape belt. */
const QUOTED_SECRET = `k${QUOTE}ey${BACKSLASH}with-9f3a2c`;
/** The same credential with no metacharacter — the raw and escaped spellings coincide. */
const PLAIN_SECRET = "plain-cred-9f3a2c";
const MARKER = "█";

describe("redactKnownSecrets — the JSON-escaped spelling (#1785)", () => {
  test("removes a quote/backslash-bearing credential from its SERIALIZED spelling", () => {
    const serialized = JSON.stringify({ auth: QUOTED_SECRET, model: "local-model" });
    // Premise of the whole row: the raw literal is NOT a substring of the serialized bytes.
    expect(serialized).not.toContain(QUOTED_SECRET);

    const scrubbed = redactKnownSecrets(serialized, [QUOTED_SECRET]);

    // Neither spelling survives — and the parsed value is gone, which is what reaches the debug ring.
    expect(scrubbed).not.toContain(QUOTED_SECRET);
    expect(scrubbed).not.toContain(JSON.stringify(QUOTED_SECRET).slice(1, -1));
    expect(JSON.stringify(JSON.parse(scrubbed))).not.toContain(QUOTED_SECRET);
    // POSITIVE CONTROL for the instrument: the surrounding structure survived, so the assertions above read
    // "the credential was removed", not "the scrub returned the fail-closed empty string".
    expect(scrubbed).toContain("local-model");
    expect(scrubbed).toContain(MARKER);
  });

  test("the escaped spelling survives a re-parse — the scrubbed capture is still valid JSON", () => {
    const scrubbed = redactKnownSecrets(JSON.stringify({ auth: QUOTED_SECRET }), [QUOTED_SECRET]);
    const parsed = JSON.parse(scrubbed) as Record<string, unknown>;
    expect(parsed["auth"]).toBe(MARKER);
  });

  test("a credential that IS the escaped spelling in the text is caught in both directions", () => {
    // A caller may hand us bytes that were escaped by someone else (an upstream echo of our own request
    // body). Raw-form text and escaped-form text both scrub clean from the same one scrub set.
    const rawForm = `sent ${QUOTED_SECRET} upstream`;
    const escapedForm = `sent ${JSON.stringify(QUOTED_SECRET).slice(1, -1)} upstream`;
    for (const text of [rawForm, escapedForm]) {
      const scrubbed = redactKnownSecrets(text, [QUOTED_SECRET]);
      expect(scrubbed).not.toContain(QUOTED_SECRET);
      expect(scrubbed).not.toContain(JSON.stringify(QUOTED_SECRET).slice(1, -1));
      expect(scrubbed).toContain("upstream");
    }
  });

  test("a metacharacter-free credential is UNCHANGED by the widening (raw === escaped)", () => {
    // The widening must be inert for the ordinary case: same marker, same output, no extra over-redaction.
    const text = JSON.stringify({ auth: PLAIN_SECRET, model: "local-model" });
    const scrubbed = redactKnownSecrets(text, [PLAIN_SECRET]);
    expect(scrubbed).toBe(text.replace(PLAIN_SECRET, MARKER));
  });

  test("text holding no credential is returned verbatim (the scrub is not a mangler)", () => {
    const clean = JSON.stringify({ model: "local-model", stop: ["</s>"] });
    expect(redactKnownSecrets(clean, [QUOTED_SECRET])).toBe(clean);
  });

  test("an empty scrub set is a no-op", () => {
    expect(redactKnownSecrets("nothing to remove", [])).toBe("nothing to remove");
    expect(redactKnownSecrets("nothing to remove", [""])).toBe("nothing to remove");
  });

  test("still removes everything when the literals COLLIDE with every marker candidate", () => {
    // The marker must contain none of the literals; hand it every candidate AS a literal and it degrades to
    // the empty replacement and must still leave nothing behind. Re-pinned here because the widening changes
    // what the marker search sees.
    const candidates = [MARKER, "■", "◆", "●", "¤", "§", "¶", "※"];
    expect(secretSafeRedactionMarker(candidates)).toBe("");
    const scrubbed = redactKnownSecrets(`before ${candidates.join("")} after`, candidates);
    for (const candidate of candidates) {
      expect(scrubbed).not.toContain(candidate);
    }
    expect(scrubbed).toBe("before  after");
  });

  test("the marker choice is unchanged by the widening (an escaped spelling is never shorter)", () => {
    expect(secretSafeRedactionMarker([QUOTED_SECRET])).toBe(MARKER);
    expect(secretSafeRedactionMarker([PLAIN_SECRET])).toBe(MARKER);
  });
});

// The expansion is EXPORTED because a boundary that runs its own post-condition on a scrubbed string — the
// last gate before bytes reach disk in `foundation/observability/debug/bug-report` — has to ask about the
// spelling the bytes are written in. Asking about the raw literals it passed in is the same blind spot one
// layer up, which is exactly how the leak got certified as clean.
describe("secretRedactionLiterals", () => {
  test("carries BOTH spellings of a metacharacter-bearing secret, longest first", () => {
    const literals = secretRedactionLiterals([QUOTED_SECRET]);
    expect(literals).toContain(QUOTED_SECRET);
    expect(literals).toContain(JSON.stringify(QUOTED_SECRET).slice(1, -1));
    // Longest-first: a longer spelling must be replaced before a shorter one it contains.
    expect(literals).toEqual([...literals].sort((left, right) => right.length - left.length));
  });

  test("a metacharacter-free secret contributes exactly ONE spelling (no widening, no duplicate)", () => {
    expect(secretRedactionLiterals([PLAIN_SECRET])).toEqual([PLAIN_SECRET]);
  });

  test("drops empty values and dedupes repeats", () => {
    expect(secretRedactionLiterals(["", PLAIN_SECRET, PLAIN_SECRET])).toEqual([PLAIN_SECRET]);
    expect(secretRedactionLiterals([])).toEqual([]);
  });
});
