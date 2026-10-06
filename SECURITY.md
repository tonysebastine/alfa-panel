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


## Current hardening controls

- Tenant Docker networks are dedicated per site; the previous shared tenant network is not used by generated workloads.
- The public API is designed to run unprivileged and delegates Docker/filesystem operations through the root-owned Unix-socket agent.
- Agent operations are typed; arbitrary container exec is disabled.
- TOTP secrets in the durable identity store are encrypted with AES-GCM using PANEL_MASTER_KEY.
- Refresh sessions are persisted and single-use rotated when the durable store is enabled.
- Site deletion requires an exact-domain confirmation and performs proxy/network cleanup.
- Backup restore creates a pre-restore backup before replacing site data.
- WAR uploads are staged by the unprivileged API and activated by the agent after size, magic-byte, path, and context validation.


## Infrastructure security additions

ACME issuance supports HTTP-01 and optional Cloudflare DNS-01. Cloudflare DNS tokens are accepted only by the privileged agent and written to an ephemeral 0600 credential file for certbot; they are never sent to the browser.

Host firewall mutations are typed allow/deny operations and are available only to the `system.manage` role. nftables rules are created without a shell and the managed input chain is initialized explicitly.

Backups can be encrypted with AES-256-CBC using OpenSSL before off-host replication. Off-host replication is refused unless encryption is enabled. The remote destination is passed as an argument to rclone, never through a shell.

The production UI consumes live metrics and authenticated log streams; simulated telemetry and demo credentials are not part of the production control path.
