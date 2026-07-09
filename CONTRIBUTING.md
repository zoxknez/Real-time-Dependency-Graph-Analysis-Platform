# Contributing

Thanks for your interest in contributing! This document explains how to get a development environment running and what we expect from pull requests.

## Getting started

The fastest development loop uses the lite stack (API + frontend + databases, no streaming pipeline):

```bash
docker compose -f docker-compose.lite.yml up -d --build
docker compose -f docker-compose.lite.yml --profile seed run --rm seed
```

For work on the ingestion/analysis pipeline you need the full stack — see the [README Quick Start](README.md#-quick-start) and [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

### Toolchain

- Rust 1.85+ (edition 2024) — `rustup` recommended
- Node.js 22+ for the frontend
- Docker Compose v2.20+
- `protoc` is vendored via `protoc-bin-vendored`; no manual install needed

## Before you open a PR

CI enforces all of these, so run them locally first:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings -D clippy::all
cargo test --workspace --lib --bins
cd apps/frontend && npx tsc --noEmit && npm run lint
```

## Pull request guidelines

1. Fork and create a feature branch (`git checkout -b feature/my-feature`)
2. Keep PRs focused — one logical change per PR
3. Use [Conventional Commits](https://www.conventionalcommits.org/) messages (`feat:`, `fix:`, `chore:`, ...)
4. Add or update tests for behavior changes
5. Update documentation if you change public APIs, configuration, or the GraphQL schema (`docs/schema.graphql`)

## Reporting bugs and requesting features

Use the GitHub issue templates. For security vulnerabilities, please do **not** open a public issue — see [docs/SECURITY.md](docs/SECURITY.md).
