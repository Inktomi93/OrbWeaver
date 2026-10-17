import type { Db } from "@orb/db";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Hono } from "hono";

type PortabilitySchema = Db["_"]["fullSchema"];

/** Canonical table exports, excluding relation declarations and other schema values. */
export type PortabilityTableName = {
  [Name in keyof PortabilitySchema]: PortabilitySchema[Name] extends SQLiteTable ? Name : never;
}[keyof PortabilitySchema];

export const NON_PORTABLE_CLASSES = ["RULED-OUT", "DERIVED", "RUNTIME", "DEFERRED", "ACCEPTED-LOSSY"] as const;
export type NonPortableClass = (typeof NON_PORTABLE_CLASSES)[number];

export interface NonPortableCanon {
  readonly classification: NonPortableClass;
  /** The governing reason and the condition that ends this classification. */
  readonly why: string;
}

export type LifecycleDoor =
  | { readonly transport: "trpc"; readonly cite: string }
  | { readonly transport: "http"; readonly method: Hono["routes"][number]["method"]; readonly cite: string }
  | { readonly ruled: string };

export const LIFECYCLE_CHROME_HOMES = ["band+kebab", "backup-pane"] as const;
export type LifecycleChromeHome = (typeof LIFECYCLE_CHROME_HOMES)[number];

export interface LifecycleDoors {
  readonly singleExport: LifecycleDoor;
  readonly singleImport: LifecycleDoor;
  readonly chrome: LifecycleChromeHome;
}
