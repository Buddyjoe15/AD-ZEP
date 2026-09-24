# Reproducible Development Harness

## Toolchain used for GF-FND-001

- Node.js `22.16.0` (`.nvmrc`)
- npm `10.9.2` (`packageManager` in `package.json`)
- Git `2.47.3`
- Chromium headless from the execution environment for browser smoke evidence

There are no third-party runtime or build dependencies in this foundation harness.

## Canonical editable source

`src/Groundfall_Master_v0_7_0.html`

For GF-FND-001 it is byte-identical to the pinned master. `baseline/Groundfall_Master_v0_7_0.html` is the immutable reference copy used by baseline verification.

## Development launch

The approved master is standalone and requires no fetch/module server. Open:

`src/Groundfall_Master_v0_7_0.html`

Direct `file://` launch is the primary offline development mode preserved by this task.

Optional local HTTP launch for browser tooling:

```sh
python3 -m http.server 8080 -d src
```

Then open `http://127.0.0.1:8080/Groundfall_Master_v0_7_0.html`.

## Build/package

```sh
npm run build
```

Output:

- `dist/Groundfall_Master_v0_7_0.html`
- `dist/BUILD_MANIFEST.json`

The build is intentionally a byte-preserving package step. It does not minify, bundle, reorder, or rewrite the game source.

Check deterministic regeneration:

```sh
npm run check:repro
```

## Validation

```sh
npm test
npm run smoke:dev
npm run smoke:dist
```

`npm test` verifies the pinned baseline, parses every inline JavaScript block, checks dependency boundaries, runs public-contract conformance tests, and checks current source invariants.

The browser smoke commands use a fresh isolated Chromium profile. They do not reuse developer browser storage.

## Evidence locations

Generated task evidence is written beneath `evidence/` and is intentionally untracked by Git so evidence from one environment is not mistaken for source.

## Isolated task checkout

Create a sibling Git worktree from a pinned revision:

```sh
./scripts/create-task-worktree.sh GF-FND-002 <base-revision>
```

If `<base-revision>` is omitted, `HEAD` is used. The script creates a dedicated `task/<task-id>` branch and a sibling worktree under `../GroundFall.Alpha-worktrees/<task-id>`.

Each task should use its own worktree, browser profile/storage, ports, and evidence directory. Never infer filesystem isolation merely from separate chat contexts.
