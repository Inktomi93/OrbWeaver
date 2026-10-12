import type { SearchService } from "#domain/search";

export interface DossierSearchDeps {
  readonly similarCharacters: SearchService["similarCharacters"];
}
