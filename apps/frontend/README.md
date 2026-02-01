# Inverse Dependency Platform - Frontend

Modern, enterprise-grade frontend for the Inverse Dependency Platform built with Next.js 14, TypeScript, and TailwindCSS.

## 🚀 Features

- **Dashboard** - Overview with statistics, ecosystem distribution, and quick actions
- **Package Explorer** - Search and explore packages across NPM, PyPI, Cargo, and more
- **Dependency Graph** - Interactive force-directed graph visualization
- **Impact Analysis** - Simulate CVE impact and assess vulnerability blast radius
- **Path Finder** - Discover shortest dependency paths between packages
- **Live Feed** - Real-time package version updates

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: TailwindCSS + Custom Design System
- **State/Data**: Apollo Client (GraphQL)
- **Animations**: Framer Motion
- **Visualization**: React Force Graph 2D / D3.js
- **Icons**: Lucide React

## 📦 Installation

```bash
# Navigate to frontend directory
cd apps/frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

## 🔧 Configuration

Create a `.env.local` file (copy from `.env.example`):

```env
NEXT_PUBLIC_GRAPHQL_ENDPOINT=http://localhost:8000/graphql
NEXT_PUBLIC_AGENT_STREAM_ENDPOINT=http://localhost:8000/agent/stream
NEXT_PUBLIC_LIVE_TOKEN_ENDPOINT=http://localhost:8000/live/token
NEXT_PUBLIC_LIVE_WS_ENDPOINT=wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent
```

## 🖥️ Development

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

## 📁 Project Structure

```
apps/frontend/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── page.tsx           # Dashboard
│   │   ├── explore/           # Package search
│   │   ├── graph/             # Dependency visualization
│   │   ├── impact/            # CVE impact analysis
│   │   ├── path/              # Path finder
│   │   ├── live/              # Real-time feed
│   │   └── settings/          # Configuration
│   ├── components/
│   │   ├── dashboard/         # Dashboard components
│   │   ├── explore/           # Explorer components
│   │   ├── graph/             # Graph visualization
│   │   ├── layout/            # Layout components
│   │   └── providers/         # Context providers
│   └── lib/
│       ├── graphql/           # GraphQL queries & types
│       ├── apollo-wrapper.tsx # Apollo Client config
│       └── utils.ts           # Utility functions
├── tailwind.config.ts         # Tailwind configuration
├── next.config.js             # Next.js configuration
└── package.json
```

## 🎨 Design System

The frontend uses a custom dark-mode-first design system with:

- **Primary Color**: Indigo (#6366f1) - Trust, Reliability
- **Accent Color**: Cyan (#06b6d4) - Growth, Innovation
- **Ecosystem Colors**: Each ecosystem has its brand color
  - NPM: Red (#CB3837)
  - PyPI: Blue (#3775A9)
  - Cargo: Orange (#DEA584)
  - Maven: Red (#C71A36)
  - Go: Cyan (#00ADD8)

## 📊 GraphQL Queries

Available queries:

```graphql
# Get package by ID
query GetPackage($id: ID!) {
  package(id: $id) {
    id
    name
    ecosystem
  }
}

# Get reverse dependents
query GetReverseDependents($packageId: ID!, $maxDepth: Int, $first: Int) {
  reverseDependents(packageId: $packageId, maxDepth: $maxDepth, first: $first) {
    edges {
      node { id, name, ecosystem }
      depth
    }
    totalCount
  }
}

# Find dependency path
query GetDependencyPath($from: ID!, $to: ID!, $maxHops: Int) {
  dependencyPath(fromPackageId: $from, toPackageId: $to, maxHops: $maxHops) {
    found
    hops
    packages { id, name, ecosystem }
  }
}

# Impact analysis
query GetImpactRadius($packageId: ID!, $maxDepth: Int, $limit: Int) {
  impactRadius(packageId: $packageId, maxDepth: $maxDepth, limit: $limit) {
    impactedPackages
    impactedVersions
    topImpacted {
      package { id, name, ecosystem }
      depth
    }
  }
}
```

## 🔗 Prerequisites

Make sure the GraphQL API is running:

```bash
# From project root
cd apps/api
cargo run
```

The API should be available at `http://localhost:8000/graphql`.

Note:

- Dev default is `http://localhost:8000/graphql`.
- The production compose file `docker/docker-compose.prod.yml` publishes the API on port 8080.

## 📝 License

MIT
