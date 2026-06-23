// build-preload.js
const fs = require('fs');
const path = require('path');

// Ensure dist directory exists
const distDir = path.join(__dirname, 'dist', 'main');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copy preload.js to dist directory
const preloadSrc = path.join(__dirname, 'src', 'main', 'preload.js');
const preloadDest = path.join(distDir, 'preload.js');

try {
  // Copy the file
  fs.copyFileSync(preloadSrc, preloadDest);
  console.log(`Successfully copied preload.js to ${preloadDest}`);
  
} catch (err) {
  console.error('Error during build:', err);
  process.exit(1);
} 
