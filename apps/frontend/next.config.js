/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Allow loading external images if needed
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
  
  // Turbopack configuration (now stable in Next.js 16)
  turbopack: {
    // Turbopack options can be added here if needed
  },
  
  // Enable React Compiler for automatic memoization (stable in Next.js 16)
  // reactCompiler: true,
  
  // Enable experimental Turbopack file system caching for faster dev restarts
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },
};

module.exports = nextConfig;
