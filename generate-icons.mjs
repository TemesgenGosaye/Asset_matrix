import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join } from 'path';

const sizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192
};

const logoPath = 'public/images/msflogo.jpg';
const androidResPath = 'android/app/src/main/res';

async function generateIcons() {
  console.log('🎨 Generating Android icons from logo...\n');
  
  for (const [folder, size] of Object.entries(sizes)) {
    const outputDir = join(androidResPath, folder);
    const outputPath = join(outputDir, 'ic_launcher.png');
    const roundOutputPath = join(outputDir, 'ic_launcher_round.png');
    
    try {
      // Create directory if it doesn't exist
      mkdirSync(outputDir, { recursive: true });
      
      // Generate square icon
      await sharp(logoPath)
        .resize(size, size, { fit: 'contain', background: { r: 15, g: 23, b: 42, alpha: 1 } })
        .png()
        .toFile(outputPath);
      
      console.log(`✓ ${folder}/ic_launcher.png (${size}x${size})`);
      
      // Generate round icon
      const roundSize = size;
      const radius = roundSize / 2;
      
      // Create circular mask
      const circle = Buffer.from(
        `<svg><circle cx="${radius}" cy="${radius}" r="${radius}" /></svg>`
      );
      
      await sharp(logoPath)
        .resize(size, size, { fit: 'contain', background: { r: 15, g: 23, b: 42, alpha: 1 } })
        .composite([{
          input: circle,
          blend: 'dest-in'
        }])
        .png()
        .toFile(roundOutputPath);
      
      console.log(`✓ ${folder}/ic_launcher_round.png (${size}x${size})`);
      
    } catch (error) {
      console.error(`✗ Error generating ${folder}:`, error.message);
    }
  }
  
  console.log('\n✅ Icon generation complete!');
}

generateIcons().catch(console.error);
