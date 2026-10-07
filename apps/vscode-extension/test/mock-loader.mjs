/**
 * Custom loader for Node.js to mock the vscode module during tests.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const vscodeMockPath = pathResolve(__dirname, 'vscode-mock.cjs');

export async function resolve(specifier, context, nextResolve) {
  // Intercept vscode module imports
  if (specifier === 'vscode') {
    return {
      url: `file:///${vscodeMockPath.replace(/\\/g, '/')}`,
      shortCircuit: true,
    };
  }

  return nextResolve(specifier, context);
}
