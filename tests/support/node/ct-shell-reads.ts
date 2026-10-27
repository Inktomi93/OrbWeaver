// The ambient reads the production AppShell issues on mount, answered from captured corpus data.
// A spec composes this map and adds only the procedures its subject owns; it never types its own backend.

import type { UserId } from "@orb/kit/ids";
import type { CorpusPlayback } from "../iso/corpus.ts";
import { createCorpusReadResponder } from "../iso/corpus-read-responder.ts";
import type { TrpcProcedurePath, TrpcRoutes } from "./route-trpc.ts";

/** Every procedure the shell reads or writes when it mounts on Home, found by mounting it against the corpus server. */
export const SHELL_AMBIENT_PATHS = [
  "persona.list",
  "chat.listChats",
  "chat.getChat",
  "chat.reapTemporaryChats",
  "character.list",
  "rosterPreset.list",
  "rosterPreset.count",
  "settings.getUserSettings",
  "databank.list",
  "databank.bankHealth",
  "notifications.list",
  "plugin.listCommands",
  "automation.listRulePresets",
] as const satisfies readonly TrpcProcedurePath[];

type ShellAmbientPath = (typeof SHELL_AMBIENT_PATHS)[number];

function captured<T>(section: T | undefined, name: string): T {
  if (section === undefined) {
    throw new Error(`The corpus has no ${name} capture`);
  }
  return section;
}

/** Each read is served by its exact captured request: a shell that asks for anything else fails the owning test. */
export function createShellAmbientReads(corpus: CorpusPlayback, viewerUserId: UserId): TrpcRoutes<ShellAmbientPath> {
  const { reads } = corpus;
  const { reads: shell, recentRooms } = captured(corpus.shellAmbient, "shell ambient");
  const commands = captured(corpus.pluginLibrary, "plugin library").ownerActive.reads.commands;
  const ruleCatalog = captured(corpus.libraryRelations, "library relations").reads.ruleCatalog;
  return {
    "persona.list": createCorpusReadResponder("persona.list", viewerUserId, reads["persona.list"]),
    "chat.listChats": createCorpusReadResponder("chat.listChats", viewerUserId, [shell.recentChats]),
    "chat.getChat": createCorpusReadResponder("chat.getChat", viewerUserId, recentRooms),
    "chat.reapTemporaryChats": createCorpusReadResponder("chat.reapTemporaryChats", viewerUserId, [shell.reaped]),
    "character.list": createCorpusReadResponder("character.list", viewerUserId, [shell.quickPicks]),
    "rosterPreset.list": createCorpusReadResponder("rosterPreset.list", viewerUserId, [shell.rosterPreview]),
    "rosterPreset.count": createCorpusReadResponder("rosterPreset.count", viewerUserId, reads["rosterPreset.count"]),
    "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", viewerUserId, reads["settings.getUserSettings"]),
    "databank.list": createCorpusReadResponder("databank.list", viewerUserId, [shell.recentDocuments]),
    "databank.bankHealth": createCorpusReadResponder("databank.bankHealth", viewerUserId, reads["databank.bankHealth"]),
    "notifications.list": createCorpusReadResponder("notifications.list", viewerUserId, [shell.inbox]),
    "plugin.listCommands": createCorpusReadResponder("plugin.listCommands", viewerUserId, [commands]),
    "automation.listRulePresets": createCorpusReadResponder("automation.listRulePresets", viewerUserId, [ruleCatalog]),
  };
}
