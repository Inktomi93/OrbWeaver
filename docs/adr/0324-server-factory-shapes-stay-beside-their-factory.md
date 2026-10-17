---
kind: adr
status: active
updated: 2026-10-17
---

# Server factory shapes stay beside their factory

## Context

The type-home table names no home for shapes in server entry, transport, infra and foundation. The placement gate fills the gap with a package contract folder the table does not sanction for the server, so factory parameter and result shapes carry baselined waivers instead of a ruling.

## Decision

A server factory's dependency, option, handle and result shape stays in the file that declares the factory, in entry, transport, infra and foundation. Ownership follows the production signature: the shape is a parameter, return type or member of a function in the same file. Spine-TypeScript section 7.4 holds the row. The placement gate and its native successor exclude these shapes; a plain-data shape named in the wire vocabulary remains judged. The baselined waivers for these shapes are deleted with the population change.

## Consequences

Wiring shapes stay readable beside the code they wire. Domain, wire and database shapes keep their homes; a factory shape that crosses to another tier or to the client moves to its sanctioned home. The population change is not yet built.

## Alternatives rejected

Move every factory shape into a server contract folder: ceremony for one caller and a home the table does not sanction. Keep the waivers as a burn-down: the waivers point at no item and the sites are correct.
