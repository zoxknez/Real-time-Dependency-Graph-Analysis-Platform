#!/bin/bash
# IDP Platform Startup Script
# Usage: ./scripts/start.sh [dev|prod|infra-only]

set -e

MODE="${1:-dev}"
COMPOSE_FILE="docker-compose.yml"
OVERRIDE_COMPOSE_FILE="docker-compose.override.yml"
APPS_COMPOSE_FILE="docker-compose.apps.yml"
APP_COMPOSE_ARGS=(-f "$COMPOSE_FILE")

if [ -f "$OVERRIDE_COMPOSE_FILE" ]; then
    APP_COMPOSE_ARGS+=(-f "$OVERRIDE_COMPOSE_FILE")
fi

APP_COMPOSE_ARGS+=(-f "$APPS_COMPOSE_FILE")

echo "🚀 Starting IDP Platform in $MODE mode..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

case $MODE in
    "infra-only")
        echo -e "${BLUE}Starting infrastructure services only...${NC}"
        docker-compose -f $COMPOSE_FILE up -d
        ;;
    
    "dev")
        echo -e "${BLUE}Starting infrastructure + development mode...${NC}"
        docker-compose -f $COMPOSE_FILE up -d
        
        echo ""
        echo -e "${YELLOW}Infrastructure is ready! Start development services manually:${NC}"
        echo ""
        echo "  # Terminal 1: API"
        echo "  cd apps/api && cargo run"
        echo ""
        echo "  # Terminal 2: Frontend"
        echo "  cd apps/frontend && npm run dev"
        echo ""
        echo "  # Terminal 3: Ingestion (optional)"
        echo "  cd apps/ingestion && cargo run"
        echo ""
        ;;
    
    "prod")
        echo -e "${BLUE}Starting full production stack...${NC}"
        docker-compose "${APP_COMPOSE_ARGS[@]}" up -d --build
        ;;
    
    "monitoring")
        echo -e "${BLUE}Starting with monitoring stack...${NC}"
        docker-compose "${APP_COMPOSE_ARGS[@]}" --profile monitoring up -d --build
        ;;
    
    *)
        echo "Unknown mode: $MODE"
        echo "Usage: ./scripts/start.sh [dev|prod|infra-only|monitoring]"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}✅ Startup complete!${NC}"
echo ""
echo "📊 Service URLs:"
echo "  - API:              http://localhost:8000/graphql"
echo "  - GraphQL Playground: http://localhost:8000/graphql"
echo "  - Frontend:         http://localhost:3000"
echo "  - Redpanda Console: http://localhost:18080"
echo "  - Memgraph Lab:     http://localhost:3002"
echo "  - RisingWave:       http://localhost:5691"
echo "  - Qdrant:           http://localhost:6333"
echo "  - Jaeger:           http://localhost:16686"
echo ""
echo "🔍 Check logs:"
echo "  docker-compose logs -f [service-name]"
echo ""
