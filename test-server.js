/**
 * Test server wrapper for Playwright tests
 * Starts the PDFile GUI and extracts the server URL
 */
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const testPdfPath = process.argv[2] || join(__dirname, 'test-fixtures', 'test.pdf');

const serverProcess = spawn('node', ['dist/cli.js', 'gui', testPdfPath], {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: false
});

let resolved = false;

serverProcess.stdout.on('data', (data) => {
  const output = data.toString();
  process.stdout.write(output);

  // Look for the server URL pattern
  const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
  if (match && !resolved) {
    resolved = true;
    console.log('\n__SERVER_URL__:', match[0]);
  }
});

serverProcess.stderr.on('data', (data) => {
  process.stderr.write(data);
});

serverProcess.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

serverProcess.on('exit', (code) => {
  console.log('Server exited with code:', code);
});

// Keep process alive
process.on('SIGINT', () => {
  serverProcess.kill();
  process.exit();
});

process.on('SIGTERM', () => {
  serverProcess.kill();
  process.exit();
});
