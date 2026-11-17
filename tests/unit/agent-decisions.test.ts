import { afterEach, describe, expect, it, vi } from 'vitest';
import { reviewAgentActions } from '../../src/ui/modules/launcher/agent/decisions';

afterEach(() => vi.unstubAllGlobals());

describe('Decisions supervision', () => {
  it('enforces a confident repair request and records its cost', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      id: 'dec-test', answers: {
        action: { type: 'choice', choice: 'revise', confidence: .96, probabilities: { revise: .95, continue: .04, restore: .01 } },
        taskSatisfied: { type: 'noul', noul: .01 }
      }, usage: { input_tokens: 1000, cost_rub: .0084 }
    }), { status: 200 })));
    const events: unknown[] = [];
    const result = await reviewAgentActions({ task: 'Create both documents', actual: { pcb: null } }, 'test-key',
      new AbortController().signal, event => events.push(event));
    expect(result).toMatchObject({ action: 'revise', taskSatisfied: .01 });
    expect(events).toEqual([expect.objectContaining({ kind: 'decision', enforced: true, usage: { input_tokens: 1000, cost_rub: .0084 } })]);
  });

  it('uses an uncertain recommendation as advice and rejects malformed responses', async () => {
    const response = { id: 'dec-test', answers: {
      action: { type: 'choice', choice: 'restore', confidence: .55, probabilities: { restore: .6, revise: .3, continue: .1 } },
      taskSatisfied: { type: 'noul', noul: .3 }
    }, usage: { cost_rub: .01 } };
    const fetch = vi.fn(async () => new Response(JSON.stringify(response)));
    vi.stubGlobal('fetch', fetch);
    await expect(reviewAgentActions({}, 'test-key', new AbortController().signal, () => {}))
      .resolves.toMatchObject({ action: 'continue', recommendation: 'restore' });
    fetch.mockImplementationOnce(async () => new Response('{}'));
    await expect(reviewAgentActions({}, 'test-key', new AbortController().signal, () => {})).rejects.toThrow();
  });
});
