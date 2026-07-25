/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 14.x needs this flag to run instrumentation.ts on server boot.
  // (Not needed on Next 15+, where it's on by default — safe to remove if you upgrade.)
  experimental: {
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
