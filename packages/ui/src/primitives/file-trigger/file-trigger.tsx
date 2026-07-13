import type { ChangeEvent, ReactElement, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";

export interface FileTriggerRenderProps {
  /** Opens the native OS file picker. Does nothing while `disabled`. */
  open: () => void;
}

export interface FileTriggerProps {
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  /** Fires with the picked batch; empty array on a picker cancel. */
  onFilesSelected: (files: File[]) => void;
  /** The caller's own trigger UI — a `<Button onClick={open}>`, a row, an avatar, anything. */
  children: (props: FileTriggerRenderProps) => ReactNode;
}

/**
 * Headless counterpart to `@orb/ui/file-dropzone`: a real (visually-hidden, not `display:none`)
 * `<input type="file">` driven by a render-prop `open()` the caller wires to its own trigger element.
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
  // A monotonic nonce (not a boolean) so back-to-back opens without an intervening change still re-fire.
  // `open()` bumps it instead of reading `inputRef.current` itself (would trip react-hooks/refs).
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
    // Reset so picking the same file twice in a row still fires `change`.
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
