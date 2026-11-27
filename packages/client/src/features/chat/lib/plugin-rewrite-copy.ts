// The line under a row whose shown text a viewer's own plugin changed. Zero runtime imports, so a spec reads it without the component graph.

const NAME_LIST = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

/** Names each plugin that changed what this row shows; the stored message is untouched. */
export function pluginRewriteLine(pluginNames: readonly string[]): string {
  return `Shown changed by ${NAME_LIST.format(pluginNames)}.`;
}
