# Security Policy

ALFA Panel is a hosting control plane. A compromise of the privileged node agent can compromise the host, so privileged operations are isolated from the browser-facing application.

Security boundaries include authenticated API access, short-lived access tokens, rotating refresh tokens, mandatory TOTP, bcrypt password verification, strict input validation, no arbitrary container command endpoint, non-root workloads, no-new-privileges, dropped Linux capabilities, read-only container roots where practical, resource limits, and audit-friendly lifecycle operations.

## Reporting a vulnerability

Do not disclose exploitable vulnerabilities in public issues. Report them privately to the repository owner with the affected version/commit, component, reproducible steps, impact, and suggested mitigation.

Never include real customer credentials, tokens, private keys, or personal data in a report.

## Production requirements

Before exposing the panel to customers:

- configure all PANEL_* secrets;
- terminate HTTPS at a trusted ingress;
- restrict panel administration by firewall/VPN where possible;
- run the node agent with minimum host permissions;
- never mount the Docker socket into the browser-facing application;
- use tenant-separated storage and encrypted off-host backups;
- enable centralized audit-log retention;
- patch the OS, Docker, Java, Python and base images;
- verify backups with restore tests.

This is a security policy and control description, not a certification.
