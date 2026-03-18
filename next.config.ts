import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow Next.js to import the existing CJS src/ modules
  serverExternalPackages: ['bull', 'pg', 'pino', 'pino-pretty'],
};

export default nextConfig;
