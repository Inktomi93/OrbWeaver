// THE single `createFormHook` instance — every multi-field form builds from `useAppForm` (or, almost
// always, one of the two editor factories that wrap it). A new bound control registers HERE, nowhere
// else. NOTE: biome.json carries a useNamingConvention override for this file only — the registry keys
// are PascalCase by necessity (createFormHook exposes them as JSX components: `<field.TextField>`).

import { createFormHook } from "@tanstack/react-form";
import { AvatarUploadField } from "./bound-fields/avatar-upload-field";
import { BoundColorField } from "./bound-fields/color-field";
import { DirtyPill, FormErrorBanner, SubmitButton } from "./bound-fields/form-chrome";
import { MacroField } from "./bound-fields/macro-field";
import { MultiToggleField } from "./bound-fields/multi-toggle-field";
import { BoundNumberField } from "./bound-fields/number-field";
import { SelectField } from "./bound-fields/select-field";
import { BoundSliderField } from "./bound-fields/slider-field";
import { SwitchField } from "./bound-fields/switch-field";
import { TextField } from "./bound-fields/text-field";
import { TextareaField } from "./bound-fields/textarea-field";
import { fieldContext, formContext } from "./contexts";

export const { useAppForm, withForm, withFieldGroup } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField,
    TextareaField,
    NumberField: BoundNumberField,
    SliderField: BoundSliderField,
    SelectField,
    SwitchField,
    ColorField: BoundColorField,
    MultiToggleField,
    AvatarUploadField,
    MacroField,
  },
  formComponents: {
    SubmitButton,
    DirtyPill,
    FormErrorBanner,
  },
});

// The real `useAppForm` options type, pinned to a concrete `TValues` — a type-extraction-only "fake
// call" instantiation (trailing 11 validator/listener generics widened to `any`, TanStack's own idiom
// for these escape hatches). Plain `Parameters<typeof useAppForm>[0]` collapses every generic to
// `unknown`, which isn't assignable back into a real call — this is what the two editor factories need.
// biome-ignore lint/suspicious/noExplicitAny: type-extraction-only instantiation of TanStack's own generic escape hatch (see comment above) — never a runtime value, never flows into app logic.
type Wildcard = any;

declare function pinAppFormOptions<TValues extends object>(
  opts: Parameters<typeof useAppForm<TValues, Wildcard, Wildcard, Wildcard, Wildcard, Wildcard, Wildcard, Wildcard, Wildcard, Wildcard, Wildcard, Wildcard>>[0],
): void;

/** The real `useAppForm` options shape for a concrete `TValues` (see `pinAppFormOptions` above). */
export type AppFormOptions<TValues extends object> = Parameters<typeof pinAppFormOptions<TValues>>[0];

/**
 * The real `useAppForm` RETURN (form instance) type for a concrete `TValues` — the SAME pin as
 * `AppFormOptions` (bare `ReturnType<typeof useAppForm>`, with no type args, independently defaults
 * every trailing generic and can silently stop structurally matching a `form` built from a richly
 * typed `AppFormOptions<TValues>` call — this keeps both derivations locked to one instantiation).
 */
export type AppFormInstance<TValues extends object> = ReturnType<
  typeof useAppForm<TValues, Wildcard, Wildcard, Wildcard, Wildcard, Wildcard, Wildcard, Wildcard, Wildcard, Wildcard, Wildcard, Wildcard>
>;
