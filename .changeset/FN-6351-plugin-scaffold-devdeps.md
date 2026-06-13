---
"@runfusion/fusion": patch
---

Standalone plugin scaffolds now declare the dev toolchain they generate scripts and config for: `@types/node`, `vitest`, and `typescript`. This lets projects created with `fn plugin new` install, build, test, and load through `fn plugin dev . --once` via the documented external-author path without relying on transitive or hoisted dependencies.

Manual spot-check for release validation:

```sh
npx @runfusion/fusion@latest plugin new proof-point-plugin
cd proof-point-plugin
pnpm install
pnpm build
pnpm test
fn plugin dev . --once
```
