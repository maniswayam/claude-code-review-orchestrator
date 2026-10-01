---
description: Performance and scalability review guidance for hot code paths
---

# Performance Optimization

## Review checklist

- Minimize repeated expensive work.
- Avoid unbounded loops and deep nested traversals.
- Batch or cache repeated computations.
- Watch for memory growth and large object churn.

## Output

Focus on root cause, impact, and the smallest safe optimization.
