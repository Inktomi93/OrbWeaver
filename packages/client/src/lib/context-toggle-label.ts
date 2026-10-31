/** The detail-panel toggle's one name at every width, keyed on whether the pane is collapsed. */
export function contextToggleLabel(collapsed: boolean): string {
  return collapsed ? "Show details" : "Hide details";
}
