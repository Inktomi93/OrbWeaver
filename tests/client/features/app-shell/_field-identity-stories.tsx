import { CtIsolation } from "@orb/testkit/browser";
import { Autocomplete } from "@orb/ui/autocomplete";
import { Checkbox } from "@orb/ui/checkbox";
import { ColorField } from "@orb/ui/color-field";
import { Combobox } from "@orb/ui/combobox";
import { Field } from "@orb/ui/field";
import { FileDropzone, FolderPicker } from "@orb/ui/file-dropzone";
import { FileTrigger } from "@orb/ui/file-trigger";
import { Input } from "@orb/ui/input";
import { MacroTextarea } from "@orb/ui/macro-textarea";
import { NumberField } from "@orb/ui/number-field";
import { RadioGroup, RadioGroupItem } from "@orb/ui/radio-group";
import { Select } from "@orb/ui/select";
import { Slider } from "@orb/ui/slider";
import { Switch } from "@orb/ui/switch";
import { Textarea } from "@orb/ui/textarea";
import type { ReactElement } from "react";

const NO_SUGGESTIONS: never[] = [];

/** Every `@orb/ui` form-field primitive mounted bare, with no wrapping Field and no id or name from the caller. */
export function BareFieldPrimitivesStory(): ReactElement {
  return (
    <CtIsolation subject="Form-field primitives" isolates="isolates each field primitive from the Field wrapper so its own id and name are judged">
      <Input aria-label="Plain text" />
      <Textarea aria-label="Long text" />
      <NumberField aria-label="Count" defaultValue={3} />
      <Checkbox aria-label="Agree" />
      <Switch aria-label="Enabled" />
      <RadioGroup aria-label="Choice" defaultValue="a">
        <RadioGroupItem value="a">A</RadioGroupItem>
        <RadioGroupItem value="b">B</RadioGroupItem>
      </RadioGroup>
      <Slider defaultValue={2} max={5} thumbLabels={["Level"]} />
      <Select aria-label="Pick one" defaultValue="a" items={[{ value: "a", label: "A" }]} />
      <Combobox aria-label="Pick many" items={["a", "b"]} />
      <Autocomplete aria-label="Suggest" items={["a", "b"]} />
      <ColorField aria-label="Colour" onValueChange={(): void => undefined} value="#336699" />
      <MacroTextarea aria-label="Macros" onChange={(): void => undefined} suggestions={NO_SUGGESTIONS} value="" />
      <FileDropzone aria-label="Drop files" />
      <FileTrigger onFilesSelected={(): void => undefined}>{(): null => null}</FileTrigger>
      <FolderPicker>Pick a folder</FolderPicker>
    </CtIsolation>
  );
}

/** The same primitives inside a Field, which owns the pair for every control it wraps. */
export function FieldWrappedPrimitivesStory(): ReactElement {
  return (
    <CtIsolation
      subject="Field-wrapped form-field primitives"
      isolates="isolates each field primitive inside a Field so the Field-owned id and name are judged"
    >
      <Field label="Plain text">
        <Input />
      </Field>
      <Field label="Long text">
        <Textarea />
      </Field>
      <Field label="Count">
        <NumberField defaultValue={3} />
      </Field>
      <Field label="Agree">
        <Checkbox />
      </Field>
      <Field label="Enabled">
        <Switch />
      </Field>
      <Field label="Pick one">
        <Select defaultValue="a" items={[{ value: "a", label: "A" }]} />
      </Field>
      <Field label="Pick many">
        <Combobox items={["a", "b"]} />
      </Field>
      <Field label="Suggest">
        <Autocomplete items={["a", "b"]} />
      </Field>
      <Field label="Macros">
        <MacroTextarea onChange={(): void => undefined} suggestions={NO_SUGGESTIONS} value="" />
      </Field>
      <Field label="Drop files">
        <FileDropzone />
      </Field>
    </CtIsolation>
  );
}

/** A form of Field-wrapped controls, each with the caller's own name or none, whose submitted keys the suite reads. */
export function FormKeysStory({ named }: { readonly named: boolean }): ReactElement {
  const caller = (name: string): { readonly name?: string } => (named ? { name } : {});
  return (
    <CtIsolation subject="Submitted form keys" isolates="isolates Field-wrapped controls in one form so FormData shows the names they submit under">
      <form aria-label="Keys">
        <Field label="Email">
          <Input {...caller("email")} />
        </Field>
        <Field label="Agree">
          <Checkbox defaultChecked={true} {...caller("agree")} />
        </Field>
        <Field label="Kind">
          <Select defaultValue="a" items={[{ value: "a", label: "A" }]} {...caller("kind")} />
        </Field>
      </form>
    </CtIsolation>
  );
}
