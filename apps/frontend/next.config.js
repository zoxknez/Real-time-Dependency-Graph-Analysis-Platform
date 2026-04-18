/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,

  // Output standalone for Docker deployment
  // https://nextjs.org/docs/advanced-features/output-file-tracing
  output: 'standalone',

  // Note: telemetry can be disabled via NEXT_TELEMETRY_DISABLED=1 env var

  // Environment variables validation
  env: {
    NEXT_PUBLIC_GRAPHQL_ENDPOINT: process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || 'http://localhost:8000/graphql',
    NEXT_PUBLIC_WS_ENDPOINT: process.env.NEXT_PUBLIC_WS_ENDPOINT || 'ws://localhost:8000/graphql/ws',
    NEXT_PUBLIC_AGENT_STREAM_ENDPOINT: process.env.NEXT_PUBLIC_AGENT_STREAM_ENDPOINT || 'http://localhost:8000/agent/stream',
    NEXT_PUBLIC_SEARCH_MODE: process.env.NEXT_PUBLIC_SEARCH_MODE || 'semantic',
  },

  // Webpack configuration
  webpack: (config, { isServer }) => {
    // Fix for canvas module in react-force-graph
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        canvas: false,
        encoding: false,
      };
    }
    return config;
  },

  // Image optimization
  images: {
    remotePatterns: [],
    unoptimized: process.env.NODE_ENV === 'development',
  },

  // Security headers
  // Based on OWASP Secure Headers Project: https://owasp.org/www-project-secure-headers/
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          }
        ],
      },
    ];
  },

  // Experimental features
  experimental: {
    // Enable server actions
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  // Compiler options
  compiler: {
    // Remove console logs in production
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // TypeScript configuration
  typescript: {
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    ignoreBuildErrors: false,
  },

  // ESLint configuration
  eslint: {
    // Run ESLint on these directories during production builds
    dirs: ['src', 'app', 'components', 'lib'],
    ignoreDuringBuilds: false,
  },
};

module.exports = nextConfig;

// Made with Bob
