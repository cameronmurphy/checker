import BaseDestinationPlugin, { DestinationConfigSchema } from './base.ts';
import { z } from 'zod';

const FIRE_BETA = 'experimental-cc-routine-2026-04-01';
const MAX_TEXT_LENGTH = 65_536;

const ClaudeCodeConfigSchema = DestinationConfigSchema.extend({
  routine_id: z.string().startsWith('trig_', "Routine IDs are prefixed 'trig_', not 'routine_'"),
  token: z.string(),
  prompt: z.string().default('{{message}}'),
});

type ClaudeCodeConfig = z.infer<typeof ClaudeCodeConfigSchema>;

export default class ClaudeCodeDestination extends BaseDestinationPlugin<ClaudeCodeConfig> {
  public override getSchema() {
    return ClaudeCodeConfigSchema;
  }

  public override async notify(message: string): Promise<boolean> {
    const { routine_id, token, prompt } = this.getConfig();

    const text = prompt.replaceAll('{{message}}', message).slice(0, MAX_TEXT_LENGTH);

    const response = await fetch(`https://api.anthropic.com/v1/claude_code/routines/${routine_id}/fire`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': FIRE_BETA,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      console.error(`Claude Code routine ${routine_id} did not fire: ${await describeFailure(response)}`);
      return false;
    }

    const session = await response.json();
    console.log(`Claude Code session started: ${session.claude_code_session_url}`);

    return true;
  }
}

async function describeFailure(response: Response): Promise<string> {
  const retryAfter = response.headers.get('retry-after');
  const suffix = retryAfter ? `, retry after ${retryAfter}s` : '';

  try {
    const body = await response.json();
    return `${response.status} ${body?.error?.type ?? response.statusText}: ${body?.error?.message ?? ''}${suffix}`;
  } catch {
    return `${response.status} ${response.statusText}${suffix}`;
  }
}
