# ADR-0001: PostgreSQL as the primary control-plane store

- **Status:** Accepted for implementation planning
- **Date:** 2026-10-16

## Context

The current implementation uses bbolt for user, session and audit records. The product direction requires multi-user tenant relationships, durable jobs, richer resource relationships, queryable audit/job history and a future multi-server control plane. PostgreSQL is the previously selected primary database.

## Decision

Use PostgreSQL for primary control-plane persistence. Use the standard `database/sql` interface with a maintained PostgreSQL driver such as pgx's `database/sql` adapter unless a documented requirement favors the native pgx API. Use embedded, versioned SQL migrations. Keep the job queue in PostgreSQL initially; do not add Redis without measured need.

## Migration constraints

- Preserve the existing bbolt database and source files.
- Build an explicit dry-run/export/import migration tool with counts and integrity checks.
- Preserve password hashes and encrypted MFA fields without logging or exposing their contents.
- Detect collisions and invalid records before writes.
- Require a verified backup and rollback plan before cutover.
- Do not run production migration automatically as part of installer startup.
- Remove bbolt only after successful cutover, reconciliation, backup verification and an explicitly reviewed follow-up change.

## Consequences

PostgreSQL adds a managed service and some memory/operational overhead but provides transactions, constraints, durable queue semantics and stronger multi-tenant relational modeling. Connection pools, statement timeouts, health checks and backup retention must be bounded for a small VPS.

## Alternatives considered

- Continue bbolt only: lightweight, but not the chosen primary-store direction for the multi-user control plane.
- Use both databases indefinitely: rejected because dual-write consistency and recovery complexity are not justified.
- Add PostgreSQL plus Redis immediately: rejected because PostgreSQL can host the initial durable job queue and the extra service increases operational cost.
