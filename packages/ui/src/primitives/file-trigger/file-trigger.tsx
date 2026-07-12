import type { ChangeEvent, ReactElement, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";

export interface FileTriggerRenderProps {
  /** Opens the native OS file picker — call from any element's `onClick` (a button, a row, an
   *  avatar). Does nothing while `disabled`. */
  open: () => void;
}

export interface FileTriggerProps {
  /** Native `accept` filter for the file-picker dialog. */
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  /** Fires with the picked batch. Empty array on a picker cancel (native `change` still fires with
   *  `files.length === 0` in that case) — callers that only care about a real pick should check
   *  `files.length > 0` themselves; this primitive reports every change verbatim. */
  onFilesSelected: (files: File[]) => void;
  /** The caller's own trigger UI — a `<Button onClick={open}>`, a row, an avatar, anything. */
  children: (props: FileTriggerRenderProps) => ReactNode;
}

/**
 * FileTrigger — the headless counterpart to `@orb/ui/file-dropzone`: a REAL `<input type="file">`
 * (visually hidden, not `display:none` — a hidden-but-present input stays in the accessibility tree
 * and keeps native picker-cancel/`change` semantics; `display:none` inputs are inconsistently
 * operable across browsers) driven by a render-prop `open()` the caller wires to ITS OWN trigger
 * element (a `Button`, an `Avatar`, a `ListRow` — whatever the surface's affordance is).
 *
 * `FileDropzone` OWNS a visible drop box as its trigger; this primitive owns NO visual chrome at
 * all — for the "click an avatar to replace it" / "a menu action opens the picker" shape where the
 * trigger is some other primitive's own control, not a dedicated box. Extracted from the pattern
 * three features hand-rolled as a raw hidden `<input>` (`no-raw-interactive-intrinsics` BURN_DOWN:
 * persona avatar, character portrait, persona-settings backup restore) — one of those three shipped
 * broken (`type="file"` omitted, D1 in the rollup audit) precisely because the wiring wasn't sealed.
 *
 * Usage:
 * ```tsx
 * <FileTrigger accept="image/*" onFilesSelected={([file]) => file && upload(file)}>
 *   {({ open }) => <Button onClick={open}>Replace portrait</Button>}
 * </FileTrigger>
 * ```
 */
export function FileTrigger({
  accept,
  multiple = false,
  disabled = false,
  onFilesSelected,
  children,
}: FileTriggerProps): ReactElement {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();
  // An open-request nonce. `open()` (which we hand to the caller's `children` render-prop) must NOT
  // read `inputRef.current` itself — a ref-reading closure escaping into render output trips
  // `react-hooks/refs`. Instead it bumps this counter, and the effect below does the actual
  // imperative `.click()` off-render. A monotonic nonce (not a boolean) so back-to-back opens
  // without an intervening change still re-fire.
  const [openRequest, setOpenRequest] = useState(0);

  const open = (): void => {
    if (disabled) {
      return;
    }
    setOpenRequest((n) => n + 1);
  };

  useEffect(() => {
    if (openRequest > 0) {
      inputRef.current?.click();
    }
  }, [openRequest]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onFilesSelected(Array.from(event.target.files ?? []));
    // Reset so picking the SAME file twice in a row still fires `change` (the native input
    // otherwise treats an identical selection as a no-op).
    event.target.value = "";
  };

  return (
    <>
      <input
        ref={inputRef}
        accept={accept}
        className="sr-only"
        data-slot="file-trigger-input"
        disabled={disabled}
        id={inputId}
        multiple={multiple}
        onChange={handleChange}
        tabIndex={-1}
        type="file"
      />
      {children({ open })}
    </>
  );
}
