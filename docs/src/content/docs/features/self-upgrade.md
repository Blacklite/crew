# Self Upgrade

> ⚠️ **Experimental** — Crew is alpha software. APIs, commands, and behavior may change between releases.


**Try this to upgrade Crew CLI:**
```bash
crew upgrade --self
```

**Try this to upgrade to latest insider build:**
```bash
crew upgrade --self --insider
```

**Try this to upgrade both CLI and repo templates:**
```bash
crew upgrade --self && crew upgrade
```

Crew can upgrade itself to the latest stable or insider release, then automatically refresh your repo templates. Insider builds are published from the `dev` branch to the npm `insider` dist-tag.

---

## What It Does

`crew upgrade --self` upgrades the Crew CLI package to the latest stable release:

1. **Detects package manager** — auto-detects npm, pnpm, or yarn based on lock files
2. **Upgrades package** — runs `npm install -g @blacklite/crew@latest` (or pnpm/yarn equivalent)
3. **Runs repo upgrade** — automatically runs `crew upgrade` to apply new templates

**Result:**
- Crew CLI upgraded to latest stable
- Your repo's `.crew/` templates refreshed with latest version
- All in one command

---

## Usage

### Upgrade to Latest Stable

```bash
crew upgrade --self
```

**Output:**
```
🔄 Upgrading Crew CLI...
   Detected package manager: npm
   Running: npm install -g @blacklite/crew@latest

✅ Crew CLI upgraded to v0.8.0
   Running: crew upgrade (to refresh repo templates)

✅ Repo templates upgraded to v0.8.0
```

---

### Upgrade to Latest Insider

```bash
crew upgrade --self --insider
```

**What's different:**
- Installs latest **prerelease** version (e.g., `v0.9.0-insider.3`)
- May include experimental features
- Used for testing bleeding-edge changes

**Output:**
```
🔄 Upgrading Crew CLI (insider)...
   Detected package manager: pnpm
   Running: pnpm add -g @blacklite/crew@insider

✅ Crew CLI upgraded to v0.9.0-insider.3
   Running: crew upgrade (to refresh repo templates)

✅ Repo templates upgraded to v0.9.0-insider.3
```

---

## Package Manager Auto-Detection

Crew auto-detects your package manager based on lock files in the current directory:

| Lock File | Detected Manager | Command Used |
|-----------|------------------|--------------|
| `pnpm-lock.yaml` | pnpm | `pnpm add -g @blacklite/crew@latest` |
| `yarn.lock` | Yarn | `yarn global add @blacklite/crew@latest` |
| `package-lock.json` | npm | `npm install -g @blacklite/crew@latest` |
| *(none)* | npm (fallback) | `npm install -g @blacklite/crew@latest` |

**Notes:**
- Detection runs in current working directory
- If no lock file found, defaults to npm
- For insider upgrades, `@latest` becomes `@insider`

---

## Auto-Refresh Repo Templates

After upgrading the CLI, `crew upgrade --self` automatically runs `crew upgrade` to refresh your repo's `.crew/` templates. This ensures:

- Built-in skills updated to latest versions
- Charter templates refreshed
- Routing/team file patterns updated
- New features added (e.g., cleanup config, scratch dir, external state)

**Skip auto-refresh:**

If you want to upgrade the CLI without refreshing repo templates:

```bash
crew upgrade --self --skip-repo-upgrade
```

*(This flag may not exist yet — just showing the pattern. For now, self-upgrade always runs repo upgrade.)*

---

## Permission Errors

If upgrade fails with permission denied:

```
❌ Error: EACCES: permission denied
```

**Solutions:**

1. **Use sudo (macOS/Linux):**
   ```bash
   sudo crew upgrade --self
   ```

2. **Fix npm permissions:**
   ```bash
   # Option A: Change npm's default directory
   npm config set prefix ~/.npm-global
   export PATH=~/.npm-global/bin:$PATH

   # Option B: Fix permissions for /usr/local
   sudo chown -R $(whoami) /usr/local/lib/node_modules
   ```

3. **Use a version manager (recommended):**
   - **nvm** (Node Version Manager) — avoids global permission issues
   - **volta** — handles global installs without sudo

---

## Version Check

Check current Crew version:

```bash
crew --version
```

**Output:**
```
@blacklite/crew v0.8.0
```

Check if a newer version is available:

```bash
npm outdated -g @blacklite/crew
```

**Output:**
```
Package             Current  Wanted  Latest  Location
@blacklite/crew  0.7.5    0.8.0   0.8.0   global
```

---

## Checking Update Status Programmatically

```bash
crew update-check --json
```

Reads the same cache the background startup check maintains and prints it as structured JSON, without making a network call:

```json
{
  "current": "0.9.6-insider.2",
  "channel": "insider",
  "latest": "0.9.7-insider.1",
  "updateAvailable": true,
  "cacheAge": "PT2H15M",
  "checkedAt": "2026-05-26T12:00:00.000Z"
}
```

This gives editor extensions, coordinator instructions, and CI scripts a stable interface to query update status without replicating the OS-specific cache path or TTL-freshness logic themselves.

**Flags:**
- `--json` — structured output (shown above)
- `--refresh` — bypass the cache and re-fetch from the npm registry now

**Exit codes:** `0` (up to date, or no cache yet), `1` (update available), `2` (transport failure during `--refresh`)

**Default (non-JSON) output:**

```
Current: 0.9.6-insider.2 (insider channel)
Latest:  0.9.7-insider.1
Update available. Run `crew upgrade --self` to install.
```

Honors `CREW_NO_UPDATE_CHECK=1` — exits `0` with no output (or `{}` with `--json`) and never calls the network.

---

## Release Channels

| Channel | Tag | Description |
|---------|-----|-------------|
| **Stable** | `@latest` | Production-ready releases (e.g., `v0.8.0`) |
| **Insider** | `@insider` | Prerelease builds for testing (e.g., `v0.9.0-insider.3`) |

**When to use insider:**
- You want to test upcoming features
- You're contributing to Crew development
- You need a bug fix before the next stable release

**When to use stable:**
- Production use
- You want predictable, tested releases
- You follow semantic versioning

---

## Workflow

**Typical upgrade workflow:**

1. **Check current version:**
   ```bash
   crew --version
   ```

2. **Upgrade CLI to latest stable:**
   ```bash
   crew upgrade --self
   ```

3. **Verify new version:**
   ```bash
   crew --version
   ```

4. **Repo templates auto-refreshed** — no extra step needed

---

## Notes

- Self-upgrade requires network access to npm registry
- Self-upgrade modifies global npm packages — may require elevated permissions
- Repo upgrade (template refresh) runs automatically after successful CLI upgrade
- If CLI upgrade fails, repo upgrade is skipped
- Insider builds may have breaking changes — read release notes before upgrading

---

## Sample Prompts

```
crew upgrade --self
```

Upgrades Crew CLI to latest stable and refreshes repo templates.

```
crew upgrade --self --insider
```

Upgrades Crew CLI to latest insider/prerelease build.

```
crew --version
```

Checks current Crew CLI version.

```
npm outdated -g @blacklite/crew
```

Checks if a newer version is available without upgrading.
