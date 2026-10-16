# ALFA-PANEL Security Acceptance Matrix

Use this as a testable control checklist, informed by OWASP ASVS 5.0, OWASP API Security Top 10 and NIST SSDF. This is an engineering checklist, not a certification claim.

| ID | Control | Required evidence | Release gate |
|---|---|---|---|
| AUTH-01 | Passwords use an appropriate adaptive password hash | Unit/integration tests; no plaintext storage | Blocker |
| AUTH-02 | Sessions expire, rotate and revoke correctly | Tests for expiry, logout, password change and revocation | Blocker |
| AUTH-03 | MFA enrollment, verification and recovery are secure | Positive/negative tests; recovery codes protected | Blocker for customer exposure |
| AUTH-04 | Login and recovery endpoints are rate-limited | Automated abuse/rate-limit tests | High |
| AUTHZ-01 | Tenant/resource authorization is checked server-side | Cross-tenant IDOR tests across every resource family | Blocker |
| AUTHZ-02 | Object properties and privileged functions are allowlisted | Mass-assignment and role escalation tests | Blocker |
| AUTHZ-03 | Reseller hierarchy cannot access sibling/unrelated tenants | Hierarchy matrix tests | Blocker |
| API-01 | Request body, size, path, enum and content type are validated | Fuzz/negative tests and request-limit tests | High |
| API-02 | SSRF is prevented in URL-fetching/health-check features | Private/link-local/metadata target tests; DNS rebinding analysis | Blocker where URL fetch exists |
| API-03 | CORS, CSRF, trusted proxies and forwarded headers are strict | Config and integration tests | Blocker |
| API-04 | Sensitive operations have idempotency and abuse controls | Duplicate-request and rate-limit tests | High |
| AGENT-01 | Agent exposes typed operations only | Contract tests prove no generic command/exec endpoint | Blocker |
| AGENT-02 | Agent socket is local, protected and caller-authorized | Socket permission and unauthorized-caller tests | Blocker |
| AGENT-03 | Agent fails closed on bad config/protocol/authorization | Startup and malformed-request tests | Blocker |
| FS-01 | Site roots are tenant-scoped and path-safe | Traversal, symlink, hard-link and race tests | Blocker |
| FS-02 | Deletion and archive extraction cannot escape target roots | Malicious archive and destructive-path tests | Blocker |
| WORKLOAD-01 | Workloads run non-root with least capabilities | Container inspection and integration tests | Blocker for untrusted workloads |
| WORKLOAD-02 | Docker socket and panel secrets are inaccessible to tenants | Negative container tests | Blocker |
| WORKLOAD-03 | CPU, memory, PID, storage and network policy are bounded | Resource exhaustion tests | High |
| TLS-01 | HTTPS is validated end-to-end; no insecure fallback | Certificate/hostname/mode integration tests | Blocker |
| TLS-02 | Cloudflare Full (strict) only enabled after origin validation | State-transition tests | Blocker |
| TLS-03 | DNS-only sites use publicly trusted certificates | External trust/hostname verification in test environment | Blocker |
| SECRET-01 | Tokens, passwords, TOTP secrets and private keys are not logged or returned | Secret scanning plus log/response tests | Blocker |
| SECRET-02 | Provider credentials are scoped and rotatable | Permission docs and rotation/revocation tests | High |
| DB-01 | SQL is parameterized; tenant constraints/indexes are reviewed | Static review, integration tests and query tests | Blocker |
| DB-02 | Migrations are versioned and fail safely | Empty DB, upgrade, interrupted migration and restore tests | Blocker |
| JOB-01 | Jobs survive worker restart and recover partial operations | Failure injection and duplicate-job tests | High |
| JOB-02 | Retries are bounded and distinguish permanent errors | Timeout/rate-limit/permission tests | High |
| BACKUP-01 | Backup integrity and path validation are enforced | Corrupt/truncated/malicious archive tests | Blocker |
| BACKUP-02 | Restore preserves existing data or enters explicit recovery state | Interrupted restore, disk-full and permission-failure tests | Blocker |
| BACKUP-03 | Off-host backups are encrypted and keys are separated | Configuration validation and restore drill | Blocker for off-host replication |
| AUDIT-01 | Privileged and security operations are recorded with actor/target/outcome | Audit integration tests | High |
| AUDIT-02 | Logs are protected against injection and secret disclosure | Malformed input and redaction tests | High |
| CI-01 | Workflow actions/dependencies are pinned or locked and permissions minimized | Workflow review and CI evidence | High |
| CI-02 | Security scans and tests cannot be silently skipped to obtain green status | Workflow negative test/review | Blocker |
| OPS-01 | systemd units use supported least-privilege sandboxing | systemd-analyze verify plus host E2E | High |
| OPS-02 | Installer/upgrade validates prerequisites and has recovery steps | Disposable install/upgrade/rollback tests | Blocker |
| OPS-03 | Resource, disk and certificate alerts are exercised | Failure-injection alert tests | High |
| SUPPLY-01 | Build outputs include version, checksums and SBOM | CI artifacts verified | High |
| SUPPLY-02 | Production image references are immutable/digest-pinned | Image manifest review and scanner evidence | High |

## Test execution rules

- Each test records the code revision, environment, expected result and observed result.
- Use disposable environments for Docker, proxy, database, restore and firewall tests.
- Never run destructive failure-injection tests against the production host.
- Mark controls `pass`, `fail`, `blocked` or `not applicable`; do not infer a pass from missing evidence.
- Critical findings must be fixed or explicitly block release; no compliance certification is implied by this matrix.
