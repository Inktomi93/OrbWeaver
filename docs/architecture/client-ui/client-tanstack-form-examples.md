# TanStack Form — React Examples Digest (for orbweaver client foundation)

Source: shallow clone of `github.com/TanStack/form`, `examples/react/*` (read in full, June 2026).
**Uniform stack across all 12:** `@tanstack/react-form ^1.33.0`, `react`/`react-dom` `19.1.0`, devtools
`@tanstack/react-devtools ^0.9.7` + `@tanstack/react-form-devtools ^0.2.29`, Vite 7, `@vitejs/plugin-react ^5.1.1`.
Per-example deps noted only where they differ.

> **Two naming gotchas up front (the prompt's dir list vs. reality):**
> - The dir **`dynamic`** does NOT demo linked/dependent fields. It demos `revalidateLogic()` + `validators.onDynamic` + a Zod schema. **No example anywhere uses `onChangeListenTo`/linked fields.**
> - The dir **`standard-schema`** is the multi-validator (Zod/Valibot/ArkType/Effect) showcase.
> - Net: of the orbweaver "SIX footguns", **zero are demonstrated as fixes** by any example, and several aren't touched at all (see final section). The examples are happy-path API tours, not draft-survival editors.

---

## 1. `composition`
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

---

## 2. `query-integration`
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

---

## 3. `compiler`
**Purpose:** Prove TanStack Form runs under the React Compiler. **This is the example that answers our "is it Compiler-clean?" question.**
**Deps:** + `babel-plugin-react-compiler 19.1.0-rc.3`, `eslint-plugin-react-compiler 19.1.0-rc.2`. Has its own `vite.config.ts`.

**API / patterns:** Source (`src/index.tsx`) is **byte-for-byte the `simple` example** — plain `useForm`, `form.Field`, `form.Subscribe`, `FieldInfo`. The only delta vs `simple` is the build config.
- `vite.config.ts`: `react({ babel: { plugins: [['babel-plugin-react-compiler', {}]] } })` — compiler ON, empty config.
- `package.json` quirk: `_test:types` (underscore-prefixed = the `tsc` typecheck is intentionally disabled for this example).

**Non-obvious mechanics:** **There is NO `'use no memo'` directive anywhere** — not in the form code, not in the field render-props. The form code passes through the compiler unmodified. This is the confirmation: **TanStack Form (render-prop + external-store architecture) is React-Compiler-clean; no opt-out pragma required.**

**Orbweaver mapping:** Direct green light for our "React Compiler ON, no hand `useMemo`/`useCallback`" constraint. **ADOPT** the Vite compiler config shape. **CONFIRMS** we don't need `use no memo` escape hatches in the bound-field set or factories. (Caveat: it's the trivial 2-field form; it proves the core primitives compile clean, not every exotic pattern — but the architecture, not the field count, is what the compiler cares about.)

---

## 4. `array`
**Purpose:** Field arrays — add/render/remove repeated sub-objects.
**Deps:** baseline.

**API / patterns (`src/index.tsx`):**
- `<form.Field name="people" mode="array">` — `mode="array"` is the array flag.
- Inside render-prop: `field.state.value.map((_, i) => <form.Field key={i} name={`people[${i}].name`}>…)` — nested fields use bracket+dot path strings.
- `field.pushValue({ name:'', age:0 })` — append. (Only `pushValue` is shown; `removeValue`/`insertValue`/`replaceValue` exist on the same field API but aren't demoed here.)
- `form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}`.

**Non-obvious mechanics:** array iteration is over `field.state.value` (the live array); subfields are addressed by interpolated path strings, and the parent stays `mode="array"`. `key={i}` (index) is used — fine for append-only, but a stable id key matters if rows can be reordered/removed (relevant to our card editors with reorderable lists).

**Orbweaver mapping:** Feeds bound-field composition for any repeatable section (e.g. character card alternate greetings, example-message blocks, lorebook entries). **ADOPT** `mode="array"` + `pushValue`/`removeValue`/`insertValue` for list editors. **WATCH** footgun #6: array values are fresh object refs each render → an `Object.is` baseline compare will always read "dirty"; our `fieldValuesEqual` must be structural. **SKIP** `key={i}` for reorderable lists — key on a stable row id.

---

## 5. `dynamic`  *(actually: revalidate-logic + onDynamic)*
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

---

## 6. `standard-schema`
**Purpose:** Standard-Schema validation across Zod, Valibot, ArkType, and Effect — interchangeable in the same validator slot.
**Deps:** + `zod ^3.25.76`, `valibot ^1.1.0`, `arktype ^2.1.22`, `effect ^3.17.14`.

**API / patterns (`src/index.tsx`):**
- Four schemas defined; all four are valid drop-ins for `validators: { onChange: <schema> }` (3 commented out).
- Zod: `z.object({...})`; Valibot: `v.object({ firstName: v.pipe(v.string(), v.minLength(3,…), v.startsWith('A',…)) })`; ArkType: `type({ firstName: 'string >= 3' })`; **Effect needs an explicit adapter: `S.standardSchemaV1(S.Struct({...}))`** (the others are natively Standard-Schema).
- `FieldInfo` here maps `field.state.meta.errors` as **objects** (`errors.map((err) => <em key={err.message}>{err.message}</em>)`) — schema validators emit `{ message }` error objects, not bare strings.

**Non-obvious mechanics:** The string-returning function validators (composition/simple) put **strings** in `meta.errors`; schema validators put **objects** with `.message`. Bound-field error rendering must handle both shapes (or we standardize on one). Effect is the only one needing `standardSchemaV1()`.

**Orbweaver mapping:** Confirms the **Zod-via-Standard-Schema seam** works by just passing the schema object. **ADOPT** Zod directly into validator slots; standardize bound-field error rendering on the **object `{ message }`** shape (since we're Zod-on-Standard-Schema, errors are objects). **SKIP** Valibot/ArkType/Effect. Reinforces footgun-free validation wiring — but says nothing about dirty/seed.

---

## 7. `field-errors-from-form-validators`
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

---

## 8. `large-form`
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

---

## 9. `ui-libraries`
**Purpose:** Bind `form.Field` to third-party inputs (Mantine `TextInput`/`Checkbox`, MUI `TextField`/`Checkbox`).
**Deps:** + `@mantine/core 7.17.8`, `@mui/material 6.5.0`, `@emotion/*`, postcss-mantine toolchain, `@vitejs/plugin-react-swc`.

**API / patterns (`src/MainComponent.tsx`):**
- Plain `useForm`, `form.Field children={({ state, handleChange, handleBlur }) => …}` — **destructures the field API directly in the render-prop param**.
- Text: `<TextInput defaultValue={state.value} onChange={(e)=>handleChange(e.target.value)} onBlur={handleBlur} />`.
- Checkbox: `<Checkbox checked={state.value} onChange={(e)=>handleChange(e.target.checked)} onBlur={handleBlur} />` — boolean via `e.target.checked`.
- Works identically for Mantine and MUI controls.

**Non-obvious mechanics / a trap:** the text inputs use **`defaultValue={state.value}` (uncontrolled)**, not `value=`. That means **`form.reset(value)` and external reseeds will NOT update these inputs** after mount — the React tree won't reflect a programmatic value change. For our draft-survival/reseed editors this is a **bug**; bound text/select fields must be **controlled (`value=`)**, not `defaultValue=`. Checkboxes here ARE controlled (`checked=`).

**Orbweaver mapping:** Feeds the **bound-field set** (how Text/Select/Switch wrap a UI lib). **ADOPT** the `handleChange(e.target.checked)` boolean wiring for our Switch and the destructure-in-render-prop ergonomics. **SKIP / INVERT** the `defaultValue=` text binding — use **controlled `value=`** so reset/reseed propagates (this directly protects footguns #1/#4 where we `reset(value)` and expect the UI to follow). Our bound fields are controlled, period.

---

## 10. `devtools`
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

---

## 11. `multi-step-wizard`
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

---

## 12. `simple`
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

---

# Master pattern / feature list (deduped across all 12)

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
- `form.Field name mode="array"` + iterate `field.state.value` + nested `form.Field name={`people[${i}].name`}`. *(array)*
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

---

# Adopt-into-orbweaver shortlist

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

---

## The SIX footguns — example coverage verdict

| # | Footgun | Any example demonstrate a FIX? | Notes |
|---|---------|-------------------------------|-------|
| 1 | `isDirty` event-based, never auto-clears post-submit → must `reset(value)` | **NO.** No example reads `isDirty` at all. `query-integration` calls bare `formApi.reset()` (no value) — resets to *mount* defaults, doesn't re-baseline to saved value, and doesn't touch the seed-guard interaction. | Factory must own entirely. |
| 2 | `form.reset(value)` INSIDE `onSubmit` can ignore new defaults (known bug) | **NO — not even exercised.** `query-integration` is the only `reset`-in-`onSubmit`, and it passes **no value**, so it sidesteps (doesn't expose or fix) the value-arg bug. | Factory must reset-with-value carefully (or reset outside onSubmit / via key-remount); no reference fix exists. |
| 3 | Bound fields writing non-user values mark dirty → need `setValue(...,{dontUpdateMeta:true})` | **NO.** No example uses `setFieldValue`/`setValue` with `dontUpdateMeta`, nor any mount-time programmatic promotion. | Entirely uncovered; factory owns mount-time writes. |
| 4 | Query×Form seed/clobber → `seededRef + !isDirty` guard | **NO.** `query-integration` avoids clobber only by never re-syncing query→form after mount (gated by `isLoading`). It neither reseeds on refetch nor guards typing. | The exact gap our seed seam fills; example is the anti-pattern. |
| 5 | Zustand-`persist` draft store mirror (version+migrate) | **NO.** No example persists drafts or uses any external store beyond the form itself. | Entirely orbweaver-original; `createAutosaveEntityForm` owns it. |
| 6 | `fieldValuesEqual` structural compare (Object.is on round-tripped refs reads "changed") | **NO.** `array` produces fresh object/array refs each render but the example never compares baselines (no dirty logic at all), so the trap is latent and unaddressed. | Factory needs a structural compare for baseline/dirty. |

**Bottom line:** all six footguns are **factory-owned**. The examples are a clean API tour (composition, validation, arrays, schema, form-groups, perf, UI binding, devtools, compiler) but contain **zero** draft-survival, dirty-tracking, reseed-guarding, autosave, or persistence machinery. They give us the *primitives* (`formOptions`, `withFieldGroup`, `useStore`, `revalidateLogic`, controlled binding, server-error mapping) but none of the *lifecycle* our two factories exist to bake.

## What the examples confirm vs. don't cover
- **CONFIRMED — React-Compiler-clean:** the `compiler` example runs the form (identical to `simple`) under `babel-plugin-react-compiler` with **no `'use no memo'` directive anywhere**. The render-prop/external-store architecture compiles clean; we don't need opt-out pragmas. (Proven on the core primitives, not every exotic combo — but the compiler reacts to architecture, not field count.)
- **CONFIRMED — composition/perf/validation/server-errors** are all first-class and match our intended design (`createFormHook` single instance, `formOptions`, `withForm`/`withFieldGroup`, `useStore` selectors, Standard-Schema Zod, `{ fields }` error mapping).
- **NOT COVERED — `query-integration` punts** on seed/clobber + dirty-reset: it seeds `defaultValues` once at mount behind an `isLoading` gate and calls bare `formApi.reset()` post-submit. No live query→form sync, no `seededRef`/`!isDirty` guard, no `key`-remount, no re-baseline. Edit-during-background-refetch and "reset to freshly-saved value" are both unsolved.
- **NOT COVERED at all:** `isDirty`/dirty-tracking, `listeners` (`onChange`/`onBlur`/`onMount`/`onSubmit` + `onChangeDebounceMs`) — **no example uses listeners**, which is the backbone of `createAutosaveEntityForm`'s debounced draft mirror + `onFieldUnmount` flush; linked/dependent fields (`onChangeListenTo`); `setFieldValue`/`setFieldMeta`/`dontUpdateMeta`; Zustand persist; structural value compare. These are all factory-original.
