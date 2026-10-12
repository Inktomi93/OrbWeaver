import type { StoreAsset } from "@orb/contracts/assets";
import type { PluginCardDataRead, PluginCardDataTarget } from "@orb/contracts/character";
import type { RequestTurnOp } from "@orb/contracts/chat";
import type { CreateDocumentFromText } from "@orb/contracts/databank";
import type { Principal } from "@orb/contracts/identity";
import type { GeneratePicture } from "@orb/contracts/imagery";
import type { ExecutePluginSuggestion, PluginManifest } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { PluginHostOps } from "./ops.ts";
import type { PluginContext } from "./service.ts";

export interface PluginRuntimeDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly requestTurn: RequestTurnOp;
  readonly imagery: { readonly generatePicture: GeneratePicture };
  readonly databankCreateFromText: CreateDocumentFromText;
  readonly assets: { readonly store: StoreAsset };
  readonly resolveOwnerPrincipal: (userId: UserId) => Promise<Principal>;
  readonly readCardData: (target: PluginCardDataTarget) => Promise<PluginCardDataRead>;
  readonly writeCardData: (target: PluginCardDataTarget, data: Record<string, unknown>) => Promise<boolean>;
  readonly readShowcaseManifest: (slug: string) => Promise<Pick<PluginManifest, "version"> | null>;
}
export interface PluginRuntimeOps {
  readonly requestTurn: PluginHostOps["chat"]["requestTurn"];
  readonly generatePicture: PluginHostOps["imagery"]["generatePicture"];
  readonly cardState: Pick<PluginHostOps["character"], "getCardData" | "setCardData">;
  readonly ingestDatabank: PluginHostOps["databank"]["ingest"];
  readonly storeFetched: PluginHostOps["assets"]["storeFetched"];
  readonly showcaseVersion: PluginContext["showcase"]["version"];
}
export interface PluginSuggestionExecutor {
  readonly run: ExecutePluginSuggestion;
  readonly bind: (run: ExecutePluginSuggestion) => void;
}
