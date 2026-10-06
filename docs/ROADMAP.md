# ALFA-PANEL Production Roadmap

This file is the dependency-aware implementation checklist. A phase is only considered complete when code, API, UI, security controls, tests, documentation, and CI are aligned.

## Completed in production-hardening

- [x] Per-site Docker network model and proxy attachment
- [x] Read-only rootfs, tmpfs, no-new-privileges and capability hardening
- [x] Arbitrary container exec removed from API/control UI
- [x] Persistent embedded identity/session/audit store
- [x] RBAC enforcement on site, user, backup and audit APIs
- [x] Encrypted TOTP secrets at rest
- [x] Refresh-token persistence and rotation
- [x] Typed privileged Unix-socket agent
- [x] Site creation/lifecycle routed through the agent
- [x] Secure file management routed through the agent
- [x] Typed WAR staging/activation
- [x] Backup/restore with pre-restore backup
- [x] Exact-domain destructive deletion confirmation
- [x] Strict CORS origin allowlist
- [x] Trusted proxy CIDR validation
- [x] Production API entrypoint and hardened systemd units
- [x] Installer and operations documentation
- [x] Production authentication UI
- [x] User/RBAC/audit settings UI
- [x] Simulated Docker console removed from production UI
- [x] Runtime ownership alignment for non-root workloads
- [x] Dependency/security scan and SBOM CI stages

## Remaining release gates

- [x] ACME HTTP-01/DNS-01 certificate lifecycle integrated with the production proxy deployment
- [x] Certificate renewal scheduler; expiry monitoring/notifications remain a release validation task
- [ ] Full reverse-proxy deployment/upgrade lifecycle
- [ ] Database migration/versioning framework for future store schema changes
- [ ] Full user lifecycle: password reset, MFA enrollment/recovery, session/device management UI
- [x] Backup retention scheduler and optional encrypted off-host backup target
- [x] Host firewall/nftables typed management
- [x] Host metrics and container runtime telemetry endpoints
- [x] Real-time log streaming UI using authenticated access tokens
- [x] API OpenAPI specification; generated client contract tests remain
- [x] Disposable Docker E2E environment in CI
- [ ] Failure-injection tests: proxy failure, Docker failure, disk full, OOM, interrupted deployment
- [ ] Upgrade/rollback automation with migration rollback
- [x] Container image digest policy and image vulnerability scanning
- [ ] Performance/load benchmarks and regression thresholds
- [ ] Independent security review/penetration test
- [ ] Final compliance evidence package

## Definition of Done

A phase is not closed by code alone. It requires:

1. Backend implementation.
2. Privilege boundary review.
3. Tenant-isolation review.
4. API authorization tests.
5. Frontend UX and responsive-state review.
6. Performance impact review.
7. Failure/rollback behavior.
8. CI green.
9. Documentation updated.
10. E2E evidence on a disposable host where infrastructure behavior is involved.

## Release status

The branch is a production-hardening candidate, not yet a v1.0 release. Infrastructure E2E and the remaining release gates must pass before production certification.

The latest GitHub Actions runs currently report all jobs as failed with no downloadable job logs/step data exposed by the GitHub integration. This is treated as an infrastructure/runner verification blocker rather than evidence that the implementation is green. The release remains blocked until CI produces actionable results.
