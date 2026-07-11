// biome-ignore-all lint/style/useNamingConvention: ST settings.json field names (snake_case) appear
// verbatim in these fixtures — they ARE the format.
// Mirror test for domain/import/substrate/persona — the ST settings.json persona parser. Pins the
// position→placement normalization (in_prompt default drops metadata; NONE / AT_DEPTH map through), the
// default-persona flag, the name-keyed identity, and the never-throws empty contract.

import { describe } from "vitest";
import { parseStPersonas } from "../../../../../packages/server/src/domain/import/substrate/persona.ts";
import { expect, test } from "../../../../support/fixtures";

describe("parseStPersonas", () => {
  test("empty / non-object / no personas → empty list, never throws", () => {
    expect(parseStPersonas(null)).toEqual({ personas: [], defaultAvatarFile: null });
    expect(parseStPersonas({})).toEqual({ personas: [], defaultAvatarFile: null });
    expect(parseStPersonas({ power_user: {} })).toEqual({ personas: [], defaultAvatarFile: null });
  });

  test("reads personas under power_user; a plain in_prompt persona stores a null metadata blob", () => {
    const { personas, defaultAvatarFile } = parseStPersonas({
      power_user: {
        personas: { "alex.png": "Alex", "eve.png": "Eve" },
        persona_descriptions: { "alex.png": { description: "the protagonist", position: 0 } },
        default_persona: "alex.png",
      },
    });
    expect(defaultAvatarFile).toBe("alex.png");
    const alex = personas.find((p) => p.name === "Alex");
    expect(alex).toMatchObject({
      name: "Alex",
      description: "the protagonist",
      avatarFile: "alex.png",
      isDefault: true,
      metadata: null, // in_prompt is the default → no noisy blob
    });
    const eve = personas.find((p) => p.name === "Eve");
    expect(eve?.isDefault).toBe(false);
    expect(eve?.description).toBe(""); // no descriptor → empty description
  });

  test("NONE position → {descriptionPosition:'none'}", () => {
    const { personas } = parseStPersonas({
      power_user: {
        personas: { "a.png": "A" },
        persona_descriptions: { "a.png": { description: "x", position: 9 } },
      },
    });
    expect(personas[0]?.metadata).toEqual({ descriptionPosition: "none" });
  });

  test("AT_DEPTH carries depth + role (via the ST numeric role bimap)", () => {
    const { personas } = parseStPersonas({
      power_user: {
        personas: { "a.png": "A" },
        persona_descriptions: { "a.png": { description: "x", position: 4, depth: 3, role: 1 } },
      },
    });
    expect(personas[0]?.metadata).toEqual({
      descriptionPosition: "at_depth",
      inject: { depth: 3, role: "user" }, // ST numeric role 1 → "user"
    });
  });

  test("TOP_AN/BOTTOM_AN collapse to at_depth WITHOUT a fabricated depth", () => {
    const { personas } = parseStPersonas({
      power_user: {
        personas: { "a.png": "A" },
        persona_descriptions: { "a.png": { description: "x", position: 2 } },
      },
    });
    expect(personas[0]?.metadata).toEqual({ descriptionPosition: "at_depth" });
  });

  test("a persona entry with no display name is skipped", () => {
    const { personas } = parseStPersonas({
      power_user: { personas: { "a.png": "", "b.png": "Real" } },
    });
    expect(personas.map((p) => p.name)).toEqual(["Real"]);
  });
});
