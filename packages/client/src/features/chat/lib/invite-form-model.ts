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
  readonly handle: Handle;
  readonly expiry: string;
  readonly maxUses: number | null;
}

/** Seed for every open (a mint has no server row) — an unlimited, never-expiring share link. */
export const INVITE_FORM_DEFAULTS: InviteFormValues = {
  mode: "link",
  handle: castId<Handle>(""),
  expiry: "never",
  maxUses: null,
};

/** The plain-function field validator (`onDynamic` shape): a targeted invite needs the exact handle;
 *  maxUses, when set, must be a positive integer. The verb remains the enforcement floor. */
export function validateInviteForm(values: InviteFormValues): { fields: Record<string, string> } | undefined {
  const fields: Record<string, string> = {};
  if (values.mode === "handle" && values.handle.trim().length === 0) {
    fields["handle"] = "Enter their exact handle.";
  }
  if (values.maxUses !== null && (!Number.isInteger(values.maxUses) || values.maxUses < 1)) {
    fields["maxUses"] = "Must be a whole number of at least 1.";
  }
  return Object.keys(fields).length > 0 ? { fields } : undefined;
}

/** Project the form values into the wire `CreateInviteInput`. `now` is the SUBMIT-time clock (an event
 *  handler, not render — the render-determinism rule doesn't bind here); expiry presets resolve to an
 *  absolute `expiresAt` epoch because that is the wire shape (`createInviteSchema`). */
export function toCreateInviteInput(values: InviteFormValues, now: number): CreateInviteInput {
  const expiryKey: InviteExpiryKey = values.expiry in EXPIRY_MS ? (values.expiry as InviteExpiryKey) : "never";
  const expiryMs = EXPIRY_MS[expiryKey];
  return {
    ...(values.mode === "handle" ? { invitedHandle: castId<Handle>(values.handle.trim()) } : {}),
    ...(values.maxUses === null ? {} : { maxUses: values.maxUses }),
    ...(expiryMs === null ? {} : { expiresAt: now + expiryMs }),
  };
}
