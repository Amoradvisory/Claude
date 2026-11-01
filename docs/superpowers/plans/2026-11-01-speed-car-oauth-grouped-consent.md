# Speed Car grouped OAuth consent implementation plan

> **For agentic workers:** Use superpowers:executing-plans. The user has authorized correction, deployment and verification.

**Goal:** Make the explicitly chosen one-time private consent discoverable while preserving existing grants and Android safeguards.

**Architecture:** Publish the five resource scopes through provider 1.2.4's advertised requiredScopes (not an enforcement setting), and render each requested scope with its meaning on the owner-secret consent form. Disable implicit same-client grant revocation. No token, KV, Durable Object, Android or pairing migration.

**Tech Stack:** TypeScript, Cloudflare OAuthProvider 1.2.4, Vitest/workerd, Wrangler.

**Spec:** User mission of 2026-11-01: confirm metadata mismatch, grouped consent, preserve tokens, prepare rollback, reconnect manually, prove GPS through real ChatGPT after owner activation.

## Global constraints

- Owner enters their code themselves; never read or enter it for them.
- Existing base tokens stay valid and gain no private rights, including on refresh.
- Preserve HTTP 403 insufficient_scope and all Android permissions/local switches.
- A deployed metadata change is not proof of ChatGPT consent or GPS success.

## Review focus

- Initial 401 scope takes priority over resource discovery; inspect the actual header.
- Path-specific resource metadata and the initial 401 must advertise the five resource scopes, excluding offline_access. The root well-known URL may return 404.
- Consent must describe only requested rights and retain CSRF/owner-code protection.
- Base token and refresh must continue to work without implicit widening.
- Reconnect must show private scopes before owner approval; location coordinates are not persisted in evidence.

## Tasks

- [x] Add integration assertions for resource scope discovery and readable grouped consent; run RED (three expected failures, including same-client token revocation).
- [x] Expand advertised requiredScopes and improve per-scope consent descriptions; run Worker/Node tests, TypeScript and build (33 Worker + 3 Node, check and dry-run passed; independent review clear).
- [ ] Review diff independently, save deployment baseline/rollback, deploy existing Worker with unchanged bindings/secrets.
- [ ] Verify live metadata and existing connection, then prompt Amor to reconnect and activate GPS. Verify through an actual ChatGPT conversation; record any blocking condition honestly.
- [ ] Update UTILISATION.md and report with source/provenance, results and rollback; publish branch and preserve local audit additions.
