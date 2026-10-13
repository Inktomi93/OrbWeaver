import { readFileSync } from "node:fs";
import process from "node:process";
import type { InventoryBuildRequest } from "../code-facts/semantic-inventory-contract.ts";
import { openInventoryDatabase, publishInventoryGeneration } from "../code-facts/semantic-inventory-database.ts";
import { extractInventoryPartition } from "./semantic-inventory-extract.ts";

const path = process.argv[2];
if (path === undefined) {
  throw new Error("inventory worker requires its parent-authored request path");
}
const request = JSON.parse(readFileSync(path, "utf8")) as InventoryBuildRequest;
const partition = extractInventoryPartition(request);
using database = openInventoryDatabase(request.destination);
database.exec("BEGIN IMMEDIATE");
publishInventoryGeneration(database, [partition]);
database.exec("COMMIT");
