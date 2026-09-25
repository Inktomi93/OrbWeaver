// The invite-mint dialog's form MODEL (FINAL-Chats §8.2 / FINAL-Chat-Tab-Redesign §8). The client-only
// view shape + defaults + the plain-function validator for `createSavedEntityForm` (§13.4 — a ≥3-field
// form with validation is a factory, never hand-rolled controlled state), plus the projection into the
// wire `CreateInviteInput`. Values are transient (a mint has no server row; every open seeds
// `defaultValues` — the add-credential-form-model precedent).
//
// MODE is a form value ("link" ⇄ "handle"), not component state, so validation can key on it: a
// targeted invite REQUIRES the exact handle (unknown handle = the coded `invite_target_unknown`
// refusal shown inline by the dialog — never silently degraded to a share link, §8.2).

import type { CreateInviteInput } from "@orb/contracts/chat";
import { SIGNUP_MAX_TTL_DAYS, SIGNUP_MAX_TTL_MS, SIGNUP_MAX_USES } from "@orb/contracts/chat";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SelectItems } from "@orb/ui/select";

/** Expiry presets — a picker, not a datetime field (the mint is an interrupt, not a scheduler).
 *  Declared ONCE as a tuple, the union derived (§7.5); both stay file-local (§7.4 homes exported
 *  feature types elsewhere). */
const INVITE_EXPIRY_KEYS = ["never", "1h", "24h", "7d"] as const;
type InviteExpiryKey = (typeof INVITE_EXPIRY_KEYS)[number];

const MS_PER_HOUR = 3_600_000;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;

/** Preset → duration in ms (null = no expiry). */
const EXPIRY_MS: Record<InviteExpiryKey, number | null> = {
  never: null,
  "1h": MS_PER_HOUR,
  "24h": HOURS_PER_DAY * MS_PER_HOUR,
  "7d": DAYS_PER_WEEK * HOURS_PER_DAY * MS_PER_HOUR,
};

export const INVITE_EXPIRY_ITEMS: SelectItems<string> = [
  { label: "Never expires", value: "never" },
  { label: "1 hour", value: "1h" },
  { label: "24 hours", value: "24h" },
  { label: "7 days", value: "7d" },
];

/** The mint form's flat values. `mode`/`expiry` are kept as strings for the bound controls
 *  (SelectField/ToggleGroup are string-valued by design); `maxUses` is the NumberField's
 *  `number | null` (null = unlimited). */
export interface InviteFormValues {
  readonly mode: string;
  /** The invite-target handle DRAFT — `""` until typed (a draft is legally empty; the submit seam brands it). */
  readonly handle: Handle | "";
  readonly expiry: string;
  readonly maxUses: number | null;
  /** D254 — the link may create an account for a signed-out visitor. Offered to a global admin only, in a mode
   *  that mints signup invites, and only for a share link; the server re-checks every one of those. */
  readonly allowSignup: boolean;
}

/** Seed for every open (a mint has no server row) — an unlimited, never-expiring share link. */
export const INVITE_FORM_DEFAULTS: InviteFormValues = {
  mode: "link",
  handle: "",
  expiry: "never",
  maxUses: null,
  allowSignup: false,
};

// The value a signup link actually asks for: a share link with the box ticked. Handle mode drops it.
function asksSignup(values: InviteFormValues): boolean {
  return values.mode === "link" && values.allowSignup;
}

// The preset's duration, with an unknown key read as never (the projection below does the same).
function expiryMsOf(expiry: string): number | null {
  return expiry in EXPIRY_MS ? EXPIRY_MS[expiry as InviteExpiryKey] : null;
}

/** The plain-function field validator (`onDynamic` shape): a targeted invite needs the exact handle;
 *  maxUses, when set, must be a positive integer; a signup link needs a use limit up to
 *  {@link SIGNUP_MAX_USES} and an expiry within {@link SIGNUP_MAX_TTL_MS}. The verb remains the enforcement
 *  floor. */
export function validateInviteForm(values: InviteFormValues): { fields: Record<string, string> } | undefined {
  const fields: Record<string, string> = {};
  if (values.mode === "handle" && values.handle.trim().length === 0) {
    fields["handle"] = "Enter their exact handle.";
  }
  if (values.maxUses !== null && (!Number.isInteger(values.maxUses) || values.maxUses < 1)) {
    fields["maxUses"] = "Must be a whole number of at least 1.";
  }
  if (asksSignup(values)) {
    if (values.maxUses === null || values.maxUses > SIGNUP_MAX_USES) {
      fields["maxUses"] = `A sign-up link needs a limit of 1 to ${SIGNUP_MAX_USES} uses.`;
    }
    const expiryMs = expiryMsOf(values.expiry);
    if (expiryMs === null || expiryMs > SIGNUP_MAX_TTL_MS) {
      fields["expiry"] = `A sign-up link must expire within ${SIGNUP_MAX_TTL_DAYS} days.`;
    }
  }
  return Object.keys(fields).length > 0 ? { fields } : undefined;
}

/** Project the form values into the wire `CreateInviteInput`. `now` is the SUBMIT-time clock (an event
 *  handler, not render — the render-determinism rule doesn't bind here); expiry presets resolve to an
 *  absolute `expiresAt` epoch because that is the wire shape (`createInviteSchema`). */
export function toCreateInviteInput(values: InviteFormValues, now: number): CreateInviteInput {
  const expiryMs = expiryMsOf(values.expiry);
  // BOTH BOUNDS ARE SENT EXPLICITLY, never by omission (2026-09-07). The verb's defaults are safe —
  // an omitted field means single-use + 48h — so omitting is now how you ask for the OPPOSITE of what this
  // form's own defaults say (`expiry: "never"`, `maxUses: null` = unlimited). Spelling the nulls is what
  // keeps the dialog honest: what the picker shows is what gets minted.
  return {
    ...(values.mode === "handle" ? { invitedHandle: castId<Handle>(values.handle.trim()) } : {}),
    maxUses: values.maxUses,
    expiresAt: expiryMs === null ? null : now + expiryMs,
    ...(asksSignup(values) ? { allowSignup: true } : {}),
  };
}
