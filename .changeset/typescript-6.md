---
"@blacklite/crew-sdk": patch
"@blacklite/crew-cli": patch
---

chore: upgrade to TypeScript 6 (closes #1325, #1328, #1334)

- Bumps `typescript` devDependency from `^5.7.0` to `^6.0.3` in packages/crew-sdk, packages/crew-cli, and the root workspace.
- Bumps `@typescript-eslint/parser` in root from `^8.57.1` to `^8.61.1` to align with the already-present `^8.61.1` plugin (v8.61.1 peer-deps cover `typescript >=4.8.4 <6.1.0`).
- Adds `"types": ["node"]` to `compilerOptions` in `packages/crew-cli/tsconfig.json` and `packages/crew-sdk/tsconfig.json`; TypeScript 6 no longer auto-injects Node globals without an explicit `types` declaration.
