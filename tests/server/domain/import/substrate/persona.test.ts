import { createHash } from "node:crypto";
import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import type { UploadedFile } from "@orb/server/domain/import";
import { incomingPersonasOf } from "@orb/server/domain/import";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

const encoder = new TextEncoder();

function settingsUpload(settings: object): UploadedFile {
  return { relPath: `profile/${ST_SETTINGS_FILE}`, bytes: encoder.encode(JSON.stringify(settings)) };
}

test.each([
  { field: "position", position: { valueOf: null, toString: null }, depth: 2, metadata: null },
  { field: "depth", position: 4, depth: { valueOf: null, toString: null }, metadata: { descriptionPosition: "at_depth" } },
  { field: "nested position", position: [{ valueOf: null, toString: null }], depth: 2, metadata: null },
  { field: "nested depth", position: 4, depth: [[{ valueOf: null, toString: null }]], metadata: { descriptionPosition: "at_depth" } },
])("keeps uploaded personas when $field cannot be converted to a number", ({ position, depth, metadata }) => {
  const art = new Uint8Array([1, 2, 3]);
  const files: UploadedFile[] = [
    settingsUpload({
      ["power_user"]: {
        personas: { "selected.png": "Selected", "other.png": "Other", "empty.png": "" },
        ["default_persona"]: "selected.png",
        ["persona_descriptions"]: {
          "selected.png": { description: "Preserved description", position, depth, role: 1 },
          "other.png": { description: "Other description", position: 9 },
        },
      },
    }),
    { relPath: "profile/User Avatars/selected.png", bytes: art },
  ];

  expect(incomingPersonasOf(files)).toEqual([
    { name: "Selected", description: "Preserved description", artHash: createHash("sha256").update(art).digest("hex"), metadata },
    { name: "Other", description: "Other description", artHash: null, metadata: { descriptionPosition: "none" } },
  ]);
});

test("preserves tolerated scalar and JSON-array placement and depth coercion", () => {
  const cases = [
    { position: 4, depth: "3", metadata: { descriptionPosition: "at_depth", inject: { depth: 3, role: "user" } } },
    { position: "4", depth: true, metadata: { descriptionPosition: "at_depth", inject: { depth: 1, role: "user" } } },
    { position: 4, depth: false, metadata: { descriptionPosition: "at_depth", inject: { depth: 0, role: "user" } } },
    { position: 4, depth: null, metadata: { descriptionPosition: "at_depth", inject: { depth: 0, role: "user" } } },
    { position: null, depth: 3, metadata: null },
    { position: true, depth: 3, metadata: null },
    { position: [4], depth: [3], metadata: { descriptionPosition: "at_depth", inject: { depth: 3, role: "user" } } },
    { position: [[4]], depth: [[2]], metadata: { descriptionPosition: "at_depth", inject: { depth: 2, role: "user" } } },
    { position: [], depth: 3, metadata: null },
    { position: [9], depth: 3, metadata: { descriptionPosition: "none" } },
    { position: 4, depth: [], metadata: { descriptionPosition: "at_depth", inject: { depth: 0, role: "user" } } },
    { position: 4, depth: [null], metadata: { descriptionPosition: "at_depth", inject: { depth: 0, role: "user" } } },
    { position: [2, 3], depth: 3, metadata: null },
    { position: 4, depth: [2, 3], metadata: { descriptionPosition: "at_depth" } },
    { position: {}, depth: 3, metadata: null },
    { position: 4, depth: {}, metadata: { descriptionPosition: "at_depth" } },
    { position: 4, depth: -1, metadata: { descriptionPosition: "at_depth" } },
    { position: 4, depth: "Infinity", metadata: { descriptionPosition: "at_depth" } },
  ];
  const namedCases = cases.map((entry, index) => ({ ...entry, name: `Persona ${String(index)}` }));
  const files = [
    settingsUpload({
      ["power_user"]: {
        personas: Object.fromEntries(namedCases.map(({ name }) => [name, name])),
        ["persona_descriptions"]: Object.fromEntries(namedCases.map(({ name, position, depth }) => [name, { position, depth, role: 1 }])),
      },
    }),
  ];

  expect(incomingPersonasOf(files)).toEqual(namedCases.map(({ name, metadata }) => ({ name, description: "", artHash: null, metadata })));
});
