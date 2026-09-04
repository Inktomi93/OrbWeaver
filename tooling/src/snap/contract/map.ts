// Structured evidence for Snap's three-sheet --map contract: application destinations, rendered shell
// topology, and the current surface. Browser values cross page validation before these types are trusted.
import { z } from "zod";

export const mapSectionIdSchema = z.string().min(1).brand<"MapSectionId">();
/** @public Cross-file Snap map evidence contract. */
export type MapSectionId = z.infer<typeof mapSectionIdSchema>;
export const mapModalSlotIdSchema = z.string().min(1).brand<"MapModalSlotId">();
/** @public Cross-file Snap map evidence contract. */
export type MapModalSlotId = z.infer<typeof mapModalSlotIdSchema>;
export const mapConfigGroupIdSchema = z.string().min(1).brand<"MapConfigGroupId">();
/** @public Cross-file Snap map evidence contract. */
export type MapConfigGroupId = z.infer<typeof mapConfigGroupIdSchema>;
export const mapContextTabIdSchema = z.string().min(1).brand<"MapContextTabId">();
/** @public Cross-file Snap map evidence contract. */
export type MapContextTabId = z.infer<typeof mapContextTabIdSchema>;
export const mapChatPositionSchema = z.string().min(1).brand<"MapChatPosition">();
/** @public Cross-file Snap map evidence contract. */
export type MapChatPosition = z.infer<typeof mapChatPositionSchema>;

type MapEntrySource = "semantic" | "dom";
export const MAP_VISIBILITIES = ["visible", "hidden"] as const;
export const mapVisibilitySchema = z.enum(MAP_VISIBILITIES);
/** @public Cross-file Snap map evidence contract. */
export type MapVisibility = z.infer<typeof mapVisibilitySchema>;
export const MAP_ACTIONABILITIES = ["actionable", "locator-only"] as const;
export const mapActionabilitySchema = z.enum(MAP_ACTIONABILITIES);
/** @public Cross-file Snap map evidence contract. */
export type MapActionability = z.infer<typeof mapActionabilitySchema>;
export const MAP_INACTIVE_REASONS = ["aria-hidden", "hidden-attribute", "inert", "display-none", "visibility-hidden", "opacity-zero", "zero-geometry"] as const;
export const mapInactiveReasonSchema = z.enum(MAP_INACTIVE_REASONS).nullable();
/** @public Cross-file Snap map evidence contract. */
export type MapInactiveReason = z.infer<typeof mapInactiveReasonSchema>;

interface MapEntryState {
  readonly disabled: boolean | null;
  readonly current: string | null;
  readonly checked: boolean | "mixed" | null;
  readonly expanded: boolean | null;
}

export interface MapEntry {
  readonly role: string;
  readonly name: string;
  /** A unique locator. It is a current interaction handle only when actionability is `actionable`. */
  readonly selector: string;
  readonly source: MapEntrySource;
  readonly state: MapEntryState;
  readonly visibility: MapVisibility;
  readonly inactiveReason: MapInactiveReason;
  readonly actionability: MapActionability;
}

export type RawMapEntry = Omit<MapEntry, "source"> & { readonly fallback: string; readonly semanticFallback: string };

export interface MapNavCapabilities {
  readonly sections: readonly MapSectionId[];
  readonly modalSlots: readonly MapModalSlotId[];
  readonly configGroups: readonly MapConfigGroupId[];
  readonly contextTabs: readonly MapContextTabId[];
  readonly contextTabNames: ReadonlyArray<{ readonly id: MapContextTabId; readonly label: string }>;
  readonly contextTabsPublished: boolean;
  readonly chatPositions: readonly MapChatPosition[];
}

interface MapCurrentPlace {
  readonly url: string;
  readonly section: MapSectionId | null;
  readonly chatOpen: boolean;
  readonly focus: boolean;
}

export type MapAtlasEvidence =
  | { readonly status: "unavailable"; readonly url: string; readonly reason: string }
  | { readonly status: "available"; readonly url: string; readonly capabilities: MapNavCapabilities; readonly place: MapCurrentPlace };

interface MapRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const MAP_SHELL_REGION_IDS = ["rail", "topbar", "list", "content", "context"] as const;
type MapShellRegionId = (typeof MAP_SHELL_REGION_IDS)[number];
export const MAP_SHELL_REGIMES = ["wide", "narrow", "mobile"] as const;
type MapShellRegime = (typeof MAP_SHELL_REGIMES)[number];
export const MAP_PANEL_MODES = ["docked", "overlay", "collapsed"] as const;
type MapPanelMode = (typeof MAP_PANEL_MODES)[number];

export interface MapShellRegion {
  readonly id: MapShellRegionId;
  readonly mounted: boolean;
  readonly visible: boolean;
  readonly available: boolean | null;
  readonly mode: MapPanelMode | null;
  readonly inert: boolean;
  readonly rect: MapRect | null;
  readonly position: string | null;
  readonly zIndex: string | null;
  readonly identity: string | null;
}

export type MapShellEvidence =
  | { readonly status: "unavailable"; readonly reason: string }
  | {
      readonly status: "available";
      readonly regime: MapShellRegime;
      readonly viewport: { readonly width: number; readonly height: number; readonly devicePixelRatio: number };
      readonly section: MapSectionId;
      readonly sectionLabel: string | null;
      readonly publishedPanels: ReadonlyArray<{
        readonly side: "list" | "context";
        readonly mode: MapPanelMode;
        readonly available: boolean;
      }>;
      readonly contentIdentity: string | null;
      readonly chatOpen: boolean;
      readonly focus: boolean;
      readonly activeContextTab: MapContextTabId | null;
      readonly contextRelation: "unspecified/auxiliary";
      readonly regions: readonly MapShellRegion[];
    };

export interface RawMapBridgeEvidence {
  readonly atlas: unknown;
  readonly shell: unknown;
}
