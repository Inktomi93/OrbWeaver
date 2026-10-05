// The accept-vocabulary matcher (#423) — the per-file decision both dropzone feeders make. The cases are the
// LIVE consumer vocabularies (character cards, chat transcripts, presets, databank documents, avatars, the
// library import) plus the two shapes that make a naive filter wrong: a file the browser gave no MIME for,
// and a double extension.

// Imported by source path, not through the barrel: this is the primitive's internal decision, not part of
// `@orb/ui`'s public surface (the same shape `macro-textarea-logic.test.ts` uses).
import { DOC_UPLOAD_ACCEPT, docUploadMime } from "@orb/contracts/extraction";
import { matchesAccept } from "../../../../packages/ui/src/primitives/file-dropzone/accept.ts";
import { expect, test } from "../../../support/fixtures.ts";

const CARD_ACCEPT = ".png,.json,image/png,application/json";
const TRANSCRIPT_ACCEPT = ".jsonl,.json,application/x-ndjson,application/json";
const LIBRARY_ACCEPT = ".zip,.png,.json";

function file(name: string, type: string): File {
  return new File(["x"], name, { type });
}

test("an omitted or empty accept takes anything — the attribute's own contract", () => {
  expect(matchesAccept(file("payload.exe", "application/x-msdownload"), undefined)).toBe(true);
  expect(matchesAccept(file("payload.exe", "application/x-msdownload"), "")).toBe(true);
  expect(matchesAccept(file("payload.exe", "application/x-msdownload"), " , ")).toBe(true);
});

test("a family wildcard admits its whole family and nothing outside it", () => {
  expect(matchesAccept(file("avatar.webp", "image/webp"), "image/*")).toBe(true);
  expect(matchesAccept(file("clip.mp4", "video/mp4"), "image/*")).toBe(false);
  // The prefix is matched on the family boundary — `image/*` must not admit a hypothetical `imagex/…`.
  expect(matchesAccept(file("odd.bin", "imagex/thing"), "image/*")).toBe(false);
});

test("an exact MIME token matches only that MIME, charset parameter and casing aside", () => {
  expect(matchesAccept(file("note.txt", "text/plain; charset=utf-8"), "text/plain")).toBe(true);
  expect(matchesAccept(file("note.txt", "TEXT/PLAIN"), "text/plain")).toBe(true);
  expect(matchesAccept(file("note.txt", "text/plain"), "text/html")).toBe(false);
});

test("a suffix token matches the file-name TAIL, so a double extension still lands", () => {
  expect(matchesAccept(file("session.orb.json", ""), TRANSCRIPT_ACCEPT)).toBe(true);
  expect(matchesAccept(file("CARD.PNG", ""), CARD_ACCEPT)).toBe(true);
  expect(matchesAccept(file("jsonly", ""), TRANSCRIPT_ACCEPT)).toBe(false);
});

test("a file the browser gave no MIME can match a suffix token but never a MIME token", () => {
  expect(matchesAccept(file("backup.zip", ""), LIBRARY_ACCEPT)).toBe(true);
  expect(matchesAccept(file("avatar", ""), "image/*")).toBe(false);
  // A dropped DIRECTORY arrives exactly like this — no MIME, no extension — so it earns a refusal.
  expect(matchesAccept(file("SillyTavern", ""), LIBRARY_ACCEPT)).toBe(false);
});

test("the live consumer vocabularies admit their own files and refuse a foreign one", () => {
  expect(matchesAccept(file("villain.png", "image/png"), CARD_ACCEPT)).toBe(true);
  expect(matchesAccept(file("payload.exe", "application/x-msdownload"), CARD_ACCEPT)).toBe(false);
  expect(matchesAccept(file("manual.pdf", "application/pdf"), DOC_UPLOAD_ACCEPT)).toBe(true);
  expect(matchesAccept(file("villain.png", "image/png"), DOC_UPLOAD_ACCEPT)).toBe(false);
  expect(matchesAccept(file("preset.json", "application/json"), "application/json,.json")).toBe(true);
});

test("Databank's additional admission refuses conflicting claims without changing native accept OR grammar", () => {
  for (const type of ["text/html", "application/javascript", "image/png"]) {
    const candidate = file("notes.md", type);
    expect(matchesAccept(candidate, DOC_UPLOAD_ACCEPT)).toBe(true);
    expect(matchesAccept(candidate, DOC_UPLOAD_ACCEPT) && docUploadMime(candidate.type, candidate.name) !== undefined).toBe(false);
  }
  const typeless = file("notes.md", "");
  expect(matchesAccept(typeless, DOC_UPLOAD_ACCEPT) && docUploadMime(typeless.type, typeless.name) !== undefined).toBe(true);
});
