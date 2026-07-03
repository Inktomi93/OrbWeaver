---
kind: reference
status: active
updated: 2026-07-03
---

# UI-Lib-TanStack-Form

> **A lib companion of the nine-doc UI law set** — a full-read examples/deep-docs mine (evidence + provenance, NOT extra law; the distilled verdicts are folded into the spec sections of `UI-Architecture-and-Layout.md` / `UI-Gates-and-Lessons.md` / `UI-Primitives-and-Reuse.md`, cited per claim).
>
> Cross-doc `§N` references resolve via the §-map in `UI-Architecture-and-Layout.md`.

## TanStack Form — React Examples Digest (for orbweaver client foundation)

Source: shallow clone of `github.com/TanStack/form`, `examples/react/*` (read in full, June 2026).
**Uniform stack across all 12:** `@tanstack/react-form ^1.33.0`, `react`/`react-dom` `19.1.0`, devtools
`@tanstack/react-devtools ^0.9.7` + `@tanstack/react-form-devtools ^0.2.29`, Vite 7, `@vitejs/plugin-react ^5.1.1`.
Per-example deps noted only where they differ.

> **Two naming gotchas up front (example dir names vs. reality):**
>
> - The dir **`dynamic`** does NOT demo linked/dependent fields. It demos `revalidateLogic()` + `validators.onDynamic` + a Zod schema. **No example anywhere uses `onChangeListenTo`/linked fields.**
> - The dir **`standard-schema`** is the multi-validator (Zod/Valibot/ArkType/Effect) showcase.
> - Net: of the orbweaver "SIX footguns", **zero are demonstrated as fixes** by any example, and several aren't touched at all (see final section). The examples are happy-path API tours, not draft-survival editors.

### 1. `composition`

**Purpose:** The canonical `createFormHook` composition pattern — bound field/form components consumed via context. This is the closest example to orbweaver's `useAppForm` design.
**Deps:** baseline only.

**API / patterns used (`src/index.tsx`, `src/AppForm/*`):**

- `createFormHookContexts()` → destructures `{ fieldContext, formContext, useFieldContext, useFormContext }` (`AppForm/AppForm.tsx:13`).
- `createFormHook({ fieldContext, formContext, fieldComponents: { TextField }, formComponents: { SubmitButton } })` → `{ useAppForm }` (single instance, exported default).
- `useAppForm({ defaultValues: { firstName:'', lastName:'' }, onSubmit: async ({ value }) => … })`.
- `<form.AppField name="firstName" validators={{ onChange, onChangeAsyncDebounceMs: 500, onChangeAsync }}>{(f) => <f.TextField label="first name" />}</form.AppField>` — render-prop yields a field bound to the field components.
- `<form.AppForm><form.SubmitButton label="save" /></form.AppForm>` — `AppForm` wrapper injects form context for form-level bound components.
- Bound **field** component (`TextField.tsx`): `const field = useFieldContext<string>()` then reads `field.state.value`, `field.handleChange(e.target.value)`, `field.handleBlur()`, `field.state.meta.isTouched`, `.isValid`, `.errors.join(',')`, `.isValidating`.
- Bound **form** component (`SubmitButton.tsx`): `const form = useFormContext()` then `<form.Subscribe selector={(state) => state.isSubmitting}>{(isSubmitting) => <button disabled={isSubmitting}>}`.
- `<form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit() }}>`.

**Non-obvious mechanics:** the bound field reads its type from `useFieldContext<string>()` — the generic is how a generic `TextField` stays type-safe without per-field typing. Validators live on `AppField`, not on the bound component, so the bound component is validation-agnostic and reusable.

**Orbweaver mapping:** This IS the skeleton for `useAppForm` composition + the bound-field set (Text/Select/Switch/Range/Macro) and form-level chrome (DirtyPill/Discard/Save). **ADOPT** wholesale: one `createFormHook`, `useFieldContext<T>()` bound fields, `useFormContext()` + `Subscribe` form components, `AppField`/`AppForm` seams. **SKIP** nothing structural. Note it does NOT show seed-on-load, `key`-remount, dirty, or reset — our factory adds all of that on top.

### 2. `query-integration`

**Purpose:** Wire a form to TanStack Query (`useQuery` seed + `useMutation` save). **Directly relevant to our Query×Form seed seam — and it PUNTS on the hard parts.**
**Deps:** + `@tanstack/react-query ^5.89.0`.

**API / patterns (`src/index.tsx`):**

- Plain `useForm` (NOT the composition hook).
- `defaultValues: { firstName: data?.firstName ?? '', lastName: data?.lastName ?? '' }` — seeded from `useQuery` data.
- `if (isLoading) return <p>Loading..</p>` BEFORE rendering the form — so the form **mounts once, after the first fetch resolves**.
- `onSubmit: async ({ formApi, value }) => { await saveUserMutation.mutateAsync(value); await refetch(); formApi.reset() }` — note `formApi.reset()` called with **NO argument**.
- `useMutation({ mutationFn })`, `useQuery({ queryKey:['data'], queryFn })`.
- `form.Field` render-prop (`children={(field) => …}`), `FieldInfo` reads `field.state.meta.*`.
- `form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}`; reset button `onClick={() => form.reset()}`.

**Non-obvious mechanics / the trap:** `defaultValues` is only consumed at mount. The `isLoading` gate means the form only exists after fetch #1 — so there's no reseed effect, no `key` remount, and **a background refetch will NOT update the form** (and conversely won't clobber typing — because nothing syncs query→form after mount). It "works" only because it never re-seeds. `formApi.reset()` after submit resets to the *original defaults captured at mount*, NOT to the freshly-saved value — and since it passes no value, it dodges the `reset(value)`-inside-onSubmit bug entirely rather than solving it.

**Orbweaver mapping:** Feeds the **Query×Form seed seam** — as the *anti-pattern reference*. It demonstrates **footgun #4 by omission**: it neither clobbers nor reseeds, because it has no live sync. Our `seededRef + !isDirty` guard + `key`-remount + structural re-baseline are exactly the gap this example leaves open. **ADOPT** only the shape (`mutateAsync` in `onSubmit`, `useQuery` for seed). **SKIP** the `isLoading`-gate-as-seed-strategy and the bare `formApi.reset()` — both are why edit-while-refetch breaks. Touches footguns **#1, #2, #4** — all left unsolved.

### 3. `compiler`

**Purpose:** Prove TanStack Form runs under the React Compiler. **This is the example that answers our "is it Compiler-clean?" question.**
**Deps:** + `babel-plugin-react-compiler 19.1.0-rc.3`, `eslint-plugin-react-compiler 19.1.0-rc.2`. Has its own `vite.config.ts`.

**API / patterns:** Source (`src/index.tsx`) is **byte-for-byte the `simple` example** — plain `useForm`, `form.Field`, `form.Subscribe`, `FieldInfo`. The only delta vs `simple` is the build config.

- `vite.config.ts`: `react({ babel: { plugins: [['babel-plugin-react-compiler', {}]] } })` — compiler ON, empty config.
- `package.json` quirk: `_test:types` (underscore-prefixed = the `tsc` typecheck is intentionally disabled for this example).

**Non-obvious mechanics:** **There is NO `'use no memo'` directive anywhere** — not in the form code, not in the field render-props. The form code passes through the compiler unmodified. This is the confirmation: **TanStack Form (render-prop + external-store architecture) is React-Compiler-clean; no opt-out pragma required.**

**Orbweaver mapping:** Direct green light for our "React Compiler ON, no hand `useMemo`/`useCallback`" constraint. **ADOPT** the Vite compiler config shape. **CONFIRMS** we don't need `use no memo` escape hatches in the bound-field set or factories. (Caveat: it's the trivial 2-field form; it proves the core primitives compile clean, not every exotic pattern — but the architecture, not the field count, is what the compiler cares about.)

### 4. `array`

**Purpose:** Field arrays — add/render/remove repeated sub-objects.
**Deps:** baseline.

**API / patterns (`src/index.tsx`):**

- `<form.Field name="people" mode="array">` — `mode="array"` is the array flag.
- Inside render-prop: `field.state.value.map((_, i) => <form.Field key={i} name={`people\[${i}].name`}>…)` — nested fields use bracket+dot path strings.
- `field.pushValue({ name:'', age:0 })` — append. (Only `pushValue` is shown; `removeValue`/`insertValue`/`replaceValue` exist on the same field API but aren't demoed here.)
- `form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}`.

**Non-obvious mechanics:** array iteration is over `field.state.value` (the live array); subfields are addressed by interpolated path strings, and the parent stays `mode="array"`. `key={i}` (index) is used — fine for append-only, but a stable id key matters if rows can be reordered/removed (relevant to our card editors with reorderable lists).

**Orbweaver mapping:** Feeds bound-field composition for any repeatable section (e.g. character card alternate greetings, example-message blocks, lorebook entries). **ADOPT** `mode="array"` + `pushValue`/`removeValue`/`insertValue` for list editors. **WATCH** footgun #6: array values are fresh object refs each render → an `Object.is` baseline compare will always read "dirty"; our `fieldValuesEqual` must be structural. **SKIP** `key={i}` for reorderable lists — key on a stable row id.

### 5. `dynamic` *(actually: revalidate-logic + onDynamic)*

**Purpose:** Despite the name, demonstrates `revalidateLogic()` and the `onDynamic` validator with a Zod schema. NOT dependent/linked fields.
**Deps:** + `zod ^3.25.76`.

**API / patterns (`src/index.tsx`):**

- `useForm({ defaultValues, validationLogic: revalidateLogic(), validators: { onDynamic: schema }, onSubmit })`.
- `revalidateLogic()` imported from `@tanstack/react-form` — opt-in validation strategy (validate-on-submit-then-revalidate-on-change).
- `validators: { onDynamic: zodSchema }` — `onDynamic` is the validator slot that `revalidateLogic` drives.
- Zod schema (`z.object({ firstName: z.string().min(1,…), lastName: … })`) passed directly (Standard Schema).
- Reset button calls `e.preventDefault(); form.reset()` with a comment: *"Avoid unexpected resets of form elements (especially `<select>` elements)"* — i.e. a `type="reset"` button will nuke native selects unless you `preventDefault` and drive `form.reset()` manually.

**Non-obvious mechanics:** `revalidateLogic()` + `onDynamic` is the modern "don't yell until they submit, then live-validate" UX. The reset-button `preventDefault` gotcha is real and bites `<select>`/`<Range>` controls.

**Orbweaver mapping:** Feeds the **Zod validation seam**. `revalidateLogic() + onDynamic` is likely the right default for our entity editors (don't error-spam on first keystroke). **ADOPT** both, plus the `preventDefault`-on-reset rule into our Discard button (we have selects/switches/ranges). **SKIP** nothing.

### 6. `standard-schema`

**Purpose:** Standard-Schema validation across Zod, Valibot, ArkType, and Effect — interchangeable in the same validator slot.
**Deps:** + `zod ^3.25.76`, `valibot ^1.1.0`, `arktype ^2.1.22`, `effect ^3.17.14`.

**API / patterns (`src/index.tsx`):**

- Four schemas defined; all four are valid drop-ins for `validators: { onChange: <schema> }` (3 commented out).
- Zod: `z.object({...})`; Valibot: `v.object({ firstName: v.pipe(v.string(), v.minLength(3,…), v.startsWith('A',…)) })`; ArkType: `type({ firstName: 'string >= 3' })`; **Effect needs an explicit adapter: `S.standardSchemaV1(S.Struct({...}))`** (the others are natively Standard-Schema).
- `FieldInfo` here maps `field.state.meta.errors` as **objects** (`errors.map((err) => <em key={err.message}>{err.message}</em>)`) — schema validators emit `{ message }` error objects, not bare strings.

**Non-obvious mechanics:** The string-returning function validators (composition/simple) put **strings** in `meta.errors`; schema validators put **objects** with `.message`. Bound-field error rendering must handle both shapes (or we standardize on one). Effect is the only one needing `standardSchemaV1()`.

**Orbweaver mapping:** Confirms the **Zod-via-Standard-Schema seam** works by just passing the schema object. **ADOPT** Zod directly into validator slots; standardize bound-field error rendering on the **object `{ message }`** shape (since we're Zod-on-Standard-Schema, errors are objects). **SKIP** Valibot/ArkType/Effect. Reinforces footgun-free validation wiring — but says nothing about dirty/seed.

### 7. `field-errors-from-form-validators`

**Purpose:** Form-level (async) validator that returns **per-field** errors + a form-level error — server-error→field mapping.
**Deps:** baseline.

**API / patterns (`src/index.tsx`):**

- `validators: { onSubmitAsync: async ({ value }) => { … return { form: 'Invalid data', fields: { age: 'Must be 13…', username: 'Username is taken' } } } }` — return shape `{ form?: string, fields: Record<fieldName, string> }`; return `null` for valid.
- Field-level `validators: { onSubmit: ({ value }) => (!value ? 'Required field' : null) }` coexisting with the form-level async validator.
- `form.Subscribe selector={(state) => [state.errorMap]}` → render `errorMap.onSubmit` (form-level error bucket).
- Fields read `field.state.meta.isValid` / `.errors.join(', ')`; error `<em role="alert">`.
- Number field: `onChange={(e) => field.handleChange(e.target.valueAsNumber)}` (use `valueAsNumber`, not `value`).

**Non-obvious mechanics:** This is THE pattern for mapping a 422/validation response onto individual fields — the form-level validator distributes errors into `fields[name]` and the matching `form.Field` picks it up via `meta.errors`. `state.errorMap.onSubmit` is the form-wide error channel. `large-form` uses the same `{ fields: {...} }` return shape with **dot-path keys** (`'emergencyContact.fullName'`) for nested fields.

**Orbweaver mapping:** Feeds the **async submit + server-error mapping** path for both factories — when a save POST returns field-level validation errors, this is how they land on fields. **ADOPT** the `{ form, fields: {dotPath: msg} }` return contract and the `errorMap.onSubmit` form-error banner (our Save chrome). **ADOPT** `valueAsNumber` for our Range/number bound fields. **SKIP** nothing.

### 8. `large-form`

**Purpose:** Scaling composition — `formOptions` sharing, `withForm`, `withFieldGroup`, lazy fields, and `useStore` field-store selectors. **The richest example for our factory architecture.**
**Deps:** baseline.

**API / patterns:**

- `hooks/form-context.tsx`: `createFormHookContexts()` → contexts.
- `hooks/form.tsx`: `createFormHook({ fieldComponents: { TextField }, formComponents: { SubscribeButton }, fieldContext, formContext })` → exports **`{ useAppForm, withForm, withFieldGroup }`**. `TextField = lazy(() => import(...))` — **bound field components can be `React.lazy`** (code-split).
- `features/people/shared-form.tsx`: `formOptions({ defaultValues: {...nested...}, validators: { onChangeAsync: async ({ value }) => ({ fields: { fullName:…, 'emergencyContact.fullName':… } }) } })` — **shared, reusable form config object**; nested defaults; form-level async validator with dot-path field errors.
- `features/people/page.tsx`: `useAppForm({ ...peopleFormOpts, onSubmit })` — spread shared opts, add per-instance `onSubmit`. Renders `form.AppField name="fullName"`, passes `form` down to `<AddressFields form={form} />` and `<FieldGroupEmergencyContact form={form} fields="emergencyContact" />`.
- `features/people/address-fields.tsx`: `withForm({ ...peopleFormOpts, render: ({ form }) => … })` — **`withForm` binds a subcomponent to the same form type** (shares `defaultValues` typing); addresses fields by path `address.line1` etc.
- `features/people/emergency-contact.tsx`: `withFieldGroup({ defaultValues: { phone:'', fullName:'' }, render: ({ group }) => <group.AppField name="fullName">… })` — **`withFieldGroup` is a reusable, path-relative sub-form**; the parent maps it onto a subtree via the `fields="emergencyContact"` prop.
- `components/text-fields.tsx`: `const errors = useStore(field.store, (state) => state.meta.errors)` — **`useStore(field.store, selector)`** for surgical subscription to one slice of field state (instead of `field.state.meta` whole-object reads).

**Non-obvious mechanics:**

- `formOptions(...)` is the **one-home config object** — `defaultValues` + form-level validators declared once, spread into `useAppForm`, `withForm`, and `withFieldGroup`. Exactly our "one home / derive-don't-respell" ideal.
- `withForm` shares the *whole* form's type; `withFieldGroup` is *path-relative* (its own mini `defaultValues`, mapped onto a subtree by the parent's `fields=` prop) → reusable across different parents/paths.
- `useStore(field.store, selector)` is the perf primitive: a field component re-renders only when its selected slice changes, not on every field-state mutation.

**Orbweaver mapping:** This feeds the **bulk of `createSavedEntityForm`/`useAppForm` composition**:

- **ADOPT `formOptions`** as the single home for an entity's `defaultValues` + validators (then the factory spreads it). Directly serves footgun #3/#4/#6 hygiene because defaults live in one place.
- **ADOPT `withFieldGroup`** for repeated card sub-sections (persona block, prompt block) and **`withForm`** for large editor panels split across files.
- **ADOPT `useStore(field.store, selector)`** as the default read pattern in our bound fields for large cards (selective subscription = the large-form perf story).
- **ADOPT `lazy` field components** if a bound control is heavy (e.g. the Macro editor).
- **ADOPT** the dot-path `{ fields: {...} }` form-level validator for cross-field rules.
- **SKIP** nothing. Note: still no dirty/seed/reset story — the factory owns those.

### 9. `ui-libraries`

**Purpose:** Bind `form.Field` to third-party inputs (Mantine `TextInput`/`Checkbox`, MUI `TextField`/`Checkbox`).
**Deps:** + `@mantine/core 7.17.8`, `@mui/material 6.5.0`, `@emotion/*`, postcss-mantine toolchain, `@vitejs/plugin-react-swc`.

**API / patterns (`src/MainComponent.tsx`):**

- Plain `useForm`, `form.Field children={({ state, handleChange, handleBlur }) => …}` — **destructures the field API directly in the render-prop param**.
- Text: `<TextInput defaultValue={state.value} onChange={(e)=>handleChange(e.target.value)} onBlur={handleBlur} />`.
- Checkbox: `<Checkbox checked={state.value} onChange={(e)=>handleChange(e.target.checked)} onBlur={handleBlur} />` — boolean via `e.target.checked`.
- Works identically for Mantine and MUI controls.

**Non-obvious mechanics / a trap:** the text inputs use **`defaultValue={state.value}` (uncontrolled)**, not `value=`. That means **`form.reset(value)` and external reseeds will NOT update these inputs** after mount — the React tree won't reflect a programmatic value change. For our draft-survival/reseed editors this is a **bug**; bound text/select fields must be **controlled (`value=`)**, not `defaultValue=`. Checkboxes here ARE controlled (`checked=`).

**Orbweaver mapping:** Feeds the **bound-field set** (how Text/Select/Switch wrap a UI lib). **ADOPT** the `handleChange(e.target.checked)` boolean wiring for our Switch and the destructure-in-render-prop ergonomics. **SKIP / INVERT** the `defaultValue=` text binding — use **controlled `value=`** so reset/reseed propagates (this directly protects footguns #1/#4 where we `reset(value)` and expect the UI to follow). Our bound fields are controlled, period.

### 10. `devtools`

**Purpose:** Wire the TanStack devtools panel + the form devtools plugin; also shows multiple independent forms and submission/error state.
**Deps:** baseline (devtools deps are in every example, this one centers them).

**API / patterns:**

- `src/index.tsx`: `<TanStackDevtools plugins={[formDevtoolsPlugin()]} eventBusConfig={{ debug: true }} />` — `eventBusConfig.debug` toggles verbose logging. (Other examples use `config={{ hideUntilHover: true }}`.)
- `src/App.tsx`: **two separate `useForm` instances** (`form1`, `form2`) — note these are plain `useForm`, NOT the composition hook, so multiple is fine. (The "one instance" rule is specifically about `createFormHook`, not `useForm`.)
- `form2` shows `onSubmit` that `throw`s a string on invalid → surfaces in devtools/submission state.
- `form.Subscribe selector={(state) => [state.submissionAttempts]}` — `submissionAttempts` counter.
- `field.handleChange(parseInt(e.target.value))` for the number field.

**Non-obvious mechanics:** `formDevtoolsPlugin()` mounts under the single `<TanStackDevtools>` shell (one shell, N plugins). `state.submissionAttempts` is a useful surfaced field. Throwing in `onSubmit` is a valid error path the devtools visualize.

**Orbweaver mapping:** Feeds **dev tooling only** — the devtools are a `devDependency` and a dev-mode mount. **ADOPT** `<TanStackDevtools plugins={[formDevtoolsPlugin()]} />` behind a dev-only flag in the SPA root; `eventBusConfig.debug` for diagnosing the dirty/seed footguns during factory dev. **SKIP** the multi-form / throw patterns. Confirms the "one `createFormHook` instance" rule is about bound components, not a ban on multiple `useForm`.

### 11. `multi-step-wizard`

**Purpose:** Multi-step form using `form.FormGroup` for per-step validation + submission, with one underlying form.
**Deps:** + `zod ^3.25.76`.

**API / patterns:**

- `hooks/form.tsx`: `createFormHook(...)` → `{ useAppForm, withForm, withFieldGroup }`; `SubscribeButton` form component.
- `features/wizard/shared-form.tsx`: `formOptions({ defaultValues: { step1:{name:''}, step2:{name:''} } })` + per-step Zod schemas (`step1Schema`, `step2Schema`).
- `features/wizard/page.tsx`: `useAppForm({ ...wizardFormOpts, validationLogic: revalidateLogic(), validators: { onDynamic: z.object({ step1: step1Schema, step2: step2Schema }) }, onSubmit })`; step state via `useState(0)`. **Comment:** the form-level `onDynamic` (full schema) only runs on `form.handleSubmit`, NOT on a `FormGroup`'s submit (which validates only its step).
- `step1-subform.tsx` / `step2-subform.tsx`: `withForm({ ...wizardFormOpts, props: { step, setStep }, render: ({ form, step, setStep }) => … })`.
  - `<form.FormGroup name="step1" validators={{ onDynamic: step1Schema }} onGroupSubmit={({ value }) => setStep(step+1)} onGroupSubmitInvalid={() => …}>{(formGroup) => (<form onSubmit={e => { …; formGroup.handleSubmit() }}> … </form>)}</form.FormGroup>`.
  - `formGroup.state.meta.errorMap` is readable just like a form/field.
  - `withForm` `props:` declares typed props (with placeholder defaults) passed at render.

**Non-obvious mechanics:** `FormGroup` is a **scoped validation+submit boundary over a subtree** of one form. Per-step submit (`formGroup.handleSubmit`) validates only that group's `onDynamic`; the full-form `onDynamic` only fires on `form.handleSubmit`. `onGroupSubmit`/`onGroupSubmitInvalid` are the per-step gate (advance step only if the step validates). One form holds all steps' state the whole time (no per-step unmount loss).

**Orbweaver mapping:** Mostly **SKIP for entity editors** — our card/persona/preset editors aren't wizards. BUT `FormGroup` + scoped `onDynamic` is a clean primitive if any editor grows tabbed sections that validate independently (e.g. a preset with "sampling" / "prompt" tabs you can save section-by-section). **ADOPT-IF-NEEDED** only. Confirms `withForm` `props:` typing and `revalidateLogic + onDynamic` again. No dirty/seed story.

### 12. `simple`

**Purpose:** Baseline `useForm` with field-level sync+async validation. The reference everything else derives from.
**Deps:** baseline.

**API / patterns (`src/index.tsx`):**

- `useForm({ defaultValues:{firstName:'',lastName:''}, onSubmit: async ({ value }) => console.log(value) })`.
- `form.Field name="firstName" validators={{ onChange: ({value}) => …string|undefined, onChangeAsyncDebounceMs: 500, onChangeAsync: async ({value}) => value.includes('error') && 'No "error"…' }}`.
- `form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}`.
- Reset: `type="reset"` button with `e.preventDefault(); form.reset()` (+ the select-reset comment).
- `FieldInfo` reads `field.state.meta.isTouched/.isValid/.errors/.isValidating`.

**Non-obvious mechanics:** Field-level sync validator returns `string | undefined`; async returns `string | false`. `onChangeAsyncDebounceMs` debounces only the async pass. `canSubmit` already accounts for validation state.

**Orbweaver mapping:** Baseline for field-level validation ergonomics. **ADOPT** `canSubmit`/`isSubmitting` Subscribe in Save chrome, field-level `onChange`+`onChangeAsync`+`onChangeAsyncDebounceMs` where a field needs bespoke async checks (e.g. unique character name). **SKIP** as a structure (too thin). No dirty/seed.

## Master pattern / feature list (deduped across all 12)

**Hook construction / composition**

- `createFormHookContexts()` → `{ fieldContext, formContext, useFieldContext, useFormContext }` — context plumbing for bound components. *(composition, large-form, multi-step)*
- `createFormHook({ fieldContext, formContext, fieldComponents, formComponents })` → `{ useAppForm, withForm, withFieldGroup }` — the single bound-hook instance. *(composition, large-form, multi-step)*
- `useAppForm({ ...formOptions, onSubmit })` — instantiate the bound form. *(composition, large-form, multi-step)*
- `useForm({ defaultValues, validators, onSubmit })` — plain (unbound) form. *(simple, query, compiler, array, dynamic, standard-schema, field-errors, ui-libraries, devtools)*
- `formOptions({ defaultValues, validators })` — shareable/spreadable config object (one home for defaults+validators). *(large-form, multi-step)*
- `withForm({ ...formOptions, props?, render })` — bind a subcomponent to the full form type. *(large-form, multi-step)*
- `withFieldGroup({ defaultValues, render: ({ group }) })` + parent `fields="path"` — path-relative reusable sub-form. *(large-form)*
- `form.FormGroup name validators={{onDynamic}} onGroupSubmit onGroupSubmitInvalid` — scoped validate+submit boundary; `formGroup.handleSubmit`, `formGroup.state.meta.errorMap`. *(multi-step)*

**Fields & binding**

- `form.Field name children={(field)=>…}` (render-prop) — core field. *(simple, array, query, etc.)*
- `form.AppField name>{(f)=>…}` — bound field (yields field-component namespace). *(composition, large-form, multi-step)*
- `form.AppForm` — wrapper providing form context to bound form components. *(composition, large-form)*
- `useFieldContext<T>()` — typed bound field consumer. *(composition, large-form, multi-step)*
- `useFormContext()` — bound form consumer. *(composition, large-form, multi-step)*
- `field.state.value`, `field.handleChange(v)`, `field.handleBlur()`, `field.name`. *(all)*
- `field.state.meta`: `isTouched`, `isValid`, `errors` (string OR `{message}` object), `isValidating`. *(all)*
- `useStore(field.store, (s)=>s.meta.errors)` — selective field-store subscription (perf). *(large-form, multi-step)*
- Number binding: `handleChange(e.target.valueAsNumber)` / `parseInt`. *(field-errors, devtools)*
- Boolean binding: `handleChange(e.target.checked)` + `checked={state.value}`. *(ui-libraries)*
- UI-lib binding via destructured render-prop `{ state, handleChange, handleBlur }`. *(ui-libraries)*
- `lazy(() => import(field))` bound field components. *(large-form)*

**Field arrays**

- `form.Field name mode="array"` + iterate `field.state.value` + nested `form.Field name={`people\[${i}].name`}`. *(array)*
- `field.pushValue(obj)` — append. (`removeValue`/`insertValue`/`replaceValue` exist; not demoed.) *(array)*

**Validation**

- Field-level `validators: { onChange, onBlur, onSubmit, onChangeAsync, onChangeAsyncDebounceMs }`. *(simple, composition, query, devtools)*
- Sync validator returns `string | undefined`; async returns `string | false`. *(simple)*
- Form-level `validators: { onChangeAsync | onSubmitAsync }` returning `{ form?, fields: { [dotPath]: msg } } | null`. *(field-errors, large-form)*
- `validationLogic: revalidateLogic()` + `validators: { onDynamic: schema }` — validate-on-submit-then-revalidate. *(dynamic, multi-step)*
- Standard-Schema: pass Zod/Valibot/ArkType schema object directly; Effect via `S.standardSchemaV1(...)`. *(standard-schema, dynamic, multi-step)*
- Schema-validator errors are `{ message }` objects (vs bare strings from fn validators). *(standard-schema, multi-step)*

**Form state / submit**

- `form.handleSubmit()` inside `onSubmit={(e)=>{e.preventDefault();e.stopPropagation();…}}`. *(all)*
- `onSubmit: async ({ value, formApi }) => …`; can `await mutateAsync`, `throw`, or `formApi.reset()`. *(query, devtools)*
- `form.Subscribe selector={(s)=>…} children`/render-prop — selective form-state subscription. *(all)*
- Subscribed state slices seen: `isSubmitting`, `canSubmit`, `submissionAttempts`, `errorMap`(`.onSubmit`). *(composition, simple, devtools, field-errors)*
- `form.reset()` (no arg) — reset to mount defaults. Reset button needs `e.preventDefault()` (select/native reset gotcha). *(simple, dynamic, query)*

**Devtools**

- `<TanStackDevtools config={{hideUntilHover:true}} | eventBusConfig={{debug:true}} plugins={[formDevtoolsPlugin()]} />` — dev-only, one shell N plugins. *(all; centered in devtools)*

**Build**

- React Compiler: `react({ babel:{ plugins:[['babel-plugin-react-compiler', {}]] } })`, **no `use no memo` needed**. *(compiler)*

## Adopt-into-orbweaver shortlist

**`useAppForm` composition (foundation)**

- Single `createFormHook` + `createFormHookContexts`, bound `useFieldContext<T>()` fields, `useFormContext()`+`Subscribe` form chrome. *(composition — the canonical skeleton)*
- `formOptions(...)` as the one-home `defaultValues`+validators object the factory spreads. *(large-form — "one home / derive-don't-respell")*
- `withFieldGroup` for repeated card sub-sections; `withForm` for split editor panels; `lazy` for heavy controls (Macro). *(large-form — scale without re-typing)*

**Bound-field set (Text/Select/Switch/Range/Macro)**

- Controlled `value=` / `checked=` ALWAYS (never `defaultValue=`), so `reset(value)`/reseed propagates. *(invert ui-libraries — protects footguns #1/#4)*
- `useStore(field.store, selector)` reads for surgical re-render in big cards. *(large-form — perf)*
- `valueAsNumber` for Range/number, `e.target.checked` for Switch. *(field-errors, ui-libraries)*
- Standardize error rendering on the `{ message }` object shape (Zod path). *(standard-schema)*

**Validation seam (Zod / Standard Schema)**

- `validationLogic: revalidateLogic()` + `validators: { onDynamic: zodSchema }` as the editor default. *(dynamic, multi-step — humane UX)*
- Form-level validator returning `{ form, fields: { [dotPath]: msg } }` for server/cross-field errors; surface via `errorMap.onSubmit`. *(field-errors, large-form)*
- Reset/Discard button must `e.preventDefault()` then `form.reset(...)`. *(dynamic, simple — select-reset gotcha)*

**Query×Form seed seam**

- Use `useQuery` for seed + `useMutation` in `onSubmit`. *(query-integration — shape only)*
- **Do NOT** copy its seed strategy: our factory owns `seededRef + !isDirty` guard, `key`-remount on entity id change, and structural re-baseline. *(query-integration leaves this open)*

**Dev tooling**

- `<TanStackDevtools plugins={[formDevtoolsPlugin()]} />` dev-only mount; `eventBusConfig.debug` while building the factories. *(devtools)*

**Build**

- Vite React-Compiler babel plugin, no opt-out pragmas in form code. *(compiler)*

### The SIX footguns — example coverage verdict

| # | Footgun | Any example demonstrate a FIX? | Notes |
| - | - | - | - |
| 1 | `isDirty` event-based, never auto-clears post-submit → must `reset(value)` | **NO.** No example reads `isDirty` at all. `query-integration` calls bare `formApi.reset()` (no value) — resets to *mount* defaults, doesn't re-baseline to saved value, and doesn't touch the seed-guard interaction. | Factory must own entirely. |
| 2 | `form.reset(value)` INSIDE `onSubmit` can ignore new defaults (known bug) | **NO — not even exercised.** `query-integration` is the only `reset`-in-`onSubmit`, and it passes **no value**, so it sidesteps (doesn't expose or fix) the value-arg bug. | Factory must reset-with-value carefully (or reset outside onSubmit / via key-remount); no reference fix exists. |
| 3 | Bound fields writing non-user values mark dirty → need `setValue(...,{dontUpdateMeta:true})` | **NO.** No example uses `setFieldValue`/`setValue` with `dontUpdateMeta`, nor any mount-time programmatic promotion. | Entirely uncovered; factory owns mount-time writes. |
| 4 | Query×Form seed/clobber → `seededRef + !isDirty` guard | **NO.** `query-integration` avoids clobber only by never re-syncing query→form after mount (gated by `isLoading`). It neither reseeds on refetch nor guards typing. | The exact gap our seed seam fills; example is the anti-pattern. |
| 5 | Zustand-`persist` draft store mirror (version+migrate) | **NO.** No example persists drafts or uses any external store beyond the form itself. | Entirely orbweaver-original; `createAutosaveEntityForm` owns it. |
| 6 | `fieldValuesEqual` structural compare (Object.is on round-tripped refs reads "changed") | **NO.** `array` produces fresh object/array refs each render but the example never compares baselines (no dirty logic at all), so the trap is latent and unaddressed. | Factory needs a structural compare for baseline/dirty. |

**Bottom line:** all six footguns are **factory-owned**. The examples are a clean API tour (composition, validation, arrays, schema, form-groups, perf, UI binding, devtools, compiler) but contain **zero** draft-survival, dirty-tracking, reseed-guarding, autosave, or persistence machinery. They give us the *primitives* (`formOptions`, `withFieldGroup`, `useStore`, `revalidateLogic`, controlled binding, server-error mapping) but none of the *lifecycle* our two factories exist to bake.

### What the examples confirm vs. don't cover

- **CONFIRMED — React-Compiler-clean:** the `compiler` example runs the form (identical to `simple`) under `babel-plugin-react-compiler` with **no `'use no memo'` directive anywhere**. The render-prop/external-store architecture compiles clean; we don't need opt-out pragmas. (Proven on the core primitives, not every exotic combo — but the compiler reacts to architecture, not field count.)
- **CONFIRMED — composition/perf/validation/server-errors** are all first-class and match our intended design (`createFormHook` single instance, `formOptions`, `withForm`/`withFieldGroup`, `useStore` selectors, Standard-Schema Zod, `{ fields }` error mapping).
- **NOT COVERED — `query-integration` punts** on seed/clobber + dirty-reset: it seeds `defaultValues` once at mount behind an `isLoading` gate and calls bare `formApi.reset()` post-submit. No live query→form sync, no `seededRef`/`!isDirty` guard, no `key`-remount, no re-baseline. Edit-during-background-refetch and "reset to freshly-saved value" are both unsolved.
- **NOT COVERED at all:** `isDirty`/dirty-tracking, `listeners` (`onChange`/`onBlur`/`onMount`/`onSubmit` + `onChangeDebounceMs`) — **no example uses listeners**, which is the backbone of `createAutosaveEntityForm`'s debounced draft mirror + `onFieldUnmount` flush; linked/dependent fields (`onChangeListenTo`); `setFieldValue`/`setFieldMeta`/`dontUpdateMeta`; Zustand persist; structural value compare. These are all factory-original.

## TanStack Form — Full-Docs Mine for Orbweaver's Form/Editor Layer

Scope read **in full**: every React guide (`docs/framework/react/guides/*` — arrays, async-initial-values, basic-concepts, custom-errors, debugging, devtools, dynamic-validation, focus-management, form-composition, form-groups, linked-fields, listeners, reactivity, react-native, ssr, submission-handling, ui-libraries, validation), the React reference (`docs/framework/react/reference/**`), the core reference (`docs/reference/**` — FieldApi, FieldGroupApi, FormApi, FormGroupApi, all functions/interfaces/variables/type-aliases), and the top-level docs (overview, philosophy, comparison, installation, typescript, quick-start, community-resources).

Version reality check: docs reflect the current line (form-core with `onDynamic`/`revalidateLogic`, `withFieldGroup`, `createFieldMap`, `formDevtoolsPlugin`, `isDefaultValue`/`isPristine`, the 22-generic FieldApi). Matches orbweaver's `@tanstack/react-form ~1.33+` target.

### A. Best-practice / capability map (full surface, grouped)

#### Form & field creation

- **`useForm({ defaultValues, onSubmit, validators })`** — the headless core. `defaultValues` is the type source of truth (`philosophy.md` "Generics are grim": never `useForm<T>()`, infer from a typed default object). *(basic-concepts.md, quick-start.md, philosophy.md)*
- **`formOptions(opts)`** — extract shared, typed config; spread into `useForm`/`useAppForm`/`withForm`. Returns `TOptions`, fully inferred. *(reference/functions/formOptions.md, basic-concepts.md)*
- **`form.Field` / render-prop** — most explicit, most verbose; "avoid hasty abstractions, render props are great." *(overview\.md, basic-concepts.md)*
- **`field.state`** = `{ value, meta }`; mutate via `field.handleChange(updater)` and `field.handleBlur()`. Always controlled (`philosophy.md` "Controlled is Cool"). *(basic-concepts.md)*

#### Composition (the orbweaver backbone)

- **`createFormHookContexts()`** → `{ fieldContext, formContext, useFieldContext, useFormContext }`. Export `useFieldContext`/`useFormContext` for your bound components. *(form-composition.md, reference/functions/createFormHookContexts.md)*
- **`createFormHook({ fieldContext, formContext, fieldComponents, formComponents })`** → `{ useAppForm, withForm, withFieldGroup, useTypedAppFormContext, extendForm }`. "Define this **once**." *(form-composition.md, quick-start.md)* — directly endorses orbweaver's single-instance hard rule.
- **`form.AppField` / `field.<BoundComponent>`** — field bound to context, type-safe `name`. **`form.AppForm` + `form.<FormComponent>`** — form-context components (e.g. SubscribeButton). *(form-composition.md)*
- **`withForm({ ...formOpts, props, render: function Render({form,...}) })`** — split big forms; `defaultValues` here are **type-only**, not runtime. Use a **named** `render` fn (ESLint hooks). Limit chained `extendForm` to **3–5** (TS perf). *(form-composition.md)*
- **`withFieldGroup({ defaultValues, props, onSubmitMeta?, render: ({group}) })`** — reuse a cluster of fields across forms; consumer passes `fields="path"` or a `{key: deepKey}` map (or `createFieldMap(defaults)` for top-level). **Validators here see `form.state.values` as `unknown`** — "ensure your fields can accept unknown error types." *(form-composition.md, reference/functions/createFieldMap.md)*
- **`extendForm({...})`** — downstream teams add components; duplicate component names are a **type error**. *(form-composition.md, reference/functions/createFormHook.md)*
- **Context-as-last-resort** (`useTypedAppFormContext`) — only when you can't pass `form` (e.g. Router `<Outlet/>`); **not type-checked, runtime-error risk.** *(form-composition.md)*
- **Tree-shaking**: `lazy()` + `Suspense` on field components registered in the hook. *(form-composition.md)*
- **Perf note**: context values are **static class instances with reactive props** (TanStack Store signals), so bound-via-context fields do **not** cause the usual context re-render storm. *(form-composition.md "A note on performance")* — validates orbweaver's bound-component plan.

#### Reactivity

- **`form.Subscribe selector={...}`** — subscribe **inside the UI**; only that component re-renders. *(reactivity.md)*
- **`useStore(form.store, selector)`** — subscribe **in component logic**; re-renders the whole component. **Always pass a selector** (omitting = re-render on any state change). **`useStore` is a deprecated alias for `useSelector`** and takes an optional 3rd `compare(a,b)` arg. *(reactivity.md, basic-concepts.md, reference/variables/useStore.md)*
- **Field meta flags** *(basic-concepts.md)*: `isTouched` (changed or blurred), `isBlurred`, `isDirty` (changed once — **persists even after revert**; opposite `isPristine`), `isDefaultValue` (value === default). Form-level mirrors exist on `FormState`: `isDirty/isPristine/isTouched/isBlurred/isDefaultValue/isValid/canSubmit/isSubmitting/isSubmitted/isSubmitSuccessful/submissionAttempts`. *(reference/interfaces/FormState.md)*
- **Dirty model is a documented choice**: "We have chosen the **persistent** 'dirty' state model. However, we introduced the `isDefaultValue` flag to also support a **non-persistent** dirty state: `const nonPersistentIsDirty = !isDefaultValue`." *(basic-concepts.md "Understanding 'isDirty' in Different Libraries")*

#### Validation

- Field- and form-level `validators: { onChange, onBlur, onSubmit, onMount, onChangeAsync, onBlurAsync, onSubmitAsync, ... }`; truthy return = error. Sync runs first, async only if sync passes (unless `asyncAlways: true`). *(validation.md, philosophy.md)*
- **Debounce**: `asyncDebounceMs` (field default) + per-validator `onChangeAsyncDebounceMs`. *(validation.md)*
- **Form-level → field errors**: form validator returns `{ form?, fields: { 'a': ..., 'socials[0].url': ..., 'details.email': ... } }`; field-specific validators **override** form-set errors for that field. *(validation.md)*
- **Standard Schema** (Zod ≥3.24, Valibot, ArkType, Yup, Effect): pass the schema directly to `validators.onChange`; form-level schema auto-propagates to fields. **Validation uses the schema's INPUT type and does NOT return transformed output** — to get output, `schema.parse(value)` inside `onSubmit`. *(validation.md, submission-handling.md, basic-concepts.md)*
- **`field.parseValueWithSchema(schema)` / `form.parseValuesWithSchema(schema)`** — parse + return issues **without** setting internal errors (mix schema with custom logic). *(reference/classes/FieldApi.md, FormApi.md)*
- **`disableErrorFlat`** — keep `errorMap.onChange/onBlur/onSubmit` separate instead of flattening into `errors[]`. *(custom-errors.md)*
- Standard-Schema form errors arrive as `Record<string, StandardSchemaV1Issue[]>` keyed by field (iterate `.flat().map(i=>i.message)`). *(validation.md)*

#### Dynamic validation (`revalidateLogic` / `onDynamic`)

- `validationLogic: revalidateLogic({ mode, modeAfterSubmission })` + `validators.onDynamic`/`onDynamicAsync`. Default behavior = **validate on submit, then on change after first submit** (RHF-style). `onDynamic` is NOT called unless `revalidateLogic()` is set. *(dynamic-validation.md, reference/functions/revalidateLogic.md)*

#### Custom errors

- Any truthy value is an error: strings, numbers, booleans, objects (`{message,severity,code}`), arrays. `errors[]` is a typed union of all validator returns; `errorMap[source]` is exactly that source's type. *(custom-errors.md)*

#### Listeners (the autosave backbone)

- **Field**: `listeners: { onChange, onBlur, onMount, onSubmit, onUnmount, onChangeDebounceMs, onBlurDebounceMs }`. *(listeners.md, reference/interfaces/FieldListeners.md)*
- **Form-level**: `listeners: { onMount, onChange, onBlur, onSubmit, onChangeDebounceMs, onFieldUnmount, ... }`. `onChange/onBlur` get `{ formApi, fieldApi }` and **propagate to all fields**. Docs' explicit example **is autosave**: `onChange: ({formApi}) => { if (formApi.state.isValid) formApi.handleSubmit() }, onChangeDebounceMs: 500`. *(listeners.md, reference/interfaces/FormListeners.md)*
- **`onFieldUnmount`** is a real `FormListeners` property (reference) but appears in **no guide** — it's the documented-but-unprosed flush hook the autosave factory wants.

#### Arrays

- `<form.Field name="x" mode="array">`; helpers on field/form: `pushValue/insertValue/removeValue/replaceValue/swapValues/moveValue/clearValues` (+ form `pushFieldValue/insertFieldValue/...`), each taking `options?: UpdateMetaOptions`. Subfields by index name `x[${i}].y`. *(arrays.md, reference/classes/FieldApi.md, FormApi.md)*
- `<button type="reset">` must `event.preventDefault()` before `form.reset()` (native reset clobbers `<select>`). *(arrays.md)*

#### Linked fields

- `validators: { onChangeListenTo: ['password'], onChange: ({value, fieldApi}) => ... }` (also `onBlurListenTo`) — re-run a field's validation when a sibling changes. *(linked-fields.md)*

#### Submission handling

- `onSubmitMeta: defaultMeta` + `form.handleSubmit(meta)` → `onSubmit({ value, meta })`. Meta is for routing the submit ("continue"/"backToMenu"), **not** a post-submit hook. *(submission-handling.md, reference/interfaces/FormOptions.md)*
- `form.Subscribe selector={s=>[s.canSubmit,s.isSubmitting]}` to gate the submit button; `canSubmit` stays `true` until touched; `!canSubmit || isPristine` to block pre-interaction. Use `aria-disabled`, not `disabled` (a11y). *(validation.md)*
- `onSubmitInvalid({formApi})` for invalid-submit handling / focus. *(focus-management.md, reference/interfaces/FormOptions.md)*

#### Async initial values

- Official pattern = **TanStack Query + `defaultValues: data?.x ?? ''` + loading spinner on `isLoading`.** That's the whole guide. *(async-initial-values.md)* — see Footgun #4: it does **not** handle refetch/clobber.

#### Focus management

- **Intentionally not built-in** ("TanStack Form does not have insights into your markup", `philosophy.md`). Hand-roll: `onSubmitInvalid` + `querySelector('[aria-invalid="true"]').focus()` (DOM) or a manual ref list (Native). *(focus-management.md)*

#### Devtools / debugging

- `@tanstack/react-devtools` + `@tanstack/react-form-devtools` → `<TanStackDevtools plugins={[formDevtoolsPlugin()]} />`. *(devtools.md, installation.md)*
- Common errors: uncontrolled→controlled (missing `defaultValues`); `field.state.value: unknown` (form type too large → split it); `Type instantiation is excessively deep` (type bug → report; runtime still fine). *(debugging.md)*

#### Reset / re-baseline (core)

- **`form.reset(values?, opts?)`** — "Resets to default values. **If values are provided, resets to those values AND the default values are updated.**" `opts.keepDefaultValues?: boolean`. *(reference/classes/FormApi.md)* — this is the official re-baseline primitive.
- `form.resetField(name)`, `form.resetFieldMeta(...)`, `form.setFieldValue(name, updater, opts?: UpdateMetaOptions)`, `form.update(options?)`. *(reference/classes/FormApi.md)*

### B. The verdict — per area (doc-cited)

| Area | Orbweaver plan | Verdict | Doc basis |
| - | - | - | - |
| Single `createFormHook` instance (`useAppForm`/`withForm`/`withFieldGroup`) | One instance, bound components | ✅ CORRECT | form-composition.md ("define this once"), quick-start.md |
| Form **only** for multi-field entity editors; plain inputs for 1–2-field | — | ✅ CORRECT | overview/philosophy: library is for "wrapping into your own design system"; verbosity is the tradeoff |
| Zod via Standard Schema | `validators.onChange: zodSchema` | ✅ CORRECT | validation.md, basic-concepts.md |
| React Compiler ON | — | ✅ CORRECT (explicit) | comparison.md row "React Compiler support ✅" (RHF = 🛑) |
| Reactivity via `form.Subscribe`/`useStore` selectors | DirtyPill/Save chrome | ✅ CORRECT — but prefer `useSelector` (useStore is a deprecated alias) | reactivity.md, reference/variables/useStore.md |
| Bound field components via `useFieldContext<T>()` | — | ✅ CORRECT; context is loosely typed (`any`), `<T>` is a manual cast seam | form-composition.md, createFormHookContexts.md |
| `listeners` (form `onChange` + `onChangeDebounceMs` + `onFieldUnmount`) as autosave backbone | `createAutosaveEntityForm` | ✅ CORRECT — docs' own autosave example | listeners.md, reference/interfaces/FormListeners.md |
| `revalidateLogic()` + `onDynamic` (validate-on-submit-then-revalidate) | not yet in plan | 🔼 SHOULD-ADOPT for editors | dynamic-validation.md |
| `reset(value)` after submit to re-baseline + clear "Unsaved" | `createSavedEntityForm` | ✅ mechanism CORRECT, but **recipe is yours** (no guide ties reset→submit) | FormApi.reset; submission-handling.md is silent |
| Seed-on-load + `seededRef + !isDirty` reseed guard | `createSavedEntityForm` | ⚠️ FACTORY-ORIGINAL (docs punt) — correct to own it | async-initial-values.md (naive only) |
| Mount-time non-user promotion via `setValue(...,{dontUpdateMeta})` | factories | ⚠️ relies on **undocumented** flag (typed as `UpdateMetaOptions`, shape not in docs) | FieldApi/FormApi setValue signatures only |
| Structural `fieldValuesEqual` (`Object.is` woes) | factories | 🔼 SHOULD-ADOPT lib's `isDefaultValue`/`evaluate` instead of hand-rolling | basic-concepts.md, reference/functions/evaluate.md |
| Zustand-`persist` draft store (version+migrate) | both factories | ⏭️ CORRECTLY-SKIP by lib (no persistence in docs) — fully yours | no doc coverage |
| `reset()` REMOVED from autosave type | `createAutosaveEntityForm` | ✅ CORRECT (reset re-baselines defaults; wrong for a live draft mirror) | FormApi.reset semantics |
| `key`-remount on entity id change | `createSavedEntityForm` | ✅ CORRECT — only clean way to re-seed `defaultValues` (not reactive) | async-initial-values.md (defaultValues seed-once) |
| Focus-first-error | — | ⏭️ CORRECTLY-SKIP (lib has none by design) — hand-roll | focus-management.md, philosophy.md |
| Devtools plugin | — | 🔼 SHOULD-ADOPT (dev only) | devtools.md |
| `withFieldGroup` for shared field clusters (e.g. card sub-sections) | — | 🔼 CONSIDER; note `unknown` error typing caveat | form-composition.md |

### C. THE SIX FOOTGUNS — DOC-PROVIDED vs FACTORY-ORIGINAL

#### #1 — `isDirty` is event-based / persistent, never auto-clears after submit

- **Is the persistence documented as intended?** YES — but in **basic-concepts.md**, not philosophy.md: *"isDirty: is `true` once the field's value is changed, even if it's reverted to the default… We have chosen the **persistent** 'dirty' state model. However, we have introduced the `isDefaultValue` flag to also support a non-persistent 'dirty' state: `const nonPersistentIsDirty = !isDefaultValue`."* `philosophy.md` says nothing about dirty.
- **Is there an official "clear isDirty / re-baseline after submit" recipe?** NO. `submission-handling.md` never mentions `reset`, `isDirty`, or post-submit cleanup. `reactivity.md` doesn't either. **The mechanism exists** — `form.reset(savedValue)` "resets to those values AND the default values are updated" (FormApi.reset) — but **no guide assembles the post-submit recipe.**
- **`isSubmitSuccessful` / post-submit hook?** `FormState.isSubmitSuccessful` and `isSubmitted` exist (reference/interfaces/FormState.md) but **no guide** wires them to re-baseline. There is **no** `onSubmitSuccess` hook; `onSubmitMeta` is unrelated (submit-routing meta only).
- **Verdict: SPLIT.** The re-baseline **primitive** (`reset(value)` updating defaults) is **DOC-PROVIDED**; the *"call it on submit success to clear Unsaved and re-arm the seed guard"* **recipe is FACTORY-ORIGINAL** — orbweaver must own it. **Sharpening:** for the DirtyPill, the *documented* non-persistent signal is **`!isDefaultValue`**, which auto-clears on revert and after `reset(value)` — strictly better than raw `isDirty` for a Save/Discard pill.

#### #2 — `reset(value)` inside `onSubmit` can ignore new defaults (known bug)

- **Doc coverage: NONE.** Not acknowledged anywhere — not submission-handling.md, not FormApi.reset's doc text. The docs present `reset(value)` as if it always updates defaults.
- **Verdict: FACTORY-ORIGINAL.** Entirely yours to work around (e.g. reset **outside/after** the `onSubmit` resolution, or via a post-submit effect keyed on `isSubmitSuccessful`). Confirm your factory does not call `reset(value)` synchronously inside the `onSubmit` body.

#### #3 — Non-user `setFieldValue` marks form dirty; need `dontUpdateMeta`

- **Doc coverage: NONE for the flag.** `dontUpdateMeta` does not appear in any doc. `setValue/setFieldValue` and all array ops accept `options?: UpdateMetaOptions`, but **the shape of `UpdateMetaOptions` is never documented** (no interface page, no prose). `listeners.md` shows `form.setFieldValue('province','')` in a listener and says nothing about the dirty side effect.
- **Verdict: FACTORY-ORIGINAL** (riding an undocumented-but-typed option). Correct shape; just be aware it's an unprosed API — pin the version and add a regression test, since "types are patch-semver, lock your version" (typescript.md) means this could shift silently.

#### #4 — Query × Form seed/clobber (refetch overwrites unsaved typing)

- **Does async-initial-values.md solve it?** NO. The entire guide is: `useQuery` → `defaultValues: data?.x ?? ''` → spinner on `isLoading`. Because `defaultValues` seeds **once at mount and is not reactive**, the naive example doesn't even *reseed* on refetch — and never discusses an `isDirty` guard. The SSR `mergeForm`/`useTransform` path (ssr.md) is a different mechanism (server-action state merge), not background-refetch reconciliation.
- **Verdict: FACTORY-ORIGINAL — confirmed on us.** Your `seededRef + !isDirty` guard (and `key`-remount on id change) is the right shape; the docs punt exactly as the EXAMPLES audit found. **Sharpening:** gate on **`!isDirty`** (persistent) here, *not* `!isDefaultValue` — you want "user has touched anything since seed," which is precisely persistent `isDirty`; `!isDefaultValue` would wrongly allow a reseed after the user types then reverts.

#### #5 — Persisted draft store (Zustand `persist`, version+migrate)

- **Doc coverage: NONE.** No guide covers form persistence, localStorage, drafts, or storage. (The only "persistent" hits are the **dirty-model** discussion — unrelated.) `mergeForm`/`useTransform` is server-state hydration, not client draft survival.
- **Verdict: FACTORY-ORIGINAL — entirely your Zustand layer.** The library is deliberately headless/storage-agnostic. `version`+`migrate` is correct and orbweaver-owned. One doc-anchored tie-in: feed the persisted draft in as the form's seed (over server data), then drive the form from `form.store` — the library imposes nothing here.

#### #6 — `fieldValuesEqual` structural compare (`Object.is` on round-tripped refs reads "changed")

- **Doc coverage of the problem: NONE** (`fieldValuesEqual`/`Object.is` not mentioned). **BUT the library already ships structural-equality machinery:**
  - **`isDefaultValue`** (field + form) = value-equals-default; for arrays/objects this is necessarily a **deep** compare (it's paired with the non-persistent dirty model and would never read `true` otherwise). *(basic-concepts.md, FormState.md)*
  - **`evaluate(objA, objB): boolean`** is an **exported** core deep-equality util. *(reference/functions/evaluate.md)*
  - **`useStore`/`useSelector`** accept a `compare(a,b)` arg for custom slice equality. *(reference/variables/useStore.md)*
- **Verdict: SHOULD-ADOPT lib primitives → potentially DELETE the hand-roll.** Rather than a bespoke `fieldValuesEqual` over round-tripped refs, lean on **`!isDefaultValue`** for the dirty signal (library does the structural compare for you) and/or the exported **`evaluate`** if you need an ad-hoc deep compare. This is the clearest "we hand-roll what the docs now provide natively" finding.

**Footgun summary:**

| # | Behavior | Official pattern? | Verdict |
| - | - | - | - |
| 1 | isDirty persistent, no auto-clear post-submit | persistence documented (basic-concepts); `reset(value)` re-baseline primitive documented; **post-submit recipe absent** | reset = DOC-PROVIDED; recipe = FACTORY-ORIGINAL; use `!isDefaultValue` for the pill |
| 2 | reset(value) inside onSubmit ignores defaults | not acknowledged | FACTORY-ORIGINAL |
| 3 | non-user setValue marks dirty (`dontUpdateMeta`) | flag undocumented; `UpdateMetaOptions` shape unprosed | FACTORY-ORIGINAL (typed but unprosed) |
| 4 | Query×Form seed/clobber | async-initial-values punts | FACTORY-ORIGINAL — confirmed on us |
| 5 | persisted draft store | no coverage | FACTORY-ORIGINAL (Zustand) |
| 6 | structural dirty compare | problem unaddressed, but `isDefaultValue`/`evaluate`/`compare` provided | SHOULD-ADOPT lib primitives; delete hand-roll |

### D. TypeScript best practices (typescript.md + reference + philosophy)

- **Strict mode + version lock**: `strict: true` required; TS ≥5.4. **Type changes ship as patch semver** → *"lock your react-form package version to a specific patch release."* *(typescript.md)* This is squarely aligned with orbweaver's pinned-version rigor — pin the exact patch, and treat type behavior (incl. the undocumented `dontUpdateMeta`) as version-bound, test-guarded.
- **Never pass generics** (`philosophy.md` "Generics are grim"): type `useAppForm` by passing a **typed `defaultValues`** object, not `useForm<Card>()`. For shared shape use `formOptions({ defaultValues: cardDefaults })` (typed via the default object) and spread it — `formOptions` returns `TOptions`, fully inferred.
- **Bound field components**: `const field = useFieldContext<string>()` from your `createFormHookContexts`. The context is typed `FieldApi<any,...>` — **`<TData>` is a manual cast point**, not inferred from the form. Keep these casts honest (orbweaver's one-home discipline: the field component declares its own `TData`).
- **`withFieldGroup` path-relative typing**: the group's `defaultValues` keys define the relative shape; consumer maps via `fields="account_data"`, a `{relKey: deepKey}` map, or `createFieldMap(defaults)` (top-level only — "field mapping is only allowed for objects"). **Group validators see `fieldApi.form.state.values` as `unknown`** — *"ensure your fields can accept unknown error types."* Type group error consumers defensively.
- **Validator typing**: function validators infer `({value, fieldApi})`; return type flows into `errors[]` (union) and `errorMap[source]` (exact). Standard-Schema validators use the schema's **input** type for `value`/`defaultValues` (`z.input<typeof schema>`); transformed output only via `schema.parse` in `onSubmit`.
- **Big-form TS hazards** (debugging.md): `field.state.value: unknown` and `Type instantiation is excessively deep` appear when the form type is too large — **mitigate by splitting** character-card editors via `withForm`/`withFieldGroup` (also good for the one-home/file-size discipline). Cap `extendForm` chains at 3–5.
- **`extendForm`** enforces **unique component names at the type level** (duplicate = compile error) — useful guardrail if any feature extends the base hook.
- **`onSubmitMeta` typing**: declare `onSubmitMeta: defaultMeta` to type `handleSubmit(meta)` and `onSubmit({meta})`; if a `withFieldGroup` declares `onSubmitMeta`, consuming forms must match it.

### E. Adopt-into-factories shortlist (each: doc source + why; ★ = changes/sharpens current plan)

1. **DirtyPill on `!isDefaultValue`, not raw `isDirty`** ★ — *basic-concepts.md*. Library does the structural compare; auto-clears on revert and after `reset(value)`; directly dissolves the visible half of footgun #1 and the whole of footgun #6's hand-roll.
2. **Keep `isDirty` (persistent) strictly for the reseed guard** ★ — *FormState.md / basic-concepts.md*. Footgun #4's `seededRef + !isDirty` wants "touched since seed," which is exactly persistent `isDirty`. Use the two flags for two different jobs — don't unify them.
3. **`form.reset(savedValue)` as the re-baseline primitive on submit-success** — *FormApi.reset*. Bake into `createSavedEntityForm`; it updates `defaultValues`, re-arming the seed guard and clearing `!isDefaultValue`. **But never call it synchronously inside `onSubmit`** (footgun #2) — run it in a post-submit effect keyed on `isSubmitSuccessful`/the resolved promise.
4. **Form-level `listeners.onChange` + `onChangeDebounceMs`** — *listeners.md*. This IS the autosave backbone; docs' own example calls `formApi.handleSubmit()` from it. Bake into `createAutosaveEntityForm`.
5. **`listeners.onFieldUnmount` flush** — *reference/interfaces/FormListeners.md*. Documented-but-unprosed; correct hook for the autosave "flush on unmount." Add a test since no guide exercises it.
6. **`revalidateLogic({mode:'submit', modeAfterSubmission:'change'})` + `onDynamic`** ★ — *dynamic-validation.md*. Editor-friendly UX (don't scream errors before first save; then live-validate). Consider as the default validation seam for both factories. Note `onDynamic` is inert without `revalidateLogic()`.
7. **`schema.parse(value)` in `onSubmit` for Zod transforms** — *submission-handling.md*. Form value is the **input** type; if any card field uses `.transform()`/coercion, parse explicitly before persisting. Bake a typed `parseOnSubmit` step.
8. **`field.parseValueWithSchema` / `form.parseValuesWithSchema`** — *FieldApi.md/FormApi.md*. For "validate with Zod but don't set library errors" (e.g. cross-checking against the persisted draft) without polluting `errorMap`.
9. **`disableErrorFlat` + `errorMap.{onChange,onBlur,onSubmit}`** — *custom-errors.md*. If editors want submit-errors styled differently from live-errors.
10. **`createFieldMap(defaults)`** — *form-composition.md*. If any shared sub-section (e.g. a persona's avatar/name pair) becomes a `withFieldGroup` mounted at top level.
11. **`onSubmitInvalid` + `aria-invalid` focus** — *focus-management.md*. Hand-roll focus-first-error into the Save chrome (library won't).
12. **`formDevtoolsPlugin()`** (dev build only) — *devtools.md*.
13. **Prefer `useSelector` over `useStore`** ★ — *reference/variables/useStore.md*. `useStore` is a deprecated alias; lock to `useSelector` in the bound chrome to avoid a future deprecation churn.
14. **Reset button `event.preventDefault()`** — *arrays.md*. Bake into the Discard control if it's ever a real `<button type="reset">`.

### F. "Are we doing anything WEIRD?" (blunt, doc-backed)

- **Weird-but-justified — riding `dontUpdateMeta` (undocumented).** It's typed (`UpdateMetaOptions`) but appears in **zero** docs. Given "types are patch-semver, lock your version" (typescript.md), this is the most fragile load-bearing assumption in the plan. **Not wrong — but pin the exact patch and add a behavioral test** that mount-time non-user promotion does NOT flip `isDirty`.
- **Likely over-built — a hand-rolled `fieldValuesEqual`.** The library already exposes `isDefaultValue` (structural) + `evaluate` (deep-equal) + `useSelector` `compare`. *(basic-concepts.md, evaluate.md, useStore.md)* If your comparator only ever feeds the dirty signal, **delete it** and use `!isDefaultValue`. This is the clearest "the docs now provide it natively" cut.
- **Possible conflation risk — one `isDirty` doing two jobs.** Docs cleanly separate persistent `isDirty` (event) from `!isDefaultValue` (value). The reseed guard (footgun #4) needs the former; the Save/Discard pill (footgun #1) wants the latter. Using one flag for both is the subtle trap basic-concepts.md is warning about.
- **Not weird — single `createFormHook`, bound components, form-for-editors-only, React Compiler.** All explicitly endorsed (form-composition.md "define this once"; comparison.md React-Compiler ✅; philosophy.md "wrap into your own design system"). No daylight between plan and docs.
- **Not weird — Zustand persistence & key-remount.** Library is deliberately silent on persistence and seeds `defaultValues` once (non-reactive), so a `persist` store + `key`-remount is the *only* sanctioned way to re-seed; you're filling a gap the library intends consumers to fill, not fighting it.
- **Minor — `reset` removed from the autosave type.** Correct and arguably *more* correct than the library, which exposes `reset` on every form; for a live draft mirror, `reset(value)` re-baselining defaults would be a footgun, so type-removing it is a clean guardrail. No doc objection.
- **Watch — calling `reset(value)` inside `onSubmit`.** Footgun #2 is real and undocumented; if any factory does this synchronously it can silently ignore new defaults. Verify the Save factory resets *after* submit resolution.

### G. Open forks for Nate

1. **DirtyPill signal**: switch to **`!isDefaultValue`** (auto-clears, structural, kills the `fieldValuesEqual` hand-roll) — or keep persistent `isDirty` for parity with some "sticky Unsaved until save" UX? Docs support either; they're semantically different. My read: `!isDefaultValue` for the pill, `isDirty` for the reseed guard.
2. **Validation timing**: adopt **`revalidateLogic({mode:'submit', modeAfterSubmission:'change'})` + `onDynamic`** as the editor default (no pre-save error noise), or keep plain `onChange` Zod? Editors usually want the former.
3. **`dontUpdateMeta` risk posture**: since it's undocumented + patch-semver types, do we (a) pin exact patch + add a guard test, (b) wrap it behind our own typed helper so a rename is one-file, or (c) both? Recommend (c).
4. **`useStore` → `useSelector`**: migrate the bound chrome now (it's a deprecated alias) or defer? Cheap to do up front.
5. **`withFieldGroup` for card sub-sections**: worth it for reuse across character/persona editors, but the `unknown`-error typing caveat costs some safety. Adopt only where a cluster genuinely repeats across ≥2 editors.
6. **Post-submit re-baseline placement**: confirm the Save factory calls `reset(savedValue)` in a post-resolution effect (keyed on `isSubmitSuccessful`), not inside `onSubmit` — to dodge footgun #2.
