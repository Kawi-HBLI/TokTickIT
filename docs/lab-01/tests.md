# Lab 1 — Test Plan and Evidence

All test files live under server/tests/lab-01/ and client/tests/lab-01/.

| # | Tool | Test | Result |
|---|------|------|--------|
| 1 | Supertest | GET /api/health returns 200, status=ok | ✅ Pass |
| 2 | Supertest | GET /api/categories returns 4 seeded categories in id order | ✅ Pass |
| 3 | Vitest | Heading renders | ✅ Pass |
| 4 | Vitest | Success state shows Online + category list | ✅ Pass |
| 5 | Vitest | Error state shows Offline + message | ✅ Pass |

## Server Test Output (`npm test` in `server/`)

```
 RUN  v2.1.9

 ✓ tests/lab-01/health.test.ts (1 test) 14ms
 ✓ tests/lab-01/categories.test.ts (1 test) 35ms

 Test Files  2 passed (2)
      Tests  2 passed (2)
```

## Client Test Output (`npm test` in `client/`)

```
 RUN  v2.1.9

 ✓ tests/lab-01/App.test.tsx (3 tests) 195ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```
