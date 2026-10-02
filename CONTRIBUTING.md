# Contributing

Thanks for your interest. The project is pre-alpha and the API is still moving.

- **Open an issue first** for anything larger than a small fix.
- **Keep the core domain-free.** Anything about restaurants, SaaS or any business belongs in `examples/`.
- **Keep `compose` pure.** No I/O, no clock reads (time comes in as `now`).
- **No real data.** Fixtures must be fictitious. Replay datasets stay out of git.
- **Run before pushing:**

```sh
pnpm install
pnpm typecheck
```
