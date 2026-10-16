# ALFA-PANEL Master Implementation Plan

**Status:** active engineering baseline; not a release or compliance certification  
**Planning baseline:** 2026-10-16  
**Target:** Debian 13, single VPS first, multi-tenant hosting panel, expandable to multiple managed servers  
**Delivery policy:** preserve existing work; implement in small reviewed milestones; never deploy to the live host as a side effect of a code change.

## 1. Product goal

Build a professional, secure, responsive and operationally reliable hosting control plane for administrators, resellers and customers. Initial managed workloads are Python and Java/Tomcat, with websites/domains, reverse-proxy ingress, DNS, TLS, databases, file operations, backups/restores, monitoring and host-security controls.

The product is not a root-shell wrapper. It records desired state, executes typed and authorized operations, verifies observed state, and exposes an honest result with recovery guidance.

## 2. Fixed decisions

- First deployment: one Debian 13 VPS; design stable interfaces for later additional agents.
- Control plane: modular Go monolith, separate job worker process where needed, and a separate narrowly privileged host agent.
- UI: preserve the current Next.js application unless baseline evidence justifies change.
- Primary control-plane database: PostgreSQL. Current bbolt data must be migrated deliberately; no blind deletion, implicit reset or unreviewed big-bang cutover.
- Job queue: PostgreSQL-backed durable jobs initially; do not add Redis or another queue until measured demand justifies it.
- Isolation: dedicated site identity and filesystem boundary as a baseline; containers with hardened profiles for untrusted application workloads.
- Ingress: retain the existing OpenResty/Nginx design unless a measured compatibility or operational issue justifies changing it.
- DNS/SSL: Cloudflare DNS and edge TLS for proxied domains; Cloudflare Origin CA for proxied origins; Let's Encrypt for DNS-only/direct access. Keep provider adapters replaceable.
- Git strategy: work on a feature branch/PR; never push to `main` or merge the PR automatically. Major milestones get a commit, CI run and PR progress update.
- Live safety: `deploy/install.sh`, firewall/SSH changes, service restarts and production migrations are not automatic steps in code implementation. They require a separate explicit deployment gate after prerequisites and rollback are verified.
- Secrets: never commit credentials, private keys, customer data, production dumps or unredacted diagnostic output.

## 3. Current-state caveats

The source and VPS state are a point-in-time assessment, not a claim of release readiness. The current working tree contains uncommitted source changes, timestamped backups, an untracked dependency checksum file and an unexpected file named `go-src/tatus --short`. These must be preserved and reviewed; do not use `git clean`, `git reset --hard`, blanket staging or blanket backup deletion. The current source uses bbolt for users, sessions and audit records, while the agreed target is PostgreSQL. A migration/export path and recovery plan are required. The repository's README and roadmap identify CI, host-level E2E, image supply-chain controls, performance testing and independent security review as release gates.

## 4. Target architecture

```text
Browser (admin / reseller / customer)
        | HTTPS, session security, CSRF/CORS controls
        v
Next.js UI  ---> versioned OpenAPI contract ---> Go API (unprivileged)
                                                   |
                          +------------------------+---------------------+
                          |                        |                     |
                     domain services          PostgreSQL            provider adapters
                          |                  users/tenants/          Cloudflare / ACME
                          |                  resources/jobs/audit      backup storage
                          v
                    durable job worker
                          |
                 typed local agent protocol
                          v
             restricted privileged host agent
                          |
       +------------------+-------------------------------+
       |                  |              |                |
    filesystem       Docker/limits   proxy/TLS        backup/restore
       |                  |              |                |
  tenant sites       Python/Tomcat    public ingress   protected storage
```

Control-plane processes and customer workloads must have separate identities and filesystem permissions. The browser must never receive the Docker socket, database credentials, provider tokens, private keys or agent access.

## 5. Full component inventory

See [Component Catalog](COMPONENT_CATALOG.md). Each component needs an owner module, API contract, authorization policy, audit event, test plan, health/metrics behavior, failure semantics and documented recovery path before it is called complete.

## 6. Dependency-ordered phases

### Phase 0 — Preserve and establish the baseline
- Record branch, HEAD, working-tree diff, untracked files, remotes, recent commits and current CI state.
- Preserve all local changes and backups; distinguish user work from generated noise without deleting either.
- Map current source, services, configuration, API, persistence, tests and deployment files.
- Run safe tests in a disposable build environment; do not install missing toolchains onto the production host merely for convenience.
- Produce verified/suspected/not-tested findings with evidence.
- **Exit:** current code and host inventory are reproducible; no pre-existing change was discarded.

### Phase 1 — Architecture, contracts and decision records
- Document module boundaries, threat model, API errors, job lifecycle, data ownership and tenant boundary.
- Publish OpenAPI and agent protocol contracts before adding endpoint implementations.
- Record decisions for PostgreSQL migration, container policy, ingress, DNS/SSL, secrets and release strategy.
- **Exit:** architecture docs match existing code and list all deviations.

### Phase 2 — Reproducible CI and supply-chain controls
- Fix workflow reliability and align package-manager commands with checked-in lockfiles.
- Keep Go tests/vet, frontend type/lint/build, disposable E2E, secret scan, vulnerability scan, systemd verification and SBOM.
- Add race tests where useful, migration tests, dependency review and artifact checksums.
- Pin third-party actions to verified immutable SHAs or an approved lockfile; grant minimum workflow token permissions.
- **Exit:** CI is actionable and repeatable, and failures identify the failing step. No release is called green based on unavailable logs.

### Phase 3 — Persistence and migrations
- Define repository interfaces and PostgreSQL schema for users, sessions, tenants, memberships, roles/permissions, audit events, sites, domains, provider credentials (references only), certificates, runtimes, backups and jobs.
- Use a supported PostgreSQL major, parameterized queries, transactions, foreign keys, unique constraints, tenant-scoped indexes and bounded connection pools.
- Add versioned migrations, startup schema checks and a backup-before-migration procedure.
- Create a one-time, dry-run-capable bbolt export/import tool with counts, checksums, collision detection and rollback instructions. Preserve the original bbolt file until post-migration verification and backup are complete.
- Never dual-write indefinitely; use a bounded migration/cutover plan.
- **Exit:** fresh install and upgrade paths pass; imported users/sessions/audit counts and protected fields reconcile; restore drill succeeds.

### Phase 4 — Identity, tenancy and audit
- Enforce server-side resource-level authorization for every API operation.
- Define admin, reseller and customer roles, tenant membership and resource ownership invariants.
- Harden login, password hashing, session lifecycle, CSRF, rate limits, MFA enrollment/recovery, session/device revocation and password reset.
- Ensure audit events capture actor, tenant, action, target, result, request/job ID and timestamp without secrets.
- **Exit:** negative cross-tenant/object/property/function authorization tests pass; session revocation is immediate; critical events are auditable.

### Phase 5 — Durable jobs and reconciliation
- Implement persisted job states, event history, idempotency keys, operation locks, retry classification, bounded exponential backoff, cancellation checkpoints and timeout handling.
- Track desired vs observed state and last verification.
- Recover safely after worker/host restart; never promise exactly-once side effects across external systems.
- **Exit:** crash-after-side-effect, timeout, retry, duplicate request and conflicting operation tests pass.

### Phase 6 — Privileged host agent
- Keep the API unprivileged and use a protected local Unix socket.
- Use typed versioned operations only; no arbitrary shell, Docker exec, executable path or environment passthrough.
- Validate caller identity, operation policy, tenant/resource ownership, filesystem roots, timeouts, output limits and protocol versions in the agent itself.
- Harden systemd units using supported sandboxing settings; test permissions against real operations before enabling restrictions.
- **Exit:** unauthorized caller/operation fails closed; agent restarts and interrupted jobs are safe; no public agent listener exists.

### Phase 7 — Website lifecycle vertical slice
- Deliver one complete flow: create site, assign owner/path, validate network and proxy config, start workload, health-check, inspect logs/status, stop/restart, update and delete.
- Keep all changes staged and validated; preserve last-known-good proxy config; report partial completion honestly.
- **Exit:** disposable E2E demonstrates lifecycle and recovery with tenant isolation.

### Phase 8 — DNS and hybrid SSL
- Implement provider-neutral DNS, certificate issuer and edge-TLS interfaces.
- Cloudflare: scoped tokens, zone discovery, safe DNS CRUD, proxy status, verification, rate-limit/retry handling and audit.
- SSL: edge certificate status, Origin CA lifecycle for proxied origins, Let's Encrypt ACME for direct/DNS-only, DNS-01 wildcard support, renewal, expiry monitoring and safe deployment.
- Never enable Full (strict) before hostname coverage and origin certificate verification; never disable TLS validation as a workaround.
- **Exit:** proxied, DNS-only, wildcard, renewal outage, mismatched certificate, propagation delay and token failure tests pass.

### Phase 9 — Runtime and database hosting
- Support explicitly selected Python and Tomcat versions with deterministic build/deploy, health checks, logs, restart policies and resource limits.
- Provision customer databases with per-tenant credentials and least-privilege grants; secrets never enter browser-visible payloads.
- Keep workload networking private by default, publish only ingress ports, block access to control-plane secrets/sockets and define egress policy.
- **Exit:** runtime isolation, quota enforcement, deployment rollback and cross-tenant attack tests pass.

### Phase 10 — Backup, restore and disaster recovery
- Back up site files, database data, configuration metadata and control-plane state consistently.
- Validate archive paths/types/links; stage restore; verify checksums; preflight space/ownership; preserve current target; recover partial failures.
- Encrypt off-host backups, separate keys from archives, configure retention and run scheduled restore drills.
- **Exit:** restore tests recover a working site and panel state; interrupted restore does not silently corrupt the original target.

### Phase 11 — Professional UI and product completeness
- Responsive accessible layouts; consistent loading/empty/error states; clear job progress and actionable errors.
- Admin: servers, users, tenants, security, system status, audit and global policy.
- Reseller/customer: tenant-scoped sites, domains, DNS, SSL, runtimes, databases, files, backups and usage.
- Replace mock/demo states with API-backed data or label unsupported capabilities explicitly.
- Generate/validate clients from OpenAPI where practical; add contract tests.
- **Exit:** keyboard/mobile UX review, API contract tests and role-based E2E pass.

### Phase 12 — Operations and production hardening
- Reproducible installer, config validation, systemd service identities, least privilege, upgrades, migrations, rollback and version reporting.
- Observability: structured redacted logs, health/readiness, queue/host metrics, disk/inode alarms, certificate expiry and backup alerts.
- Performance baselines for API latency, memory/CPU, job throughput, site startup and restore time on the actual VPS class.
- Independent security review and threat-model closure.
- **Exit:** production readiness checklist is evidenced; no unresolved critical security finding; backup and rollback drills demonstrated.

### Phase 13 — Multi-server expansion (after single-node release)
- Register remote agents, rotate/revoke agent identity, report capabilities/health, schedule work by server, and handle disconnection and version skew.
- Add cross-server placement and migration only after one-node behavior is stable.
- **Exit:** network partition, agent replacement, stale capabilities and server migration tests pass.

## 7. Definition of done for every change

1. Contract and authorization reviewed.
2. Tests cover success, denial and failure/recovery paths.
3. No secrets or customer data added to repository/logs.
4. `git diff --check`, lint, type checks, tests, vet/build and relevant security scans pass, or blockers are explicitly recorded.
5. Documentation, OpenAPI and migration notes updated.
6. Change is isolated in a focused commit on the feature branch.
7. GitHub Actions run is inspected; the PR receives a milestone summary and known limitations.
8. No production deployment, service restart, firewall/SSH change or migration without the deployment gate.

## 8. Resource/performance policy

- Avoid Redis, Kubernetes, a service mesh and separate microservices for the first single-node release.
- Bound Go concurrency, subprocesses, DB connections, upload sizes, logs, backup jobs and per-tenant resources.
- Use multi-stage, digest-pinned production images where images are built; minimize image layers and remove build tools from runtime images.
- Keep frontend bundle size and third-party dependencies measured; use the existing lockfile/package manager consistently.
- Benchmark rather than guessing; performance claims need repeatable measurements.
- Prefer boring supported components and explicit failure behavior over custom cryptography or custom protocol complexity.

## 9. Release blockers

- Unrestricted privileged command path or public agent socket.
- Cross-tenant access or unsafe path/restore behavior.
- Secrets/private keys exposed in logs, APIs, artifacts or source control.
- Invalid or destructive migration without backup and recovery path.
- TLS silently downgraded or origin certificate mismatch ignored.
- Unverified backup restoration or no documented panel recovery.
- CI status unknown or failures suppressed.
- No disposable end-to-end lifecycle evidence.
- Critical security finding unresolved.

## 10. Research references

- OWASP ASVS 5.0: https://owasp.org/projects/asvs
- OWASP API Security Top 10 (2023): https://owasp.org/www-project-api-security/
- NIST SSDF SP 800-218: https://csrc.nist.gov/pubs/sp/800/218/final
- PostgreSQL version support: https://www.postgresql.org/support/versioning/
- Docker Engine security: https://docs.docker.com/engine/security/
- systemd execution sandboxing: https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html
- Cloudflare API token permissions: https://developers.cloudflare.com/fundamentals/api/reference/permissions/
- Cloudflare SSL modes: https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/
- Let's Encrypt challenge types: https://letsencrypt.org/docs/challenge-types/
- GitHub Actions secure use: https://docs.github.com/en/actions/reference/security/secure-use
