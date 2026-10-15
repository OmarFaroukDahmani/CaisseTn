// Post-install script to ensure expo-router asset PNGs exist
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, 'node_modules', 'expo-router', 'assets');
const requiredAssets = [
  'file.png', 'pkg.png', 'unmatched.png', 'error.png',
  'forward.png', 'sitemap.png', 'arrow_down.png', 'logotype.png',
];

// 1x1 transparent PNG base64
const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

if (fs.existsSync(assetsDir)) {
  for (const asset of requiredAssets) {
    const assetPath = path.join(assetsDir, asset);
    if (!fs.existsSync(assetPath)) {
      fs.writeFileSync(assetPath, transparentPng);
      console.log(`Created missing asset: ${asset}`);
    }
  }
}
