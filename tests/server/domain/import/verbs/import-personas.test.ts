// Unit test for domain/import/verbs/importPersonas (Option B; PD-77) — `import` performs NO db access: it maps
// each parsed ST persona → the canonical `BulkImportPersonaInput`, delegates the WRITE to the injected
// `bulkImportPersonas` op (a recording fake), then copies the op's `idByName` into `personaByUserName` for
// chat attribution. The db-write/dedup correctness is pinned in `persona/persistence/import-write.int.test.ts`.

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { ImportPersonaInput } from "../../../../../packages/server/src/domain/import/contract/views.ts";
import { createImportPersonas } from "../../../../../packages/server/src/domain/import/verbs/import-personas.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeProfileHarness } from "../_support.ts";

const OWNER = castId<UserId>("user_owner");

function persona(name: string, isDefault = false): ImportPersonaInput {
  return {
    parsed: {
      name,
      description: `${name} desc`,
      avatarFile: `${name}.png`,
      isDefault,
      metadata: null,
    },
  };
}

describe("importPersonas (Option B mapping)", () => {
  test("maps ST → BulkImportPersonaInput, delegates, and populates personaByUserName (lowercased)", async () => {
    const h = makeProfileHarness(OWNER);
    const svc = createImportPersonas(h.ctx);

    const result = await svc({ personas: [persona("Nate", true), persona("Eve")] });

    // Delegated to the injected op with the canonical mapping.
    expect(h.personaCalls).toHaveLength(1);
    expect(h.personaCalls[0]?.ownerId).toBe(OWNER);
    expect(h.personaCalls[0]?.personas.map((p) => p.name).sort()).toEqual(["Eve", "Nate"]);
    expect(h.personaCalls[0]?.personas[0]?.description).toBe("Nate desc");

    expect(result.personasCreated).toBe(2);
    expect(result.defaultPersonaId).not.toBeNull();

    // The chat importers read this (lowercased name → id) to attribute `user_name`s.
    expect(h.profile.personaByUserName.get("nate")).toBe(result.defaultPersonaId);
    expect(h.profile.personaByUserName.has("eve")).toBe(true);
  });
});
