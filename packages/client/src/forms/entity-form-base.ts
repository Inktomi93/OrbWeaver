// Pure base shared by both entity-form factories: debounce, draft seed/mirror, baseline hash and value equality.
// Submit-invalid DOM focus lives in forms/editor/focus-invalid-field.ts.

import { stableStringify } from "@orb/kit/stable-stringify";
import type { EntityDraftStore } from "#state";

/** The listener debounce both factories default their draft mirror to (ms). */
export const DEFAULT_DEBOUNCE_MS = 500;
// The draft baseline hash: a persisted draft outranks the server ONLY when it was
// begun on the SAME server snapshot the form now mounts over. A stale draft (server changed since the edit
// began, or an unverifiable pre-envelope draft) is DISCARDED — server outranks. This hash is the identity
// of the server snapshot an edit began on; the store compares the stamped hash against the live one on read.
// A stable-key JSON serialization is a complete identity for form values (JSON-shaped by construction — the
// `formValuesEqual` header proves the shape: strings/numbers/booleans/arrays/nested objects, no Dates/Maps).

/** A stable-key structural hash of a server snapshot — the identity a draft's baseline is matched against. */
export function hashServerBaseline(serverValues: unknown): string {
  return stableStringify(serverValues);
}

/**
 * The draft-seed read (baseline-gated): the surviving crash draft for `entityId`, but ONLY when it both
 * validates against the form model AND was begun on the CURRENT server snapshot (`baselineHash`). A stale
 * or unverifiable draft is discarded by the store — server outranks (undefined here). `undefined`
 * `baselineHash` (no server row yet — a create) reads the draft on validity alone.
 */
export function readDraftSeed<TValues extends object>(
  draft: EntityDraftStore<TValues> | undefined,
  entityId: string,
  baselineHash?: string,
): Readonly<Partial<TValues>> | undefined {
  return draft?.readDraft(entityId, baselineHash);
}

/** The draft-mirror write: persist the live form values into the crash-survival slot, stamping the server
 *  snapshot (`baselineHash`) this edit is being made against so a later mount can verify freshness. */
export function mirrorDraft<TValues extends object>(
  draft: EntityDraftStore<TValues> | undefined,
  entityId: string,
  values: TValues,
  baselineHash?: string,
): void {
  draft?.setDraft(entityId, values, baselineHash);
}

// The ONE structural-equal home for the forms layer (D54 note: `es-toolkit`'s isEqual is the adopt-when
// trigger; a local deep-equal is equally sanctioned — kept local so the forms layer takes no new
// dependency). The autosave boundary's save driver compares live `state.values` against the last-saved
// snapshot with it: form values are mapper outputs (a FRESH object every render), so an `Object.is`
// baseline compare always reads "changed" (footgun #6, UI-Lib-TanStack-Form). Form values are JSON-shaped
// by construction — the contracts that back them are zod objects of strings/numbers/booleans/arrays/nested
// objects, no Dates/Maps/Sets/functions — so a recursive structural walk is a complete equality for them.
/** Structural deep-equality for JSON-shaped form values (the forms layer's ONE deep-equal, see header). */
export function formValuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) {
    return false;
  }
  if (aIsArray) {
    const bArr = b as readonly unknown[];
    const aArr = a as readonly unknown[];
    if (aArr.length !== bArr.length) {
      return false;
    }
    return aArr.every((item, i) => formValuesEqual(item, bArr[i]));
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  if (aKeys.length !== Object.keys(bObj).length) {
    return false;
  }
  return aKeys.every((key) => Object.hasOwn(bObj, key) && formValuesEqual(aObj[key], bObj[key]));
}
