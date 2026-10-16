/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The shared package is consumed as TypeScript source, so Next must transpile it.
  transpilePackages: ['@traceback/shared'],
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  // `standalone` output is only needed for the Docker image; on Windows the
  // symlink step requires elevated privileges, so it is opt-in via an env var.
  ...(process.env.NEXT_OUTPUT_STANDALONE === '1' ? { output: 'standalone' } : {}),
};

export default nextConfig;
