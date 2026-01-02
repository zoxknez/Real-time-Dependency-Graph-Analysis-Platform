import http from 'k6/http';
import { check, sleep } from 'k6';
import ws from 'k6/ws';
import { Rate, Counter } from 'k6/metrics';

// Custom metrics
const wsConnectionErrors = new Rate('ws_connection_errors');
const wsMessageReceived = new Counter('ws_messages_received');
const subscriptionLatency = new Counter('subscription_latency');

export const options = {
  stages: [
    { duration: '15s', target: 20 },   // Ramp up WebSocket connections
    { duration: '1m', target: 50 },    // Sustain 50 concurrent subscriptions
    { duration: '30s', target: 100 },  // Peak subscriptions
    { duration: '1m', target: 100 },   // Hold at peak
    { duration: '15s', target: 0 },    // Ramp down
  ],
  thresholds: {
    ws_connection_errors: ['rate<0.05'],
    ws_messages_received: ['count>100'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:8080';
const WS_URL = BASE_URL.replace('http', 'ws') + '/graphql';

// Subscription types to test
const SUBSCRIPTIONS = {
  newVersion: `
    subscription NewVersions($ecosystems: [Ecosystem!]) {
      newVersion(ecosystems: $ecosystems) {
        packageId
        version
        ecosystem
        publishedAt
      }
    }
  `,
  breakingChanges: `
    subscription BreakingChanges($ecosystems: [Ecosystem!]) {
      breakingChangeDetected(ecosystems: $ecosystems) {
        packageId
        fromVersion
        toVersion
        changeType
        severity
        description
      }
    }
  `,
  liveStats: `
    subscription LiveStats {
      liveStats {
        totalPackages
        totalVersions
        newVersionsLast24h
        breakingChangesLast24h
      }
    }
  `,
  packageEvents: `
    subscription PackageEvents($packageId: ID!) {
      packageEvents(packageId: $packageId) {
        eventType
        timestamp
        data
      }
    }
  `,
};

// Sample package IDs for testing
const SAMPLE_PACKAGE_IDS = [
  'npm:react',
  'npm:vue',
  'npm:express',
  'crates.io:tokio',
  'crates.io:serde',
  'pypi:fastapi',
];

export default function () {
  // Choose a random subscription type
  const subscriptionTypes = Object.keys(SUBSCRIPTIONS);
  const subType = subscriptionTypes[Math.floor(Math.random() * subscriptionTypes.length)];
  const query = SUBSCRIPTIONS[subType];
  
  // Prepare variables based on subscription type
  let variables = {};
  if (subType === 'packageEvents') {
    variables.packageId = SAMPLE_PACKAGE_IDS[Math.floor(Math.random() * SAMPLE_PACKAGE_IDS.length)];
  } else if (subType === 'newVersion' || subType === 'breakingChanges') {
    variables.ecosystems = ['NPM', 'CARGO', 'PYPI'];
  }

  // GraphQL over WebSocket protocol (graphql-ws)
  const payload = JSON.stringify({
    id: `sub-${__VU}-${Date.now()}`,
    type: 'subscribe',
    payload: {
      query,
      variables,
    },
  });

  const connectionAck = JSON.stringify({ type: 'connection_init' });

  const res = ws.connect(WS_URL, { headers: { 'Sec-WebSocket-Protocol': 'graphql-transport-ws' } }, function (socket) {
    socket.on('open', function () {
      // Send connection init
      socket.send(connectionAck);
    });

    socket.on('message', function (message) {
      const msg = JSON.parse(message);
      
      if (msg.type === 'connection_ack') {
        // Connection acknowledged, send subscription
        socket.send(payload);
      } else if (msg.type === 'next') {
        // Received data
        wsMessageReceived.add(1);
        subscriptionLatency.add(Date.now());
        
        check(msg, {
          'has payload': (m) => m.payload !== undefined,
          'has data': (m) => m.payload?.data !== undefined,
        });
      } else if (msg.type === 'error') {
        wsConnectionErrors.add(1);
      }
    });

    socket.on('error', function (e) {
      wsConnectionErrors.add(1);
      console.error('WebSocket error:', e);
    });

    socket.on('close', function () {
      // Connection closed
    });

    // Keep connection open for some time to receive events
    socket.setTimeout(function () {
      // Send unsubscribe
      socket.send(JSON.stringify({
        id: `sub-${__VU}-${Date.now()}`,
        type: 'complete',
      }));
      socket.close();
    }, 10000 + Math.random() * 20000); // 10-30 seconds
  });

  check(res, {
    'WebSocket connection successful': (r) => r && r.status === 101,
  });

  if (!res || res.status !== 101) {
    wsConnectionErrors.add(1);
  }

  sleep(1);
}

// Concurrent HTTP + WebSocket load test
export function mixedLoad() {
  const graphqlEndpoint = `${BASE_URL}/graphql`;
  
  // 70% HTTP queries, 30% WebSocket subscriptions
  if (Math.random() < 0.7) {
    // HTTP GraphQL query
    const query = `
      query {
        graphStats {
          totalPackages
          totalVersions
        }
      }
    `;
    
    const res = http.post(graphqlEndpoint, JSON.stringify({ query }), {
      headers: { 'Content-Type': 'application/json' },
    });
    
    check(res, {
      'HTTP status 200': (r) => r.status === 200,
    });
  } else {
    // WebSocket subscription (shorter duration)
    ws.connect(WS_URL, { headers: { 'Sec-WebSocket-Protocol': 'graphql-transport-ws' } }, function (socket) {
      socket.on('open', function () {
        socket.send(JSON.stringify({ type: 'connection_init' }));
      });
      
      socket.on('message', function (message) {
        const msg = JSON.parse(message);
        if (msg.type === 'connection_ack') {
          socket.send(JSON.stringify({
            id: 'short-sub',
            type: 'subscribe',
            payload: {
              query: SUBSCRIPTIONS.liveStats,
            },
          }));
        } else if (msg.type === 'next') {
          wsMessageReceived.add(1);
        }
      });
      
      socket.setTimeout(function () {
        socket.close();
      }, 5000);
    });
  }
  
  sleep(0.5);
}
