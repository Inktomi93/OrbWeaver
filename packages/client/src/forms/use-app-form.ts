// THE single `createFormHook` instance (UI-Gates §11.3; gate `tanstack-form-only-in-shared` — the
// grit `no-direct-useform` bans raw `useForm`/`createFormHook` outside forms/). Every multi-field
// form in the app builds from `useAppForm` (or, almost always, from the two editor FACTORIES that
// wrap it — §13.4: the factory trigger is ≥3 fields OR validation OR save/draft semantics; only a
// genuinely trivial input stays plain controlled + Zod). Bound field set: Text/Textarea/Number/
// Select/Switch + the save chrome; a new bound control registers HERE, nowhere else. (The Macro
// bound field joins when a feature first composes `@orb/ui/macro-textarea` into an editor.)
// NOTE: biome.json carries a useNamingConvention override for THIS file only — the registry keys
// are PascalCase by necessity (createFormHook exposes them as JSX components: `<field.TextField>`).

import { createFormHook } from "@tanstack/react-form";
import { DirtyPill, FormErrorBanner, SubmitButton } from "./bound-fields/form-chrome";
import { NumberField } from "./bound-fields/number-field";
import { SelectField } from "./bound-fields/select-field";
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
    NumberField,
    SelectField,
    SwitchField,
  },
  formComponents: {
    SubmitButton,
    DirtyPill,
    FormErrorBanner,
  },
});

// The REAL `useAppForm` options type, pinned to a concrete `TValues` — a type-extraction-only "fake
// call" instantiation (the trailing 11 validator/listener generics widened to `any`, TanStack's own
// idiom for these deeply-generic escape hatches — see form-core's `AnyFieldApi`/`AnyFormApi`). Plain
// `Parameters<typeof useAppForm>[0]` collapses every generic to `unknown` (no call site to infer
// from), which is NOT assignable back into a real `useAppForm<TValues, ...>({...})` call once spread
// — this is the derivation the two editor factories actually need for their `config.options` type.
// biome-ignore lint/suspicious/noExplicitAny: type-extraction-only instantiation of TanStack's own generic escape hatch (see comment above) — never a runtime value, never flows into app logic.
type Wildcard = any;

declare function pinAppFormOptions<TValues extends object>(
  opts: Parameters<
    typeof useAppForm<
      TValues,
      Wildcard,
      Wildcard,
      Wildcard,
      Wildcard,
      Wildcard,
      Wildcard,
      Wildcard,
      Wildcard,
      Wildcard,
      Wildcard,
      Wildcard
    >
  >[0],
): void;

/** The real `useAppForm` options shape for a concrete `TValues` (see `pinAppFormOptions` above). */
export type AppFormOptions<TValues extends object> = Parameters<
  typeof pinAppFormOptions<TValues>
>[0];

/**
 * The real `useAppForm` RETURN (form instance) type for a concrete `TValues` — the SAME pin as
 * `AppFormOptions` (bare `ReturnType<typeof useAppForm>`, with no type args, independently defaults
 * every trailing generic and can silently stop structurally matching a `form` built from a richly
 * typed `AppFormOptions<TValues>` call — this keeps both derivations locked to one instantiation).
 */
export type AppFormInstance<TValues extends object> = ReturnType<
  typeof useAppForm<
    TValues,
    Wildcard,
    Wildcard,
    Wildcard,
    Wildcard,
    Wildcard,
    Wildcard,
    Wildcard,
    Wildcard,
    Wildcard,
    Wildcard,
    Wildcard
  >
>;
