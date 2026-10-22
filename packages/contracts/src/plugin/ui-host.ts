// Scripted UI relay arguments exclude room identity; the mount supplies membership-checked scope.
import { z } from "zod";
import type { UiProxyableHostFunction } from "./host-v1.ts";

const KV_KEY_MAX = 512;
/** The bounded transcript page accepted by the scripted UI relay. */
export const PLUGIN_UI_CHAT_MESSAGES_LIMIT_MAX = 50;
const kvKey = z.string().min(1).max(KV_KEY_MAX);
const noArgs = z.tuple([]);
const oneKey = z.tuple([kvKey]);
const keyAndValue = z.tuple([kvKey, z.string()]);

/** Positional arguments parsed by the authoritative UI relay before calling its installer-scoped bridge. */
export const pluginUiHostArgsSchemas = {
  "chat.listMessages": z.tuple([z.object({ limit: z.int().positive().max(PLUGIN_UI_CHAT_MESSAGES_LIMIT_MAX).optional() }).optional()]),
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
