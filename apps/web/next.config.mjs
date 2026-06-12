/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@onspace/shared-types'],
  // Emit a self-contained Node bundle to .next/standalone so production
  // Docker images can ship without node_modules. Local dev / `next start`
  // are unaffected. Required by apps/web/Dockerfile.
  output: 'standalone',
  // Next 15.0.2 dev quirk on dynamic `[id]` routes: webpack lists
  // `vendor-chunks/<pkg>.js` in the server bundle's manifest but doesn't
  // emit those files for tree-shaken modules (e.g. clsx, @tanstack/*).
  // The static-paths-worker child process then 500s with
  // `Cannot find module './vendor-chunks/...js'`. Disabling splitChunks
  // on the dev server compiler inlines everything into page.js so the
  // worker has nothing to miss. Production builds keep the default
  // optimization (no quirk there).
  webpack: (config, { dev, isServer }) => {
    if (dev && isServer) {
      config.optimization = config.optimization ?? {};
      config.optimization.splitChunks = false;
      config.optimization.runtimeChunk = false;
    }
    return config;
  },
};
export default nextConfig;
