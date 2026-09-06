// Unit: the character-refusal mapper (#542). A UNIT and not a CT for the reason the sibling turn mapper is
// one: the CT QueryClient has no MutationCache seam, so `meta.errorToast` copy is unobservable in a browser
// test — the decision is pure, so it is proved here and the hooks stay one-liners over it.
//
// The shapes below are the REAL wire shape, not an invented one: tRPC's error formatter puts the honest
// domain code on `error.data.reason` (`transport/trpc/error-mapping.ts`), which is why the mapper reads that
// field and never the message. The message is deliberately included in the fixtures AND deliberately never
// asserted — a mapper that matched on prose would pass these tests and break on the first server reword.

import { CHARACTER_HANDLE_CONFLICT_OP_CODE, CHARACTER_HANDLE_RESERVED_OP_CODE, CHARACTER_STALE_BASIS_OP_CODE } from "@orb/contracts/character";
import { describe } from "vitest";
// Deep import the PURE lib module (NOT the feature barrel): a barrel import drags browser TSX into the
// dom-less root `typecheck:graph` program (the `character-list-view.test.ts` precedent).
import {
  CHARACTER_HANDLE_CONFLICT_COPY,
  CHARACTER_HANDLE_RESERVED_COPY,
  CHARACTER_STALE_BASIS_COPY,
  characterMutationToast,
  characterRefusalCopy,
} from "../../../../../packages/client/src/features/character/lib/character-refusal-notice.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** A tRPC client error as the formatter shapes it — the `data.reason` discriminator beside a domain message. */
function refusal(reason: string, message: string): unknown {
  return { message, data: { code: "BAD_REQUEST", httpStatus: 400, reason } };
}

const CREATE_FALLBACK = "Couldn't create the character.";

describe("characterMutationToast", () => {
  test("a handle conflict is named in the user's own vocabulary, never the generic fallback", () => {
    const error = refusal(CHARACTER_HANDLE_CONFLICT_OP_CODE, 'a character with handle "elara-vance" already exists');
    expect(characterMutationToast(error, CREATE_FALLBACK)).toBe(CHARACTER_HANDLE_CONFLICT_COPY);
    // THE DEFECT, PINNED: this is the one create failure the user can fix, and it used to read exactly like
    // a dead server.
    expect(characterMutationToast(error, CREATE_FALLBACK)).not.toBe(CREATE_FALLBACK);
    // The copy names the ACT the user takes, not the derived handle they never saw.
    expect(CHARACTER_HANDLE_CONFLICT_COPY).not.toContain("handle");
  });

  test("the reserved synthetic-group namespace gets its own reason", () => {
    const error = refusal(CHARACTER_HANDLE_RESERVED_OP_CODE, 'handle "__group__x" is reserved for synthetic group characters');
    expect(characterMutationToast(error, CREATE_FALLBACK)).toBe(CHARACTER_HANDLE_RESERVED_COPY);
  });

  test("#1551: CHARACTER_STALE_BASIS gets its own client-owned copy, never the server's raw sentence", () => {
    const error = refusal(CHARACTER_STALE_BASIS_OP_CODE, "This character changed while the edit was being prepared — reload it and apply the change again.");
    expect(characterMutationToast(error, CREATE_FALLBACK)).toBe(CHARACTER_STALE_BASIS_COPY);
    expect(characterMutationToast(error, CREATE_FALLBACK)).not.toBe(CREATE_FALLBACK);
  });

  test("a genuine fault still toasts the caller's verb-specific fallback — nothing is swallowed or relabelled", () => {
    // No `data` at all (a network drop), an untyped internal error, and a code the client does not map:
    // each must fall through, or a real fault would be reported to the user as a name problem.
    expect(characterMutationToast(new Error("Failed to fetch"), CREATE_FALLBACK)).toBe(CREATE_FALLBACK);
    expect(characterMutationToast(refusal("", "boom"), CREATE_FALLBACK)).toBe(CREATE_FALLBACK);
    expect(characterMutationToast({ message: "boom", data: { code: "INTERNAL_SERVER_ERROR" } }, CREATE_FALLBACK)).toBe(CREATE_FALLBACK);
    expect(characterMutationToast(refusal("background_unavailable", "…"), CREATE_FALLBACK)).toBe(CREATE_FALLBACK);
  });

  test("the rename path shares the mapper and keeps its OWN fallback", () => {
    const save = "Couldn't save the character.";
    expect(characterMutationToast(refusal(CHARACTER_HANDLE_CONFLICT_OP_CODE, "…"), save)).toBe(CHARACTER_HANDLE_CONFLICT_COPY);
    expect(characterMutationToast(new Error("boom"), save)).toBe(save);
  });
});

describe("characterRefusalCopy", () => {
  test("is null for anything the user cannot act on — the dialog's field line stays absent for a fault", () => {
    expect(characterRefusalCopy(null)).toBeNull();
    expect(characterRefusalCopy(new Error("Failed to fetch"))).toBeNull();
    expect(characterRefusalCopy(refusal("background_unavailable", "…"))).toBeNull();
  });

  test("quotes the SAME string the toast does — one refusal must not have two spellings", () => {
    const error = refusal(CHARACTER_HANDLE_CONFLICT_OP_CODE, "…");
    expect(characterRefusalCopy(error)).toBe(characterMutationToast(error, CREATE_FALLBACK));
  });
});
