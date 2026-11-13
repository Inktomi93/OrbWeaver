// Scripted UI relay arguments exclude room identity; the mount supplies membership-checked scope.
// Strip mode: these schemas also read plugin guest data, which can carry keys this release does not declare.
import { z } from "zod";
import { GLOBAL_VARIABLE_VALUE_MAX_BYTES, globalVariableKeySchema, withoutNul } from "../automation/index.ts";
import type { UiProxyableHostFunction } from "./host-v1.ts";
import { PLUGIN_KV_KEY_MAX_CHARS, PLUGIN_KV_VALUE_MAX_BYTES } from "./host-v1.ts";
import { byteBoundedString } from "./ui.ts";

/** The `data.reason` of every refusal `plugin.uiHostCall` answers as the caller's own mistake, one per way a call
 *  can be wrong. This is also the closed allowlist of codes a scripted surface's guest receives: its rejected
 *  host call carries the code as `code`, and plugin code keys on it, never on the message text. Each code names a
 *  fact about the plugin's own call, row or storage, which its installer can already see. An isolated frame
 *  receives none of them (`PLUGIN_FRAME_CALL_REFUSED`). */
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

const PLUGIN_UI_HOST_CALL_CODE_SET: ReadonlySet<string> = new Set(Object.values(PLUGIN_UI_HOST_CALL_CODES));

/** Whether a refusal reason is one a scripted surface's guest may receive. */
export function isPluginUiHostCallCode(reason: string): reason is PluginUiHostCallCode {
  return PLUGIN_UI_HOST_CALL_CODE_SET.has(reason);
}

/** The message of every scripted guest host call that fails with no allowlisted code. It is one fixed sentence, so
 *  a fault's server text, a not-found's id or any reason outside {@link PLUGIN_UI_HOST_CALL_CODES} never reaches
 *  plugin code. */
export const PLUGIN_UI_HOST_CALL_FAILED = "plugin host: the call could not be completed";

/** The bounded transcript page accepted by the scripted UI relay. */
export const PLUGIN_UI_CHAT_MESSAGES_LIMIT_MAX = 50;
// Each schema is at least as strict as the column it reaches, so a refusal is the relay's coded answer and never the
// table's CHECK error: `storage.kv` keys and values read the plugin table's caps, variables read the global plane's.

/** A `storage.kv` key, counted in UTF-16 units and holding no NUL. The relay parses its arguments with it and the
 *  host's storage write checks a server guest's key with it, so both doors refuse alike. */
export const pluginKvKeySchema = withoutNul(z.string().min(1).max(PLUGIN_KV_KEY_MAX_CHARS));
/** A `storage.kv` value, counted in UTF-8 bytes and holding no NUL; read by the relay and the host's storage write,
 *  as {@link pluginKvKeySchema}. */
export const pluginKvValueSchema = withoutNul(byteBoundedString(PLUGIN_KV_VALUE_MAX_BYTES));
const variableValue = withoutNul(byteBoundedString(GLOBAL_VARIABLE_VALUE_MAX_BYTES));
const noArgs = z.tuple([]);
const oneKey = z.tuple([pluginKvKeySchema]);
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
  "storage.set": z.tuple([pluginKvKeySchema, pluginKvValueSchema]),
  "storage.compareAndSet": z.tuple([pluginKvKeySchema, pluginKvValueSchema.nullable(), pluginKvValueSchema]),
  "storage.delete": oneKey,
  "storage.list": z.tuple([z.string().max(PLUGIN_KV_KEY_MAX_CHARS).optional()]),
} satisfies Record<UiProxyableHostFunction, z.ZodType>;
