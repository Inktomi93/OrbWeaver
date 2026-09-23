// The imagery INTENT store — the payload channel THREE shell-level
// modals share (imagine · imageDetail · imageEdit). Exercised through the non-hook
// `__readImageryIntentForTest` snapshot (the reactive readers need a React render — the
// `steer-recovery-store.test.ts` posture).
//
// WHAT ACTUALLY MATTERS HERE, and why these are the pins: three modals share ONE store, so the load-bearing
// property is SLOT ISOLATION — a launcher writing its own intent must not silently strand or corrupt a
// sibling's, and each `onClose` clear must free ONLY its own slot. The two DELIBERATE cross-slot clears
// (detail↔edit supersede each other, because the shell reuses one Dialog and swaps the body in place, so the
// superseded modal's `onClose` never fires) are the exception the store encodes on purpose — pinned here so
// a future "simplification" that drops them shows up as a red instead of a stale subject rendering in a
// modal the user already left.
//
// NOT pinned here: that each opener also calls `openModal(<slot>)`. That write lands in shell-store, which
// exposes no non-hook read; `openModal` is shell-store's own one-line surface and the CT stories
// (tests/client/features/imagery/) exercise the opener→body path end-to-end through the real slot.

import type { ImageSubject, ImagineSeed } from "@orb/client/state";
import {
  __readImageryIntentForTest,
  __resetImageryIntent,
  clearDetailSubject,
  clearEditSubject,
  clearImagineSeed,
  openImageDetail,
  openImageEdit,
  openImagine,
} from "@orb/client/state";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

// TypeIDs are MINTED, never hand-written literals (the branded suffix is validated at runtime).
const CHAT_ID = mintTypeId(ID_PREFIX.chat);
const OTHER_CHAT_ID = mintTypeId(ID_PREFIX.chat);

function seed(overrides: Partial<ImagineSeed> = {}): ImagineSeed {
  return { chatId: CHAT_ID, mode: "free", prompt: "a dragon over the castle", ...overrides };
}

function subject(overrides: Partial<ImageSubject> = {}): ImageSubject {
  return { assetId: mintTypeId(ID_PREFIX.asset), chatId: CHAT_ID, url: "blob:one", alt: "a generated image", ...overrides };
}

describe("imagery intent store", () => {
  beforeEach(() => {
    __resetImageryIntent(); // reset the module singleton between tests.
  });

  test("every slot starts empty (nothing to render before a launcher writes an intent)", () => {
    expect(__readImageryIntentForTest()).toEqual({ imagineSeed: undefined, detailSubject: undefined, editSubject: undefined });
  });

  test("openImagine hands the parsed slash seed through verbatim", () => {
    const s = seed({ mode: "scenario", prompt: "the tavern at dusk" });
    openImagine(s);
    expect(__readImageryIntentForTest().imagineSeed).toEqual(s);
  });

  test("openImageDetail / openImageEdit hand their subject through verbatim", () => {
    const detail = subject({ alt: "detail" });
    openImageDetail(detail);
    expect(__readImageryIntentForTest().detailSubject).toEqual(detail);

    const edit = subject({ alt: "edit", url: "blob:two" });
    openImageEdit(edit);
    expect(__readImageryIntentForTest().editSubject).toEqual(edit);
  });

  test("a re-open REPLACES its slot rather than accumulating (a second /imagine never inherits the first)", () => {
    openImagine(seed({ prompt: "first" }));
    openImagine(seed({ chatId: OTHER_CHAT_ID, mode: "background", prompt: "second" }));
    expect(__readImageryIntentForTest().imagineSeed).toEqual({ chatId: OTHER_CHAT_ID, mode: "background", prompt: "second" });
  });

  test("each clear frees ONLY its own slot — a modal's onClose never strands a sibling", () => {
    openImagine(seed());
    openImageDetail(subject({ alt: "detail" }));

    clearImagineSeed();
    const afterImagineClear = __readImageryIntentForTest();
    expect(afterImagineClear.imagineSeed).toBeUndefined();
    // The detail modal is still open behind it — its subject must survive the imagine modal's onClose.
    expect(afterImagineClear.detailSubject?.alt).toBe("detail");

    clearDetailSubject();
    expect(__readImageryIntentForTest().detailSubject).toBeUndefined();
  });

  test("the imagine slot is INDEPENDENT of the two image slots (opening an image never disturbs a live seed)", () => {
    const s = seed({ prompt: "still composing" });
    openImagine(s);
    openImageDetail(subject());
    openImageEdit(subject());
    // The imagine seed survives both — the three slots are separate fields, not one shared subject.
    expect(__readImageryIntentForTest().imagineSeed).toEqual(s);
  });

  test("detail → edit SUPERSEDES: opening the edit modal clears the detail subject it replaced", () => {
    const detail = subject({ alt: "the source" });
    openImageDetail(detail);
    openImageEdit(detail);
    const state = __readImageryIntentForTest();
    expect(state.editSubject).toEqual(detail);
    // Deliberate: the shell swaps the Dialog body in place, so the detail modal's onClose never fires —
    // leaving its subject set would strand a view the user has already left.
    expect(state.detailSubject).toBeUndefined();
  });

  test("edit → detail SUPERSEDES too: the post-edit hand-off clears the edit subject", () => {
    const source = subject({ alt: "the source" });
    const edited = subject({ alt: "the edited result", url: "blob:edited" });
    openImageEdit(source);
    openImageDetail(edited); // the hand-off after a successful editImage
    const state = __readImageryIntentForTest();
    expect(state.detailSubject).toEqual(edited);
    expect(state.editSubject).toBeUndefined();
  });

  test("clearEditSubject leaves a detail subject opened after it alone (the hand-off is not undone by a late onClose)", () => {
    openImageEdit(subject({ alt: "the source" }));
    openImageDetail(subject({ alt: "the edited result" })); // hand-off already cleared editSubject
    clearEditSubject(); // the edit modal's onClose, firing late
    expect(__readImageryIntentForTest().detailSubject?.alt).toBe("the edited result");
  });
});
