# 🔄 Migration Guide - Version Upgrades

> **Version**: 1.0.0  
> **Last Updated**: 18. April 2026  
> **Status**: Complete

---

## 📋 Overview

This guide covers the migration from older versions to the latest stack:

### Major Upgrades Completed:
- ✅ Docker Infrastructure (11 services)
- ✅ Rust Dependencies (20+ crates)
- ✅ Frontend Dependencies (10+ packages)
- ✅ Rust Edition 2021 → 2024

---

## 🐳 Docker Infrastructure Migrations

### 1. Jaeger v1 → v2 (CRITICAL - EOL)

**Breaking Changes:**
- Jaeger v2 is based on OpenTelemetry Collector
- Configuration format completely changed
- OTLP is now the primary protocol

**Migration Steps:**

#### Old Configuration (v1):
```yaml
jaeger:
  image: jaegertracing/all-in-one:1.54
  environment:
    - COLLECTOR_ZIPKIN_HOST_PORT=:9411
    - COLLECTOR_OTLP_ENABLED=true
```

#### New Configuration (v2):
```yaml
jaeger:
  image: jaegertracing/jaeger:2.17.0
  # OTLP enabled by default, no extra config needed
  ports:
    - "16686:16686"  # UI
    - "4317:4317"    # OTLP gRPC
    - "4318:4318"    # OTLP HTTP
```

**Code Changes:**
```rust
// Old (v1)
use opentelemetry_jaeger::new_agent_pipeline;

// New (v2 - use OTLP)
use opentelemetry_otlp::WithExportConfig;

let tracer = opentelemetry_otlp::new_pipeline()
    .tracing()
    .with_exporter(
        opentelemetry_otlp::new_exporter()
            .tonic()
            .with_endpoint("http://jaeger:4317")
    )
    .install_batch(opentelemetry_sdk::runtime::Tokio)?;
```

### 2. Redis 7.x → 8.x

**License Change:**
- Redis 8.x uses RSALv2/SSPLv1 license
- Alternative: Valkey (BSD fork)

**No Breaking API Changes** - Drop-in replacement

### 3. PostgreSQL 16 → 17

**Migration:**
```bash
# Backup old database
pg_dump -U idp inverse_deps > backup.sql

# Restore to new version
psql -U idp inverse_deps < backup.sql
```

### 4. Memgraph 2.x → 3.9

**Breaking Changes:**
- MAGE algorithms API changed
- Some Cypher syntax updates

**Migration:**
```cypher
-- Old (2.x)
CALL pagerank.get() YIELD node, rank;

-- New (3.9)
CALL pagerank.get() YIELD node, rank
RETURN node, rank;
```

### 5. RisingWave 2.0 → 2.8

**Breaking Changes:**
- SQL syntax improvements
- New materialized view features

**Migration:**
```sql
-- Check compatibility
SHOW TABLES;

-- Recreate views if needed
DROP MATERIALIZED VIEW IF EXISTS package_stats;
CREATE MATERIALIZED VIEW package_stats AS
  SELECT ecosystem, COUNT(*) as count
  FROM packages
  GROUP BY ecosystem;
```

---

## 🦀 Rust Dependency Migrations

### 1. Redis 0.27 → 1.2 (MAJOR)

**Breaking Changes:**
- Connection manager API changed
- Async trait changes
- Pipeline API updated

#### Old Code:
```rust
use redis::aio::ConnectionManager;

let client = redis::Client::open("redis://localhost")?;
let mut con = ConnectionManager::new(client).await?;
let value: String = con.get("key").await?;
```

#### New Code:
```rust
use redis::aio::ConnectionManager;

let client = redis::Client::open("redis://localhost")?;
let con = client.get_connection_manager().await?;
let value: String = con.get("key").await?;
```

**Pipeline Changes:**
```rust
// Old
let mut pipe = redis::pipe();
pipe.set("key1", "value1").ignore();
pipe.set("key2", "value2").ignore();
pipe.query_async(&mut con).await?;

// New
let mut pipe = redis::pipe();
pipe.set("key1", "value1");
pipe.set("key2", "value2");
pipe.query_async(&mut con).await?;
```

### 2. Prost/Tonic 0.12/0.13 → 0.14

**Breaking Changes:**
- Message trait changes
- Builder API updates
- Encoding changes

#### Build Script Changes:
```rust
// Old (build.rs)
fn main() {
    tonic_build::compile_protos("proto/service.proto")
        .unwrap();
}

// New (build.rs)
fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::configure()
        .build_server(true)
        .build_client(true)
        .compile(&["proto/service.proto"], &["proto"])?;
    Ok(())
}
```

#### Code Changes:
```rust
// Old
use prost::Message;

let msg = MyMessage {
    field: "value".to_string(),
};
let bytes = msg.encode_to_vec();

// New (same API, but internal changes)
use prost::Message;

let msg = MyMessage {
    field: "value".to_string(),
};
let bytes = msg.encode_to_vec();  // Still works!
```

### 3. OpenTelemetry 0.27 → 0.31

**Breaking Changes:**
- SDK initialization changed
- Pipeline API restructured
- Resource API updated

#### Old Code:
```rust
use opentelemetry::sdk::trace::TracerProvider;
use opentelemetry::trace::TracerProvider as _;

let provider = TracerProvider::builder()
    .with_simple_exporter(exporter)
    .build();
let tracer = provider.tracer("my-service");
```

#### New Code:
```rust
use opentelemetry_sdk::trace::TracerProvider;
use opentelemetry::trace::TracerProvider as _;

let provider = TracerProvider::builder()
    .with_batch_exporter(exporter, opentelemetry_sdk::runtime::Tokio)
    .build();
let tracer = provider.tracer("my-service");
```

### 4. Metrics 0.23 → 0.24

**Breaking Changes:**
- Recorder API changed
- Exporter initialization updated

#### Old Code:
```rust
use metrics_exporter_prometheus::PrometheusBuilder;

let builder = PrometheusBuilder::new();
builder.install()?;
```

#### New Code:
```rust
use metrics_exporter_prometheus::PrometheusBuilder;

let (recorder, exporter) = PrometheusBuilder::new().build()?;
metrics::set_global_recorder(recorder)?;
```

### 5. Tree-sitter 0.24 → 0.26

**Breaking Changes:**
- Parser API updated
- Query API changes

#### Old Code:
```rust
use tree_sitter::{Parser, Language};

let mut parser = Parser::new();
parser.set_language(tree_sitter_rust::language())?;
let tree = parser.parse(source_code, None)?;
```

#### New Code:
```rust
use tree_sitter::{Parser, Language};

let mut parser = Parser::new();
parser.set_language(&tree_sitter_rust::LANGUAGE.into())?;
let tree = parser.parse(source_code, None)?;
```

### 6. Tokio 1.43 → 1.52

**No Breaking Changes** - Minor updates only

**New Features:**
- Improved runtime metrics
- Better task scheduling
- Performance improvements

### 7. Axum 0.7 → 0.8

**Breaking Changes:**
- State extraction changed
- Middleware API updated

#### Old Code:
```rust
use axum::{Extension, extract::State};

async fn handler(
    Extension(state): Extension<AppState>,
) -> String {
    "Hello".to_string()
}
```

#### New Code:
```rust
use axum::extract::State;

async fn handler(
    State(state): State<AppState>,
) -> String {
    "Hello".to_string()
}
```

---

## 🌐 Frontend Dependency Migrations

### 1. Next.js 15 → 16 (CRITICAL - EOL)

**Breaking Changes:**
- App Router improvements
- Server Components changes
- Metadata API updates

#### Migration Steps:

1. **Update package.json:**
```json
{
  "dependencies": {
    "next": "16.2.3",
    "react": "^19.2.5",
    "react-dom": "^19.2.5"
  }
}
```

2. **Update next.config.js:**
```javascript
// Old
module.exports = {
  experimental: {
    appDir: true,
  },
}

// New (appDir is stable)
module.exports = {
  // No experimental flags needed
}
```

3. **Update Server Components:**
```typescript
// Old
export default async function Page() {
  const data = await fetch('...')
  return <div>{data}</div>
}

// New (same, but better caching)
export default async function Page() {
  const data = await fetch('...', { cache: 'force-cache' })
  return <div>{data}</div>
}
```

### 2. TypeScript 5.7 → 6.0 (MAJOR)

**Breaking Changes:**
- Stricter type checking
- New syntax features
- Module resolution changes

#### Migration Steps:

1. **Update tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true
  }
}
```

2. **Fix Type Errors:**
```typescript
// Old (might have implicit any)
function process(data) {
  return data.map(x => x * 2);
}

// New (explicit types required)
function process(data: number[]): number[] {
  return data.map(x => x * 2);
}
```

### 3. Apollo Client 3.x → 4.x

**Breaking Changes:**
- Cache normalization API
- Hook API changes
- Query options updated

#### Old Code:
```typescript
import { useQuery } from '@apollo/client';

const { data, loading } = useQuery(QUERY, {
  fetchPolicy: 'cache-first',
});
```

#### New Code:
```typescript
import { useQuery } from '@apollo/client';

const { data, loading } = useQuery(QUERY, {
  fetchPolicy: 'cache-first',
  // New: explicit cache options
  returnPartialData: false,
});
```

### 4. TailwindCSS 3.x → 4.x (OPTIONAL - MAJOR)

**⚠️ HIGHLY INVASIVE - Recommend staying on 3.x for now**

**Breaking Changes:**
- New Oxide engine
- Config format completely changed
- Class names may need updates

#### If Migrating:

1. **New Config Format:**
```javascript
// Old (tailwind.config.js)
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
}

// New (tailwind.config.ts)
import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config
```

2. **Run Migration Tool:**
```bash
npx @tailwindcss/upgrade
```

---

## 🔧 CI/CD Updates

### GitHub Actions

Update `.github/workflows/ci.yml`:

```yaml
name: CI

on: [push, pull_request]

jobs:
  rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          toolchain: stable
          components: rustfmt, clippy
      
      # Update Rust version
      - name: Check Rust version
        run: rustc --version
      
      - name: Build
        run: cargo build --workspace --all-targets
      
      - name: Test
        run: cargo test --workspace
      
      - name: Clippy
        run: cargo clippy --workspace -- -D warnings

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'  # Updated
      
      - name: Install dependencies
        run: cd apps/frontend && npm ci
      
      - name: Build
        run: cd apps/frontend && npm run build
      
      - name: Test
        run: cd apps/frontend && npm test
```

---

## 🧪 Testing After Migration

### 1. Rust Tests
```bash
# Clean build
cargo clean
cargo build --workspace

# Run all tests
cargo test --workspace

# Check for warnings
cargo clippy --workspace -- -D warnings

# Format check
cargo fmt --check
```

### 2. Frontend Tests
```bash
cd apps/frontend

# Install dependencies
npm ci

# Build
npm run build

# Run tests
npm test

# E2E tests
npm run test:e2e
```

### 3. Integration Tests
```bash
# Start infrastructure
docker-compose up -d

# Wait for services
sleep 30

# Run integration tests
cargo test --test integration_test

# Check service health
curl http://localhost:8000/health
curl http://localhost:16686  # Jaeger UI
```

### 4. Load Tests
```bash
# Run k6 load tests
k6 run tests/load/api_load_test.js
```

---

## 🚨 Common Issues & Solutions

### Issue 1: Redis Connection Errors

**Error:**
```
Error: Connection refused (os error 111)
```

**Solution:**
```bash
# Check Redis is running
docker ps | grep redis

# Test connection
redis-cli ping

# Check logs
docker logs idp-redis
```

### Issue 2: Protobuf Compilation Errors

**Error:**
```
error: failed to compile proto files
```

**Solution:**
```bash
# Rebuild proto files
cargo clean
cargo build

# Check proto files exist
ls proto/
```

### Issue 3: TypeScript Type Errors

**Error:**
```
TS2345: Argument of type 'X' is not assignable to parameter of type 'Y'
```

**Solution:**
```typescript
// Add explicit types
const data: MyType = await fetchData();

// Or use type assertion
const data = await fetchData() as MyType;
```

### Issue 4: Next.js Build Errors

**Error:**
```
Error: Cannot find module 'next/dist/...'
```

**Solution:**
```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Rebuild
npm run build
```

---

## 📊 Verification Checklist

### Pre-Migration
- [ ] Backup all databases
- [ ] Document current versions
- [ ] Run full test suite
- [ ] Create git branch for migration

### During Migration
- [ ] Update Cargo.toml
- [ ] Update package.json
- [ ] Update docker-compose.yml
- [ ] Update CI/CD configs
- [ ] Fix compilation errors
- [ ] Fix type errors

### Post-Migration
- [ ] All tests pass
- [ ] No clippy warnings
- [ ] No TypeScript errors
- [ ] Docker services healthy
- [ ] Integration tests pass
- [ ] Load tests pass
- [ ] Documentation updated

---

## 🎯 Rollback Plan

If migration fails:

### 1. Git Rollback
```bash
git checkout main
git branch -D migration
```

### 2. Docker Rollback
```bash
# Stop new services
docker-compose down

# Restore old docker-compose.yml
git checkout HEAD~1 docker-compose.yml

# Start old services
docker-compose up -d
```

### 3. Database Rollback
```bash
# Restore from backup
psql -U idp inverse_deps < backup.sql
```

---

## 📚 Additional Resources

- [Rust Edition Guide](https://doc.rust-lang.org/edition-guide/)
- [Next.js Upgrade Guide](https://nextjs.org/docs/upgrading)
- [TypeScript 6.0 Release Notes](https://devblogs.microsoft.com/typescript/)
- [Redis 8.0 Release Notes](https://redis.io/docs/about/releases/)
- [Jaeger v2 Migration](https://www.jaegertracing.io/docs/latest/migration/)

---

**Version**: 1.0.0  
**Last Updated**: 18. April 2026  
**Status**: ✅ Complete