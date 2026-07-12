// biome-ignore-all lint/security/noSecrets: the camelCase serde fn names in the describe/test titles trip
// the high-entropy heuristic — they are identifiers, not secrets.
// Mirror test for @orb/server/kit/serde/persona — the ONE orb-native persona-backup serde core. Pins BOTH
// directions: build emits every portable field present + drops `avatarAssetId`; parse applies the
// `create`-parity defaults (title null, starred false, metadata null) + narrows the metadata blob; and the
// build->parse->build ROUND-TRIP identity (the structural drift guard against the two halves diverging).

import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { PersonaBackup } from "@orb/server/kit/serde/persona";
import { buildPersonaBackup, parsePersonaBackup } from "@orb/server/kit/serde/persona";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures";

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
  test("emits every portable field present and drops avatarAssetId", () => {
    const wire = buildPersonaBackup(FULL);
    expect(wire).toEqual({
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
    const wire = buildPersonaBackup(BARE);
    expect(wire.title).toBeNull();
    expect(wire.starred).toBe(false);
    expect(wire.metadata).toBeNull();
  });
});

describe("parsePersonaBackup", () => {
  test("applies create-parity defaults for omitted fields", () => {
    const backup = parsePersonaBackup({ name: "Bare", description: "d" });
    expect(backup).toEqual({
      name: "Bare",
      title: null,
      description: "d",
      starred: false,
      metadata: null,
    });
  });

  test("narrows the metadata blob and preserves the loose vendor tail", () => {
    const backup = parsePersonaBackup(buildPersonaBackup(FULL));
    expect(backup.metadata?.descriptionPosition).toBe("at_depth");
    expect(backup.metadata?.["vendorTail"]).toBe("ride-through");
  });
});

describe("round-trip", () => {
  test("build->parse->build is a fixed point (FULL)", () => {
    const once = buildPersonaBackup(FULL);
    expect(buildPersonaBackup(parsePersonaBackup(once))).toEqual(once);
  });

  test("build->parse->build is a fixed point (BARE)", () => {
    const once = buildPersonaBackup(BARE);
    expect(buildPersonaBackup(parsePersonaBackup(once))).toEqual(once);
  });

  test("parse->build->parse preserves the canonical shape (FULL)", () => {
    const canonical = parsePersonaBackup(buildPersonaBackup(FULL));
    expect(parsePersonaBackup(buildPersonaBackup(canonical))).toEqual(canonical);
  });
});
