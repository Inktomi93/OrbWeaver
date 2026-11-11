// Scripted UI relay arguments exclude room identity; the mount supplies membership-checked scope.
// Strip mode: these schemas also read plugin guest data, which can carry keys this release does not declare.
import { z } from "zod";
import type { UiProxyableHostFunction } from "./host-v1.ts";

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

const KV_KEY_MAX = 512;
/** The bounded transcript page accepted by the scripted UI relay. */
export const PLUGIN_UI_CHAT_MESSAGES_LIMIT_MAX = 50;
const kvKey = z.string().min(1).max(KV_KEY_MAX);
const noArgs = z.tuple([]);
const oneKey = z.tuple([kvKey]);
const keyAndValue = z.tuple([kvKey, z.string()]);

/** Positional arguments parsed by the authoritative UI relay before calling its installer-scoped bridge. */
export const pluginUiHostArgsSchemas = {
  "chat.listMessages": z.tuple([
    z
      .object({ limit: z.int().positive().max(PLUGIN_UI_CHAT_MESSAGES_LIMIT_MAX).optional() })
      .strip()
      .optional(),
  ]),
  "chat.getVariables": noArgs,
  "variables.get": oneKey,
  "variables.set": keyAndValue,
  "variables.delete": oneKey,
  "storage.get": oneKey,
  "storage.set": keyAndValue,
  "storage.compareAndSet": z.tuple([kvKey, z.string().nullable(), z.string()]),
  "storage.delete": oneKey,
  "storage.list": z.tuple([z.string().max(KV_KEY_MAX).optional()]),
} satisfies Record<UiProxyableHostFunction, z.ZodType>;
