const isProd = process.env.NODE_ENV === 'production';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // Usa o basePath e assetPrefix apenas no GitHub Pages (produção)
  basePath: isProd ? '/Arkiv3.0' : '',
  assetPrefix: isProd ? '/Arkiv3.0' : '',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;