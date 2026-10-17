# ALFA-PANEL Component Catalog

This catalog defines the expected module boundaries. It is a target design, not a statement that every module is currently implemented.

## Control plane and shared foundations

| Component | Responsibility | Main contract / acceptance |
|---|---|---|
| Configuration | Typed config, defaults, validation, secret references | Invalid/missing production config fails startup safely; no secret values logged |
| API transport | Versioned HTTP routes, request limits, pagination, errors | OpenAPI matches routes; consistent errors and request IDs |
| Authentication | Password verification, login, MFA, recovery, session lifecycle | Rate limits, safe hashes, immediate revocation, CSRF protections |
| Authorization | Roles, permissions, tenant/resource policy | Every resource operation checks actor + tenant + action; deny by default |
| Tenancy | Tenant, membership, reseller hierarchy and quotas | No cross-tenant reads/writes even with guessed IDs |
| Audit | Security and privileged operation events | Append-oriented, access-controlled, redacted and correlated with jobs |
| Persistence | PostgreSQL connection lifecycle, repositories, transactions | Migrations are versioned; constraints enforce invariants |
| Migration | bbolt export/import and schema upgrades | Dry-run, counts/checksums, no destructive implicit cutover |
| Job engine | Durable jobs, events, locks, retry/cancel/timeouts | Restart recovery and idempotent/reconciled operations |
| Reconciliation | Desired vs observed state | Drift visible; no unsafe automatic repeated destructive operation |
| Secrets | Provider/credential references, encryption and rotation | Least privilege, redaction, keys separated from encrypted data |
| Observability | Logs, metrics, traces/correlation, readiness | Bounded cardinality, no secrets, useful failure diagnostics |

## Privileged host operations

| Component | Responsibility | Main contract / acceptance |
|---|---|---|
| Agent protocol | Versioned typed request/response over local socket | Reject unknown version/operation/schema; no arbitrary shell interface |
| Agent authorization | Verify local caller and operation scope | Deny by default; agent revalidates API request assumptions |
| Filesystem manager | Site roots, ownership, uploads, safe deletion | Traversal/symlink/TOCTOU tests; no cross-site access |
| Workload manager | Docker lifecycle, network, volume, limits | No Docker socket in web/API/customer containers; least capabilities |
| Proxy manager | Render, validate, atomically apply, reload and recover | Bad config leaves last-known-good service active |
| Runtime manager | Python/Tomcat build/start/stop/restart/health/logs | Bounded resource use, deterministic deploy, explicit versions |
| Firewall manager | Narrow allow/deny policy operations | SSH recovery path tested; no unrestricted firewall arguments |
| Backup manager | Create, verify, restore, prune, replicate | Integrity, path safety, encryption, failure recovery |
| Service supervisor | Service health and controlled lifecycle | Timeouts, signal handling, no restart loops on shutdown |

## Hosting domain modules

| Component | Responsibility | Main contract / acceptance |
|---|---|---|
| Sites | Site lifecycle and desired/observed state | End-to-end create/update/stop/start/delete verified |
| Domains | Normalization, ownership proof, site bindings | Unique normalized names; ownership verified before external activation |
| DNS providers | Zone/record CRUD, proxy state, verification | Scoped tokens, idempotent changes, propagation-aware status |
| Certificate lifecycle | Issuance, renewals, deploy, expiry, revocation | Correct issuer per proxy mode; never silently weaken TLS |
| Edge TLS | Cloudflare edge certificate and SSL-mode inspection | Confirm coverage/activation before marking ready |
| Customer databases | Provisioning, credentials, grants, backup/restore | Per-tenant least privilege and secret-safe credential rotation |
| File manager | Tenant-scoped list/read/write/move/delete/upload | Bounded file sizes; safe paths; audit destructive operations |
| Deployment | Artifact staging, validation, activation and rollback | Checksum/provenance where available; failed deploy keeps prior version |
| Backup catalog | Backup metadata, retention and restore history | Verified backup state and explicit recovery status |
| Quotas/usage | Storage, CPU/memory/process/site/domain/job limits | Enforcement server-side; telemetry distinguishes observed and estimated data |
| Notifications | Job/security/expiry/backup alerts | Retry-safe delivery, user preferences, no secret content |

## Frontend modules

- Auth and account recovery; MFA and session/device management.
- Admin dashboard: server health, capacity, jobs, alerts and audit trail.
- Tenant/reseller management and permission views.
- Site list/detail and lifecycle controls.
- Domain/DNS records with proxy mode and propagation status.
- SSL inventory with issuer, hostname coverage, expiry, renewal history and errors.
- Python/Tomcat runtime deployment, logs, status and resource usage.
- Customer database provisioning and credential reset.
- File manager with path boundaries, upload progress and destructive confirmations.
- Backup inventory, verification, retention and restore preflight.
- Security/firewall interface restricted to authorized administrators.
- Settings, provider integrations, credential status and API contract version.
- Shared design system: responsive layouts, accessible controls, loading/empty/error states, keyboard navigation and clear destructive-operation confirmations.

## Delivery and operations modules

- Reproducible development/build environment and locked dependencies.
- CI: formatting, lint, type checks, unit/integration/E2E tests, security scans, systemd validation and SBOM.
- Release artifacts with checksums and version metadata.
- Installer and configuration validator; no implicit production install in CI.
- Versioned database migrations and bbolt migration utility.
- systemd units with reviewed least privilege and sandboxing.
- Health/readiness endpoints, structured logs, metrics and alert rules.
- Backup/restore and upgrade/rollback runbooks.
- Threat model, security verification matrix, dependency inventory, incident response and vulnerability reporting.

## Explicitly deferred until justified

Kubernetes, service mesh, Redis, multi-region orchestration, plugin marketplace, billing engine, domain registrar/reseller APIs, email hosting, arbitrary custom runtime execution, and general-purpose remote shell. These are not required for a high-quality first release and increase operational/security cost.
