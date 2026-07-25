# Installation

> ⚠️ **Experimental** — Crew is alpha software. APIs, commands, and behavior may change between releases.

Crew coordinates AI agents in your repository by providing a structured workspace, routing rules, and agent templates. This article walks you through installing the Crew command-line interface (CLI), initializing Crew in your project, and validating the setup.

## Prerequisites

Before you install Crew, confirm you have the following:

- **[Node.js 20 or later](https://nodejs.org/en/download)** — verify by running `node --version`
- **[A Git repository](https://git-scm.com/)** (new or existing)
- **[GitHub Copilot](https://github.com/features/copilot)** — required for the VS Code agent workflow

## Installation methods

Crew provides three installation paths. Choose the one that matches your workflow.

| Method | Best for | Command |
| --- | --- | --- |
| [CLI (recommended)](#install-the-cli) | All projects, cross-platform | `npm install -g @blacklite/crew-cli` |
| [VS Code](#use-crew-in-vs-code) | Already using Copilot in VS Code | No install needed — uses CLI init |
| [SDK](#install-the-sdk) | Building tools on top of Crew | `npm install @blacklite/crew-sdk` |

## Install the CLI

To install the Crew CLI globally:

1. Run the following command:

   ```bash
   npm install -g @blacklite/crew-cli
   ```

2. Verify the installation:

   ```bash
   crew --version
   ```

### Use npx (no install)

For one-off use, run Crew without a global install:

```bash
npx @blacklite/crew-cli init
```

## Use Crew in VS Code

Crew integrates with GitHub Copilot in VS Code. The `.crew/` directory created by the CLI works identically in VS Code — same agents, same decisions, same memory.

**Tip:** Initialize your team with the CLI (`crew init`), then open the project in VS Code to keep working with the same crew.

## Install the SDK

If you're building tools on top of Crew, install the SDK as a project dependency:

1. Run the following command:

   ```bash
   npm install @blacklite/crew-sdk
   ```

2. Import what you need in your code:

   ```typescript
   import { defineConfig, loadConfig, resolveCrew } from '@blacklite/crew-sdk';
   ```

The SDK gives you typed configuration, routing, model selection, and the full agent lifecycle API. For details, see the [SDK Reference](https://blacklite.github.io/crew/docs/reference/sdk/).

## Update Crew

To update the Crew CLI to the latest version:

```bash
npm install -g @blacklite/crew-cli@latest
```

If you also use the SDK, update it separately:

```bash
npm install @blacklite/crew-sdk@latest
```

## Initialize Crew in your project

To initialize Crew in your repository:

1. Navigate to your project root:

   ```bash
   cd <your-project-root>
   ```

2. Run the init command:

   ```bash
   crew init
   ```

3. Confirm Crew created the following files and directories:

   - `.github/agents/crew.agent.md` — coordinator agent definition
   - `.crew/` — Crew workspace directory

**Expected output:**

```
✅ Crew installed.
   .github/agents/crew.agent.md — coordinator agent
   .crew/templates/ — 11 template files

Open GitHub Copilot and select Crew from the agent list.
```

## Validate the installation

To confirm Crew is working correctly:

1. Run the status command:

   ```bash
   crew status
   ```

   You can also use `npx crew status` if you skipped the global install.

2. Check that `.crew/` contains the expected files:

   ```bash
   ls .crew/
   ```

   The directory should include `team.md`, `routing.md`, `decisions.md`, and an `agents/` subdirectory.

## Optional: Personal crew (cross-project)

A personal crew lets any project on your machine inherit a shared agent configuration without running `crew init` in each repository.

To create a personal crew:

```bash
crew init --global
```

Crew writes the personal configuration to a platform-specific path:

| Platform | Path |
| --- | --- |
| Linux | `~/.config/crew/` |
| macOS | `~/Library/Application Support/crew/` |
| Windows | `%APPDATA%\crew\` |

## Optional: Typed configuration

You can create a `crew.config.ts` file at your project root to enable typed configuration. This step is optional — Crew works with sensible defaults without it.

```typescript
import { defineConfig } from '@blacklite/crew-sdk';

export default defineConfig({
  agents: {
    dir: '.github/agents',
  },
  crew: {
    dir: '.crew',
  },
});
```

## Troubleshoot

### `crew: command not found`

The npm global binary directory is not in your `PATH`.

**macOS and Linux** — Add the npm global bin to your shell profile:

```bash
export PATH="$(npm bin -g):$PATH"
```

**Windows** — Add the npm global bin directory to your `PATH` environment variable:

```powershell
$env:PATH += ";$(npm bin -g)"
```

Then restart your terminal and re-run `crew --version`.

### `Cannot find .crew/ directory`

Crew was not initialized in the current directory. Run one of the following:

- For the current project: `crew init`
- For a personal crew shared across projects: `crew init --global`

### Version mismatch between CLI and SDK

If Crew reports a version conflict between the CLI and the software development kit (SDK), update both packages:

```bash
npm install -g @blacklite/crew-cli@latest
npm install @blacklite/crew-sdk@latest
```
