---
"@blacklite/crew-cli": patch
"@blacklite/crew-sdk": patch
---

Pin GitHub Actions references to full-length commit SHAs across the 10 shipped workflow templates (`crew-ci.yml`, `crew-docs.yml`, `crew-heartbeat.yml`, `crew-issue-assign.yml`, `crew-label-enforce.yml`, `crew-preview.yml`, `crew-promote.yml`, `crew-release.yml`, `crew-triage.yml`, `sync-crew-labels.yml`), matching the same hardening already applied to this repo's own `.github/workflows/`. Orgs that require SHA-pinned actions as a supply-chain policy can now use `crew init`/`crew upgrade` without hand-patching every installed workflow. Closes #1441.
