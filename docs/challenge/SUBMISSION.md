# Real-time Dependency Graph Analysis Platform

## One-line pitch

A source-backed dependency graph that combines AST API changes, direct version exposure, live advisories, and explicit business review in one War Room.

## Why WebMCP matters

WebMCP lets an agent inspect and operate the same workflow as a human. It does not bypass application logic: both channels converge on `WarRoomActions` and the same domain guards.

## Run

Use Docker Compose for Memgraph/backend services and Node.js for the frontend. The repository pins the Rust toolchain in `rust-toolchain.toml`; use the configured Node runtime and install dependencies under `apps/frontend`.

Canonical demo route: `/graph`. See `DEMO-SCRIPT.md` for the review flow and `FINAL-CLAIMS.md` for boundaries.

## Limitations

Declared range exposure does not prove source compatibility. Transitive version compatibility is not computed. OSV evidence may be unavailable. Migration plans are deterministic application output and do not edit source code.
