---
"@blacklite/crew-sdk": patch
---

fix(sdk): export `addCrewStateGitignoreBlock` / `removeCrewStateGitignoreBlock` from the package root

`packages/crew-cli/src/cli/commands/migrate-backend.ts` imports these helpers from
`@blacklite/crew-sdk`, but they were never re-exported from `src/index.ts`. This broke
the CLI TypeScript build (`TS2305: has no exported member`). Re-export the two functions
(plus their marker constants) so the CLI compiles and the state-backend migration command
resolves them. Unblocks cutting a stable release that carries the #1378 inline-dispatch-gate fix.
