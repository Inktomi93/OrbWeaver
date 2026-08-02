// Composition seam for the regex SCRIPT LIBRARY (D121-E) + the four portability ops built alongside it (the
// card lift, the card re-embed, and the backup-bundle export/import pair). Built EARLY — before chat —
// because chat's `ChatContext.resolveRegexSources` is one of its products, and the resolve op needs nothing
// but `db`. The SERVICE needs chat's membership guards for the room scope, but those are the standalone
// `requireHost`/`requireParticipant` factories off chat's front door (the world-info compose precedent),
// not the built chat service — so there is no ordering knot.
//
// The ENGINE is composed elsewhere and stays there: `@orb/kit/regex` executes, and the `node:vm` ReDoS
// watchdog (`@orb/server/kit/regex`) is injected onto ChatContext as `applyRegexReplace`. This seam wires
// only the DATA the engine runs on (AGENTS §1 "engine vs data").

import type { Db } from "@orb/db";
import { ID_PREFIX } from "@orb/kit/ids";
import { can } from "#domain/admin";
import type { ExportCardScripts, ExportRegexScripts, ImportCardScripts, ImportRegexScript, RegexService, ResolveRegexSources } from "#domain/regex";
import {
  createExportCardScripts,
  createExportRegexScripts,
  createImportCardScripts,
  createImportRegexScript,
  createRegexService,
  createResolveRegexSources,
} from "#domain/regex";
import type { AuditEntry } from "#foundation/observability";
import { requireHost, requireParticipant } from "../../domain/chat";
import { publishUserEvent } from "../../transport/trpc";
import { minter } from "./minter";

/** What the regex seam needs from the composition root. */
export interface RegexComposeDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
}

/** The regex compose product: the service + the four portability ops + the chat-turn resolve op. */
export interface RegexComposeResult {
  readonly regex: RegexService;
  /** Injected onto `ChatContext` — the ONE home of the four-scope junction dereference. */
  readonly resolveRegexSources: ResolveRegexSources;
  /** Injected into the card IMPORT path (the `importLorebook` twin). */
  readonly importCardScripts: ImportCardScripts;
  /** Injected into `ExportContext` — the card RE-EMBED. */
  readonly exportCardScripts: ExportCardScripts;
  /** The backup-bundle descriptor's two halves. */
  readonly exportRegexScripts: ExportRegexScripts;
  readonly importRegexScript: ImportRegexScript;
}

export function buildRegex(deps: RegexComposeDeps): RegexComposeResult {
  const { db, now, audit } = deps;
  const newScriptId = minter(ID_PREFIX.regexScript);

  const regex = createRegexService({
    db,
    now,
    newScriptId,
    audit,
    requireChatHost: (principal, chatId) => requireHost({ db, can }, principal, chatId).then((): void => undefined),
    requireChatMember: (principal, chatId) => requireParticipant({ db, can }, principal, chatId).then((): void => undefined),
    emitUserEvent: publishUserEvent,
  });

  const portabilityCtx = { db, now, newScriptId };

  return {
    regex,
    resolveRegexSources: createResolveRegexSources({ db }),
    importCardScripts: createImportCardScripts(portabilityCtx),
    exportCardScripts: createExportCardScripts({ db }),
    exportRegexScripts: createExportRegexScripts({ db }),
    importRegexScript: createImportRegexScript(portabilityCtx),
  };
}
