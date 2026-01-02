import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const rateLimitHits = new Rate('rate_limit_hits');
const avgResponseTime = new Trend('avg_response_time', true);

export const options = {
  scenarios: {
    // Test rate limiting for free tier (100 req/min)
    free_tier_test: {
      executor: 'constant-arrival-rate',
      rate: 200, // 200 requests per minute (exceeds limit)
      timeUnit: '1m',
      duration: '2m',
      preAllocatedVUs: 10,
      maxVUs: 20,
      tags: { tier: 'free' },
    },
    // Test rate limiting for pro tier (1000 req/min)
    pro_tier_test: {
      executor: 'constant-arrival-rate',
      rate: 1500, // 1500 requests per minute (exceeds limit)
      timeUnit: '1m',
      duration: '2m',
      preAllocatedVUs: 20,
      maxVUs: 50,
      startTime: '3m',
      tags: { tier: 'pro' },
    },
    // Test burst handling
    burst_test: {
      executor: 'shared-iterations',
      vus: 50,
      iterations: 500,
      maxDuration: '30s',
      startTime: '6m',
      tags: { tier: 'burst' },
    },
  },
  thresholds: {
    // At least 50% of requests should be rate limited in free tier test
    'rate_limit_hits{tier:free}': ['rate>0.3'],
    // Response time should stay reasonable even under load
    'avg_response_time{tier:free}': ['p(95)<1000'],
    // 429 responses should have proper headers
    'http_req_duration{status:429}': ['p(95)<100'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:8080';
const GRAPHQL_ENDPOINT = `${BASE_URL}/graphql`;

// Simple query for rate limit testing
const SIMPLE_QUERY = `
  query {
    graphStats {
      totalPackages
    }
  }
`;

// API keys for different tiers (mock)
const API_KEYS = {
  free: 'test-free-tier-key',
  pro: 'test-pro-tier-key',
  enterprise: 'test-enterprise-tier-key',
};

function makeGraphQLRequest(apiKey = null) {
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  
  return http.post(
    GRAPHQL_ENDPOINT,
    JSON.stringify({ query: SIMPLE_QUERY }),
    { headers, tags: { name: 'graphql_query' } }
  );
}

export default function () {
  const scenario = __ENV.SCENARIO || 'free';
  const apiKey = API_KEYS[scenario] || null;
  
  const res = makeGraphQLRequest(apiKey);
  avgResponseTime.add(res.timings.duration);
  
  // Check for rate limiting
  const isRateLimited = res.status === 429;
  rateLimitHits.add(isRateLimited ? 1 : 0);
  
  if (isRateLimited) {
    // Verify rate limit response format
    check(res, {
      'rate limit has retry-after': (r) => r.headers['Retry-After'] !== undefined,
      'rate limit has x-ratelimit-limit': (r) => r.headers['X-Ratelimit-Limit'] !== undefined,
      'rate limit has x-ratelimit-remaining': (r) => r.headers['X-Ratelimit-Remaining'] !== undefined,
      'rate limit body has error': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.errors && body.errors.some(e => e.message.includes('rate limit'));
        } catch {
          return false;
        }
      },
    });
  } else {
    // Normal response checks
    check(res, {
      'status is 200': (r) => r.status === 200,
      'has valid response': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.data !== undefined;
        } catch {
          return false;
        }
      },
    });
  }
  
  // Small sleep to control rate
  sleep(0.1);
}

// Test distributed rate limiting (Redis-backed)
export function distributedRateLimitTest() {
  const headers = {
    'Content-Type': 'application/json',
    'X-Forwarded-For': `192.168.1.${Math.floor(Math.random() * 254) + 1}`,
  };
  
  const res = http.post(
    GRAPHQL_ENDPOINT,
    JSON.stringify({ query: SIMPLE_QUERY }),
    { headers }
  );
  
  check(res, {
    'response received': (r) => r.status === 200 || r.status === 429,
  });
  
  if (res.status === 429) {
    rateLimitHits.add(1);
  }
  
  sleep(0.05);
}

// Test different client IPs (simulating distributed clients)
export function multiClientTest() {
  const clientId = Math.floor(Math.random() * 100);
  const headers = {
    'Content-Type': 'application/json',
    'X-Client-Id': `client-${clientId}`,
  };
  
  // Each "client" makes a few requests
  for (let i = 0; i < 5; i++) {
    const res = http.post(
      GRAPHQL_ENDPOINT,
      JSON.stringify({ query: SIMPLE_QUERY }),
      { headers }
    );
    
    if (res.status === 429) {
      rateLimitHits.add(1);
      break; // Stop if rate limited
    }
    
    sleep(0.1);
  }
  
  sleep(1);
}

// Test rate limit recovery
export function rateLimitRecoveryTest() {
  // Exhaust rate limit
  let rateLimited = false;
  for (let i = 0; i < 150 && !rateLimited; i++) {
    const res = makeGraphQLRequest();
    if (res.status === 429) {
      rateLimited = true;
      
      // Get retry-after header
      const retryAfter = parseInt(res.headers['Retry-After'] || '60');
      console.log(`Rate limited! Retry after: ${retryAfter}s`);
      
      // Wait for rate limit to reset
      sleep(retryAfter + 1);
      
      // Verify recovery
      const recoveryRes = makeGraphQLRequest();
      check(recoveryRes, {
        'recovered from rate limit': (r) => r.status === 200,
      });
    }
  }
  
  if (!rateLimited) {
    console.log('Did not hit rate limit after 150 requests');
  }
}
