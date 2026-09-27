---
kind: work
status: open
updated: 2026-09-24
priority: P2
area: network
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

The build landed with the node and CT tests named in the plan's Test plan, leg C (D269). The live proof needs a public IP address, which the lane sandbox has none of, so the owner runs it on a public host:

1. Use a host whose router WAN address is public: not 100.64.0.0/10 (CGNAT) and not a LAN range. Run a production build with `AUTH_MODE=local`, the owner claimed, and `BIND_HOST` unset or set to the LAN interface.
2. On the router, forward TCP 443 to this machine's port 8443 and TCP 80 to port 8080. Open both ports in the host firewall.
3. Start the server with `pnpm start`. Sign in as the owner. Open Admin, then Multi-user, then Share over the internet. Under HTTPS at your public address, enter the WAN address, keep 8443 and 8080, and press Get a certificate.
4. Record that the card reaches `https on` and the server log has `share: this server serves https at https://<address>`.
5. From outside the LAN, for example a phone hotspot, record the output of `curl -sv https://<address>/healthz` (TLS verifies, 200) and `openssl s_client -connect <address>:443 </dev/null 2>/dev/null | openssl x509 -noout -issuer -dates -ext subjectAltName` (a Let's Encrypt issuer, about 160 hours between the dates, `IP Address:<address>`).
6. Sign in at `https://<address>` from outside and record that the browser holds `__Host-orb_session` and that `/api/auth/config` reports `"transport":"https"`.
7. Record `ls -l data/secrets/` showing `acme_account_key.pem`, `ip_certificate.pem` and `ip_certificate_key.pem` at `-rw-------`.
8. Leave the server running past the card's renewal time, about 80 hours after issue. Record the second `serves https` log line and the new `notAfter` from step 5's `openssl` command, later than the first.
9. Fallback: remove the port 80 forward, press Turn off https, then Get a certificate again. Record that the card shows `Plain http only` with `validation_failed`, that the log has the `security: true` line with `code: "validation_failed"`, and that `curl https://<address>` is refused. Let's Encrypt allows five failed validations per address per hour, so run this step once.
