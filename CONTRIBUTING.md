# Contributing

Thanks for your interest. The project is pre-alpha and the API is still moving.

- **Open an issue first** for anything larger than a small fix.
- **Keep the core domain-free.** Anything about restaurants, SaaS or any business belongs in `examples/`.
- **Keep `compose` pure.** No I/O, no clock reads (time comes in as `now`).
- **No real data.** Fixtures must be fictitious. Replay datasets stay out of git.
- **Add tests.** A behavior change needs a test that fails without it. Coverage minimums are enforced, and the test files
  are type-checked.
- **Changing what a package exports?** The public API test in that package will fail. Update its list on purpose and add a
  changeset (`pnpm changeset`).

## Before pushing

```sh
pnpm install
pnpm typecheck
pnpm build       # the packages import each other through dist/, so build before testing
pnpm test
```

The Redis integration tests are skipped unless `REDIS_URL` is set (CI sets it). To run them locally:

```sh
docker run -d -p 6379:6379 redis:7
REDIS_URL=redis://localhost:6379 pnpm test
```

Tests never call the real Jev API. If you change the TypeSafe decider, try it by hand with your own key
(`TYPESAFE_API_KEY`) and say so in the pull request.
