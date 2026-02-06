# ═══════════════════════════════════════════════════════════════════════════════
# Makefile - Development Commands
# ═══════════════════════════════════════════════════════════════════════════════

.PHONY: help build test lint format clean docker-up docker-down seed quality-search quality-search-seeded
APP_COMPOSE_FILES = -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.apps.yml

# Default target
help:
	@echo "╔═══════════════════════════════════════════════════════════════════════════════╗"
	@echo "║                    Dependency Graph Analysis Platform                          ║"
	@echo "╠═══════════════════════════════════════════════════════════════════════════════╣"
	@echo "║ Development Commands:                                                          ║"
	@echo "║   make build         - Build all Rust services                                ║"
	@echo "║   make test          - Run all tests                                          ║"
	@echo "║   make lint          - Run clippy and fmt checks                              ║"
	@echo "║   make format        - Format all code                                        ║"
	@echo "║   make clean         - Clean build artifacts                                  ║"
	@echo "║                                                                               ║"
	@echo "║ Docker Commands:                                                              ║"
	@echo "║   make docker-up     - Start all infrastructure services                      ║"
	@echo "║   make docker-down   - Stop all services                                      ║"
	@echo "║   make docker-logs   - Tail logs from all services                            ║"
	@echo "║   make docker-build  - Build all Docker images                                ║"
	@echo "║                                                                               ║"
	@echo "║ Database Commands:                                                            ║"
	@echo "║   make db-init       - Initialize all databases                               ║"
	@echo "║   make seed          - Seed development data                                  ║"
	@echo "║   make db-reset      - Reset all database data                                ║"
	@echo "║                                                                               ║"
	@echo "║ Testing Commands:                                                             ║"
	@echo "║   make test-unit     - Run unit tests only                                    ║"
	@echo "║   make test-e2e      - Run E2E tests (Playwright)                             ║"
	@echo "║   make test-load     - Run load tests (k6)                                    ║"
	@echo "║   make quality-search - Run semantic search quality harness                   ║"
	@echo "║   make quality-search-seeded - Seed data + run harness (requires API running) ║"
	@echo "║                                                                               ║"
	@echo "║ Frontend Commands:                                                            ║"
	@echo "║   make frontend-dev  - Start frontend dev server                              ║"
	@echo "║   make frontend-build - Build frontend for production                         ║"
	@echo "╚═══════════════════════════════════════════════════════════════════════════════╝"

# ═══════════════════════════════════════════════════════════════════════════════
# Development Commands
# ═══════════════════════════════════════════════════════════════════════════════

build:
	@echo "🔨 Building all Rust services..."
	cargo build --workspace

build-release:
	@echo "🚀 Building release binaries..."
	cargo build --workspace --release

test:
	@echo "🧪 Running all tests..."
	cargo test --workspace

test-unit:
	@echo "🧪 Running unit tests..."
	cargo test --workspace --lib

test-integration:
	@echo "🧪 Running integration tests..."
	cargo test --workspace --test '*'

lint:
	@echo "🔍 Running linters..."
	cargo fmt --all -- --check
	cargo clippy --workspace --all-targets -- -D warnings

format:
	@echo "✨ Formatting code..."
	cargo fmt --all
	cd apps/frontend && npm run format

clean:
	@echo "🧹 Cleaning build artifacts..."
	cargo clean
	rm -rf apps/frontend/node_modules apps/frontend/.next

check:
	@echo "✅ Running cargo check..."
	cargo check --workspace --all-targets

# ═══════════════════════════════════════════════════════════════════════════════
# Docker Commands
# ═══════════════════════════════════════════════════════════════════════════════

docker-up:
	@echo "🐳 Starting infrastructure services..."
	docker-compose -f docker-compose.yml up -d

docker-up-all:
	@echo "🐳 Starting all services..."
	docker-compose $(APP_COMPOSE_FILES) up -d

docker-down:
	@echo "🐳 Stopping all services..."
	docker-compose $(APP_COMPOSE_FILES) down

docker-logs:
	@echo "📜 Tailing logs..."
	docker-compose $(APP_COMPOSE_FILES) logs -f

docker-build:
	@echo "🔨 Building Docker images..."
	docker-compose $(APP_COMPOSE_FILES) build

docker-pull:
	@echo "📥 Pulling latest images..."
	docker-compose -f docker-compose.yml pull

docker-ps:
	@echo "📊 Service status..."
	docker-compose $(APP_COMPOSE_FILES) ps

# ═══════════════════════════════════════════════════════════════════════════════
# Database Commands
# ═══════════════════════════════════════════════════════════════════════════════

db-init:
	@echo "🗄️ Initializing databases..."
	@bash scripts/db/init-databases.sh

seed:
	@echo "🌱 Seeding development data..."
	python scripts/dev-seed.py

db-reset:
	@echo "⚠️ Resetting all databases..."
	docker-compose -f docker-compose.yml down -v
	docker-compose -f docker-compose.yml up -d
	@sleep 5
	@$(MAKE) db-init
	@$(MAKE) seed

# ═══════════════════════════════════════════════════════════════════════════════
# Testing Commands  
# ═══════════════════════════════════════════════════════════════════════════════

test-e2e:
	@echo "🎭 Running Playwright E2E tests..."
	cd apps/frontend && npx playwright test

test-e2e-ui:
	@echo "🎭 Running Playwright E2E tests with UI..."
	cd apps/frontend && npx playwright test --ui

test-load:
	@echo "⚡ Running k6 load tests..."
	k6 run tests/load/graphql-queries.js

test-load-ws:
	@echo "⚡ Running WebSocket load tests..."
	k6 run tests/load/websocket-subscriptions.js

test-load-rate:
	@echo "⚡ Running rate limiting tests..."
	k6 run tests/load/rate-limiting.js

quality-search:
	@echo "📏 Running semantic search quality harness..."
	@echo "Set TEST_API_URL (default: http://localhost:8080)"
	cargo run -p e2e-tests --bin search_quality

quality-search-seeded:
	@echo "🐳 Ensuring infra is up..."
	docker-compose -f docker-compose.yml up -d
	@echo "🌱 Seeding Memgraph + Qdrant (requires: pip install neo4j qdrant-client)"
	python scripts/dev-seed.py
	@echo "📏 Running semantic search quality harness..."
	cargo run -p e2e-tests --bin search_quality

test-all:
	@$(MAKE) test
	@$(MAKE) test-e2e
	@echo "✅ All tests passed!"

# ═══════════════════════════════════════════════════════════════════════════════
# Frontend Commands
# ═══════════════════════════════════════════════════════════════════════════════

frontend-install:
	@echo "📦 Installing frontend dependencies..."
	cd apps/frontend && npm install

frontend-dev:
	@echo "🚀 Starting frontend dev server..."
	cd apps/frontend && npm run dev

frontend-build:
	@echo "🔨 Building frontend..."
	cd apps/frontend && npm run build

frontend-lint:
	@echo "🔍 Linting frontend..."
	cd apps/frontend && npm run lint

frontend-type-check:
	@echo "✅ Type checking frontend..."
	cd apps/frontend && npm run type-check

# ═══════════════════════════════════════════════════════════════════════════════
# Pre-commit Commands
# ═══════════════════════════════════════════════════════════════════════════════

pre-commit-install:
	@echo "🔧 Installing pre-commit hooks..."
	pip install pre-commit
	pre-commit install

pre-commit-run:
	@echo "🔍 Running pre-commit on all files..."
	pre-commit run --all-files

# ═══════════════════════════════════════════════════════════════════════════════
# CI/CD Commands
# ═══════════════════════════════════════════════════════════════════════════════

ci-lint:
	@echo "🔍 CI lint check..."
	cargo fmt --all -- --check
	cargo clippy --workspace --all-targets -- -D warnings
	cd apps/frontend && npm run lint

ci-test:
	@echo "🧪 CI test suite..."
	cargo test --workspace --no-fail-fast

ci-build:
	@echo "🔨 CI build..."
	cargo build --workspace --release
	cd apps/frontend && npm run build

# ═══════════════════════════════════════════════════════════════════════════════
# Documentation Commands
# ═══════════════════════════════════════════════════════════════════════════════

docs:
	@echo "📚 Generating documentation..."
	cargo doc --workspace --no-deps --open

docs-build:
	@echo "📚 Building documentation..."
	cargo doc --workspace --no-deps

# ═══════════════════════════════════════════════════════════════════════════════
# Helm/Kubernetes Commands
# ═══════════════════════════════════════════════════════════════════════════════

helm-lint:
	@echo "🔍 Linting Helm charts..."
	helm lint deploy/helm/idp

helm-template:
	@echo "📄 Rendering Helm templates..."
	helm template idp deploy/helm/idp

helm-dry-run:
	@echo "🔍 Helm dry run..."
	helm install --dry-run --debug idp deploy/helm/idp

# ═══════════════════════════════════════════════════════════════════════════════
# Utility Commands
# ═══════════════════════════════════════════════════════════════════════════════

download-models:
	@echo "📥 Downloading embedding models..."
	python scripts/download-models.py

setup: pre-commit-install frontend-install
	@echo "✅ Development environment setup complete!"

dev: docker-up
	@sleep 5
	@$(MAKE) seed
	@echo "✅ Development environment ready!"
	@echo "   - API: http://localhost:8080/graphql"
	@echo "   - Frontend: run 'make frontend-dev'"
	@echo "   - Grafana: http://localhost:3001"

status:
	@echo "📊 Service Status:"
	@docker-compose -f docker-compose.yml ps
	@echo ""
	@echo "📊 Application Status:"
	@docker-compose $(APP_COMPOSE_FILES) ps 2>/dev/null || echo "App containers not running"

logs-api:
	docker-compose $(APP_COMPOSE_FILES) logs -f api

logs-analysis:
	docker-compose $(APP_COMPOSE_FILES) logs -f analysis

logs-ingestion:
	docker-compose $(APP_COMPOSE_FILES) logs -f ingestion
