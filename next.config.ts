import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // Allow Next.js to import the existing CJS src/ modules without bundling them
  serverExternalPackages: ['bull', 'pg', 'ioredis', 'pino', 'pino-pretty'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Treat all local src/ utility modules as external so they run in Node
      // without being bundled (avoids issues with pino/bull/pg at build time).
      // We must resolve the @/ alias to an absolute path since Node won't know it.
      const root = path.resolve(__dirname);
      const originalExternals = config.externals ?? [];
      config.externals = [
        ...(Array.isArray(originalExternals) ? originalExternals : [originalExternals]),
        ({ request }: { request?: string }, callback: (err?: Error | null, result?: string) => void) => {
          if (request && request.startsWith('@/src/')) {
            // Resolve @/ to the project root
            const resolved = path.join(root, request.slice(2)); // strip '@/'
            return callback(null, `commonjs ${resolved}`);
          }
          callback();
        },
      ];
    }
    return config;
  },
};

export default nextConfig;
