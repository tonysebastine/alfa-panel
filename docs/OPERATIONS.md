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
