#!/usr/bin/env node
/**
 * Claude Code PostToolUse Hook: Skill Usage Logger
 * Records which skill Claude invoked and the user prompt that triggered it.
 * Only runs on the Skill tool, so nothing is logged for prompts that use no skill.
 */

import { appendFileSync, readFileSync } from 'fs';

interface SkillHookInput {
  session_id?: string;
  transcript_path?: string;
  tool_name?: string;
  tool_input?: {
    skill?: string;
    args?: string;
  };
  [key: string]: unknown;
}

interface TranscriptContentPart {
  type?: string;
  text?: string;
}

const PROMPT_PREVIEW_LENGTH = 300;

function logDebug(message: string): void {
  const logPath = '.claude/hooks/skill_usage.log';
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  appendFileSync(logPath, logEntry);
}

function extractPromptText(content: unknown): string | null {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    const parts = content as TranscriptContentPart[];
    // Tool results are also stored as "user" entries; skip those
    if (parts.some(part => part.type === 'tool_result')) {
      return null;
    }
    const text = parts
      .filter(part => part.type === 'text' && typeof part.text === 'string')
      .map(part => part.text)
      .join(' ');
    return text || null;
  }
  return null;
}

function findLastUserPrompt(transcriptPath: string | undefined): string {
  if (!transcriptPath) {
    return '(prompt unavailable)';
  }
  try {
    const lines = readFileSync(transcriptPath, 'utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.type !== 'user') continue;
        const text = extractPromptText(entry.message?.content);
        if (text) {
          const collapsed = text.replace(/\s+/g, ' ').trim();
          return collapsed.length > PROMPT_PREVIEW_LENGTH
            ? `${collapsed.slice(0, PROMPT_PREVIEW_LENGTH)}...`
            : collapsed;
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch (error) {
    logDebug(`  (failed to read transcript: ${error})`);
  }
  return '(prompt unavailable)';
}

function main(): void {
  try {
    // Read input from stdin
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
        const input: SkillHookInput = JSON.parse(inputData);
        const skill = input.tool_input?.skill || '(unknown)';
        const args = input.tool_input?.args;

        logDebug(`Skill used: ${skill}${args ? ` (args: ${args})` : ''}`);
        logDebug(`  session: ${input.session_id || '(unknown)'}`);
        logDebug(`  prompt: ${findLastUserPrompt(input.transcript_path)}`);
      } catch (parseError) {
        logDebug(`Skill usage hook parse error: ${parseError}`);
      }
    });

  } catch (error) {
    logDebug(`Skill usage hook error: ${error}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
