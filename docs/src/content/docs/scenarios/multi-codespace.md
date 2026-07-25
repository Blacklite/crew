# Multi-Codespace Setup with Crew SubCrews

> End-to-end walkthrough of running multiple Crew instances across Codespaces.

## Background: The Tetris Experiment

We validated Crew SubCrews by building a multiplayer Tetris game using 3 Codespaces, each running a separate SubCrew:

| Codespace | SubCrew | Label | Focus |
|-----------|--------|-------|-------|
| CS-1 | `ui-team` | `team:ui` | React game board, piece rendering, animations |
| CS-2 | `backend-team` | `team:backend` | WebSocket server, game state, matchmaking |
| CS-3 | `infra-team` | `team:infra` | CI/CD, Docker, deployment |

All three Codespaces shared the same repository. Each Crew instance only picked up issues matching its SubCrew's label.

## Setup Steps

### 1. Create the SubCrews config

In your repository, create `.crew/streams.json`:

```json
{
  "workstreams": [
    {
      "name": "ui-team",
      "labelFilter": "team:ui",
      "folderScope": ["src/client", "src/components"],
      "description": "Game UI and rendering"
    },
    {
      "name": "backend-team",
      "labelFilter": "team:backend",
      "folderScope": ["src/server", "src/shared"],
      "description": "Game server and state management"
    },
    {
      "name": "infra-team",
      "labelFilter": "team:infra",
      "folderScope": [".github", "docker", "k8s"],
      "workflow": "direct",
      "description": "Build and deploy pipeline"
    }
  ],
  "defaultWorkflow": "branch-per-issue"
}
```

### 2. Configure each Codespace

In `.devcontainer/devcontainer.json`, set the `CREW_TEAM` env var. For multiple configs, use [devcontainer features](https://containers.dev/features) or separate devcontainer folders:

**Option A: Separate devcontainer configs**

```
.devcontainer/
  ui-team/
    devcontainer.json    # CREW_TEAM=ui-team
  backend-team/
    devcontainer.json    # CREW_TEAM=backend-team
  infra-team/
    devcontainer.json    # CREW_TEAM=infra-team
```

**Option B: Set env var after launch**

```bash
export CREW_TEAM=ui-team
crew  # launches with SubCrew context
```

### 3. Label your issues

Create GitHub issues with the appropriate team labels:

```bash
gh issue create --title "Add piece rotation animation" --label "team:ui"
gh issue create --title "Implement matchmaking queue" --label "team:backend"
gh issue create --title "Add Docker compose for dev" --label "team:infra"
```

### 4. Launch Crew in each Codespace

Each Codespace runs `crew` normally. The SubCrew context is detected automatically:

```bash
# In Codespace 1 (CREW_TEAM=ui-team)
crew
# → Ralph only triages issues labeled "team:ui"
# → Agents only modify files in src/client, src/components

# In Codespace 2 (CREW_TEAM=backend-team)
crew
# → Ralph only triages issues labeled "team:backend"
# → Agents only modify files in src/server, src/shared
```

### 5. Monitor across SubCrews

Use the CLI from any Codespace to see all SubCrews:

```bash
crew subcrews status
```

<!-- Screenshot: SubCrews status output showing PRs per SubCrew -->
<!-- TODO: Add screenshot placeholder -->

## What Worked

- **Clear separation**: Each SubCrew had well-defined boundaries, minimizing merge conflicts
- **Parallel velocity**: 3x throughput vs. single-crew mode for independent work
- **Label-based routing**: Simple, uses existing GitHub infrastructure

## What Didn't Work (Yet)

- **Cross-SubCrew dependencies**: When the UI team needed a backend API change, manual coordination was required
- **Shared files**: `package.json`, `tsconfig.json`, and other root files caused occasional conflicts
- **No meta-coordinator**: No automated way to coordinate across SubCrews (future work)

## Lessons Learned

1. **Keep SubCrews independent** — design folder boundaries to minimize shared files
2. **Use branch-per-issue** — direct commits across SubCrews cause merge hell
3. **Label everything** — unlabeled issues get lost between SubCrews
4. **Start with 2 SubCrews** — add more once the team finds its rhythm
