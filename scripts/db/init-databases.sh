#!/bin/bash
# Database initialization script
# Run all database migrations and setup scripts

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================"
echo "Dependency Graph - Database Initialization"
echo "============================================"
echo ""

# Configuration
MEMGRAPH_HOST="${MEMGRAPH_HOST:-localhost}"
MEMGRAPH_PORT="${MEMGRAPH_PORT:-7687}"
QDRANT_HOST="${QDRANT_HOST:-localhost}"
QDRANT_PORT="${QDRANT_PORT:-6333}"
RISINGWAVE_HOST="${RISINGWAVE_HOST:-localhost}"
RISINGWAVE_PORT="${RISINGWAVE_PORT:-4566}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Wait for service to be ready
wait_for_service() {
    local host=$1
    local port=$2
    local name=$3
    local max_attempts=30
    local attempt=1

    log_info "Waiting for $name at $host:$port..."
    
    while ! nc -z "$host" "$port" 2>/dev/null; do
        if [ $attempt -ge $max_attempts ]; then
            log_error "$name is not available after $max_attempts attempts"
            return 1
        fi
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo ""
    log_info "$name is ready!"
}

# Initialize Memgraph
init_memgraph() {
    log_info "Initializing Memgraph..."
    
    if command -v mgconsole &> /dev/null; then
        mgconsole --host "$MEMGRAPH_HOST" --port "$MEMGRAPH_PORT" < "$SCRIPT_DIR/001-init-schema.cypher"
        log_info "Memgraph schema initialized"
        
        mgconsole --host "$MEMGRAPH_HOST" --port "$MEMGRAPH_PORT" < "$SCRIPT_DIR/002-graph-algorithms.cypher" || true
        log_info "Memgraph algorithms configured"
    else
        log_warn "mgconsole not found, using Docker..."
        docker exec -i memgraph mgconsole < "$SCRIPT_DIR/001-init-schema.cypher"
        docker exec -i memgraph mgconsole < "$SCRIPT_DIR/002-graph-algorithms.cypher" || true
    fi
}

# Initialize Qdrant
init_qdrant() {
    log_info "Initializing Qdrant collections..."
    
    # Create package_embeddings collection
    curl -s -X PUT "http://$QDRANT_HOST:$QDRANT_PORT/collections/package_embeddings" \
        -H "Content-Type: application/json" \
        -d '{
            "vectors": {
                "size": 384,
                "distance": "Cosine"
            },
            "optimizers_config": {
                "memmap_threshold": 20000
            },
            "quantization_config": {
                "scalar": {
                    "type": "int8",
                    "quantile": 0.99,
                    "always_ram": true
                }
            }
        }' > /dev/null
    
    # Create payload index for ecosystem
    curl -s -X PUT "http://$QDRANT_HOST:$QDRANT_PORT/collections/package_embeddings/index" \
        -H "Content-Type: application/json" \
        -d '{"field_name": "ecosystem", "field_schema": "keyword"}' > /dev/null
    
    # Create code_embeddings collection
    curl -s -X PUT "http://$QDRANT_HOST:$QDRANT_PORT/collections/code_embeddings" \
        -H "Content-Type: application/json" \
        -d '{
            "vectors": {
                "size": 384,
                "distance": "Cosine"
            },
            "optimizers_config": {
                "memmap_threshold": 50000
            }
        }' > /dev/null
    
    # Create payload indices
    curl -s -X PUT "http://$QDRANT_HOST:$QDRANT_PORT/collections/code_embeddings/index" \
        -H "Content-Type: application/json" \
        -d '{"field_name": "package_id", "field_schema": "keyword"}' > /dev/null
    
    curl -s -X PUT "http://$QDRANT_HOST:$QDRANT_PORT/collections/code_embeddings/index" \
        -H "Content-Type: application/json" \
        -d '{"field_name": "symbol_type", "field_schema": "keyword"}' > /dev/null
    
    log_info "Qdrant collections created"
}

# Initialize RisingWave
init_risingwave() {
    log_info "Initializing RisingWave..."
    
    if command -v psql &> /dev/null; then
        PGPASSWORD="${RISINGWAVE_PASSWORD:-}" psql \
            -h "$RISINGWAVE_HOST" \
            -p "$RISINGWAVE_PORT" \
            -U "${RISINGWAVE_USER:-root}" \
            -d "${RISINGWAVE_DB:-dev}" \
            -f "$SCRIPT_DIR/004-risingwave-setup.sql"
        log_info "RisingWave materialized views created"
    else
        log_warn "psql not found, skipping RisingWave initialization"
        log_warn "Run manually: psql -h $RISINGWAVE_HOST -p $RISINGWAVE_PORT -d dev -f 004-risingwave-setup.sql"
    fi
}

# Main execution
main() {
    echo "Configuration:"
    echo "  Memgraph:   $MEMGRAPH_HOST:$MEMGRAPH_PORT"
    echo "  Qdrant:     $QDRANT_HOST:$QDRANT_PORT"
    echo "  RisingWave: $RISINGWAVE_HOST:$RISINGWAVE_PORT"
    echo ""
    
    # Check for required tools
    if ! command -v curl &> /dev/null; then
        log_error "curl is required but not installed"
        exit 1
    fi
    
    # Parse arguments
    SKIP_WAIT=false
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-wait)
                SKIP_WAIT=true
                shift
                ;;
            --memgraph-only)
                init_memgraph
                exit 0
                ;;
            --qdrant-only)
                init_qdrant
                exit 0
                ;;
            --risingwave-only)
                init_risingwave
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Wait for services if not skipped
    if [ "$SKIP_WAIT" = false ]; then
        wait_for_service "$MEMGRAPH_HOST" "$MEMGRAPH_PORT" "Memgraph"
        wait_for_service "$QDRANT_HOST" "$QDRANT_PORT" "Qdrant"
        wait_for_service "$RISINGWAVE_HOST" "$RISINGWAVE_PORT" "RisingWave" || true
    fi
    
    # Initialize databases
    init_memgraph
    init_qdrant
    init_risingwave || log_warn "RisingWave initialization skipped"
    
    echo ""
    log_info "============================================"
    log_info "Database initialization complete!"
    log_info "============================================"
}

main "$@"
