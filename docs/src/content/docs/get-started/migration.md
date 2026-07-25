# Migration Guide

> Upgrading from an older version of Crew? Find your scenario below.

## Table of Contents

- [Quick Reference](#quick-reference)
- [Scenario 1: Brand New User](#scenario-1-brand-new-user)
- [Scenario 2: Upgrading from v0.5.4 Beta](#scenario-2-upgrading-from-v054-beta)
- [Scenario 3: Already on v0.8.x via npm](#scenario-3-already-on-v08x-via-npm)
- [Scenario 4: Was Using @bradygaster/create-crew](#scenario-4-was-using-bradygastercreate-crew)
- [Scenario 5: Was Using npx github: Distribution](#scenario-5-was-using-npx-github-distribution)
- [Scenario 6: My .crew/ Directory Broke After Upgrading](#scenario-6-my-crew-directory-broke-after-upgrading)
- [Scenario 7: I Have .ai-team/ from an Older Version](#scenario-7-i-have-ai-team-from-an-older-version)
- [Scenario 8: Using Crew in CI/CD](#scenario-8-using-crew-in-cicd)
- [Scenario 9: Using Crew SDK Programmatically](#scenario-9-using-crew-sdk-programmatically)
- [Troubleshooting](#troubleshooting)
- [Rolling Back](#rolling-back)
- [What's New in v0.8.18+](#whats-new-in-v0818)

---

## Quick Reference

| Before | After |
|--------|-------|
| `npx github:Blacklite/crew` | `npm install -g @blacklite/crew-cli` |
| `@bradygaster/create-crew` | `@blacklite/crew-cli` |
| `.ai-team/` directory | `.crew/` directory |
| v0.5.4 (beta) | v0.8.x (latest) |

---

## Scenario 1: Brand New User

Never used Crew before? Start here.

### Prerequisites

- Node.js 20 or later
- npm 9 or later
- A GitHub account with [GitHub Copilot](https://github.com/features/copilot) enabled
- `gh` CLI authenticated (`gh auth status` should show you logged in)

### Install

```bash
npm install -g @blacklite/crew-cli
```

### Initialize a Project

```bash
cd your-project
crew init
```

This creates a `.crew/` directory with your team roster, agent charters, and configuration files.

### Verify

```bash
crew doctor
```

All checks should pass. You're ready to go.

---

## Scenario 2: Upgrading from v0.5.4 Beta

This is the biggest jump. The codebase was rewritten in TypeScript, the `.crew/` directory format changed, and the command structure was reorganized.

### What Changed

- **TypeScript rewrite:** Entire codebase ported from JavaScript to TypeScript (strict mode).
- **`.crew/` directory format:** v0.5.4 format is incompatible with v0.8.x. You must reinitialize.
- **Command structure:** Some commands were reorganized or renamed.
- **SDK API:** The public API changed significantly if you were using Crew programmatically.
- **Distribution:** npm-only. The `npx github:` install path is gone.

### Step-by-Step

1. **Back up your existing `.crew/` directory:**

   ```bash
   cp -r .crew .crew-v054-backup
   ```

2. **Uninstall the old version (if globally installed):**

   ```bash
   npm uninstall -g @bradygaster/create-crew
   ```

3. **Install the latest version:**

   **Global (recommended):**
   ```bash
   npm install -g @blacklite/crew-cli@latest
   ```

   **Local (project dependency):**
   ```bash
   npm install --save-dev @blacklite/crew-cli@latest
   ```

4. **Remove the old `.crew/` directory:**

   ```bash
   rm -rf .crew
   ```

5. **Reinitialize:**

   ```bash
   crew init
   ```

6. **Manually migrate your customizations.** Open `.crew-v054-backup/` and copy over any custom agent charters, team roster entries, or decisions into the new `.crew/` directory structure. The new format uses Markdown files (not JSON).

   **Which files are safe to copy?** Use this table as your guide:

   | Directory/File | Safe to copy? | Notes |
   |---|---|---|
   | `agents/` | ✅ Yes — all of them | Including scribe and ralph — their history is valuable context |
   | `decisions.md` | ✅ Yes | Your team's decision ledger |
   | `decisions/` | ✅ Yes | Including `inbox/` |
   | `routing.md` | ✅ Yes | Your routing rules |
   | `team.md` | ✅ Yes | Your roster |
   | `skills/` | ✅ Yes | Learned patterns |
   | `casting/` | ❌ Skip | Regenerated automatically on first run |
   | `templates/` | ❌ Skip | Overwritten by `crew upgrade` |
   | `log/` | 🟡 Optional | Diagnostic archive — no harm copying, but not required |
   | `orchestration-log/` | 🟡 Optional | Same as log/ |

7. **Validate with crew doctor:**

   ```bash
   crew doctor
   ```

   This runs 9 checks to ensure your `.crew/` directory is healthy after migration. All checks should pass before you consider the upgrade complete.

### Key Format Changes

| v0.5.4 | v0.8.x (latest) |
|--------|---------|
| `.crew/config.json` | `.crew/team.md` (Markdown with YAML front matter) |
| JSON decision log | `.crew/decisions.md` (append-only Markdown) |
| Flat agent files | `.crew/agents/{name}/charter.md` (directory per agent) |

---

## Scenario 3: Already on v0.8.x via npm

If you're already on any v0.8.x release, this is a simple update.

**Global:**
```bash
npm install -g @blacklite/crew-cli@latest
```

**Local:**
```bash
npm install --save-dev @blacklite/crew-cli@latest
```

Verify the version:

```bash
crew --version
```

Expected output: the latest `0.8.x` version (e.g., `0.8.25`).

Your `.crew/` directory is compatible — no reinitialization needed.

---

## Scenario 4: Was Using @bradygaster/create-crew

The `@bradygaster/create-crew` package is deprecated. It has been replaced by `@blacklite/crew-cli`.

### Switch

```bash
# Remove the old package
npm uninstall -g @bradygaster/create-crew

# Install the new package
npm install -g @blacklite/crew-cli
```

The `crew` command works the same way. Your `.crew/` directory does not need to change if you were already on v0.8.x.

---

## Scenario 5: Was Using npx github: Distribution

The GitHub-native distribution (`npx github:Blacklite/crew`) has been removed. Crew is now distributed exclusively through npm.

### Switch

Replace any usage of:

```bash
# OLD — no longer works
npx github:Blacklite/crew
```

With:

```bash
# NEW
npm install -g @blacklite/crew-cli
```

Then use the `crew` command directly. If you had this in scripts or CI/CD workflows, update every reference — see [Scenario 8: Using Crew in CI/CD](#scenario-8-using-crew-in-cicd).

---

## Scenario 6: My .crew/ Directory Broke After Upgrading

If `crew doctor` fails or commands error out after upgrading, follow these steps.

### 1. Back Up

```bash
cp -r .crew .crew-broken-backup
```

### 2. Reinitialize

```bash
rm -rf .crew
crew init
```

### 3. Restore Customizations

Manually copy custom agent charters, roster entries, and decisions from `.crew-broken-backup/` into the new `.crew/` structure.

### 4. Verify

```bash
crew doctor
```

If `crew doctor` still fails, see [Troubleshooting](#troubleshooting) below.

---

## Scenario 7: I Have .ai-team/ from an Older Version

Very early versions of Crew used `.ai-team/` instead of `.crew/`. This directory name is no longer recognized.

### Migrate

1. **Back up:**

   ```bash
   mv .ai-team .ai-team-backup
   ```

2. **Initialize the new directory:**

   ```bash
   crew init
   ```

3. **Manually migrate** any custom configuration from `.ai-team-backup/` into `.crew/`.

4. **Update `.gitignore`** if it references `.ai-team/`:

   ```bash
   # Remove .ai-team references, add .crew if needed
   ```

5. **Verify:**

   ```bash
   crew doctor
   ```

---

## Scenario 8: Using Crew in CI/CD

If you run Crew in GitHub Actions or another CI/CD system, update your workflow files.

### Before (old distribution)

```yaml
- name: Run Crew
  run: npx github:Blacklite/crew
```

### After (v0.8.x)

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20'

- name: Install Crew
  run: npm install -g @blacklite/crew-cli@latest

- name: Run Crew
  run: crew doctor && crew status
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Key CI/CD Notes

- Set `GITHUB_TOKEN` as an environment variable. Crew requires it for GitHub Copilot operations.
- Pin to a specific version (e.g., `@0.8.25`) in CI to avoid surprise upgrades, or use `@latest` to stay current.
- Node.js 20+ is required. Update your workflow's `setup-node` action if needed.

---

## Scenario 9: Using Crew SDK Programmatically

If you import Crew as a library, the package name and API have changed.

### Package Change

```bash
# OLD
npm install @blacklite/crew

# NEW
npm install @blacklite/crew-sdk
```

### Import Change

```typescript
// OLD
import { Crew } from '@blacklite/crew';

// NEW
import { Crew } from '@blacklite/crew-sdk';
```

### API Notes

- The SDK is now fully typed (TypeScript strict mode).
- Some methods were renamed or reorganized. Check the [SDK documentation](../reference/sdk.md) for the current API surface.
- If you were relying on internal/undocumented APIs, those have changed. Stick to the documented public API.

---

## Troubleshooting

### `command not found: crew`

Crew isn't on your PATH. Install globally:

```bash
npm install -g @blacklite/crew-cli
```

### npm 404 error when installing

You may be using the old package name. Use the correct name:

```bash
npm install -g @blacklite/crew-cli
```

If the package genuinely isn't published yet, check [the npm page](https://www.npmjs.com/package/@blacklite/crew-cli) or the [GitHub repo](https://github.com/Blacklite/crew) for release status.

### Permission denied during install

Use this approach (do **not** use `sudo npm`):

```bash
# Fix npm prefix (recommended)
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
```

### Old format not recognized

Your `.crew/` directory is from an older version. Back it up and reinitialize:

```bash
cp -r .crew .crew-old-backup
rm -rf .crew
crew init
```

### GITHUB_TOKEN issues

Crew needs a valid GitHub token for Copilot operations. Verify:

```bash
echo $GITHUB_TOKEN
```

If empty, authenticate via the GitHub CLI:

```bash
gh auth login
export GITHUB_TOKEN=$(gh auth token)
```

### gh auth issues

Make sure the GitHub CLI is installed and authenticated:

```bash
gh auth status
```

If not authenticated:

```bash
gh auth login
```

### Wrong version installed

Check your installed version:

```bash
crew --version
```

If it shows an old version:

```bash
npm uninstall -g @blacklite/crew-cli
npm install -g @blacklite/crew-cli@latest
```

### Team roster gone after upgrade

Your `.crew/team.md` may not have survived the upgrade. Reinitialize and restore from backup:

```bash
crew init
# Then manually restore roster entries from your backup
```

### `crew doctor` fails

Run it to see which checks fail:

```bash
crew doctor
```

Common causes:

- Missing `.crew/` directory — run `crew init`.
- Missing `GITHUB_TOKEN` — see [GITHUB_TOKEN issues](#github_token-issues) above.
- Node.js too old — upgrade to Node.js 20+.
- Corrupted `.crew/` files — back up, remove, and reinitialize.

### Node.js version too old

Crew requires Node.js 20 or later. Check your version:

```bash
node --version
```

If below 20, upgrade via [nodejs.org](https://nodejs.org/) or your preferred version manager:

```bash
# nvm
nvm install 20
nvm use 20

# fnm
fnm install 20
fnm use 20
```

---

## Rolling Back

If you need to downgrade to a previous v0.8.x release:

```bash
npm install -g @blacklite/crew-cli@0.8.17
```

### Warnings

- **The GitHub-native distribution (`npx github:Blacklite/crew`) is permanently removed.** You cannot roll back to that install method.
- **`.crew/` directory format changed between v0.5.4 and v0.8.x.** If you roll back to v0.5.4, your current `.crew/` directory will not be compatible. Keep backups.
- Rolling back within the v0.8.x line (e.g., 0.8.25 to 0.8.24) should be safe — the `.crew/` format is stable across v0.8.x releases.

---

## What's New in v0.8.18+

Key improvements since the migration from v0.5.4 beta:

- **Remote Crew Mode:** `crew link`, `crew init --mode remote`, and dual-root path resolution for team identity directories.
- **`crew doctor`:** 9-check setup validation with clear pass/fail output.
- **npm-only distribution:** Simpler install, semantic versioning, stable and insider channels.
- **TypeScript strict mode:** Full type safety across the SDK and CLI.
- **Semver fix:** Version format now follows the semver spec (`0.8.x-preview.N`).
- **Node 22+ compatibility:** ESM import fixes for vscode-jsonrpc (v0.8.23+).
- **Casting system:** Universe-based agent naming with persistent registries (v0.8.25+).

For the full list of changes, see the [CHANGELOG](https://github.com/Blacklite/crew/blob/main/CHANGELOG.md).

---

*Questions or issues? Open an issue at [github.com/Blacklite/crew](https://github.com/Blacklite/crew/issues).*
