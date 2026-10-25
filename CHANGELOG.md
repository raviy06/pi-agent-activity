# Changelog

## [0.1.4] - 2026-10-25

### Changed

- Update @types/node from 24.13.3 to 24.19.2, retaining the Node 24 development
  typing baseline instead of adopting Node 26 APIs ahead of supported runtimes.
- Runtime support remains Node >=22.19.0 with the existing Node 22/24 checks.

## [0.1.1] - 2026-10-25

### Added

- Pull-request CI with lint, typecheck, tests, package validation, runtime smoke,
  workflow validation, CodeQL, and a stable aggregate CI check.
- Version/lockfile/changelog checks, including a mandatory version bump over the PR base.
- A clean publishable distribution build that excludes development scripts and tests.
- CI-gated main-only npm trusted-publishing workflow with provenance, registry
  idempotency checks, protected environment approval, and GitHub release notes.
- Dependency update automation and documented publication prerequisites.

No npm publication or live installation implied by this source change.

## [0.1.0] - 2026-10-24

### Added

- Read-only public RPC bridge from activityStatus v1 to pi-minimal's activity slot.
- Correlated requests, capability detection, single-flight refresh, lifecycle-hint
  coalescing and session-safe cleanup.
- Bounded transient state with success retention, explicit notice dismissal,
  unknown/disconnected behavior, and optional own-usage metrics.
- `/activity` details, refresh, plain, static and dismiss controls.
- Tests for data projection, retention, RPC lifecycle, host readiness, scheduling,
  runtime read-only enforcement, and non-TUI no-op behavior.

Private development checkpoint; no npm publication or live installation implied.
