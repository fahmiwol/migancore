/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NOTE: do NOT set output:"standalone" — pm2 runs `next start`, and `next start`
  // does NOT work with standalone output: it serves a STALE .next, so new builds
  // never ship (chunk hash unchanged) and old crashing code stays live. This caused
  // the 2026-06-15 outage. If we ever want standalone, run `node .next/standalone/server.js`,
  // not `next start`. See FINDINGS F-024.
};
export default nextConfig;
