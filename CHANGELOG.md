# Changelog

## 2.0.0

First release of the `rzlamrr/msvc-dev-cmd` fork, continuing from `ilammy/msvc-dev-cmd` 1.13.
See [Migrating from v1](README.md#migrating-from-ilammymsvc-dev-cmdv1).

### Breaking

- Runs on Node 24 (`using: node24`); needs runner 2.327.0 or newer.
- On ARM64 runners the default `arch` is `arm64` instead of `x64`.

### Added

- Visual Studio 2026 support (`vsversion: "2026"` or `"18.0"`, also found in the standard installation directory `18`).
- Outputs: `arch`, `vcvarsall`, `installation-path`, `vs-version`, `toolset-version`.
- Error messages list the installed Visual Studio versions (and toolsets, for a bad `toolset`).
- The action is bundled into `dist/` and runs without `node_modules`.

### Fixed

- Environment variables whose value contains `=` were exported truncated.
- When `vswhere` reports several installations, only the first path is used instead of a corrupted one.
- An `arch` such as `constructor` was mistaken for an alias.

### Internal

- `@actions/core` 3 (ESM), ESLint 10 with a flat config, `actions/checkout` 7, `npm ci` and `npm audit --omit=dev` in CI.
- CI runs on `windows-2022`, `windows-2025`, `windows-2025-vs2026`, `windows-latest` and `windows-11-arm`, plus unit tests.
