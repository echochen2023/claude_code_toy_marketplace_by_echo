#!/usr/bin/env node
/**
 * Claude Code Pre-Tool Use Hook: Linting Before Commits
 * Project-specific hook that intercepts git commit commands and runs linting first.
 */

import * as fs from 'fs';
import { execSync } from 'child_process';

interface HookInput {
  tool_name: string;
  tool_input: {
    command?: string;
    [key: string]: unknown;
  };
}

interface HookResponse {
  continue?: boolean;
  suppressOutput?: boolean;
  stopReason?: string;
  decision?: 'approve' | 'block';
  reason?: string;
  systemMessage?: string;
  permissionDecision?: 'allow' | 'deny' | 'ask';
  hookSpecificOutput?: {
    hookEventName: 'PreToolUse';
    permissionDecision?: 'allow' | 'deny' | 'ask';
    permissionDecisionReason?: string;
  };
}

interface LintResult {
  success: boolean;
  message: string;
}

function logDebug(message: string): void {
  const logPath = '.claude/hooks/hook_debug.log';
  fs.appendFileSync(logPath, `${message}\n`);
}

function getStagedFiles(): string[] {
  try {
    const result = execSync('git diff --cached --name-only --diff-filter=ACM', {
      encoding: 'utf8'
    });
    const stagedFiles = result.trim().split('\n').filter(f => f.trim());
    logDebug(`Staged files: ${JSON.stringify(stagedFiles)}`);
    return stagedFiles;
  } catch {
    logDebug('Failed to get staged files');
    return [];
  }
}

function runCommand(command: string, args: string[]): { returnCode: number; stdout: string; stderr: string } {
  try {
    const result = execSync(`${command} ${args.join(' ')}`, {
      encoding: 'utf8',
      stdio: 'pipe'
    });
    return { returnCode: 0, stdout: result, stderr: '' };
  } catch (error: unknown) {
    const err = error as { status?: number; stdout?: string; stderr?: string; message?: string };
    return {
      returnCode: err.status || 1,
      stdout: err.stdout || '',
      stderr: err.stderr || err.message || ''
    };
  }
}

function runLinters(): LintResult {
  const results: string[] = [];

  // Get the current working directory (should be project root)
  const cwd = process.cwd();
  logDebug(`Running linters in project: ${cwd}`);

  // Check if we're in a git repository
  try {
    execSync('git rev-parse --git-dir', { stdio: 'pipe' });
  } catch {
    return { success: true, message: 'Not in a git repository, skipping linting' };
  }

  // Get staged files
  const stagedFiles = getStagedFiles();
  if (stagedFiles.length === 0) {
    logDebug('No staged files to lint');
    return { success: true, message: 'No staged files to lint' };
  }

  // Filter staged files by type
  const pythonFiles = stagedFiles.filter(f => f.endsWith('.py'));
  const jsTsFiles = stagedFiles.filter(f => /\.(js|ts|jsx|tsx)$/.test(f));

  logDebug(`Python files to lint: ${JSON.stringify(pythonFiles)}`);
  logDebug(`JS/TS files to lint: ${JSON.stringify(jsTsFiles)}`);

  // Python linting with flake8
  if (pythonFiles.length > 0) {
    try {
      const result = runCommand('flake8', [
        '--max-line-length=88',
        '--extend-ignore=E203,W503',
        ...pythonFiles
      ]);
      if (result.returnCode !== 0) {
        results.push(`Python linting (flake8) failed:\n${result.stdout}`);
      } else {
        logDebug('Python linting passed');
      }
    } catch {
      logDebug('flake8 not found, skipping Python linting');
    }
  }

  // JavaScript/TypeScript linting with eslint
  if (jsTsFiles.length > 0) {
    try {
      const result = runCommand('npx', ['eslint', ...jsTsFiles]);
      if (result.returnCode !== 0) {
        results.push(`JavaScript/TypeScript linting (eslint) failed:\n${result.stdout}`);
      } else {
        logDebug('JS/TS linting passed');
      }
    } catch {
      logDebug('eslint not found, skipping JS/TS linting');
    }
  }

  // Check for Python requirements and run additional checks on staged Python files
  if (pythonFiles.length > 0 && (fs.existsSync('requirements.txt') || fs.existsSync('pyproject.toml'))) {
    // Try running black for code formatting check on staged Python files only
    try {
      const result = runCommand('black', ['--check', '--diff', ...pythonFiles]);
      if (result.returnCode !== 0) {
        results.push(`Python formatting (black) check failed:\n${result.stdout}`);
      } else {
        logDebug('Black formatting check passed');
      }
    } catch {
      logDebug('black not found, skipping formatting check');
    }
  }

  if (results.length > 0) {
    return {
      success: false,
      message: `Linting failed:\n${'='.repeat(50)}\n${results.join('\n')}`
    };
  } else {
    return { success: true, message: 'All linting checks passed' };
  }
}

// Matches `git commit` even when git global options sit in between,
// e.g. `git -C "/path/to/repo" commit`, `git -c user.name=x commit`, `git --no-pager commit`
const SHELL_WORD = String.raw`(?:[^\s"']|"[^"]*"|'[^']*')+`;
const GIT_COMMIT_PATTERN = new RegExp(
  String.raw`(?:^|[\s;&|(])git` +
  String.raw`(?:\s+(?:-[Cc]\s+${SHELL_WORD}|--?[\w-]+(?:=${SHELL_WORD})?))*` +
  String.raw`\s+commit\b`
);

function isGitCommitCommand(command: string): boolean {
  return GIT_COMMIT_PATTERN.test(command);
}

function main(): void {
  try {
    // Read input from stdin (Claude Code passes hook data as JSON)
    let inputData = '';
    process.stdin.setEncoding('utf8');

    process.stdin.on('readable', () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        inputData += chunk;
      }
    });

    process.stdin.on('end', () => {
      try {
        const input: HookInput = JSON.parse(inputData);

        logDebug(`Hook input received: ${JSON.stringify(input, null, 2)}`);

        // Extract tool information
        const toolName = input.tool_name || '';
        const toolInput = input.tool_input || {};
        const command = toolInput.command || '';

        // Log detailed tool information
        logDebug(`Tool name: ${toolName}`);
        logDebug(`Tool input: ${JSON.stringify(toolInput, null, 2)}`);
        logDebug(`Command: ${command}`);

        // Check if this is a git commit command
        const isGitCommit = toolName === 'Bash' && isGitCommitCommand(command);

        logDebug(`Is git commit command: ${isGitCommit}`);

        let response: HookResponse;

        if (isGitCommit) {
          logDebug('Git commit detected - running linters...');
          const lintResult = runLinters();

          if (!lintResult.success) {
            // Block the commit and provide feedback
            response = {
              decision: 'block',
              permissionDecision: 'deny',
              reason: `❌ Commit blocked due to linting errors:\n\n${lintResult.message}\n\nPlease fix the linting issues before committing.`,
              hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'deny',
                permissionDecisionReason: `Linting errors found: ${lintResult.message}`
              }
            };
            logDebug(`BLOCKING commit due to: ${lintResult.message}`);
          } else {
            // Allow the commit to proceed
            response = {
              decision: 'approve',
              permissionDecision: 'allow',
              reason: '✅ All linting checks passed. Proceeding with commit.',
              hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'allow',
                permissionDecisionReason: 'All linting checks passed'
              }
            };
            logDebug('All linting passed - ALLOWING commit');
          }
        } else {
          // For non-commit commands, just allow them through
          response = {
            decision: 'approve',
            permissionDecision: 'allow',
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              permissionDecision: 'allow'
            }
          };
          logDebug(`Non-commit command (${toolName}) - allowing through`);
        }

        // Output the decision as JSON
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(response));
      } catch (parseError) {
        const errorMsg = `Hook parse error: ${parseError}`;
        logDebug(errorMsg);
        // In case of error, allow the command to proceed
        // eslint-disable-next-line no-console
        console.log(JSON.stringify({
          decision: 'approve',
          permissionDecision: 'allow',
          reason: `Hook error (allowing command): ${parseError}`,
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
            permissionDecisionReason: `Hook parse error: ${parseError}`
          }
        }));
      }
    });

  } catch (error) {
    const errorMsg = `Hook error: ${error}`;
    logDebug(errorMsg);
    // In case of error, allow the command to proceed
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      decision: 'approve',
      permissionDecision: 'allow',
      reason: `Hook error (allowing command): ${error}`,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: `Hook error: ${error}`
      }
    }));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}