/**
 * Wrapper around the local `claude -p` CLI for structured JSON output.
 * Uses the user's existing Claude Code subscription — no API key required.
 */
import { runCmd } from "./run-cmd";

export interface ClaudeOptions {
  systemPrompt: string;
  userPrompt: string;
  schema: object;
  timeoutMs?: number;
}

export interface ClaudeResult<T> {
  output: T;
  cost_usd: number;
  duration_ms: number;
  cache_read_tokens: number;
  cache_create_tokens: number;
}

interface CliEnvelope {
  type: string;
  is_error: boolean;
  result?: string;
  structured_output?: unknown;
  total_cost_usd?: number;
  duration_ms?: number;
  usage?: {
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

export async function runClaude<T>(opts: ClaudeOptions): Promise<ClaudeResult<T>> {
  const args = [
    "-p",
    "--output-format", "json",
    "--json-schema", JSON.stringify(opts.schema),
    "--append-system-prompt", opts.systemPrompt,
    opts.userPrompt,
  ];

  const r = await runCmd("claude", args, {
    cwd: process.cwd(),
    timeoutMs: opts.timeoutMs ?? 300_000,
  });
  if (r.code !== 0) {
    throw new Error(`claude -p exited ${r.code}: ${r.stderr.slice(0, 800) || r.stdout.slice(0, 800)}`);
  }

  let env: CliEnvelope;
  try {
    env = JSON.parse(r.stdout) as CliEnvelope;
  } catch (e) {
    throw new Error(`claude -p returned non-JSON: ${r.stdout.slice(0, 400)}`);
  }
  if (env.is_error || env.structured_output == null) {
    throw new Error(`claude -p reported error / missing structured_output: ${JSON.stringify(env).slice(0, 600)}`);
  }

  return {
    output: env.structured_output as T,
    cost_usd: env.total_cost_usd ?? 0,
    duration_ms: env.duration_ms ?? 0,
    cache_read_tokens: env.usage?.cache_read_input_tokens ?? 0,
    cache_create_tokens: env.usage?.cache_creation_input_tokens ?? 0,
  };
}
