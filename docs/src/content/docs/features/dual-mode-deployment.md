---
title: Dual-Mode Deployment — Pod-Aware Capabilities
description: Run Crew in either agent-per-node or crew-per-pod deployment modes with pod-specific machine capability manifests, controlled by CREW_POD_ID and CREW_DEPLOYMENT_MODE env vars.
---

# Dual-Mode Deployment — Pod-Aware Capabilities

> ⚠️ **Experimental** — Crew is alpha software. APIs, commands, and behavior may change between releases.

Dual-mode deployment extends [Capability Routing](/crew/docs/features/capability-routing/) to support both classic single-machine setups and modern containerized/Kubernetes deployments where multiple Crew pods may share an organization's workload — each with potentially different machine capabilities.

It introduces two environment variables and a pod-specific manifest lookup pattern so the same Crew config can run identically in either deployment shape.

---

## The two deployment modes

| Mode | What it means | Capability manifest |
|------|---------------|---------------------|
| **`agent-per-node`** (default) | One Crew instance per machine; the machine's capabilities are the crew's capabilities | `.crew/machine-capabilities.json` (shared) |
| **`crew-per-pod`** | Multiple Crew pods may run on different machines/containers, each with potentially different capabilities | `.crew/machine-capabilities-{podId}.json` (pod-specific) with fallback chain |

Choose the mode via the `CREW_DEPLOYMENT_MODE` environment variable:

```bash
# Classic single-machine setup (default)
export CREW_DEPLOYMENT_MODE=agent-per-node

# Kubernetes / multi-pod setup
export CREW_DEPLOYMENT_MODE=crew-per-pod
export CREW_POD_ID=worker-1
```

If neither is set, the SDK defaults to `agent-per-node` for backward compatibility.

---

## Environment variables

### `CREW_DEPLOYMENT_MODE`

| Value | Behavior |
|-------|----------|
| `agent-per-node` | Single shared `machine-capabilities.json` |
| `crew-per-pod` | Pod-specific manifests with fallback chain |
| (unset) | Same as `agent-per-node` |

### `CREW_POD_ID`

Pod identifier used to construct the pod-specific manifest path. Required when `CREW_DEPLOYMENT_MODE=crew-per-pod`; ignored otherwise.

```bash
CREW_POD_ID=worker-1          # → .crew/machine-capabilities-worker-1.json
CREW_POD_ID=gpu-pool-node-3   # → .crew/machine-capabilities-gpu-pool-node-3.json
```

---

## The fallback chain (crew-per-pod mode)

When `CREW_DEPLOYMENT_MODE=crew-per-pod` AND `CREW_POD_ID` is set, the SDK looks up capabilities in this order:

1. **`.crew/machine-capabilities-{podId}.json`** — pod-specific (highest priority)
2. **`.crew/machine-capabilities.json`** — shared fallback for capabilities that apply to all pods
3. **`~/.crew/machine-capabilities.json`** — user-home fallback (rarely useful in container deployments)
4. **`null`** — opt-out; capability routing falls back to label-only routing

The first manifest that exists is loaded; the search stops there (no merging). If you need different pods to see different capability sets, give each its own pod-specific file. If you need a shared baseline plus pod-specific additions, merge at the deployment-config level (Helm, Kustomize, etc.) — the SDK doesn't merge automatically.

---

## SDK programmatic access

The new exports from `@blacklite/crew-sdk/ralph/capabilities`:

```typescript
import {
  getDeploymentMode,
  getPodId,
  type DeploymentMode,
} from '@blacklite/crew-sdk/ralph/capabilities';

const mode: DeploymentMode = getDeploymentMode();  // 'agent-per-node' | 'crew-per-pod'
const podId: string | undefined = getPodId();       // e.g. 'worker-1', or undefined
```

These are pure env-var readers. They don't cache or memoize — each call reads `process.env` directly so changes between reads are visible.

---

## Typical Kubernetes deployment shape

In a KEDA-scaled deployment (see [KEDA Scaling](/crew/docs/features/keda-scaling/)), each scaled pod gets a unique `CREW_POD_ID` from the pod's name or hash:

```yaml
# Deployment env block
env:
  - name: CREW_DEPLOYMENT_MODE
    value: crew-per-pod
  - name: CREW_POD_ID
    valueFrom:
      fieldRef:
        fieldPath: metadata.name
```

The pod's mounted volume contains per-pod manifests baked in by the image build or pulled from a ConfigMap, e.g.:

```
/app/.crew/
├── machine-capabilities.json           # shared baseline (CPU, memory)
├── machine-capabilities-gpu-pool-node-1.json   # extends baseline with GPU
├── machine-capabilities-gpu-pool-node-2.json   # same shape
└── machine-capabilities-cpu-pool-node-1.json   # no GPU declaration
```

Pods scheduled onto GPU nodes load a manifest declaring GPU capability; pods on CPU-only nodes get a manifest without GPU. Ralph's issue dispatcher routes `needs:gpu`-labeled work only to pods with the GPU capability.

---

## Limitations

- **No automatic pod discovery.** The SDK reads env vars to know who it is; it doesn't enumerate sibling pods or coordinate work distribution. That's the deployment orchestrator's job (KEDA, scheduler).
- **No central capability registry.** Pods don't publish their capabilities back to anything; each pod evaluates issues against its own loaded manifest independently. If you need a central view, your orchestrator must aggregate.
- **Manifest changes require redeploy or restart.** The fallback lookup happens on capability resolution; manifest content is read from disk each time but the manifest *path* is decided by env vars set at process start.

---

## See also

- [Capability Routing](/crew/docs/features/capability-routing/) — the broader machine-capability system
- [KEDA Scaling](/crew/docs/features/keda-scaling/) — autoscaling Crew pods on demand
- [Labels](/crew/docs/features/labels/) — `needs:*` label conventions used for capability matching
