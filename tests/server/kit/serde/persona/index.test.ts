// Mirror test for @orb/server/kit/serde/persona — the ONE orb-native persona-backup serde core. Pins BOTH
// directions: build emits every portable field present + drops `avatarAssetId` + stamps the uniform
// envelope; parse applies the `create`-parity defaults (title null, starred false, metadata null), narrows
// the metadata blob, ACCEPTS an envelope-less legacy file forever, and refuses a newer writer by name; plus
// the build->parse->build ROUND-TRIP identity (the drift guard against the two halves diverging).

import type { PortableParse } from "@orb/contracts/portability";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { PersonaBackup, PersonaCandidate, PersonaIdentity } from "@orb/server/kit/serde/persona";
import {
  buildPersonaBackup,
  findDuplicatePersona,
  PERSONA_SCHEMA_KIND,
  parsePersonaBackup,
  personaContentKey,
  personaPlacementOf,
} from "@orb/server/kit/serde/persona";
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

/** The emitted file as a plain object (build now returns BYTES, like every other family). */
function wireOf(backup: PersonaBackup): Record<string, unknown> {
  return JSON.parse(DEC.decode(buildPersonaBackup(backup))) as Record<string, unknown>;
}

const SOURCE_CHARACTER_ID = mintTypeId(ID_PREFIX.character);

// A fixture exercising the edge fields: an explicit title, starred, and the full metadata blob (the at-depth
// placement directive + the createFromCharacter provenance + a loose vendor tail that must ride through).
const FULL: PersonaBackup = {
  name: "Nyx",
  title: "The Wanderer",
  description: "a wandering scholar",
  starred: true,
  metadata: {
    descriptionPosition: "at_depth",
    inject: { depth: 3, role: "system" },
    sourceCharacterId: SOURCE_CHARACTER_ID,
    swapMacros: true,
    vendorTail: "ride-through",
  },
};

// The minimal fixture: only the two required fields, everything else absent — parse must fill the defaults.
const BARE: PersonaBackup = {
  name: "Bare",
  title: null,
  description: "d",
  starred: false,
  metadata: null,
};

describe("buildPersonaBackup", () => {
  test("emits every portable field present, drops avatarAssetId, and stamps the uniform envelope", () => {
    const wire = wireOf(FULL);
    expect(wire).toEqual({
      schemaKind: PERSONA_SCHEMA_KIND,
      schemaVersion: 1,
      name: "Nyx",
      title: "The Wanderer",
      description: "a wandering scholar",
      starred: true,
      metadata: {
        descriptionPosition: "at_depth",
        inject: { depth: 3, role: "system" },
        sourceCharacterId: SOURCE_CHARACTER_ID,
        swapMacros: true,
        vendorTail: "ride-through",
      },
    });
    expect(wire).not.toHaveProperty("avatarAssetId");
  });

  test("emits title null / starred false / metadata null concretely (self-describing backup)", () => {
    const wire = wireOf(BARE);
    expect(wire["title"]).toBeNull();
    expect(wire["starred"]).toBe(false);
    expect(wire["metadata"]).toBeNull();
  });
});

describe("parsePersonaBackup", () => {
  test("applies create-parity defaults for omitted fields", () => {
    const backup = must(parsePersonaBackup(ENC.encode(JSON.stringify({ schemaKind: PERSONA_SCHEMA_KIND, schemaVersion: 1, name: "Bare", description: "d" }))));
    expect(backup).toEqual({
      name: "Bare",
      title: null,
      description: "d",
      starred: false,
      metadata: null,
    });
  });

  test("narrows the metadata blob and preserves the loose vendor tail", () => {
    const backup = must(parsePersonaBackup(buildPersonaBackup(FULL)));
    expect(backup.metadata?.descriptionPosition).toBe("at_depth");
    expect(backup.metadata?.["vendorTail"]).toBe("ride-through");
  });
});

describe("accept-old-forever (external artifacts)", () => {
  test("an ENVELOPE-LESS legacy persona file still parses — a user's existing backups must not stop working", () => {
    // The shape persona shipped with before the spine: a bare backup object, no schemaKind at all (F4).
    const legacy = ENC.encode(JSON.stringify({ name: "Legacy", description: "from before the envelope" }));
    expect(must(parsePersonaBackup(legacy)).name).toBe("Legacy");
  });

  test("a FOREIGN envelope is still refused (envelope-optional is not envelope-blind)", () => {
    const foreign = ENC.encode(JSON.stringify({ schemaKind: "orb.theme", schemaVersion: 1, name: "x", description: "y" }));
    expect(parsePersonaBackup(foreign).ok).toBe(false);
    expect(refusalOf(parsePersonaBackup(foreign))).toBe("foreign-kind");
  });

  test("a file from a NEWER writer is refused BY NAME, not half-parsed with today's semantics", () => {
    const future = ENC.encode(JSON.stringify({ schemaKind: PERSONA_SCHEMA_KIND, schemaVersion: 99, name: "x", description: "y" }));
    expect(refusalOf(parsePersonaBackup(future))).toBe("newer-version");
  });
});

describe("round-trip", () => {
  test("build->parse->build is a fixed point (FULL)", () => {
    const once = buildPersonaBackup(FULL);
    expect(DEC.decode(buildPersonaBackup(must(parsePersonaBackup(once))))).toBe(DEC.decode(once));
  });

  test("build->parse->build is a fixed point (BARE)", () => {
    const once = buildPersonaBackup(BARE);
    expect(DEC.decode(buildPersonaBackup(must(parsePersonaBackup(once))))).toBe(DEC.decode(once));
  });

  test("parse->build->parse preserves the canonical shape (FULL)", () => {
    const canonical = must(parsePersonaBackup(buildPersonaBackup(FULL)));
    expect(must(parsePersonaBackup(buildPersonaBackup(canonical)))).toEqual(canonical);
  });
});

describe("the persona content identity", () => {
  const identity = (over: Partial<PersonaIdentity> = {}): PersonaIdentity => ({
    name: "Alex",
    title: null,
    description: "the one who asks why",
    placement: null,
    artHash: null,
    ...over,
  });

  test("folds the name and strips a free-name count: 'Alex', ' alex ' and 'Alex 2' with equal content are one persona", () => {
    const base = personaContentKey(identity());
    expect(personaContentKey(identity({ name: " alex " }))).toBe(base);
    expect(personaContentKey(identity({ name: "Alex 2" }))).toBe(base);
  });

  test("a different name, description, title, placement or art keys DIFFERENTLY", () => {
    const base = personaContentKey(identity());
    expect(personaContentKey(identity({ name: "Eve" }))).not.toBe(base);
    expect(personaContentKey(identity({ description: "another" }))).not.toBe(base);
    expect(personaContentKey(identity({ title: "Captain" }))).not.toBe(base);
    expect(personaContentKey(identity({ placement: { descriptionPosition: "at_depth" } }))).not.toBe(base);
    expect(personaContentKey(identity({ artHash: "a".repeat(64) }))).not.toBe(base);
  });

  test("placement reads the knobs that change the prompt and ignores provenance", () => {
    expect(personaPlacementOf(null)).toBeNull();
    expect(personaPlacementOf({ seededDefault: true })).toBeNull();
    expect(personaPlacementOf({ swapMacros: true, seededDefault: true })).toEqual({ swapMacros: true });
  });

  test("findDuplicatePersona answers the content-equal candidate with the name it carries, else null", () => {
    const candidates: PersonaCandidate[] = [
      { ...identity({ name: "Alex 2" }), id: mintTypeId(ID_PREFIX.persona) },
      { ...identity({ description: "another" }), id: mintTypeId(ID_PREFIX.persona) },
    ];
    expect(findDuplicatePersona(identity(), candidates)?.name).toBe("Alex 2");
    expect(findDuplicatePersona(identity({ description: "a third" }), candidates)).toBeNull();
  });
});
