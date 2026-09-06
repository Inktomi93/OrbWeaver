// components/ front door — client-shared composites over @orb/ui (UI-Arch §2.1: NOT @orb/ui itself —
// ui stays parts-only; these are cross-feature composites with no single feature owner).

export type { BackgroundSourceFieldProps } from "./background-source-field.tsx";
export { BackgroundSourceField } from "./background-source-field.tsx";
export type { BandProps } from "./band.tsx";
export { Band } from "./band.tsx";
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
export type { LibraryListFrameProps, LibraryListLayoutProps, LibraryListRowsProps, LibrarySurfaceShellProps } from "./library-surface.tsx";
export { LibraryListFrame, LibraryListLayout, LibraryListRows, LibrarySurfaceShell } from "./library-surface.tsx";
export type { ListPaneHeaderBack, ListPaneHeaderProps } from "./list-pane-header.tsx";
export { ListPaneHeader } from "./list-pane-header.tsx";
export type { MemberDrillBack, MemberDrillHeaderProps } from "./member-drill-header.tsx";
export { MemberDrillHeader } from "./member-drill-header.tsx";
export {
  CHIP_TOUCH_FLOOR_AT_COARSE,
  CHIP_TOUCH_WIDTH_FLOOR_AT_COARSE,
  CONTEXT_CELL_FLOOR_AT_COARSE,
  CONTEXT_RAIL_WRAP,
  CONTEXT_RAIL_WRAPPED_EDGE_BAR_OFF,
  DISCLOSURE_TOUCH_FLOOR_AT_COARSE,
  FINE_INERT_UNTIL_HOVER,
  HIDE_AT_COARSE,
  LABEL_TO_SR_ONLY_AT_COARSE,
  PICKER_GAP_AT_COARSE,
  PIN_REVEAL,
  REVEAL_AT_COARSE,
  VALUE_ROW_TOUCH_FLOOR_AT_COARSE,
} from "./pointer-variants.ts";
export type { RegexScopeOrderProps } from "./regex-scope-order.tsx";
export { RegexScopeOrder } from "./regex-scope-order.tsx";
export type { RegexScriptPickerProps } from "./regex-script-picker.tsx";
export { RegexScriptPicker } from "./regex-script-picker.tsx";
export type { RelationManagerItem, RelationManagerSectionProps } from "./relation-manager-section.tsx";
export { RelationManagerSection } from "./relation-manager-section.tsx";
export type { RowActionsMenuProps, RowDestructiveAction } from "./row-actions-menu.tsx";
export { RowActionsMenu } from "./row-actions-menu.tsx";
export { ROW_ACTION_INLINE, ROW_ACTION_OVERFLOW, ROW_REVEAL, ROW_REVEAL_SWAP, ROW_REVEAL_SWAP_COARSE_KEEP, SETTING_ROW_REVEAL } from "./row-reveal.ts";
export type { RowToggleActionFillProps, RowToggleActionProps } from "./row-toggle-action.tsx";
export { RowToggleAction } from "./row-toggle-action.tsx";
export type { SettingRowActionsProps } from "./setting-row-actions.tsx";
export { SettingRowActions, SettingRowDevActions, SettingRowResetAction } from "./setting-row-actions.tsx";
export { SettingRowGroup } from "./setting-row-group.tsx";
export { SettingCheckboxRow, SettingSwitchRow } from "./setting-switch-row.tsx";
export type { ConfigTeachScopeValue, SettingRowProps } from "./setting-teach-row.tsx";
export { ConfigTeachScope, SettingRow } from "./setting-teach-row.tsx";
export type { StoredConfigUnreadableNoticeProps } from "./stored-config-unreadable-notice.tsx";
export { StoredConfigUnreadableNotice } from "./stored-config-unreadable-notice.tsx";
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
  trackerActionName,
  trackerFieldName,
} from "./tracker-blocks/index.ts";
export type { TrailingArrowProps } from "./trailing-arrow.tsx";
export { TrailingArrow } from "./trailing-arrow.tsx";
export type { ConfigLeafAddress, ConfigLeafReading, ConfigLeafValue } from "./use-config-leaf.ts";
export { configLeafKey, useConfigLeaf, useConfigLeafReadings } from "./use-config-leaf.ts";
export type { UserMacroEditorDialogProps, UserMacrosFormValues } from "./user-macro-editor-dialog.tsx";
export { UserMacroEditorDialog } from "./user-macro-editor-dialog.tsx";
