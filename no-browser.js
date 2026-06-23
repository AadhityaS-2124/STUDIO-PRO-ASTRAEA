// This script prevents any browser from being opened
// It works by overriding the open package that's used by vite and other tools
const originalConsoleLog = console.log;

// Override console.log to detect browser launch attempts
console.log = function(...args) {
  const logString = args.join(' ');
  if (
    logString.includes('Local:') ||
    logString.includes('launching browser') ||
    logString.includes('browser launched')
  ) {
    originalConsoleLog('Browser launch attempt detected and prevented');
    return;
  }
  
  originalConsoleLog(...args);
};

// Run the actual command
require('child_process').spawn(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['run', 'dev'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      BROWSER: 'none',
      VITE_OPEN_BROWSER: 'false',
      OPEN_BROWSER: 'false',
    }
  }
); 