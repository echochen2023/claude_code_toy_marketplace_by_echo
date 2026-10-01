#!/usr/bin/env node
/**
 * Claude Code PostToolUse Hook: Automatic Test Runner
 * Runs tests automatically when source code files are modified
 */

import { readFileSync, appendFileSync } from 'fs';
import { execSync } from 'child_process';

interface HookInput {
  tool_name: string;
  tool_input: {
    file_path?: string;
    [key: string]: unknown;
  };
  tool_output: unknown;
  success: boolean;
}

function logDebug(message: string): void {
  const logPath = '.claude/hooks/test_hook_debug.log';
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  appendFileSync(logPath, logEntry);
}

function isSourceCodeFile(filePath: string): boolean {
  // Check if this is a source code file we care about
  const codeExtensions = ['.ts', '.tsx', '.js', '.jsx'];
  const isInSrc = filePath.includes('src/') || filePath.includes('src\\');
  const hasCodeExtension = codeExtensions.some(ext => filePath.endsWith(ext));
  const isNotTestFile = !filePath.includes('.test.') && !filePath.includes('.spec.');

  return isInSrc && hasCodeExtension && isNotTestFile;
}

function wasSourceCodeModified(toolInput: HookInput['tool_input']): boolean {
  const filePath = toolInput.file_path || '';
  return isSourceCodeFile(filePath);
}

function checkTestSetup(): { hasTests: boolean; testCommand: string | null } {
  try {
    // Check package.json for test scripts (excluding lint-only scripts)
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
    const scripts = packageJson.scripts || {};

    // Look for unit test specific script names
    if (scripts['test:unit']) {
      return { hasTests: true, testCommand: 'npm run test:unit' };
    }
    if (scripts.vitest) {
      return { hasTests: true, testCommand: 'npm run vitest' };
    }
    if (scripts.jest) {
      return { hasTests: true, testCommand: 'npm run jest' };
    }

    // Check if the test script exists and is NOT just linting
    if (scripts.test) {
      const testScript = scripts.test;
      // Skip if the test script only runs lint
      if (testScript.includes('lint') && !testScript.includes('jest') && !testScript.includes('vitest') && !testScript.includes('test-runner')) {
        logDebug('Test script only runs lint, skipping');
      } else {
        return { hasTests: true, testCommand: 'npm test' };
      }
    }

    // Check for test files existence
    try {
      const testFiles = execSync('find . -name "*.spec.ts" -o -name "*.test.ts" -o -name "*.spec.tsx" -o -name "*.test.tsx" | grep -v node_modules | head -1', { stdio: 'pipe', encoding: 'utf8' }).trim();
      if (testFiles) {
        // If vitest is available in devDependencies, use it
        const devDependencies = packageJson.devDependencies || {};
        if (devDependencies.vitest) {
          return { hasTests: true, testCommand: 'npx vitest run' };
        }
        // Check if jest is available
        if (devDependencies.jest || devDependencies['@types/jest']) {
          return { hasTests: true, testCommand: 'npx jest' };
        }
        // Default to vitest for modern React setup
        return { hasTests: true, testCommand: 'npx vitest run' };
      }
    } catch {
      // No test files found
    }

    return { hasTests: false, testCommand: null };
  } catch (error) {
    logDebug(`Error checking test setup: ${error}`);
    return { hasTests: false, testCommand: null };
  }
}

function runTests(testCommand: string): { success: boolean; output: string } {
  try {
    logDebug(`Running tests with command: ${testCommand}`);
    const output = execSync(testCommand, {
      encoding: 'utf8',
      timeout: 30000, // 30 second timeout
      stdio: 'pipe'
    });

    return { success: true, output };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const output = err.stdout || err.stderr || err.message || 'Unknown error';
    logDebug(`Test command failed: ${output}`);
    return { success: false, output };
  }
}

function main(): void {
  try {
    logDebug('=== TEST RUNNER HOOK STARTED ===');

    // Read input from stdin
    const input = readFileSync(0, 'utf8');
    logDebug(`Raw input received: ${input}`);

    const hookData: HookInput = JSON.parse(input);
    logDebug(`PostToolUse hook received: ${JSON.stringify(hookData, null, 2)}`);

    // Check if source code was modified
    const sourceModified = wasSourceCodeModified(hookData.tool_input);
    logDebug(`Tool name: ${hookData.tool_name}, File path: ${hookData.tool_input?.file_path}, Source modified: ${sourceModified}`);

    if (!sourceModified) {
      logDebug('No source code modifications detected, skipping tests');
      console.log(JSON.stringify({ permissionDecision: 'allow' }));
      logDebug('=== TEST RUNNER HOOK COMPLETED (NO ACTION) ===');
      return;
    }

    logDebug('Source code modification detected, checking for tests...');

    // Check if we have tests to run
    const testSetup = checkTestSetup();

    if (!testSetup.hasTests) {
      logDebug('No tests found in project');
      console.log(JSON.stringify({
        permissionDecision: 'allow',
        systemMessage: '📝 Source code modified, but no tests found. Consider adding tests to your project.'
      }));
      logDebug('=== TEST RUNNER HOOK COMPLETED (NO TESTS) ===');
      return;
    }

    // Run tests
    logDebug(`Found tests, running: ${testSetup.testCommand}`);
    const testResult = runTests(testSetup.testCommand!);

    if (testResult.success) {
      logDebug('Tests passed successfully');
      console.log(JSON.stringify({
        permissionDecision: 'allow',
        systemMessage: `✅ Tests passed after code modification!\n\n${testResult.output.slice(-500)}`
      }));
      logDebug('=== TEST RUNNER HOOK COMPLETED (TESTS PASSED) ===');
    } else {
      logDebug('Tests failed');
      console.log(JSON.stringify({
        permissionDecision: 'allow',
        systemMessage: `❌ Tests failed after code modification:\n\n${testResult.output.slice(-1000)}\n\n⚠️  Consider fixing failing tests.`
      }));
      logDebug('=== TEST RUNNER HOOK COMPLETED (TESTS FAILED) ===');
    }

  } catch (error) {
    logDebug(`Hook error: ${error}`);
    logDebug(`Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
    // Always allow on error to not block workflow
    console.log(JSON.stringify({
      permissionDecision: 'allow',
      systemMessage: `Test runner hook error: ${error}`
    }));
    logDebug('=== TEST RUNNER HOOK COMPLETED (ERROR) ===');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}