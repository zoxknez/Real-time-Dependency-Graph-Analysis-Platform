# Development Guide

## Prerequisites

- **Rust** 1.75+ with `rustup`
- **Node.js** 20+ with `pnpm`
- **Docker** & Docker Compose
- **Protocol Buffers** compiler (`protoc`)

### Installing Prerequisites

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Node.js (via nvm)
nvm install 20
nvm use 20

# pnpm
corepack enable
corepack prepare pnpm@latest --activate

# Protocol Buffers (macOS)
brew install protobuf

# Protocol Buffers (Ubuntu)
sudo apt install -y protobuf-compiler

# Protocol Buffers (Windows - via Chocolatey)
choco install protoc
```

## Quick Start

### 1. Clone and Setup

```bash
git clone https://github.com/your-org/idp.git
cd idp

# Copy environment template
cp .env.example .env
```

### 2. Start Infrastructure

```bash
# Start Memgraph, Redis, Kafka, Qdrant
docker compose up -d

# Verify services are running
docker compose ps
```

### 3. Build Backend

```bash
# Check compilation
cargo check --workspace

# Run all tests
cargo test --workspace

# Build release binaries
cargo build --release
```

### 4. Start Backend Services

```bash
# In separate terminals or use tmux

# API Gateway
cargo run -p api

# Ingestion Service (optional for dev)
cargo run -p ingestion

# Graph Writer
cargo run -p graph-writer
```

### 5. Start Frontend

```bash
cd apps/frontend
pnpm install
pnpm dev
```

Access the application at `http://localhost:3000`

## Project Structure

```
├── apps/
│   ├── api/              # GraphQL API Gateway (Rust)
│   ├── frontend/         # Next.js web interface
│   ├── ingestion/        # Package registry crawler
│   ├── graph-writer/     # Kafka → Memgraph writer
│   ├── vector-writer/    # Kafka → Qdrant writer
│   ├── analysis/         # CVE & breaking change analysis
│   └── syncer/           # Graph → RisingWave sync
├── packages/
│   ├── models/           # Shared Rust types
│   └── storage/          # Database client abstractions
├── proto/                # Protocol Buffer definitions
├── deploy/
│   └── helm/idp/         # Kubernetes Helm charts
├── docker/               # Dockerfiles
├── docs/                 # Documentation
├── tests/                # Integration tests
└── scripts/              # Utility scripts
```

## Environment Variables

Create a `.env` file:

```env
# Server
HOST=0.0.0.0
PORT=8080

# Memgraph
MEMGRAPH_URI=bolt://localhost:7687
MEMGRAPH_USERNAME=
MEMGRAPH_PASSWORD=

# Redis
REDIS_URL=redis://localhost:6379

# Kafka
KAFKA_BROKERS=localhost:9092
KAFKA_TOPIC=versions
KAFKA_CONSUMER_GROUP=api-subscriptions

# Qdrant
QDRANT_URL=http://localhost:6334

# Guardrails
RATE_LIMIT_RPM=100
MAX_COMPLEXITY=1000
MAX_DEPTH=10

# Logging
RUST_LOG=info,api=debug
```

## Development Workflow

### Running Tests

```bash
# All tests
cargo test --workspace

# Specific crate
cargo test -p api

# With output
cargo test -p api -- --nocapture

# Integration tests (requires Docker)
cargo test --test '*' -- --test-threads=1
```

### Code Quality

```bash
# Formatting
cargo fmt --all

# Linting
cargo clippy --workspace --all-targets -- -D warnings

# Check for security issues
cargo audit

# Check dependencies
cargo deny check
```

### Database Management

```bash
# Connect to Memgraph
docker compose exec memgraph mgconsole

# Cypher commands
MATCH (n) RETURN count(n);
MATCH (p:Package) RETURN p LIMIT 10;

# Clear database (development only!)
MATCH (n) DETACH DELETE n;
```

### Kafka Management

```bash
# List topics
docker compose exec redpanda rpk topic list

# Create topic
docker compose exec redpanda rpk topic create versions

# Consume messages
docker compose exec redpanda rpk topic consume versions

# Produce test message
docker compose exec redpanda rpk topic produce versions
```

### Frontend Development

```bash
cd apps/frontend

# Install dependencies
pnpm install

# Development server with hot reload
pnpm dev

# Type checking
pnpm type-check

# Linting
pnpm lint

# Build for production
pnpm build
```

## Adding a New Feature

### Backend (Rust)

1. **Add types** in `packages/models/src/`
2. **Add GraphQL types** in `apps/api/src/gql/types.rs`
3. **Add resolvers** in `apps/api/src/gql/query.rs` or `subscription.rs`
4. **Add tests** in `apps/api/tests/`
5. **Update documentation** in `docs/API.md`

### Frontend (Next.js)

1. **Add GraphQL operations** in `apps/frontend/src/graphql/`
2. **Generate types** with `pnpm codegen`
3. **Add components** in `apps/frontend/src/components/`
4. **Add pages/routes** in `apps/frontend/src/app/`
5. **Add tests** with Jest

## Debugging

### API Service

```bash
# Enable trace logging
RUST_LOG=trace cargo run -p api

# Enable backtrace for panics
RUST_BACKTRACE=1 cargo run -p api
```

### GraphQL

Access GraphQL Playground at `http://localhost:8080/graphql`

### Subscriptions

Test with wscat:
```bash
# Install wscat
npm install -g wscat

# Connect to WebSocket
wscat -c ws://localhost:8080/graphql/ws

# Send subscription
{"type":"connection_init"}
{"id":"1","type":"subscribe","payload":{"query":"subscription { newVersion { package { name } version { version } } }"}}
```

### Performance Profiling

```bash
# CPU profiling with flamegraph
cargo install flamegraph
cargo flamegraph -p api

# Memory profiling
cargo install heaptrack
heaptrack cargo run -p api
```

## Docker Development

### Build Images

```bash
# Build all images
docker compose build

# Build specific image
docker build -f docker/api.Dockerfile -t idp-api .
```

### Full Stack

```bash
# Start everything
docker compose --profile full up -d

# View logs
docker compose logs -f api

# Stop all
docker compose down
```

## Common Issues

### Protobuf Compilation Errors

```
error: failed to run custom build command for `prost-build`
```

**Solution:** Install protoc
```bash
# macOS
brew install protobuf

# Ubuntu
sudo apt install protobuf-compiler

# Verify
protoc --version
```

### Memgraph Connection Refused

```
error: Connection refused (os error 111)
```

**Solution:** Ensure Memgraph is running
```bash
docker compose up -d memgraph
docker compose logs memgraph
```

### Kafka Consumer Lag

If subscriptions are delayed:

```bash
# Check consumer lag
docker compose exec redpanda rpk group describe api-subscriptions

# Reset consumer offset
docker compose exec redpanda rpk group seek api-subscriptions --to latest
```

### Frontend Build Errors

```
Module not found: Can't resolve '@/components/...'
```

**Solution:** Regenerate types
```bash
cd apps/frontend
pnpm codegen
pnpm build
```

## IDE Setup

### VS Code

Recommended extensions:
- `rust-analyzer` - Rust support
- `Even Better TOML` - Cargo.toml
- `GraphQL` - .graphql files
- `Tailwind CSS IntelliSense` - Frontend
- `ESLint` - JavaScript/TypeScript
- `Prettier` - Code formatting

Settings (`.vscode/settings.json`):
```json
{
  "rust-analyzer.checkOnSave.command": "clippy",
  "editor.formatOnSave": true,
  "[rust]": {
    "editor.defaultFormatter": "rust-lang.rust-analyzer"
  },
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

### IntelliJ/RustRover

- Install Rust plugin
- Set `cargo check` for on-save checks
- Configure ESLint for frontend

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/my-feature`
3. Make changes following code style
4. Add tests for new functionality
5. Run `cargo test` and `cargo clippy`
6. Commit with conventional commits: `feat: add new feature`
7. Push and create Pull Request

## Resources

- [Rust Book](https://doc.rust-lang.org/book/)
- [async-graphql Documentation](https://async-graphql.github.io/async-graphql/en/)
- [Axum Documentation](https://docs.rs/axum/latest/axum/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Memgraph Documentation](https://memgraph.com/docs)
