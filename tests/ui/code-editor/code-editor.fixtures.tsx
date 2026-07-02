// CT fixtures for the CodeEditor seal. Playwright CT serializes mount props, so the controlled
// state loop (value ↔ onChange) lives HERE; the tests pass only strings.
import { CodeEditor } from "@orb/ui/code-editor";
import type { ReactElement } from "react";
import { useState } from "react";

interface ControlledEditorProps {
  readonly initialValue: string;
}

/** Controlled editor whose live value is mirrored into an `<output>` (role=status) for asserts. */
export function ControlledEditor({ initialValue }: ControlledEditorProps): ReactElement {
  const [value, setValue] = useState(initialValue);
  return (
    <div>
      <CodeEditor lang="css" value={value} onChange={setValue} ariaLabel="fixture css editor" />
      <output>{value}</output>
    </div>
  );
}

interface ReadOnlyEditorProps {
  readonly value: string;
}

export function ReadOnlyEditor({ value }: ReadOnlyEditorProps): ReactElement {
  return (
    <CodeEditor lang="css" value={value} readOnly={true} ariaLabel="fixture readonly editor" />
  );
}
