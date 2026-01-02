import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const packageQueryDuration = new Trend('package_query_duration', true);
const searchQueryDuration = new Trend('search_query_duration', true);
const dependentsQueryDuration = new Trend('dependents_query_duration', true);
const impactQueryDuration = new Trend('impact_query_duration', true);

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp up
    { duration: '1m', target: 50 },    // Stay at 50 VUs
    { duration: '2m', target: 100 },   // Peak load
    { duration: '1m', target: 50 },    // Scale down
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
    errors: ['rate<0.05'],
    package_query_duration: ['p(95)<200'],
    search_query_duration: ['p(95)<300'],
    dependents_query_duration: ['p(95)<500'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:8080';
const GRAPHQL_ENDPOINT = `${BASE_URL}/graphql`;

// Sample data for testing
const SAMPLE_PACKAGES = [
  'npm:react@18.3.1',
  'npm:vue@3.4.21',
  'npm:lodash@4.17.21',
  'npm:express@4.19.2',
  'npm:typescript@5.4.2',
  'crates.io:tokio@1.37.0',
  'crates.io:serde@1.0.198',
  'crates.io:axum@0.7.4',
  'pypi:requests@2.32.0',
  'pypi:fastapi@0.110.1',
];

const SEARCH_TERMS = [
  'react',
  'async',
  'http',
  'json',
  'web framework',
  'database',
  'testing',
  'cli',
];

// GraphQL query functions
function graphqlQuery(query, variables = {}) {
  const payload = JSON.stringify({ query, variables });
  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };
  return http.post(GRAPHQL_ENDPOINT, payload, params);
}

// Package query
function queryPackage(packageId) {
  const query = `
    query GetPackage($id: ID!) {
      package(id: $id) {
        id
        name
        ecosystem
        latestVersion
        description
        license
        downloadCount
        dependencies {
          id
          name
          versionReq
        }
      }
    }
  `;
  return graphqlQuery(query, { id: packageId });
}

// Search packages query
function searchPackages(term, limit = 20) {
  const query = `
    query SearchPackages($query: String!, $limit: Int) {
      searchPackages(query: $query, limit: $limit) {
        items {
          id
          name
          ecosystem
          description
          downloadCount
        }
        totalCount
        hasMore
      }
    }
  `;
  return graphqlQuery(query, { query: term, limit });
}

// Reverse dependents query
function queryReverseDependents(packageId, depth = 2) {
  const query = `
    query ReverseDependents($packageId: ID!, $depth: Int) {
      reverseDependents(packageId: $packageId, depth: $depth) {
        nodes {
          id
          name
          ecosystem
        }
        edges {
          source
          target
          versionReq
        }
        totalCount
      }
    }
  `;
  return graphqlQuery(query, { packageId, depth });
}

// Impact radius query
function queryImpactRadius(packageId) {
  const query = `
    query ImpactRadius($packageId: ID!) {
      impactRadius(packageId: $packageId) {
        direct
        transitive
        total
        byEcosystem {
          ecosystem
          count
        }
        criticalDependents {
          id
          name
          downloadCount
        }
      }
    }
  `;
  return graphqlQuery(query, { packageId });
}

// Graph stats query
function queryGraphStats() {
  const query = `
    query GraphStats {
      graphStats {
        totalPackages
        totalVersions
        totalDependencies
        byEcosystem {
          ecosystem
          packageCount
          versionCount
        }
      }
    }
  `;
  return graphqlQuery(query);
}

// Version history query
function queryVersionHistory(packageId) {
  const query = `
    query VersionHistory($packageId: ID!, $limit: Int) {
      versionHistory(packageId: $packageId, limit: $limit) {
        version
        publishedAt
        hasBreakingChanges
        downloadCount
      }
    }
  `;
  return graphqlQuery(query, { packageId, limit: 10 });
}

// Main test function
export default function () {
  const packageId = SAMPLE_PACKAGES[Math.floor(Math.random() * SAMPLE_PACKAGES.length)];
  const searchTerm = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)];

  group('Package Queries', function () {
    const res = queryPackage(packageId);
    const success = check(res, {
      'package query status 200': (r) => r.status === 200,
      'package query has data': (r) => {
        const body = JSON.parse(r.body);
        return body.data !== undefined;
      },
      'package query no errors': (r) => {
        const body = JSON.parse(r.body);
        return !body.errors || body.errors.length === 0;
      },
    });
    errorRate.add(!success);
    packageQueryDuration.add(res.timings.duration);
  });

  sleep(0.5);

  group('Search Queries', function () {
    const res = searchPackages(searchTerm);
    const success = check(res, {
      'search status 200': (r) => r.status === 200,
      'search has results': (r) => {
        const body = JSON.parse(r.body);
        return body.data?.searchPackages !== undefined;
      },
    });
    errorRate.add(!success);
    searchQueryDuration.add(res.timings.duration);
  });

  sleep(0.5);

  group('Reverse Dependents', function () {
    const res = queryReverseDependents(packageId, 2);
    const success = check(res, {
      'dependents status 200': (r) => r.status === 200,
      'dependents has data': (r) => {
        const body = JSON.parse(r.body);
        return body.data?.reverseDependents !== undefined;
      },
    });
    errorRate.add(!success);
    dependentsQueryDuration.add(res.timings.duration);
  });

  sleep(0.5);

  // Less frequent queries
  if (Math.random() < 0.2) {
    group('Impact Radius', function () {
      const res = queryImpactRadius(packageId);
      const success = check(res, {
        'impact status 200': (r) => r.status === 200,
      });
      errorRate.add(!success);
      impactQueryDuration.add(res.timings.duration);
    });
  }

  if (Math.random() < 0.1) {
    group('Graph Stats', function () {
      const res = queryGraphStats();
      check(res, {
        'stats status 200': (r) => r.status === 200,
      });
    });
  }

  if (Math.random() < 0.1) {
    group('Version History', function () {
      const res = queryVersionHistory(packageId);
      check(res, {
        'history status 200': (r) => r.status === 200,
      });
    });
  }

  sleep(1);
}

// Setup function - runs once before the test
export function setup() {
  console.log('Starting load test against:', GRAPHQL_ENDPOINT);
  
  // Verify API is accessible
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`API health check failed: ${res.status}`);
  }
  
  return { startTime: Date.now() };
}

// Teardown function - runs once after the test
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Test completed in ${duration.toFixed(2)} seconds`);
}
