---
configured: false
interval: 10
timeout: 30
description: "My crew work loop"
---

# Crew Work Loop

> ⚠️ Set `configured: true` in the frontmatter above to activate this loop.
> Run with: `crew loop`

## What to do each cycle

Describe what your crew should do every time the loop wakes up. Be specific —
the more context you give, the better your crew performs.

Examples:
- Check for new messages in a Teams channel and summarize action items
- Review recent pull requests and flag anything needing attention
- Run a health check on staging and report anomalies
- Scan the inbox for anything that needs a response today

<!-- Replace this section with your actual loop instructions. -->

## Monitoring (optional)

If you want your crew to watch external channels, enable monitor capabilities:

```bash
crew loop --monitor-email --monitor-teams
```

## Personality (optional)

If your crew has a specific voice or style, describe it here so each cycle
stays consistent.

Example: "Be concise. Use bullet points. Flag blockers clearly."

## Tips

- **Be specific.** Vague prompts produce vague results.
- **Set boundaries.** Tell the crew what NOT to do (e.g., "Don't send messages to anyone but me").
- **Start small.** Begin with one task per cycle, then expand.
- **Use frontmatter.** `interval` controls how often the loop runs. `timeout` caps each cycle.
