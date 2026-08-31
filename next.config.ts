import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // SVG를 Next.js Image 컴포넌트로 사용하려면 dangerouslyAllowSVG가 필요합니다.
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;
