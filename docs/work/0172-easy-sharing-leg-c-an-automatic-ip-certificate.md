---
kind: work
status: blocked
updated: 2026-10-24
priority: P2
area: network
blocked: owner
plan: easy-sharing
---

# Easy-sharing leg C: an automatic IP certificate for port-forwarded hosts

## What

Add an optional leg after S. When a host has a public IP and forwards port 443 or 80 to orbweaver, the server gets and renews a Let's Encrypt IP address certificate itself, and the Share card offers it: forward 443 and https is automatic. IP certificates are generally available, only under the shortlived ACME profile (160 hours), and only through HTTP-01 or TLS-ALPN-01 (<https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability.html>). Before the build brief, verify which Node ACME client supports the shortlived profile and IP identifiers. Keep it off unless the host chooses it, and fall back to plain http with the public-http warning when validation fails. LAN addresses and CGNAT cannot get a public certificate; the tunnel stays the default.

## Why

Owner ruling: port-forwarding hosts get https with no certificate setup. Most hosts have no certificate, and a bare port-forward sends passwords and session cookies in plain text.

## Done when

The plan carries leg C. A live proof on a public IP gets a certificate, serves https, and renews before expiry; a failed validation falls back to http with the warning; tests cover the renewal schedule and the fallback.

## Evidence

Owner waived the live proof: the owner's region blocking stays on, and it drops some Let's Encrypt validation probes.

- Proven on a real public IP, image built from main's tree: a certificate order runs through the Share card and fails at Let's Encrypt secondary validation; the card falls back to plain http with its warning.
- Not proven: issuance, https serving, the cookie and transport checks, file modes and renewal.
