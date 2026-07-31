---
"@blacklite/crew-cli": patch
"@blacklite/crew-sdk": patch
---

Fix shellcheck SC2086 in workflow templates: quote `$GITHUB_OUTPUT` redirects

All `>> $GITHUB_OUTPUT` (and `>> $GITHUB_STEP_SUMMARY`) redirects in `run:` blocks were unquoted, causing `actionlint` + shellcheck to report SC2086 (double quote to prevent globbing and word splitting) in downstream repos that run `actionlint` in their CI. The fix is purely additive quotes around the variable; behaviour is unchanged.

**Files fixed:**
- `.crew-templates/workflows/crew-heartbeat.yml` (canonical source — synced to all mirrors)
- `templates/workflows/crew-heartbeat.yml`
- `packages/crew-cli/templates/workflows/crew-heartbeat.yml`
- `packages/crew-sdk/templates/workflows/crew-heartbeat.yml`

**Crew's own workflows also fixed:**
- `.github/workflows/crew-heartbeat.yml`
- `.github/workflows/crew-repo-health.yml`
- `.github/workflows/crew-ci.yml`

A new `.github/workflows/crew-workflow-lint.yml` CI job is added to lint both Crew's own workflows and the bundled templates on every PR and push to `dev`/`main`, so this class of regression is caught before it ships.
