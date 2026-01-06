#!/usr/bin/env python3
"""
Development Seed Script

Seeds local development databases with sample package + version data.
This script is aligned with the API GraphQL/Memgraph schema:
- Package nodes use stable IDs like "npm:express" (no version)
- Version nodes belong to packages via (:Version)-[:BELONGS_TO]->(:Package)
- Dependencies are modeled as (:Version)-[:DEPENDS_ON]->(:Package)
- Qdrant points include payload { package_id, ecosystem } for filtering

Usage:
    python scripts/dev-seed.py
    
    # Or with custom hosts
    python scripts/dev-seed.py --memgraph-host localhost:7687 --qdrant-host localhost:6333
"""

import argparse
import json
import random
import sys
import time
from datetime import datetime, timedelta
from typing import Any

try:
    from neo4j import GraphDatabase
except ImportError:
    print("neo4j not installed. Run: pip install neo4j")
    sys.exit(1)

try:
    from qdrant_client import QdrantClient
    from qdrant_client.models import (
        Distance,
        PointStruct,
        VectorParams,
    )
except ImportError:
    print("qdrant-client not installed. Run: pip install qdrant-client")
    sys.exit(1)


# Sample package data based on popular npm/crates packages
SAMPLE_PACKAGES = [
    # JavaScript/TypeScript ecosystem
    {
        "name": "react",
        "registry": "npm",
        "versions": ["18.2.0", "18.3.0", "18.3.1"],
        "description": "A JavaScript library for building user interfaces",
        "keywords": ["react", "frontend", "ui", "component"],
        "license": "MIT",
    },
    {
        "name": "vue",
        "registry": "npm",
        "versions": ["3.3.0", "3.4.0", "3.4.21"],
        "description": "Progressive JavaScript Framework",
        "keywords": ["vue", "frontend", "reactive"],
        "license": "MIT",
    },
    {
        "name": "lodash",
        "registry": "npm",
        "versions": ["4.17.19", "4.17.20", "4.17.21"],
        "description": "Lodash modular utilities",
        "keywords": ["utilities", "functional", "modules"],
        "license": "MIT",
    },
    {
        "name": "axios",
        "registry": "npm",
        "versions": ["1.5.0", "1.6.0", "1.6.7"],
        "description": "Promise based HTTP client",
        "keywords": ["http", "ajax", "promise"],
        "license": "MIT",
    },
    {
        "name": "express",
        "registry": "npm",
        "versions": ["4.18.0", "4.18.2", "4.19.2"],
        "description": "Fast, unopinionated, minimalist web framework",
        "keywords": ["server", "http", "rest"],
        "license": "MIT",
    },
    {
        "name": "typescript",
        "registry": "npm",
        "versions": ["5.2.0", "5.3.0", "5.4.2"],
        "description": "TypeScript is a superset of JavaScript",
        "keywords": ["typescript", "types", "compiler"],
        "license": "Apache-2.0",
    },
    {
        "name": "webpack",
        "registry": "npm",
        "versions": ["5.88.0", "5.90.0", "5.91.0"],
        "description": "A bundler for javascript and friends",
        "keywords": ["bundler", "build", "module"],
        "license": "MIT",
    },
    {
        "name": "next",
        "registry": "npm",
        "versions": ["13.5.0", "14.0.0", "14.1.3"],
        "description": "The React Framework for Production",
        "keywords": ["react", "framework", "ssr"],
        "license": "MIT",
    },
    # Rust ecosystem
    {
        "name": "tokio",
        "registry": "crates.io",
        "versions": ["1.35.0", "1.36.0", "1.37.0"],
        "description": "An event-driven, non-blocking I/O platform",
        "keywords": ["async", "io", "runtime"],
        "license": "MIT",
    },
    {
        "name": "serde",
        "registry": "crates.io",
        "versions": ["1.0.196", "1.0.197", "1.0.198"],
        "description": "A generic serialization/deserialization framework",
        "keywords": ["serde", "serialization", "json"],
        "license": "MIT OR Apache-2.0",
    },
    {
        "name": "axum",
        "registry": "crates.io",
        "versions": ["0.6.20", "0.7.0", "0.7.4"],
        "description": "Web framework that focuses on ergonomics and modularity",
        "keywords": ["web", "async", "tower"],
        "license": "MIT",
    },
    {
        "name": "reqwest",
        "registry": "crates.io",
        "versions": ["0.11.26", "0.11.27", "0.12.0"],
        "description": "An easy and powerful HTTP client",
        "keywords": ["http", "client", "async"],
        "license": "MIT OR Apache-2.0",
    },
    # Python ecosystem
    {
        "name": "requests",
        "registry": "pypi",
        "versions": ["2.31.0", "2.31.1", "2.32.0"],
        "description": "Python HTTP for Humans",
        "keywords": ["http", "client", "requests"],
        "license": "Apache-2.0",
    },
    {
        "name": "fastapi",
        "registry": "pypi",
        "versions": ["0.109.0", "0.110.0", "0.110.1"],
        "description": "FastAPI framework, high performance",
        "keywords": ["api", "async", "openapi"],
        "license": "MIT",
    },
    {
        "name": "pydantic",
        "registry": "pypi",
        "versions": ["2.5.0", "2.6.0", "2.6.4"],
        "description": "Data validation using Python type hints",
        "keywords": ["validation", "types", "parsing"],
        "license": "MIT",
    },
]

# Dependency relationships
DEPENDENCIES = [
    ("next", "react"),
    ("next", "typescript"),
    ("axios", "lodash"),
    ("express", "lodash"),
    ("vue", "typescript"),
    ("axum", "tokio"),
    ("axum", "serde"),
    ("reqwest", "tokio"),
    ("reqwest", "serde"),
    ("fastapi", "pydantic"),
]


def _fnv1a_64(data: bytes) -> int:
    """Stable 64-bit FNV-1a hash."""
    h = 0xCBF29CE484222325
    for b in data:
        h ^= b
        h = (h * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return h


def generate_embedding(text: str, dim: int = 384) -> list[float]:
    """Deterministic lexical embedding.

    Matches the API's mock embedder behavior:
    - hashes token + char-trigram features into a fixed-size vector
    - L2 normalizes for cosine distance
    """

    if dim <= 0:
        return []

    vec: list[float] = [0.0] * dim
    normalized = text.lower()

    def add_feature(feature: str, weight: float) -> None:
        h = _fnv1a_64(feature.encode("utf-8"))
        idx = int(h % dim)
        sign = 1.0 if (h & 1) == 0 else -1.0
        vec[idx] += sign * weight

    def add_token(token: str) -> None:
        add_feature(f"tok:{token}", 1.0)

        # Prefix/suffix features help match common stems.
        for n in range(3, 7):
            if len(token) >= n:
                add_feature(f"pre:{token[:n]}", 0.15)
                add_feature(f"suf:{token[-n:]}", 0.15)

        if len(token) >= 3:
            for i in range(len(token) - 2):
                tri = token[i : i + 3]
                add_feature(f"tri:{tri}", 0.2)

    # Full text weak feature
    add_feature(f"txt:{normalized}", 0.25)

    # Tokenize on non-alphanumeric boundaries
    token = []
    prev_token: str | None = None
    for ch in normalized:
        if ch.isalnum() and ord(ch) < 128:
            token.append(ch)
        else:
            if token:
                cur = "".join(token)
                add_token(cur)
                if prev_token is not None:
                    add_feature(f"bi:{prev_token}_{cur}", 0.3)
                prev_token = cur
                token = []
    if token:
        cur = "".join(token)
        add_token(cur)
        if prev_token is not None:
            add_feature(f"bi:{prev_token}_{cur}", 0.3)

    # Normalize
    norm = sum(v * v for v in vec) ** 0.5
    if norm > 0:
        vec = [v / norm for v in vec]
    return vec


def registry_to_ecosystem(registry: str) -> str:
    if registry == "npm":
        return "npm"
    if registry in ("crates.io", "cargo"):
        return "cargo"
    if registry == "pypi":
        return "pypi"
    return registry


def ecosystem_to_payload(ecosystem: str) -> str:
    # Must match API's ecosystem_payload_value mapping
    mapping = {
        "npm": "NPM",
        "pypi": "PY_PI",
        "cargo": "CARGO",
        "maven": "MAVEN",
        "nuget": "NU_GET",
        "go": "GO",
    }
    return mapping.get(ecosystem.lower(), "NPM")


def stable_package_id(pkg: dict) -> str:
    eco = registry_to_ecosystem(pkg["registry"])
    return f"{eco}:{pkg['name']}"


def create_version_node(pkg: dict, version: str) -> dict:
    """Create a version node structure."""
    published = datetime.now() - timedelta(days=random.randint(1, 365))
    package_id = stable_package_id(pkg)
    return {
        "id": f"{package_id}@{version}",
        "package_id": package_id,
        "version": version,
        "published_at": published.isoformat(),
        "yanked": False,
        "created_at": int(time.time()),
    }


def seed_memgraph(driver, packages: list[dict]) -> None:
    """Seed Memgraph with package nodes and dependency edges."""
    print("Seeding Memgraph...")
    
    with driver.session() as session:
        # Create constraints
        print("  Creating constraints...")
        try:
            session.run("CREATE CONSTRAINT ON (p:Package) ASSERT p.id IS UNIQUE")
        except Exception:
            pass  # Constraint may already exist
        
        # Insert package nodes
        print("  Inserting package nodes...")
        for pkg in packages:
            eco = registry_to_ecosystem(pkg["registry"])
            pkg_id = stable_package_id(pkg)
            session.run(
                """
                MERGE (p:Package {id: $id})
                SET p.name = $name,
                    p.ecosystem = $ecosystem,
                    p.created_at = coalesce(p.created_at, $created_at),
                    p.updated_at = $updated_at
                """,
                id=pkg_id,
                name=pkg["name"],
                ecosystem=eco,
                created_at=int(time.time()),
                updated_at=int(time.time()),
            )

        # Insert version nodes
        print("  Inserting version nodes...")
        for pkg in packages:
            for version in pkg["versions"]:
                v = create_version_node(pkg, version)
                session.run(
                    """
                    MERGE (v:Version {id: $id})
                    SET v.package_id = $package_id,
                        v.version = $version,
                        v.published_at = $published_at,
                        v.yanked = $yanked,
                        v.created_at = $created_at
                    WITH v
                    MATCH (p:Package {id: $package_id})
                    MERGE (v)-[:BELONGS_TO]->(p)
                    """,
                    **v,
                )
        
        # Insert dependency edges (Version -> Package) and package projection (Package -> Package)
        print("  Creating dependency edges...")
        for dep, target in DEPENDENCIES:
            # Find packages and link latest versions
            dep_pkg = next((p for p in packages if p["name"] == dep), None)
            target_pkg = next((p for p in packages if p["name"] == target), None)
            
            if dep_pkg and target_pkg:
                dep_pkg_id = stable_package_id(dep_pkg)
                target_pkg_id = stable_package_id(target_pkg)
                dep_ver_id = f"{dep_pkg_id}@{dep_pkg['versions'][-1]}"
                
                session.run(
                    """
                    MATCH (v:Version {id: $dep_ver_id})
                    MATCH (b:Package {id: $target_pkg_id})
                    MERGE (v)-[:DEPENDS_ON {version_req: "*", dev: false}]->(b)

                    WITH v, b
                    MATCH (a:Package {id: $dep_pkg_id})
                    MERGE (a)-[:DEPENDS_ON_PKG]->(b)
                    """,
                    dep_ver_id=dep_ver_id,
                    dep_pkg_id=dep_pkg_id,
                    target_pkg_id=target_pkg_id,
                )
        
        # Create some maintainer nodes
        print("  Creating maintainer nodes...")
        maintainers = [
            {"login": "facebook", "name": "Facebook"},
            {"login": "vuejs", "name": "Vue.js Team"},
            {"login": "tokio-rs", "name": "Tokio Contributors"},
            {"login": "microsoft", "name": "Microsoft"},
            {"login": "tiangolo", "name": "Sebastián Ramírez"},
        ]
        
        for m in maintainers:
            session.run(
                """
                MERGE (m:Maintainer {login: $login})
                SET m.name = $name
                """,
                **m
            )
        
        # Link maintainers to packages
        maintainer_links = [
            ("facebook", "react"),
            ("facebook", "next"),
            ("vuejs", "vue"),
            ("tokio-rs", "tokio"),
            ("tokio-rs", "axum"),
            ("microsoft", "typescript"),
            ("tiangolo", "fastapi"),
        ]
        
        for maintainer, pkg_name in maintainer_links:
            pkg = next((p for p in packages if p["name"] == pkg_name), None)
            if pkg:
                pkg_id = stable_package_id(pkg)
                session.run(
                    """
                    MATCH (m:Maintainer {login: $maintainer})
                    MATCH (p:Package {id: $pkg_id})
                    MERGE (m)-[:MAINTAINS]->(p)
                    """,
                    maintainer=maintainer,
                    pkg_id=pkg_id
                )
    
    print("  Memgraph seeding complete!")


def seed_qdrant(client: QdrantClient, packages: list[dict]) -> None:
    """Seed Qdrant with package embeddings."""
    print("Seeding Qdrant...")
    
    collection_name = "package_embeddings"
    vector_dim = 384
    
    # Create or recreate collection
    print("  Creating collection...")
    try:
        client.delete_collection(collection_name)
    except Exception:
        pass
    
    client.create_collection(
        collection_name=collection_name,
        vectors_config=VectorParams(size=vector_dim, distance=Distance.COSINE),
    )
    
    # Insert package embeddings
    print("  Inserting package embeddings...")
    points = []
    point_id = 1
    
    for pkg in packages:
        eco = registry_to_ecosystem(pkg["registry"])
        pkg_id = stable_package_id(pkg)

        # Use deterministic mock embeddings based on package name.
        # In mock mode this is a *sanity harness* (querying by exact name),
        # not a true semantic embedding.
        point = PointStruct(
            id=point_id,
            vector=generate_embedding(pkg["name"], vector_dim),
            payload={
                "package_id": pkg_id,
                "ecosystem": ecosystem_to_payload(eco),
                "name": pkg["name"],
                "registry": pkg["registry"],
                "description": pkg["description"],
                "keywords": pkg["keywords"],
            },
        )
        points.append(point)
        point_id += 1
    
    # Batch upsert
    batch_size = 100
    for i in range(0, len(points), batch_size):
        batch = points[i:i + batch_size]
        client.upsert(collection_name=collection_name, points=batch)
    
    # Create code embeddings collection
    print("  Creating code embeddings collection...")
    code_collection = "code_embeddings"
    try:
        client.delete_collection(code_collection)
    except Exception:
        pass
    
    client.create_collection(
        collection_name=code_collection,
        vectors_config=VectorParams(size=vector_dim, distance=Distance.COSINE),
    )
    
    # Insert some sample code embeddings
    print("  Inserting code embeddings...")
    code_points = []
    code_id = 1
    
    sample_symbols = [
        ("react", "useState", "function", "const [state, setState] = useState(initialValue)"),
        ("react", "useEffect", "function", "useEffect(() => { ... }, [deps])"),
        ("react", "Component", "class", "class MyComponent extends Component { }"),
        ("vue", "ref", "function", "const count = ref(0)"),
        ("vue", "computed", "function", "const doubled = computed(() => count.value * 2)"),
        ("lodash", "debounce", "function", "_.debounce(func, wait, options)"),
        ("lodash", "throttle", "function", "_.throttle(func, wait, options)"),
        ("express", "Router", "class", "const router = express.Router()"),
        ("tokio", "spawn", "function", "tokio::spawn(async { ... })"),
        ("serde", "Serialize", "trait", "#[derive(Serialize)]"),
        ("fastapi", "FastAPI", "class", "app = FastAPI()"),
        ("pydantic", "BaseModel", "class", "class Item(BaseModel): ..."),
    ]
    
    for pkg_name, symbol, symbol_type, code in sample_symbols:
        pkg = next((p for p in packages if p["name"] == pkg_name), None)
        if pkg:
            eco = registry_to_ecosystem(pkg["registry"])
            point = PointStruct(
                id=code_id,
                vector=generate_embedding(symbol, vector_dim),
                payload={
                    "package_id": stable_package_id(pkg),
                    "ecosystem": ecosystem_to_payload(eco),
                    "symbol_name": symbol,
                    "symbol_type": symbol_type,
                    "code_snippet": code,
                    "language": "typescript" if pkg["registry"] == "npm" else 
                                "rust" if pkg["registry"] == "crates.io" else "python",
                },
            )
            code_points.append(point)
            code_id += 1
    
    if code_points:
        client.upsert(collection_name=code_collection, points=code_points)
    
    print("  Qdrant seeding complete!")


def main():
    parser = argparse.ArgumentParser(description="Seed development databases")
    parser.add_argument(
        "--memgraph-host",
        default="bolt://localhost:7687",
        help="Memgraph connection URI",
    )
    parser.add_argument(
        "--qdrant-host",
        default="localhost",
        help="Qdrant host",
    )
    parser.add_argument(
        "--qdrant-port",
        type=int,
        default=6333,
        help="Qdrant gRPC port",
    )
    parser.add_argument(
        "--skip-memgraph",
        action="store_true",
        help="Skip Memgraph seeding",
    )
    parser.add_argument(
        "--skip-qdrant",
        action="store_true",
        help="Skip Qdrant seeding",
    )
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("Dependency Graph - Development Seed Script")
    print("=" * 60)
    print()
    
    if not args.skip_memgraph:
        print(f"Connecting to Memgraph at {args.memgraph_host}...")
        try:
            driver = GraphDatabase.driver(args.memgraph_host)
            driver.verify_connectivity()
            seed_memgraph(driver, SAMPLE_PACKAGES)
            driver.close()
        except Exception as e:
            print(f"  Error connecting to Memgraph: {e}")
            print("  Skipping Memgraph seeding.")
    
    print()
    
    if not args.skip_qdrant:
        print(f"Connecting to Qdrant at {args.qdrant_host}:{args.qdrant_port}...")
        try:
            client = QdrantClient(host=args.qdrant_host, port=args.qdrant_port)
            # Qdrant may accept TCP connections before REST is fully ready (e.g. during migrations).
            # Do a small readiness probe with backoff to avoid flaky seeding.
            for attempt in range(1, 8):
                try:
                    client.get_collections()
                    break
                except Exception as e:
                    if attempt == 7:
                        raise
                    delay = min(2 ** attempt, 10)
                    print(f"  Qdrant not ready yet ({e}); retrying in {delay}s...")
                    time.sleep(delay)
            seed_qdrant(client, SAMPLE_PACKAGES)
        except Exception as e:
            print(f"  Error connecting to Qdrant: {e}")
            print("  Skipping Qdrant seeding.")
    
    print()
    print("=" * 60)
    print("Seeding complete!")
    print("=" * 60)
    print()
    print("Sample data inserted:")
    print(f"  - {len(SAMPLE_PACKAGES)} packages")
    print(f"  - {sum(len(p['versions']) for p in SAMPLE_PACKAGES)} versions")
    print(f"  - {len(DEPENDENCIES)} dependency relationships")
    print()
    print("You can now query the data via the GraphQL API.")


if __name__ == "__main__":
    main()
