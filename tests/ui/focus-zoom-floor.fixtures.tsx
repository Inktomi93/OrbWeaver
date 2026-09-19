// CT fixtures for the iOS FOCUS-ZOOM CENSUS (#2450). Playwright CT serializes mount props, so every
// controlled loop (CodeEditor's value/onChange, MacroTextarea's, ColorField's) lives HERE and the suite
// mounts one prop-free element.
//
// ONE STORY, EVERY TEXT-ENTRY PRIMITIVE: the census is a page-level sweep, not a per-component assertion,
// because the defect is "some control somewhere is under 16px" and a per-component list is exactly the
// thing that goes stale when a new primitive lands. Anything rendering an `input`, `textarea`, `select` or
// `[contenteditable=true]` that a finger can focus belongs in this tree.
import { Autocomplete } from "@orb/ui/autocomplete";
import { CodeEditor } from "@orb/ui/code-editor";
import { ColorField } from "@orb/ui/color-field";
import { Combobox } from "@orb/ui/combobox";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { Input } from "@orb/ui/input";
import { MacroTextarea } from "@orb/ui/macro-textarea";
import { NumberField } from "@orb/ui/number-field";
import { Select } from "@orb/ui/select";
import { Textarea } from "@orb/ui/textarea";
import type { ReactElement } from "react";
import { useState } from "react";

const SELECT_ITEMS = [
  { label: "Alpha", value: "alpha" },
  { label: "Beta", value: "beta" },
];
const TAGS = ["Adventure", "Mystery"] as const;
const MACROS = [{ name: "user", detail: "the reader's persona" }] as const;

/** The planted POSITIVE CONTROL: a text input the census MUST catch. It carries its own marker so the
 *  real assertion can subtract it — a fence that cannot be proven to fire is not a fence. */
export function UnderFloorControl(): ReactElement {
  return <input aria-label="planted under-floor control" data-focus-zoom-control="planted" style={{ fontSize: "15px" }} />;
}

function ControlledCodeEditor(): ReactElement {
  const [value, setValue] = useState("body { color: red; }");
  return <CodeEditor ariaLabel="census css editor" lang="css" onChange={setValue} value={value} />;
}

function ControlledMacroTextarea(): ReactElement {
  const [value, setValue] = useState("Hello {{user}}");
  return <MacroTextarea aria-label="census macro textarea" onChange={setValue} suggestions={MACROS} value={value} />;
}

function ControlledColorField(): ReactElement {
  const [value, setValue] = useState("#336699");
  return <ColorField aria-label="census color field" onValueChange={setValue} value={value} />;
}

/**
 * Every text-entry primitive `@orb/ui` seals, mounted at once. `Autocomplete` runs its INLINE arm so its
 * field and its rows are both in the tree with no open animation to settle; `Combobox` and `ColorField`
 * are closed here and the suite opens them in its own case, because a popup's contents mount on demand.
 */
export function TextEntryCensus(): ReactElement {
  return (
    <div style={{ display: "grid", gap: 8, width: 420 }}>
      <Input aria-label="census input" />
      <Input aria-label="census input inline" layout="inline" />
      <Textarea aria-label="census textarea" />
      <ControlledMacroTextarea />
      <NumberField aria-label="census number field" defaultValue={5} />
      <Combobox aria-label="census combobox" items={TAGS} />
      <Autocomplete aria-label="census autocomplete" inline={true} items={TAGS} mode="none" open={true} />
      <Select aria-label="census select" items={SELECT_ITEMS} name="censusSelect" placeholder="Pick one" />
      <ControlledColorField />
      <FileDropzone accept="image/*" aria-label="census dropzone" />
      <ControlledCodeEditor />
    </div>
  );
}
