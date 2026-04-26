const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

const assetsDir = path.join(__dirname, 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir);
}

// Professional NeuralDesk SVG Design
// Background: Deep Dark Blue (#0A0A0F)
// Symbol: Stylized 'N' with neural link nodes in a gradient
const svgIcon = `
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="100" fill="#0A0A0F"/>
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#8B5CF6;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#3B82F6;stop-opacity:1" />
    </linearGradient>
  </defs>
  <circle cx="140" cy="140" r="25" fill="url(#grad)"/>
  <circle cx="372" cy="140" r="25" fill="url(#grad)"/>
  <circle cx="140" cy="372" r="25" fill="url(#grad)"/>
  <circle cx="372" cy="372" r="25" fill="url(#grad)"/>
  <path d="M140 372V140L372 372V140" stroke="url(#grad)" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M140 140L372 372" stroke="white" stroke-width="10" stroke-opacity="0.2" stroke-linecap="round"/>
</svg>`;

async function generate() {
  console.log('🚀 Generating NeuralDesk Icon...');

  const tempPng = path.join(assetsDir, 'temp_icon.png');
  const finalIco = path.join(assetsDir, 'icon.ico');

  try {
    // 1. Render SVG to high-res PNG
    await sharp(Buffer.from(svgIcon))
      .resize(512, 512)
      .png()
      .toFile(tempPng);

    // 2. Convert PNG to multi-size ICO
    const buf = await pngToIco(tempPng);
    fs.writeFileSync(finalIco, buf);

    // 3. Cleanup
    fs.unlinkSync(tempPng);

    console.log(`✅ Success! Icon created at: ${finalIco}`);
  } catch (err) {
    console.error('❌ Failed to generate icon:', err);
    process.exit(1);
  }
}

generate();