# hello-crew

Beginner sample for the Crew SDK that demonstrates how to locate or create a team directory, cast a themed team of agents from The Usual Suspects universe, onboard them with persistent identities, and verify that agent names remain consistent across multiple casts.

## Prerequisites

- Node.js >= 20
- npm
- The SDK must be built first: `cd ../../ && npm run build`

## Quick start

1. Install dependencies: `npm install`
2. Run the sample: `npm start`

## What you'll learn

- How to use `resolveCrew()` to find or create a `.crew/` directory
- How to cast a themed team from the Crew SDK universe system
- How to onboard each agent with a charter and history files
- How casting history provides deterministic, persistent agent identities

## How it works

The sample walks through five steps. First, it locates or creates a `.crew/` directory using `resolveCrew()`. Next, it uses the `CastingEngine` to create a team of four agents from The Usual Suspects universe, assigning them lead, developer, tester, and scribe roles based on their personalities. Then it onboards each agent by creating their individual agent directories and initializing their charter and history files. It displays the team roster in a formatted table showing each agent's name, role, and personality. Finally, it demonstrates the casting history system by casting the same team configuration twice and verifying that agent names match across both casts, proving the system is deterministic.

## Expected output

```
🎬 hello-crew — Crew SDK beginner sample

────────────────────────────────────────────────────────────
  Step 1 — Resolve .crew/ directory
────────────────────────────────────────────────────────────
✅ Created demo .crew/ at: /tmp/hello-crew-demo/.crew
   resolveCrew() → /tmp/hello-crew-demo/.crew

────────────────────────────────────────────────────────────
  Step 2 — Cast a team from "The Usual Suspects"
────────────────────────────────────────────────────────────
  Universe: The Usual Suspects
  Team size: 4

  🎭 Keyser — Lead
     Personality: Quietly commanding; sees the whole board before anyone else.

────────────────────────────────────────────────────────────
  Step 3 — Onboard agents
────────────────────────────────────────────────────────────
  ✅ Keyser — Lead
  ✅ McManus — Developer
  ✅ Fenster — Tester
  ✅ Verbal — Scribe

────────────────────────────────────────────────────────────
  Step 4 — Team roster
────────────────────────────────────────────────────────────
  Names match across casts: ✅ Yes

────────────────────────────────────────────────────────────
  Step 5 — Casting history (persistent names)
────────────────────────────────────────────────────────────
  Casting records: 2
  Names match across casts: ✅ Yes
```

## Key files

| File | Purpose |
|---|---|
| `index.ts` | Main demo script showcasing all five steps |
| `tests/hello-crew.test.ts` | Acceptance tests for casting and onboarding |
| `TEST-SCRIPT.md` | Manual test walkthrough |

## Next steps

- Check out the [knock-knock sample](../knock-knock/README.md) to see agents interact with live LLM responses
- Read the [Crew SDK documentation](../../README.md) for more details on the casting system
