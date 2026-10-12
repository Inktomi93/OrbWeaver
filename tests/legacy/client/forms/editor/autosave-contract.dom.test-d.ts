// Type pins for the autosave factory's SEAM LAW (Codex audit client-forms-01): the persistence seam is
// declared at exactly one place, and that is a COMPILE fact. Both seams used to be optional, so a mount
// with neither type-checked, re-baselined, cleared the crash draft, and reported "Saved" over an edit that
// went nowhere. A mint-time throw cannot decide this — every live consumer legitimately mints WITHOUT
// `config.save` (a module-scope factory cannot reach the tRPC client) — so the factory is overloaded: a
// config without `save` returns a boundary whose props are `{ save } | { readOnly: true }`.
// Runtime behavior (the backstop refusal + the read-only status fold) lives in the
// `create-autosave-entity-form.ct.tsx` sibling. The public factory overloads pair the arms declared in
// `autosave-contract.ts`; this proof checks their composed browser-facing contract.

import { createAutosaveEntityForm } from "@orb/client/forms/editor";
import type { ReactNode } from "react";
import { expectTypeOf, test } from "vitest";

interface Values {
  readonly text: string;
}

const CHILDREN = (): ReactNode => null;
const MOUNT = { entityId: "e", serverValues: { text: "" }, children: CHILDREN } as const;
const SAVE = (values: Values): Promise<unknown> => Promise.resolve(values);

// A config WITHOUT the seam — the shape 25 of 25 live consumers use.
const SeamlessMint = createAutosaveEntityForm<Values>({ defaultValues: { text: "" } });
// A config WITH the seam — the CT-story shape (a module-scope save closing over a local spy).
const SavingMint = createAutosaveEntityForm<Values>({ defaultValues: { text: "" }, save: SAVE });

test("a config-without-save boundary REFUSES a mount that declares no seam (the client-forms-01 defect)", () => {
  // @ts-expect-error — neither `save` nor `readOnly`: the state that used to discard edits under "Saved"
  const el = SeamlessMint(MOUNT);
  expectTypeOf(el).not.toBeAny();
});

test("a config-without-save boundary accepts the persisting arm and the read-only arm", () => {
  expectTypeOf(SeamlessMint({ ...MOUNT, save: SAVE })).not.toBeAny();
  expectTypeOf(SeamlessMint({ ...MOUNT, readOnly: true })).not.toBeAny();
});

test("the two arms are exclusive — a mount cannot claim to persist AND be read-only", () => {
  // @ts-expect-error — `readOnly` is `never` on the persisting arm and `save` is `never` on the read-only one
  const el = SeamlessMint({ ...MOUNT, save: SAVE, readOnly: true });
  expectTypeOf(el).not.toBeAny();
});

test("a config-WITH-save boundary keeps `save` an optional per-instance OVERRIDE", () => {
  expectTypeOf(SavingMint(MOUNT)).not.toBeAny();
  expectTypeOf(SavingMint({ ...MOUNT, save: SAVE })).not.toBeAny();
});
