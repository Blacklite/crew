# Troubleshooting

Common issues and fixes for Crew installation and usage.

---

## Quick fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `crew: command not found` | Crew CLI not installed or not in PATH | Run `npm install -g @blacklite/crew-cli` or use `npx @blacklite/crew-cli` |
| `No .crew/ directory found` | Not in a git repo or Crew not initialized | Run `git init` then `npx crew init` |
| `Cannot find agent "{name}"` | Agent doesn't exist in `.crew/agents/` | Check `.crew/team.md` for roster, or re-run casting |
| `gh: command not found` | GitHub CLI not installed | Install from [cli.github.com](https://cli.github.com/) then `gh auth login` |
| `Node.js version error` | Node.js version below v20 | Upgrade Node.js to v20+ (see below) |

---

## `npx github:Blacklite/crew` appears to hang

**Problem:** Running the install command shows a frozen npm spinner. Nothing happens.

**Cause:** npm resolves `github:` package specifiers via `git+ssh://git@github.com/...`. If no SSH agent is running (or your key isn't loaded), git prompts for your passphrase on the TTY — but npm's progress spinner overwrites the prompt, making it invisible. This is an npm TTY handling issue, not a Crew bug.

**Fix (choose one):**

1. **Start your SSH agent first** (recommended):
   ```bash
   eval "$(ssh-agent -s)"
   ssh-add
   ```
   Then re-run `npx github:Blacklite/crew`.

2. **Disable npm's progress spinner** to reveal the prompt:
   ```bash
   npx --progress=false github:Blacklite/crew
   ```

3. **Use HTTPS instead of SSH** by configuring git:
   ```bash
   git config --global url."https://github.com/".insteadOf git@github.com:
   ```

**Reference:** [#30](https://github.com/Blacklite/crew/issues/30)

---

## `gh` CLI not authenticated

**Problem:** GitHub Issues, PRs, Ralph, or Project Boards commands fail with authentication errors.

**Cause:** The `gh` CLI isn't logged in, or is missing required scopes.

**Fix:**

1. Log in:
   ```bash
   gh auth login
   ```

2. If using Project Boards, add the `project` scope:
   ```bash
   gh auth refresh -s project
   ```

3. Verify:
   ```bash
   gh auth status
   ```

---

## Authentication fails on cross-org repos

**Problem:** Crew agents hit authentication errors when working with repositories across personal GitHub and GitHub Enterprise Managed Users (EMU) organizations.

**Cause:** The `gh` CLI and git credentials are tied to one account at a time. When you switch contexts between personal and EMU repos, the active account may not have access to the target repository.

**Fix:**

1. Use `gh auth switch` to toggle between authenticated accounts:
   ```bash
   gh auth status
   gh auth switch --user <username>
   ```

2. Add account mappings to `.github/copilot-instructions.md` so Crew agents know which account to use for which repos.

3. Configure git credential helpers per host or organization.

See [Cross-organization authentication](./cross-org-auth) for detailed setup instructions.

---

## Node.js version too old

**Problem:** `npx github:Blacklite/crew` fails with an engine compatibility error, or Crew behaves unexpectedly.

**Cause:** Crew requires Node.js 20.0.0 or later (LTS), enforced via `engines` in `package.json`.

**Fix:**

```bash
node --version
```

If below v20, upgrade to the latest LTS:
- **nvm (macOS/Linux):** `nvm install --lts && nvm use --lts`
- **nvm-windows:** `nvm install lts && nvm use lts`
- **Direct download:** [nodejs.org](https://nodejs.org/)

---

## Crew agent not appearing in Copilot

**Problem:** After install, `crew` doesn't show up in the `/agent` (CLI) or `/agents` (VS Code) list in GitHub Copilot.

**Cause:** The `.github/agents/crew.agent.md` file may not have been created, or Copilot hasn't refreshed its agent list.

**Fix:**

1. Verify the file exists:
   ```bash
   ls .github/agents/crew.agent.md
   ```
   If missing, re-run `npx github:Blacklite/crew`.

2. Restart your Copilot session — close and reopen the terminal or editor.

---

## Upgrade doesn't change anything

**Problem:** Running `npx github:Blacklite/crew upgrade` completes but nothing changes.

**Cause:** You may already be on the latest version, or npm cached an old version.

**Fix:**

1. Check current version in `.github/agents/crew.agent.md` (frontmatter `version:` field).

2. Clear npm cache and retry:
   ```bash
   npx --yes github:Blacklite/crew upgrade
   ```

---

## Windows-specific issues

**Problem:** Path errors or file operations fail on Windows.

**Cause:** Some shell commands assume Unix-style paths.

**Fix:** Crew's core uses `path.join()` for all file operations and is Windows-safe. If you see path issues:
- Use PowerShell or Git Bash (not cmd.exe)
- Ensure git is in your PATH
- Ensure `gh` CLI is in your PATH

---

## "⚠ crew pre-commit: refusing to commit two-layer state into the working tree"

**Problem:** A `git commit` is blocked with the message above.

**Cause:** You're on the `orphan` or `two-layer` backend, and one or more state files (`.crew/decisions.md`, `.crew/agents/*/history.md`, `.crew/casting/`, `.crew/routing/`) were staged for commit. These files belong on the `crew-state` orphan branch, not in your working branch. Something wrote them back to disk after the migration — a direct `fs.writeFile` call, an editor auto-save, or an external tool — and you staged them unintentionally.

**Recovery flow:**

1. **Unstage the state files:**
   ```bash
   git restore --staged .crew/decisions.md
   git restore --staged ".crew/agents/*/history.md"
   ```

2. **Check whether the orphan branch already has the content** (it should, if `crew sync` has run):
   ```bash
   git show crew-state:decisions.md
   git show crew-state:agents/<agent-name>/history.md
   ```

3. **If the working-tree copy contains new content not yet on the orphan branch**, lift it through Crew before deleting:
   ```bash
   crew memory write --file .crew/decisions.md
   ```

4. **Remove the working-tree copies:**
   ```bash
   # PowerShell
   Remove-Item .crew\decisions.md -ErrorAction SilentlyContinue
   Get-ChildItem .crew\agents -Recurse -Filter history.md | Remove-Item
   ```
   ```bash
   # bash
   rm -f .crew/decisions.md .crew/agents/*/history.md
   ```

5. **Commit normally** — the `post-commit` hook will call `crew sync --quiet` automatically:
   ```bash
   git commit -m "your commit message"
   ```

**When to use `CREW_SYNC_ACTIVE=1`:** Rarely. This env var bypasses both the pre-commit and post-commit hooks. It's intended for internal use by `crew sync` itself to prevent recursion. If you set it to unblock a commit, the state files will land in your working-branch history and appear in PRs — exactly what two-layer is designed to prevent. Use the recovery flow above instead.

---
