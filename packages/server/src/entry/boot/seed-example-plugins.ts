// Graph adapter over the one shipped showcase tuple; plugin owns completeness, consent and upgrade policy.

import { SHOWCASE_PLUGIN_SLUGS } from "@orb/showcase-plugins";
import type { ExamplePluginSeeder, ExamplePluginSeederDeps as ShowcaseSeedDeps } from "#domain/plugin";
import { createExamplePluginSeeder as createShowcaseSeedPolicy } from "#domain/plugin";

export type { ExamplePluginSeeder } from "#domain/plugin";

// @orb-waive no-inline-package-interface(ExamplePluginSeederDeps): baselined when the gate landed; burn-down item 952.
/** The original graph port; shipped slugs are bound here rather than imported by a domain. */
export interface ExamplePluginSeederDeps {
  readonly packBundle: ShowcaseSeedDeps["packBundle"];
  readonly bundledVersion: ShowcaseSeedDeps["bundledVersion"];
  readonly install: ShowcaseSeedDeps["install"];
  readonly upgrade: ShowcaseSeedDeps["upgrade"];
  readonly requestConsent: ShowcaseSeedDeps["requestConsent"];
  readonly listHeld: ShowcaseSeedDeps["listHeld"];
  readonly isSeeded: ShowcaseSeedDeps["isSeeded"];
  readonly markSeeded: ShowcaseSeedDeps["markSeeded"];
  readonly readSeededVersions: ShowcaseSeedDeps["readSeededVersions"];
  readonly writeSeededVersions: ShowcaseSeedDeps["writeSeededVersions"];
}

export function createExamplePluginSeeder(deps: ExamplePluginSeederDeps): ExamplePluginSeeder {
  return createShowcaseSeedPolicy({
    slugs: SHOWCASE_PLUGIN_SLUGS,
    packBundle: (slug) => deps.packBundle(slug),
    bundledVersion: (slug) => deps.bundledVersion(slug),
    install: (args) => deps.install(args),
    upgrade: (args) => deps.upgrade(args),
    requestConsent: (args) => deps.requestConsent(args),
    listHeld: (principal) => deps.listHeld(principal),
    isSeeded: (principal) => deps.isSeeded(principal),
    markSeeded: (principal) => deps.markSeeded(principal),
    readSeededVersions: (principal) => deps.readSeededVersions(principal),
    writeSeededVersions: (principal, versions) => deps.writeSeededVersions(principal, versions),
  });
}
