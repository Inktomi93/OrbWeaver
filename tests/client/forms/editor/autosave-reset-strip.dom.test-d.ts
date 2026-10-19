// `reset` re-baselines a live autosave draft mirror into the isDirty loop (D54 §13.1, UI-Gates-and-Lessons.md §7 row 2).
// The session's form type strips it, so a call or a returned `reset` property is a compile error.
import { expectTypeOf, test } from "vitest";
import type { AppFormInstance, AutosaveSession } from "#client/forms/editor/index.ts";

interface Values {
  readonly text: string;
}

declare const session: AutosaveSession<Values>;
declare const saved: AppFormInstance<Values>;
declare const debounceTimer: { reset: () => void };

test("the autosave session form carries no reset member", () => {
  expectTypeOf(session.form).not.toHaveProperty("reset");
  // positive control: the strip removes exactly `reset` from a form that has it
  expectTypeOf(saved).toHaveProperty("reset");
  expectTypeOf(session.form).toHaveProperty("handleSubmit");
  expectTypeOf(session.form).toHaveProperty("setFieldValue");
});

test("calling reset on the autosave form does not compile, with or without a value", () => {
  // @ts-expect-error reset is type-removed from the autosave session form
  session.form.reset();
  // @ts-expect-error reset(value) is the exact re-baseline call the isDirty loop comes from
  session.form.reset({ text: "" });
  expectTypeOf(session.form).not.toHaveProperty("reset");
});

test("a reset property cannot be handed back through the session surface", () => {
  const surface: AutosaveSession<Values> = {
    form: session.form,
    saveState: "saved",
    restored: false,
    retrySave: () => undefined,
    reseed: () => undefined,
    // @ts-expect-error the session object admits no reset property
    reset: () => undefined,
  };
  expectTypeOf(surface).toEqualTypeOf<AutosaveSession<Values>>();
});

test("reset stays legal on forms that are not the autosave surface", () => {
  saved.reset();
  debounceTimer.reset();
  expectTypeOf(saved.reset).toBeFunction();
});
