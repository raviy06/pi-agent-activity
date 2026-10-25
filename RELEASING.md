# CI and npm releases

## PR contract

Every new extension PR must bump the package version. Synchronize `package.json`,
both root package-lock versions, and a dated CHANGELOG section. The prepared
version must be newer than the PR base. Only stable `MAJOR.MINOR.PATCH` release
versions are supported by this initial pipeline. Dependabot PRs also need a bump.

The aggregate **CI** check requires:
- ESLint, TypeScript checking, unit tests and build on Node 22.19/24 and Windows.
- Package identity/version/changelog checks and clean distribution build/pack.
- Model-free TUI smoke on Linux/macOS using published pi-minimal 0.2.3 and an
  immutable pinned fork API-provider fixture; no private npm credentials needed.
- Workflow actionlint and CodeQL for TypeScript/JavaScript and GitHub Actions.

PR jobs have read-only repository permissions except CodeQL SARIF upload. No
`pull_request_target`, npm secrets, publishing permissions or protected release
environment are used by PR code. Require aggregate CI on main and resolve review
conversations before merging.

## Distribution

The source stays private in npm metadata. `npm run build:pkg` creates `dist-pkg`
with compiled runtime modules, README, changelog, license and a publishable
manifest. Development scripts, tests, dev dependencies and node_modules are not
copied. Validate with:

```sh
npm ci --ignore-scripts
npm run lint
npm run typecheck
npm test
npm run build:pkg
npm run check:release -- --packed
npm pack ./dist-pkg --ignore-scripts
```

## Publishing flow

After **CI succeeds on a push to main**, Publish checks out that exact commit and
queues an `npm` environment deployment. Manual main-only dispatch supports retry,
but still verifies successful CI for the exact commit. The publisher reruns
validation/tests/build, checks scoped package identity, and queries the registry.
Only HTTP 404 means unpublished; auth/rate/server failures stop the workflow.
An existing version is not republished. A superseded main commit is rejected,
and a new publication must be newer than npm's current `latest` version, so
out-of-order CI completions cannot downgrade the npm dist-tag.

With environment approval, npm trusted publishing issues a short-lived token via
GitHub OIDC. Publication uses `--provenance --access public`. The GitHub release
is created as a **draft** with the exact version's nonempty changelog, then the
package tarball is uploaded and its name/state/size/SHA-256 verified before the
release is made public. This order supports GitHub's immutable releases. Write/id-token permissions exist
only in the main-only publish job. No registry-url placeholder npm token is used.

A failed publication can be retried from main after correcting account setup. If
npm accepted the version but GitHub draft creation/upload failed, a retry skips
npm and resumes the matching draft. A complete published release is verified
without mutation. An already-published immutable release with missing assets
cannot be repaired by uploading afterward: leave it intact and create a new
version. Never delete/retag an immutable release or overwrite a published version.

## Required owner setup

These are account settings, not granted by workflow YAML:

1. Confirm control of npm scope `@raviy06` and establish the package if npm requires
   an initial authorized publication before trusted-publisher configuration.
2. Configure the npm trusted publisher with:
   - GitHub owner: `raviy06`
   - Repository: `pi-agent-activity`
   - Workflow filename: `release.yml`
   - Environment: `npm`
3. Protect GitHub environment `npm` with an owner reviewer and main-only deployment.
4. Merge only after CI/review; approve the pending release deployment once npm is
   configured. Do not bypass the failed check or expose a long-lived npm token.

No workflow was dispatched and no package was published merely by adding these
files. Local source visibility is public; source `private: true` prevents
accidental publication from the wrong directory.
