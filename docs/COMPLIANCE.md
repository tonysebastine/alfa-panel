# Security & Compliance Control Mapping

ALFA Panel is designed to support security programs; it is not itself a compliance certification.

| Control area | ALFA Panel control |
|---|---|
| OWASP ASVS authentication | bcrypt password verification, TOTP, short-lived access tokens, refresh rotation |
| OWASP ASVS input validation | domain, runtime, resource and JVM/Python entrypoint validation |
| OWASP ASVS logging | audit-log architecture and operational retention requirements |
| CIS Docker | non-root workloads, dropped capabilities, no-new-privileges, resource limits, restricted port exposure |
| NIST CSF Identify | site/runtime/resource metadata and operational documentation |
| NIST CSF Protect | authentication, isolation, firewall guidance and secret handling |
| NIST CSF Detect | health/status/logging hooks and audit requirements |
| NIST CSF Respond | disable/rotate/rebuild incident procedure |
| NIST CSF Recover | backup and restore procedures |
| GDPR security principle | least privilege, tenant isolation goals, controlled secrets, logging and retention guidance |
| SOC 2 security criteria | access control, change control, monitoring and recovery controls documented in the project |

## Operator responsibility

The operator remains responsible for lawful processing, privacy notices, data residency and retention, customer contracts/DPAs, physical infrastructure, patching, backup encryption and key management, access reviews, incident notification and independent audit evidence.

Do not advertise ALFA Panel as SOC 2, ISO 27001, GDPR-certified, or otherwise certified solely because these mappings exist.
