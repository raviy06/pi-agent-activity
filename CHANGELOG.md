# Changelog

## [Unreleased]

### Changed

- Refreshes are now event-driven. After the capability `ping`, the companion subscribes to every change hint the provider advertises in that reply: the fork's coalesced `subagents:activity:changed` (`capabilities.activityEvents.event`) and the `events.childStatus`, `asyncStarted`, `asyncComplete`, `processTerminal` and `jobsChanged` names, the last added by upstream pi-subagents 0.83.0 (#3070). Names come from the reply, not a hardcoded list, so a renamed event cannot silently stop refreshes; malformed advertisements are ignored. With hints available the poll becomes a safety net at 10 s (active) / 30 s (idle) instead of 2 s / 10 s; without them the old cadence stays. Hints still only schedule a coalesced read of `status`; they never supply rows.

## [0.2.1] - 2026-10-25

Failed and stopped child rows now clear from the footer, and the companion is
verified against `@raviy06/pi-subagents` 0.83.0.

### Changed

- Document compatibility with the published `@raviy06/pi-subagents` 0.83.0 (the RPC `ping`/`status` contract this companion uses is unchanged) and the new optional activity fields, change event and run records it can adopt next. Smoke verified against the 0.83.0 bundle.
- Failed and stopped child rows now leave the footer sixty seconds after they are
  first observed instead of staying until dismissed. In practice they sat in error
  colour for the rest of the session (observed at 30 minutes) and competed with
  live failures. Successful completions still clear after ten seconds; paused and
  unknown rows still remain until dismissed because they may need the user.
  `/activity dismiss` continues to hide any finished row early.

## [0.2.0] - 2026-10-25

This batch includes the reviewed dependency and release-workflow updates since
published version 0.1.1. The companion's read-only runtime behavior is unchanged.

### Tooling

- Update ESLint from 10.11.0 to 10.13.0 and typescript-eslint from 8.70.1 to 8.72.0.
- Update Node 24 typings from 24.13.3 to 24.19.2 without adopting Node 26 APIs or
  changing the existing Node 22.19/24 runtime support.
- Upgrade TypeScript from 5.9.3 to supported 6.0.3. TypeScript 7 remains deferred
  because it is outside the parser's peer range; no peer constraints are bypassed.
- Upgrade checkout, setup-node and upload-artifact to v7 while preserving safe
  checkout defaults, read-only release detection and protected publication.

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
  protected publisher runs. Successful main CI and protected npm approval remain
  required; publication uses OIDC provenance and exact-source verification.

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
