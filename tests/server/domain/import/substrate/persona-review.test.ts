// substrate/persona-review — the personas an uploaded profile tree would import, read from `settings.json` +
// `User Avatars/` parts. Pins the pairing (a persona's art is the avatar beside ITS settings file), the art
// hash (sha256 of the bytes the run would store), the tolerance (an unreadable settings file yields none) and
// the multi-profile read.

import { createHash } from "node:crypto";
import { describe } from "vitest";
import type { UploadedFile } from "../../../../../packages/server/src/domain/import/contract/views.ts";
import { incomingPersonasOf } from "../../../../../packages/server/src/domain/import/substrate/persona-review.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const ENC = new TextEncoder();
// Raw JSON: the ST wire keys are snake_case and stay verbatim.
const NATE_SETTINGS =
  '{"power_user":{"personas":{"nate.png":"Nate"},"persona_descriptions":{"nate.png":{"description":"ST Nate","position":4,"depth":2,"role":1}}}}';
const EVE_SETTINGS = '{"power_user":{"personas":{"eve.png":"Eve"}}}';

function file(relPath: string, text: string | Uint8Array): UploadedFile {
  return { relPath, bytes: typeof text === "string" ? ENC.encode(text) : text };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("incomingPersonasOf", () => {
  test("pairs a persona with the avatar beside ITS settings.json and hashes the bytes", () => {
    const art = new Uint8Array([1, 2, 3]);

    const [nate] = incomingPersonasOf([file("p/settings.json", NATE_SETTINGS), file("p/User Avatars/nate.png", art)]);

    expect(nate).toMatchObject({ name: "Nate", description: "ST Nate", artHash: sha256(art) });
    expect(nate?.metadata).toMatchObject({ descriptionPosition: "at_depth" });
  });

  test("a persona whose avatar is not in the upload is art-less, and another profile's avatar is not borrowed", () => {
    const personas = incomingPersonasOf([file("a/settings.json", NATE_SETTINGS), file("b/User Avatars/nate.png", new Uint8Array([9]))]);

    expect(personas.map((p) => p.artHash)).toEqual([null]);
  });

  test("reads every profile's settings.json, a bare root one included", () => {
    const personas = incomingPersonasOf([file("settings.json", NATE_SETTINGS), file("other/settings.json", EVE_SETTINGS)]);

    expect(personas.map((p) => p.name)).toEqual(["Nate", "Eve"]);
  });

  test("an unreadable settings.json yields none instead of throwing, and other files are ignored", () => {
    const personas = incomingPersonasOf([file("a/settings.json", "{not json"), file("a/characters/Aria.png", "PNG"), file("b/settings.json", EVE_SETTINGS)]);

    expect(personas.map((p) => p.name)).toEqual(["Eve"]);
  });
});
