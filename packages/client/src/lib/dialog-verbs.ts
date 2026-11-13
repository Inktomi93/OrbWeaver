// The verbs the dialogs print on their exits and commits. A zero-import leaf, so a spec's node side reads them without
// loading the component graph. Not a `*-names` module: these words name no one control, so the test-label index must not
// claim them for every spec that locates a Cancel.

export const DIALOG_VERBS = {
  accept: "Accept",
  apply: "Apply",
  cancel: "Cancel",
  close: "Close",
  create: "Create",
  discard: "Discard",
  done: "Done",
  remove: "Remove",
  restore: "Restore",
  retry: "Retry",
  save: "Save",
} as const;

/** What a dialog's commit says while its write is in flight. */
export const DIALOG_PENDING_VERBS = {
  creating: "Creating…",
  saving: "Saving…",
} as const;
