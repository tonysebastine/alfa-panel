# Production Operations

## Required environment

Set:

- PANEL_JWT_SECRET: at least 32 random bytes;
- PANEL_ADMIN_USERNAME;
- PANEL_ADMIN_PASSWORD_BCRYPT;
- PANEL_TOTP_SECRET.

Example password-hash generation with Apache htpasswd:

    htpasswd -bnBC 12 "" 'CHANGE-ME' | tr -d ':\\n'

Generate the TOTP secret with a trusted authenticator/provisioning workflow and store it as a protected secret.

## Host hardening

Recommended controls:

- Debian/Ubuntu security updates enabled;
- vendor-supported Docker Engine;
- nftables/UFW default-deny inbound policy;
- SSH keys and restricted administration;
- Fail2ban or equivalent for SSH and panel authentication;
- NTP/time synchronization;
- encrypted off-host backups;
- log rotation and retention.

## Verification

    cd go-src && go test ./...
    cd go-src && go vet ./...
    docker network inspect panel-network
    docker inspect <container> --format '{{json .HostConfig.PortBindings}}'
    docker inspect <container> --format '{{json .HostConfig.CapDrop}}'
    docker inspect <container> --format '{{json .HostConfig.SecurityOpt}}'

Expected workload posture: no public port binding, ALL in CapDrop, and no-new-privileges:true.

## Incident response

1. Disable the affected site.
2. Preserve audit and application logs.
3. Rotate panel credentials and JWT/TOTP secrets if authentication may be compromised.
4. Rotate affected application secrets.
5. Snapshot evidence before destructive cleanup.
6. Rebuild from a trusted image/source.
7. Restore only verified data.
8. Record root cause, affected tenants and remediation.

## Backup requirement

Back up site data, panel metadata, certificates/ACME state where appropriate, and configuration. Test restoration on a separate environment at least quarterly for production deployments.


## Production install

Use deploy/install.sh on a supported Linux host with Docker and Go 1.26+. The installer creates separate API and privileged-agent systemd services. Configure /etc/alfa-panel/api.env before starting them. The API should remain bound to localhost and be exposed through the reverse proxy.

Required production secrets include PANEL_JWT_SECRET, PANEL_MASTER_KEY, PANEL_ADMIN_USERNAME, PANEL_ADMIN_PASSWORD_BCRYPT, and PANEL_TOTP_SECRET. Do not commit these values.

## Service verification

- systemctl status alfa-panel-agent
- systemctl status alfa-panel-api
- test -S /run/alfa-panel/agent.sock
- curl http://127.0.0.1:8088/healthz
