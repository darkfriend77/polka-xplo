/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@polka-xplo/shared"],
  async rewrites() {
    // Proxy /indexer-api/* to the indexer so browser never needs its direct address.
    // Server-side code uses API_URL directly (Docker internal network).
    const dest = process.env.API_URL ?? "http://localhost:3001";
    return [
      { source: "/indexer-api/:path*", destination: `${dest}/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
