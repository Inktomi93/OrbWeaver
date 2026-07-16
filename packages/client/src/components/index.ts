// components/ front door — client-shared composites over @orb/ui (UI-Arch §2.1: NOT @orb/ui itself —
// ui stays parts-only; these are cross-feature composites with no single feature owner).

export type { CharacterPickerProps } from "./character-picker";
export { CharacterPicker } from "./character-picker";
export type { ConfirmDialogProps } from "./confirm-dialog";
export { ConfirmDialog } from "./confirm-dialog";
export type { EntryListEditorProps } from "./entry-list-editor";
export { EntryListEditor } from "./entry-list-editor";
export type { FormDialogProps, FormDialogSubmit, FormSubmitButtonProps } from "./form-dialog";
export { FormDialog, FormSubmitButton } from "./form-dialog";
export type { LibraryRowActions, LibraryRowProps } from "./library-row";
export { LibraryRow } from "./library-row";
export type { LibraryListLayoutProps, LibrarySurfaceShellProps } from "./library-surface";
export { LibraryListLayout, LibrarySurfaceShell } from "./library-surface";
export type { RegexEditorDialogProps, RegexScriptsFormValues } from "./regex-editor-dialog";
export { RegexEditorDialog } from "./regex-editor-dialog";
export type { RelationManagerItem, RelationManagerSectionProps } from "./relation-manager-section";
export { RelationManagerSection } from "./relation-manager-section";
export type { RowActionsMenuProps, RowDestructiveAction } from "./row-actions-menu";
export { RowActionsMenu } from "./row-actions-menu";
export { ROW_REVEAL } from "./row-reveal";
export { SettingCheckboxRow, SettingSwitchRow } from "./setting-switch-row";
export type { TagPickerDialogProps } from "./tag-picker-dialog";
export { TagPickerDialog } from "./tag-picker-dialog";
