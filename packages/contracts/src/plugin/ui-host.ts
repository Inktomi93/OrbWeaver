// Scripted UI relay arguments exclude room identity; the mount supplies membership-checked scope.
// Strip mode: these schemas also read plugin guest data, which can carry keys this release does not declare.
import { z } from "zod";
import { GLOBAL_VARIABLE_VALUE_MAX_BYTES, globalVariableKeySchema } from "../automation/index.ts";
import type { UiProxyableHostFunction } from "./host-v1.ts";
import { PLUGIN_KV_KEY_MAX_CHARS, PLUGIN_KV_VALUE_MAX_BYTES } from "./host-v1.ts";
import { byteBoundedString } from "./ui.ts";

/** The `data.reason` of every refusal `plugin.uiHostCall` answers as the caller's own mistake, one per way a call
 *  can be wrong. A plugin surface keys on these, never on the message text. */
export const PLUGIN_UI_HOST_CALL_CODES = {
  notEnabled: "plugin_ui_not_enabled",
  notProxyable: "plugin_ui_not_proxyable",
  notGranted: "plugin_ui_not_granted",
  argsNotJson: "plugin_ui_args_not_json",
  argsInvalid: "plugin_ui_args_invalid",
  scopeRequired: "plugin_ui_scope_required",
  resultTooLarge: "plugin_ui_result_too_large",
  storageCap: "plugin_storage_cap",
} as const;
export type PluginUiHostCallCode = (typeof PLUGIN_UI_HOST_CALL_CODES)[keyof typeof PLUGIN_UI_HOST_CALL_CODES];

/** The bounded transcript page accepted by the scripted UI relay. */
export const PLUGIN_UI_CHAT_MESSAGES_LIMIT_MAX = 50;
// Each schema is at least as strict as the column it reaches, so a refusal is the relay's coded answer and never the
// table's CHECK error: `storage.kv` keys and values read the plugin table's caps, variables read the global plane's.
const kvKey = z.string().min(1).max(PLUGIN_KV_KEY_MAX_CHARS);
const kvValue = byteBoundedString(PLUGIN_KV_VALUE_MAX_BYTES);
const variableValue = byteBoundedString(GLOBAL_VARIABLE_VALUE_MAX_BYTES);
const noArgs = z.tuple([]);
const oneKey = z.tuple([kvKey]);
const oneVariable = z.tuple([globalVariableKeySchema]);

/** Positional arguments parsed by the authoritative UI relay before calling its installer-scoped bridge. */
export const pluginUiHostArgsSchemas = {
  "chat.listMessages": z.tuple([
    z
      .object({ limit: z.int().positive().max(PLUGIN_UI_CHAT_MESSAGES_LIMIT_MAX).optional() })
      .strip()
      .optional(),
  ]),
  "chat.getVariables": noArgs,
  "variables.get": oneVariable,
  "variables.set": z.tuple([globalVariableKeySchema, variableValue]),
  "variables.delete": oneVariable,
  "storage.get": oneKey,
  "storage.set": z.tuple([kvKey, kvValue]),
  "storage.compareAndSet": z.tuple([kvKey, kvValue.nullable(), kvValue]),
  "storage.delete": oneKey,
  "storage.list": z.tuple([z.string().max(PLUGIN_KV_KEY_MAX_CHARS).optional()]),
} satisfies Record<UiProxyableHostFunction, z.ZodType>;
