// Stage and distributable clones share one scrub owner; publication never edits canonical business text to hide a secret.
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { secretRedactionLiterals } from "@orb/kit/secret-redaction";
import type { StageCloneOptions } from "../contract/stage-clone.ts";

const SECRET_BOUND_ROWS = [
  "DELETE FROM user_credentials",
  "DELETE FROM sessions",
  "UPDATE users SET password_hash = NULL WHERE password_hash IS NOT NULL",
  "DELETE FROM chat_invites WHERE status = 'pending'",
] as const;

// SDK cache and pre-auth stores have no inbound FKs; settled invite history carries non-null private token hashes.
const PUBLICATION_PRIVATE_ROWS = [
  "DELETE FROM session_entries",
  "DELETE FROM oidc_transactions",
  "DELETE FROM oidc_pending_signups",
  "DELETE FROM chat_invites",
] as const;
const PRIVATE_MATERIAL = "Corpus publication contains private material";

/** Remove only the clone's source-bound secrets; ordinary stages retain their existing runtime lineage semantics. */
export function scrubStageClone(db: DatabaseSync, options: StageCloneOptions): void {
  if (options.publication !== undefined) {
    db.exec("PRAGMA secure_delete = ON");
  }
  for (const statement of SECRET_BOUND_ROWS) {
    db.exec(statement);
  }
  if (options.publication === undefined) {
    return;
  }
  for (const statement of PUBLICATION_PRIVATE_ROWS) {
    db.exec(statement);
  }
  verifyDatabaseValues(db, secretRedactionLiterals(options.publication.privateLiterals));
  if (db.prepare("PRAGMA foreign_key_check").all().length > 0) {
    throw new Error("Corpus publication has broken database relationships");
  }
  // Deleted credentials must not survive in free pages of a distributable database.
  db.exec("VACUUM");
}

function verifyDatabaseValues(db: DatabaseSync, literals: readonly string[]): void {
  for (const table of db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()) {
    const name = table["name"];
    if (typeof name !== "string") {
      throw new Error("Corpus publication cannot read its database table inventory");
    }
    const quoted = `"${name.replaceAll('"', '""')}"`;
    for (const row of db.prepare(`SELECT * FROM ${quoted}`).iterate()) {
      for (const value of Object.values(row)) {
        if (typeof value === "string" && literals.some((literal) => value.includes(literal))) {
          throw new Error(PRIVATE_MATERIAL);
        }
      }
    }
  }
}

/** Inspect actual output bytes, including CAS payloads; a known echo refuses rather than rewriting user content. */
export function verifyStagePublicationBytes(database: string, assets: string, privateLiterals: readonly string[]): void {
  const literals = secretRedactionLiterals(privateLiterals).map((literal) => Buffer.from(literal));
  const inspect = (path: string): void => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      throw new Error("Corpus publication contains a symbolic link");
    }
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path)) {
        inspect(join(path, entry));
      }
    } else if (stat.isFile()) {
      const bytes = readFileSync(path);
      if (literals.some((literal) => bytes.includes(literal))) {
        throw new Error(PRIVATE_MATERIAL);
      }
    }
  };
  for (const path of [database, `${database}-wal`, `${database}-shm`, assets]) {
    if (existsSync(path)) {
      inspect(path);
    }
  }
}
