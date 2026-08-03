// The version-locked `dontUpdateMeta` guard (UI-Lib-TanStack-Form.md §C footgun #3): the flag is
// TYPED but appears in ZERO docs, and the library ships type changes as patch semver — so the
// saved-form factory's `promote()` rides this pinned behavioral test. If an upgrade renames or
// breaks the flag, THIS goes red before any editor silently starts flagging pristine forms dirty.
// Headless FormApi (form-core re-export) — no DOM, no React.

import { FormApi } from "@tanstack/react-form";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

interface Values {
  name: string;
  avatarAssetId: string | null;
}

function headlessForm(): FormApi<Values, never, never, never, never, never, never, never, never, never, never, never> {
  const form = new FormApi({
    defaultValues: { name: "", avatarAssetId: null } as Values,
  });
  form.mount();
  return form as never;
}

describe("setFieldValue dontUpdateMeta (the promote() contract)", () => {
  test("a dontUpdateMeta write changes the VALUE but never flips isDirty/isTouched", () => {
    const form = headlessForm();
    form.setFieldValue("avatarAssetId", "asset_x", { dontUpdateMeta: true });
    expect(form.state.values.avatarAssetId).toBe("asset_x");
    expect(form.state.isDirty).toBe(false);
    expect(form.state.isTouched).toBe(false);
  });

  test("control: the same write WITHOUT the flag marks the form dirty", () => {
    const form = headlessForm();
    form.setFieldValue("avatarAssetId", "asset_x");
    expect(form.state.isDirty).toBe(true);
  });

  test("the two dirty signals stay distinct: revert clears isDefaultValue, never isDirty", () => {
    const form = headlessForm();
    form.setFieldValue("name", "Kira");
    expect(form.state.isDefaultValue).toBe(false);
    expect(form.state.isDirty).toBe(true);
    form.setFieldValue("name", "");
    // The pill signal auto-clears on revert; the reseed-guard signal is persistent BY DESIGN.
    expect(form.state.isDefaultValue).toBe(true);
    expect(form.state.isDirty).toBe(true);
  });
});
