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
