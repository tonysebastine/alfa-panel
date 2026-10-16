# ALFA-PANEL

Production-oriented multi-tenant hosting control plane for Tomcat and Python workloads.

## Engineering plan

- [Master implementation plan](docs/MASTER_IMPLEMENTATION_PLAN.md)
- [Component catalog](docs/COMPONENT_CATALOG.md)
- [Security acceptance matrix](docs/SECURITY_ACCEPTANCE_MATRIX.md)
- [PostgreSQL architecture decision](docs/decisions/ADR-0001-postgresql-control-plane.md)

These documents describe the target design and required evidence; they do not claim that every listed feature is implemented or certified.

## Architecture

- Next.js frontend, suitable for Cloudflare Pages/static edge hosting.
- Go API running unprivileged.
- Root-owned typed Unix-socket agent for Docker, filesystem, proxy, ACME, firewall and backup operations.
- Dedicated Docker network per site.
- OpenResty/Nginx ingress with ACME support.
- Embedded bbolt identity/session/audit store.
- Hardened containers: non-root, read-only rootfs, dropped capabilities, no-new-privileges, resource limits and no published application ports.

## Production setup

1. Install Docker, Go 1.26+, OpenResty proxy infrastructure and required ACME tooling.
2. Configure /etc/alfa-panel/api.env from .env.example.
3. Use deploy/install.sh as root.
4. Verify systemctl status alfa-panel-agent alfa-panel-api, the ACME and backup timers, and curl http://127.0.0.1:8088/healthz.
5. Put the frontend behind HTTPS and configure PANEL_CORS_ORIGINS with the exact frontend origin.
6. If using Cloudflare Tunnel, expose only the localhost API listener through the tunnel; never expose the agent socket.

## Security

Read SECURITY.md before production deployment.

## API

OpenAPI contract: docs/openapi.yaml.

## Operations

Read docs/OPERATIONS.md and docs/ROADMAP.md.

## Deployment rollback

Installations are versioned under /opt/alfa-panel/releases. To roll back, run deploy/rollback.sh as root or specify an exact release directory.

## Release status

This branch is a production-hardening candidate. Host-level E2E, CI health, image digest pinning for every production image, and independent security review remain release gates. No certification claim is made by this repository.
