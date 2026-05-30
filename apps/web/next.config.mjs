/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@overturn/db", "@overturn/shared"],
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
};
export default nextConfig;
