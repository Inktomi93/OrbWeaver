// Each mutation family takes its own id family: another family's id, or an unparsed string, fails to compile.
import type { TrpcClient } from "@orb/client/data";
import type { CharacterId, ChatId, PluginId, PresetId, RegexScriptId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

declare const client: TrpcClient;
declare const characterId: CharacterId;
declare const chatId: ChatId;
declare const pluginId: PluginId;
declare const presetId: PresetId;
declare const scriptId: RegexScriptId;
declare const raw: string;

test("a procedure's input keeps every id family", async () => {
  await client.regex.attachToCharacter.mutate({ characterId, scriptId });
  await client.regex.attachToPreset.mutate({ presetId, scriptId });
  await client.regex.attachToChat.mutate({ chatId, scriptId });
  await client.regex.removeScript.mutate({ scriptId });
  await client.chat.reapHusk.mutate({ chatId });
  await client.plugin.uninstall.mutate({ pluginId });
  expectTypeOf(client.chat.reapHusk.mutate).parameter(0).toEqualTypeOf<{ chatId: ChatId }>();

  // @ts-expect-error -- a chat id is no character id and no script id.
  await client.regex.attachToCharacter.mutate({ characterId: chatId, scriptId: chatId });
  // @ts-expect-error -- a character id is no preset id.
  await client.regex.attachToPreset.mutate({ presetId: characterId, scriptId });
  // @ts-expect-error -- a preset id is no chat id.
  await client.regex.attachToChat.mutate({ chatId: presetId, scriptId });
  // @ts-expect-error -- a chat id is no script id.
  await client.regex.removeScript.mutate({ scriptId: chatId });
  // @ts-expect-error -- a script id is no chat id.
  await client.chat.reapHusk.mutate({ chatId: scriptId });
  // @ts-expect-error -- an unparsed string has proved nothing about its family.
  await client.chat.reapHusk.mutate({ chatId: raw });
  // @ts-expect-error -- a chat id is no plugin id.
  await client.plugin.uninstall.mutate({ pluginId: chatId });
});
