# Distributed Mesh

> ⚠️ **Experimental** — Crew is alpha software. APIs, commands, and behavior may change between releases.

**Try this to coordinate crews across machines:**
```
Set up a distributed mesh so my local crew can see the state of our CI crew
```

**Try this to sync remote crew state:**
```
Run sync-mesh.sh to pull the latest state from all remote crews
```

The distributed mesh lets crews on different machines coordinate through git and HTTP. Local crews read remote crew state after syncing it locally.

---

## What Is the Distributed Mesh?

One sentence:

> **"The filesystem is the mesh, and git is how the mesh crosses machine boundaries."**

Crew agents always read local files. When crews live on different machines, you need to materialize remote state locally before agents can see it. The distributed mesh does this through simple sync scripts — no servers, no federation protocols, no real-time messaging.

---

## Three Zones

| Zone | Description | Transport | Complexity |
|------|-------------|-----------|------------|
| **1 — Local** | Same host/filesystem | Direct file read | Zero |
| **2 — Remote-Trusted** | Different host, same org | `git pull` from shared repo | Zero new (git exists) |
| **3 — Remote-Opaque** | Different org, no shared auth | `curl` / HTTP fetch | ~15 lines of shell |

**Zone 1 (Local):** `cat ../crew-b/SUMMARY.md` works because the file is on your disk.

**Zone 2 (Remote-Trusted):** Crews push their state to a shared git repo. You pull from that repo to materialize their state locally.

**Zone 3 (Remote-Opaque):** A remote organization publishes their crew's `SUMMARY.md` at an HTTPS URL. You curl it to materialize locally.

---

## How It Works

### Agent Lifecycle with Sync

```
Agent wakes up
  │
  ├─ SYNC: git pull (Zone 2) + curl (Zone 3)
  ├─ READ: cat .mesh/**/state.md — all local now
  ├─ WORK: do the task
  ├─ WRITE: update own billboard, log, drops
  └─ PUBLISH: git push
```

Two new steps (SYNC, PUBLISH). Both are transport only — they move files, not change them.

### What Doesn't Change

- Agents read local files
- Write partitioning (each crew owns its directory)
- Pull-based coordination
- Eventual consistency
- LLMs as the relevance engine

### What Changes

Remote files need to arrive locally before agents can read them.

---

## Configuration

### The `mesh.json` File

One JSON file lists where to find each crew:

```json
{
  "crews": {
    "auth-crew": { "zone": "local", "path": "../auth-crew/.mesh" },
    "ci-crew": {
      "zone": "remote-trusted",
      "source": "git@github.com:our-org/ci-crew.git",
      "sync_to": ".mesh/remotes/ci-crew"
    },
    "partner-fraud": {
      "zone": "remote-opaque",
      "source": "https://partner.dev/crew-contracts/fraud/SUMMARY.md",
      "sync_to": ".mesh/remotes/partner-fraud"
    }
  }
}
```

### Sync Scripts

**Bash (requires `jq` and `git`):**

```bash
./sync-mesh.sh          # reads mesh.json, materializes remote state
```

**PowerShell (requires `git` only):**

```powershell
.\sync-mesh.ps1                        # default: reads mesh.json
.\sync-mesh.ps1 -MeshJson custom.json  # custom config path
```

Both scripts read `mesh.json`, pull from remote-trusted repos, curl from remote-opaque URLs, and materialize everything into `.mesh/remotes/`.

---

## Getting Started

### Prerequisites

- Git (with SSH or HTTPS auth configured)
- A shell (bash/zsh) or PowerShell
- `jq` ([github.com/jqlang/jq](https://github.com/jqlang/jq)) for the bash sync script (PowerShell script has no external dependencies)

### 1. Create the Mesh State Repo

The **mesh state repo** is a shared git repository where crews publish their current state. Nothing more — no code, no automation, no agents.

```bash
git clone git@github.com:our-org/crew-mesh-state.git
cd crew-mesh-state
```

### 2. Directory Structure

One directory per crew, each with a `SUMMARY.md`:

```
crew-mesh-state/
├── README.md          # What this repo is, who participates
├── auth-crew/
│   └── SUMMARY.md     # Auth crew's current state
├── ci-crew/
│   └── SUMMARY.md     # CI crew's current state
└── data-crew/
    └── SUMMARY.md     # Data crew's current state
```

### 3. Register Your Crew

Create your directory, write initial state, push:

```bash
mkdir my-crew
echo "# my-crew — active" > my-crew/SUMMARY.md
git add . && git commit -m "register my-crew" && git push
```

### 4. Configure `mesh.json`

Point at the shared repo:

```json
{
  "crews": {
    "ci-crew": {
      "zone": "remote-trusted",
      "source": "git@github.com:our-org/crew-mesh-state.git",
      "sync_to": ".mesh/remotes/ci-crew"
    }
  }
}
```

### 5. Run Your First Sync

```bash
./sync-mesh.sh          # reads mesh.json, materializes remote state
ls .mesh/remotes/       # should show directories per remote crew
```

> **Does the mesh state repo need its own Crew?** No. It's a shared data directory — a dumb pipe. No agents, no `.crew/` folder, no automation. Each crew pushes its own state via write partitioning. The repo is just a git-based rendezvous point. If you later want a "mesh observer" that monitors all crews, THAT would be its own Crew project — but it's not required and shouldn't be the state repo itself.

---

## Cross-Org Setup (Zone 3)

Remote org publishes `SUMMARY.md` at a URL. Add an HTTP entry to `mesh.json`:

```json
"partner-crew": {
  "zone": "remote-opaque",
  "source": "https://partner.dev/crew-contracts/SUMMARY.md",
  "sync_to": ".mesh/remotes/partner-crew"
}
```

---

## How This Relates to Other Features

### SubCrews (Streams)

**SubCrews** partition work **within a single repo** using GitHub labels (e.g., `team:ui`, `team:backend`). Each SubCrew runs in its own Codespace but shares the same git repository.

**Distributed mesh** coordinates **across repos and machines** — different organizations, different git repos, potentially no shared authentication.

SubCrews solve "one repo, many teams." Distributed mesh solves "many repos, many machines, crossing org boundaries."

See [SubCrews](./streams.md) for within-repo partitioning.

### Export & Import

**Export/import** is a **snapshot-based** knowledge transfer. You export a trained crew from one repo and import it into another. It's a one-time copy.

**Distributed mesh** is **continuous coordination**. Remote crews keep working; you sync their latest state every time your agents wake up.

Use export/import when you want to **clone a team**. Use distributed mesh when you want **live coordination**.

See [Multiple Crews scenario](../scenarios/multiple-crews.md) for when to use each approach.

---

## Upstream inheritance

The **upstream module** and the **distributed mesh** serve different coordination needs. They're complementary, not competing.

### Upstream: top-down inheritance

The `upstream/` module (configured in `upstream.json`) is for **hierarchical inheritance**. An organization-level or team-level crew pushes skills, decisions, wisdom, casting policy, and routing rules **down** to project crews. The consuming crew treats upstream content as **read-only** — it inherits conventions but doesn't write back.

### Mesh: peer coordination

The distributed mesh (configured in `mesh.json`) is for **peer-to-peer coordination**. Crews on equal footing share their **current state** with each other. Each crew **publishes** its own state (SUMMARY.md, billboards) and **reads** everyone else's. It's read-write for each crew's own directory.

### Use them together

A crew can have **both** an upstream (inheriting org conventions) **and** mesh peers (coordinating with sibling crews). For example:

- Your project crew inherits security policies and routing rules from the org-level crew via `upstream.json`
- The same crew coordinates with other project crews (auth, ci, data) via `mesh.json`

### Comparison

| | Upstream | Mesh |
|---|---|---|
| **Direction** | Top-down (parent → child) | Peer-to-peer (crew ↔ crew) |
| **Write model** | Read-only for consumer | Read-write (own directory) |
| **What flows** | Skills, decisions, wisdom, casting, routing | Current state (SUMMARY.md, billboards) |
| **Config file** | `upstream.json` | `mesh.json` |
| **Transport** | Local path / git clone / export JSON | Local path / git pull / HTTP curl |
| **Use case** | Org policies flowing into team projects | Sibling crews keeping each other informed |

### What neither does

Neither upstream nor mesh is about **agent-to-agent communication within a single crew**. That's the drop-box pattern — agents write to `decisions/inbox/`, read from `history.md`, and coordinate asynchronously within one `.crew/` directory.

---

## Skill scope

When you ask an agent to set up a distributed mesh, the skill produces three things:

1. **`mesh.json` config file** — defines crews, zones, and sync sources
2. **A decision entry** — records why you configured the mesh this way
3. **Sync scripts** — copies pre-built `sync-mesh.sh` and `sync-mesh.ps1` from the skill's bundled resources

The skill does **not** generate:

- ❌ Code (validators, helpers, utilities)
- ❌ Tests (the sync scripts are pre-tested templates)
- ❌ Custom sync scripts (bundled scripts are copied, not regenerated)

**Why this matters:** Deterministic skills give you consistent results. The sync scripts are bundled with the distributed-mesh skill. Agents shouldn't waste time generating validators or rewriting sync logic from scratch — they should copy the bundled scripts and configure your `mesh.json`.

If you need to customize the sync behavior, edit the copied scripts in your project root. The mesh skill's job ends at configuration.

---

## What We're NOT Building

- ❌ Federation protocol (git push/pull IS federation)
- ❌ Discovery service (mesh.json IS discovery)
- ❌ Auth system (git auth IS the auth system)
- ❌ A2A endpoints (no running servers)
- ❌ Schema versioning (markdown; LLM reads it)
- ❌ Real-time sync (agents are async; eventual consistency is correct)
- ❌ Message queues (agents aren't persistent; nobody's listening)
- ❌ CRDTs/conflict resolution (write partitioning; no conflicts possible)

---

## Sample Prompts

```
configure a distributed mesh with our CI crew on GitHub
```

Creates a `mesh.json` entry for a remote-trusted crew and runs the first sync.

```
sync remote crew state before starting work
```

Runs the sync script to materialize the latest state from all configured remote crews.

```
add a partner crew from https://partner.dev/crew-contracts/SUMMARY.md
```

Adds a remote-opaque Zone 3 entry to `mesh.json` for cross-org coordination.

```
show me what remote crews are configured
```

Lists all crews in `mesh.json` and their zones.
