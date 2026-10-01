---
description: TypeScript-specific guidance for types, generics, and safer application design
---

# TypeScript Patterns

## Review checklist

- Prefer specific types over `any`.
- Use discriminated unions and readonly when helpful.
- Guard against nullable values early.
- Prefer interfaces and utility types for shared contracts.

## Example

```ts
const value: string | null = input;
if (!value) {
  throw new Error('Missing value');
}
```

## Output

Provide type-safety issues with suggested code changes.
