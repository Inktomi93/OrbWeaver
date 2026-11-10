export type PluginKeyValueNode = PluginOneSource<{ readonly rows?: string[]; readonly rowsFrom?: string }, (typeof PLUGIN_SOURCE_KEYS.keyValue)[number]>;
type PluginKeyValueNode = PluginOneSource<{ readonly rows?: string[]; readonly rowsFrom?: string }, "rows" | "rowsFrom">;
