// The submit a committing dialog draws in its footer. It lives below `state/` because a registry modal declares one on its
// definition, and the definitions home in `state/`, which may not import `components/`.

import type { NonEmptyLabel } from "./non-empty-label.ts";
import type { TestIdKey } from "./test-ids.ts";

export interface DialogSubmit<L extends string = string> {
  /** The submit button's label (e.g. "Apply" / "Create" / "Save"). */
  readonly label: NonEmptyLabel<L>;
  /** Fires on the button and on Enter; the caller closes the dialog itself. Never fires while `disabled` or `loading`. */
  readonly onSubmit: () => void;
  /** Disables the submit button (e.g. an empty required field or a pending mutation). @defaultValue false */
  readonly disabled?: boolean;
  /** Shows the submit button's busy state. @defaultValue false */
  readonly loading?: boolean;
  /** A registered test-id key for the submit button. */
  readonly testKey?: TestIdKey;
}
