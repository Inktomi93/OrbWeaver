// CT kit: prove a template-text field ROUND-TRIPS a literal `{{token}}` — the shared assertion behind the
// owner ruling MACROS NEVER RESOLVE IN WRITABLE FIELDS.
//
// WHAT IT CATCHES. An editable surface must display and persist RAW template text. The failure is silent
// and destructive: an editor that paints RESOLVED text into its own field saves what the field holds, so
// `{{user}} is here` is persisted as `Alex is here` — the template is gone, irreversibly, and every other
// persona then reads a prompt hardcoded to one name. The editor's own behavior tests all stay green (the
// field faithfully saved what it showed), which is exactly why this needs its own assertion.
//
// WHY THE WIRE IS THE PROOF, not the DOM. A field can display the literal token and still ship a resolved
// payload (or vice versa) — only the recorded mutation input says what was actually STORED. So this asserts
// the tRPC payload first (via `routeTrpc`'s recorder), and then re-asserts the field's own displayed value
// as the second half of the round trip: the surface must not repaint resolved text after the save settles.
//
// The static half of this invariant is the `macro-resolution-home` gate (scripts/check/gates/) — it keeps a
// resolver from being imported into a form component at all. The gate is import-keyed and therefore blind to
// DATA FLOW (a sanctioned render home drilling an already-resolved string down as a prop); this helper is
// the belt for that blind spot, and the two are meant to be worn together.
//
// WAVE-2 PRESET EDITORS MUST USE THIS: every editor that lands on the preset section / guided-template /
// user-macro bodies calls `assertTokenRoundtrip` on its template-text field — no per-editor re-spelling of
// the assertion, so the invariant cannot drift editor to editor.

import { expect } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import type { TrpcRecorder } from "./route-trpc.ts";

/** The probe text: a bare identity macro plus prose, so a resolution bug changes the string VISIBLY (an
 *  empty-value resolve would leave " is watching" and still be caught by the exact-equality assert). */
export const TEMPLATE_PROBE = "{{user}} is watching {{char}}.";

export interface TokenRoundtripSpec {
  /** The recorder from `routeTrpc(page, …)` — the wire truth about what was saved. */
  readonly trpc: TrpcRecorder;
  /** The template-text field under test (a textarea/input locator — `getByLabel("Content")`). */
  readonly field: Locator;
  /** The mutation procedure the field's save fires, e.g. `"chat.setChatInjection"`. */
  readonly proc: string;
  /** The key on the mutation input carrying the template text, e.g. `"content"`. A DOTTED path reaches a
   *  nested one (`"config.formatStrings.continueNudge"`) — the preset surfaces save one whole config blob,
   *  so their template fields are never top-level keys. */
  readonly payloadKey: string;
  /** Override the probe text (must contain at least one literal `{{token}}`). */
  readonly text?: string;
}

/** Read `payloadKey` off a recorded mutation input — a dotted path walks in, a plain key indexes directly
 *  (byte-identical behavior for the single-key callers). */
function readPayload(input: unknown, payloadKey: string): unknown {
  let cursor: unknown = input;
  for (const segment of payloadKey.split(".")) {
    if (cursor === null || typeof cursor !== "object") {
      return;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

/**
 * Type a literal `{{token}}` into `field`, commit it, and assert the SAVED payload carries the token
 * verbatim — then that the field still shows it. Fails if either end resolved the macro.
 */
export async function assertTokenRoundtrip(spec: TokenRoundtripSpec): Promise<void> {
  const text = spec.text ?? TEMPLATE_PROBE;
  const before = spec.trpc.count(spec.proc);

  await spec.field.fill(text);
  // Autosave commits on blur in this codebase's form driver; a field that saves per-keystroke has already
  // fired by now, so blurring is safe for both shapes.
  await spec.field.blur();

  // The wire: the mutation fired, and its template field is byte-identical to what was typed. `toEqual` on
  // the whole string (not a `contains` on the token) so a PARTIAL resolve — one macro substituted, the
  // other left literal — cannot pass.
  await expect.poll(() => spec.trpc.count(spec.proc)).toBeGreaterThan(before);
  await expect.poll(() => readPayload(spec.trpc.lastInput(spec.proc), spec.payloadKey)).toEqual(text);

  // The DOM: after the save settles the field must still hold the raw template, not a resolved repaint.
  await expect(spec.field).toHaveValue(text);
}
