# ALFA Panel Architecture

## Control plane

The system is split into:

1. Next.js control-plane UI.
2. Go node agent for privileged local operations.
3. Docker Engine for workload execution.
4. Ingress proxy as the only public application ingress.
5. Tomcat/Python tenant workloads.

The browser-facing application must never receive access to the Docker Unix socket.

## Site lifecycle

1. Validate domain, runtime and resource inputs.
2. Create the tenant directory.
3. Render Compose and proxy configuration.
4. Validate the rendered configuration.
5. Verify the managed Docker network.
6. Start the workload.
7. Verify state and health.
8. Publish status and audit information.

Failures must not leave partial secrets or unsafe paths behind.

## Runtime security

Default workload controls are non-root UID/GID, no-new-privileges, cap_drop ALL, no public ports, read-only root filesystems where practical, tmpfs for transient data, CPU/memory/PID limits, health checks, and controlled writable volumes.

Python dependencies are not installed on every container boot. Dependency installation should be an explicit deployment operation so runtime startup is deterministic and auditable.

## Privileged boundary

Operations capable of changing the host, Docker daemon, proxy configuration, certificates, firewall or tenant filesystem belong in the node-agent layer. These operations must use typed allowlisted actions rather than arbitrary shell strings.


## Privileged-operation boundary

The control plane is split into an unprivileged API and a root-owned agent:

Browser -> API (unprivileged) -> Unix socket -> panel-agentd (root) -> Docker/filesystem/proxy/backups.

The agent accepts typed operations only. Arbitrary shell execution is not a supported API or agent primitive.

## Tenant networking

Each site receives a deterministic, collision-resistant Docker bridge network derived from its validated domain. The reverse proxy is explicitly attached to that network; tenant containers are not placed on a shared tenant network and no application host ports are published.


## ACME filesystem contract

The host path `PANEL_ACME_WEBROOT` must be mounted read/write into the managed OpenResty container at `/var/www/letsencrypt`. `PANEL_ACME_SSLROOT` is the host certificate store and is mounted into the proxy container at the same path used by generated vhosts. The API never handles certificate private-key bytes.
