/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source; Next compiles them in place.
  transpilePackages: [
    "@music-rpg/ai",
    "@music-rpg/analytics",
    "@music-rpg/auth",
    "@music-rpg/database",
    "@music-rpg/domain",
    "@music-rpg/events",
    "@music-rpg/jobs",
    "@music-rpg/moderation",
    "@music-rpg/shared",
    "@music-rpg/simulation",
    "@music-rpg/storage",
    "@music-rpg/ui",
  ],
  experimental: {
    // PGlite ships WASM and must not be bundled into the server build.
    serverComponentsExternalPackages: ["@electric-sql/pglite", "postgres"],
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
