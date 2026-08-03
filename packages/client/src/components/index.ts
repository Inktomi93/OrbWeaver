// components/ front door — client-shared composites over @orb/ui (UI-Arch §2.1: NOT @orb/ui itself —
// ui stays parts-only; these are cross-feature composites with no single feature owner).

export type { BackgroundSourceFieldProps } from "./background-source-field.tsx";
export { BackgroundSourceField } from "./background-source-field.tsx";
export type { CharacterPickerProps } from "./character-picker.tsx";
export { CharacterPicker } from "./character-picker.tsx";
export type { ConfirmDialogProps } from "./confirm-dialog.tsx";
export { ConfirmDialog } from "./confirm-dialog.tsx";
export type { EntryListEditorProps } from "./entry-list-editor.tsx";
export { EntryListEditor } from "./entry-list-editor.tsx";
export type { FaceStripItem, FaceStripProps } from "./face-strip.tsx";
export { FaceStrip } from "./face-strip.tsx";
export type { FormDialogProps, FormDialogSubmit, FormSubmitButtonProps } from "./form-dialog.tsx";
export { FormDialog, FormSubmitButton } from "./form-dialog.tsx";
export type { GreetingStudioProps } from "./greeting-studio.tsx";
export { GreetingStudio } from "./greeting-studio.tsx";
export type { LibraryRowActions, LibraryRowProps } from "./library-row.tsx";
export { LibraryRow } from "./library-row.tsx";
export type { LibraryListLayoutProps, LibrarySurfaceShellProps } from "./library-surface.tsx";
export { LibraryListLayout, LibrarySurfaceShell } from "./library-surface.tsx";
export type { ListPaneHeaderBack, ListPaneHeaderProps } from "./list-pane-header.tsx";
export { ListPaneHeader } from "./list-pane-header.tsx";
export type { RegexScopeOrderProps } from "./regex-scope-order.tsx";
export { RegexScopeOrder } from "./regex-scope-order.tsx";
export type { RegexScriptPickerProps } from "./regex-script-picker.tsx";
export { RegexScriptPicker } from "./regex-script-picker.tsx";
export type { RelationManagerItem, RelationManagerSectionProps } from "./relation-manager-section.tsx";
export { RelationManagerSection } from "./relation-manager-section.tsx";
export type { RowActionsMenuProps, RowDestructiveAction } from "./row-actions-menu.tsx";
export { RowActionsMenu } from "./row-actions-menu.tsx";
export { ROW_REVEAL, ROW_REVEAL_SWAP } from "./row-reveal.ts";
export type { RowToggleActionFillProps, RowToggleActionProps } from "./row-toggle-action.tsx";
export { RowToggleAction } from "./row-toggle-action.tsx";
export { SettingCheckboxRow, SettingSwitchRow } from "./setting-switch-row.tsx";
export type { TagPickerDialogProps } from "./tag-picker-dialog.tsx";
export { TagPickerDialog } from "./tag-picker-dialog.tsx";
export type {
  AddRowAction,
  AddRowProps,
  AmbientStripProps,
  BeatLineProps,
  CastCardProps,
  CastField,
  GoalLineProps,
  HintEditorProps,
  MeterRowProps,
  StatCellProps,
  TrackerChipProps,
  TrackerValueProps,
} from "./tracker-blocks/index.ts";
export {
  AddRow,
  AmbientStrip,
  BeatLine,
  CastCard,
  GoalLine,
  HintEditor,
  MeterRow,
  RelationshipBadge,
  StatCell,
  TrackerChip,
  TrackerValue,
} from "./tracker-blocks/index.ts";
export type { UserMacroEditorDialogProps, UserMacrosFormValues } from "./user-macro-editor-dialog.tsx";
export { UserMacroEditorDialog } from "./user-macro-editor-dialog.tsx";
