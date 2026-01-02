-- Qdrant Collection Setup
-- Initialize vector collections with optimal configuration
-- This is a reference - actual setup is done via Qdrant REST API

-- ============================================
-- COLLECTION: package_embeddings
-- Purpose: Semantic search for packages
-- ============================================

/*
POST /collections/package_embeddings
{
  "vectors": {
    "size": 384,
    "distance": "Cosine"
  },
  "optimizers_config": {
    "memmap_threshold": 20000,
    "indexing_threshold": 20000
  },
  "quantization_config": {
    "scalar": {
      "type": "int8",
      "quantile": 0.99,
      "always_ram": true
    }
  },
  "on_disk_payload": true
}

-- Create payload indices for filtering
PUT /collections/package_embeddings/index
{
  "field_name": "ecosystem",
  "field_schema": "keyword"
}

PUT /collections/package_embeddings/index
{
  "field_name": "name",
  "field_schema": "keyword"
}

PUT /collections/package_embeddings/index
{
  "field_name": "downloads",
  "field_schema": "integer"
}
*/

-- ============================================
-- COLLECTION: code_embeddings
-- Purpose: Semantic search for code symbols
-- ============================================

/*
POST /collections/code_embeddings
{
  "vectors": {
    "size": 384,
    "distance": "Cosine"
  },
  "optimizers_config": {
    "memmap_threshold": 50000,
    "indexing_threshold": 50000
  },
  "quantization_config": {
    "scalar": {
      "type": "int8",
      "quantile": 0.99,
      "always_ram": true
    }
  },
  "on_disk_payload": true
}

-- Create payload indices
PUT /collections/code_embeddings/index
{
  "field_name": "package_id",
  "field_schema": "keyword"
}

PUT /collections/code_embeddings/index
{
  "field_name": "symbol_type",
  "field_schema": "keyword"
}

PUT /collections/code_embeddings/index
{
  "field_name": "language",
  "field_schema": "keyword"
}
*/

-- ============================================
-- COLLECTION: doc_embeddings  
-- Purpose: Semantic search for documentation
-- ============================================

/*
POST /collections/doc_embeddings
{
  "vectors": {
    "size": 384,
    "distance": "Cosine"
  },
  "optimizers_config": {
    "memmap_threshold": 10000
  },
  "on_disk_payload": true
}

PUT /collections/doc_embeddings/index
{
  "field_name": "package_id",
  "field_schema": "keyword"
}

PUT /collections/doc_embeddings/index
{
  "field_name": "doc_type",
  "field_schema": "keyword"
}
*/
