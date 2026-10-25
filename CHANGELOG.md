# Changelog

## [Unreleased]

### Fixed

- Create GitHub Releases as drafts, upload and verify package assets, then publish
  them. This avoids HTTP 422 when immutable releases reject post-publication uploads.
- Verify asset name, upload state, size and SHA-256 digest before finalization;
  resume matching drafts safely and avoid modifying published immutable releases.
- Resolve actual lightweight/annotated tag commits before and after publication;
  reject source mismatches without retagging instead of trusting creation metadata.
- Require exactly one nonempty, dated changelog section for the release version,
  handling LF/CRLF and rejecting missing, duplicate or empty notes before publication.

### Changed

- Ordinary PRs no longer require version bumps or new changelog entries. Prepare
  grouped versioned notes in a dedicated release PR.
- Skip publication and npm approval for main pushes without a package-version
  change; verify release intent from successful same-commit main CI before the
  protected publisher runs. OIDC publication remains unverified end-to-end.

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
