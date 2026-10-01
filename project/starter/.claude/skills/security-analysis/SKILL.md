---
description: Security-focused review guidance for common web and API vulnerabilities
---

# Security Analysis

## Review checklist

- Validate inputs and sanitize outputs.
- Avoid command injection and unsafe serialization.
- Protect secrets using environment variables.
- Review auth and authorization paths before shipping.

## Common issues

- Open redirects
- SQL injection vectors
- missing authorization checks
- insecure random generation

## Output

Report critical and high-severity security issues with clear remediation notes.
