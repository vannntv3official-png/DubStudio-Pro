import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const desktopDir = path.join(rootDir, 'apps', 'desktop');

const desktopRequire = createRequire(path.join(desktopDir, 'package.json'));
const electronBinary = desktopRequire('electron');

console.log('[SmokeTest] Found Electron binary at:', electronBinary);
console.log('[SmokeTest] Starting DubStudio AI desktop application smoke test...');

const testUserData = path.join(rootDir, 'backend', '.test_user_data');
const child = spawn(electronBinary, ['.', `--user-data-dir=${testUserData}`], {
  cwd: desktopDir,
  env: {
    ...process.env,
    ELECTRON_ENABLE_LOGGING: '1',
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let backendStarted = false;
let backendReady = false;

child.stdout.on('data', (chunk) => {
  const msg = chunk.toString();
  process.stdout.write(`[App Out] ${msg}`);
  if (msg.includes('Starting backend on')) {
    backendStarted = true;
  }
  if (msg.includes('Backend is ready and responding to health check')) {
    backendReady = true;
    console.log('[SmokeTest] SUCCESS: Backend started and responded to health check!');
    // Allow window to initialize and render, then exit cleanly
    setTimeout(() => {
      console.log('[SmokeTest] Terminating test process gracefully...');
      child.kill();
      process.exit(0);
    }, 2500);
  }
});

child.stderr.on('data', (chunk) => {
  const msg = chunk.toString();
  if (msg.includes('GPU') || msg.includes('GL') || msg.includes('passthrough') || msg.includes('D3D11')) {
    return;
  }
  process.stderr.write(`[App Err] ${msg}`);
});

child.on('exit', (code, signal) => {
  console.log(`[SmokeTest] Process exited with code ${code}, signal ${signal}`);
  if (backendReady) {
    process.exit(0);
  } else {
    console.error('[SmokeTest] FAILED: Backend did not reach ready state before exit.');
    process.exit(1);
  }
});

setTimeout(() => {
  if (!backendReady) {
    console.error('[SmokeTest] TIMEOUT: DubStudio AI failed to start within 30 seconds.');
    child.kill();
    process.exit(1);
  }
}, 30000);
