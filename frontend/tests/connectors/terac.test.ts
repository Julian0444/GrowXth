import assert from 'node:assert/strict';
import test from 'node:test';

import { createTeracDraft } from '../../lib/server/connectors/terac.ts';

test('creates a Terac draft with the official v2 shape and never auto-launches it', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.TERAC_API_KEY;
  const originalProject = process.env.TERAC_PROJECT_ID;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  process.env.TERAC_API_KEY = 'test-key';
  delete process.env.TERAC_PROJECT_ID;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith('/projects?limit=100')) {
      return Response.json({ data: [], pagination: { has_more: false } });
    }
    if (url.endsWith('/projects')) {
      return Response.json({ id: 'project-1', name: 'GrowXth Campaign Validation' });
    }
    return Response.json({
      id: 'opportunity-1',
      status: 'draft',
      project_id: 'project-1',
      num_participants: 12,
      pricing: {
        cost_per_participant_cents: 500,
        total_cost_cents: 6000,
        currency: 'usd',
      },
      submission_stats: {
        total: 0,
        in_progress: 0,
        awaiting_review: 0,
        approved: 0,
        rejected: 0,
      },
      updated_at: '2026-07-24T20:00:00Z',
    });
  }) as typeof fetch;

  try {
    const result = await createTeracDraft({
      appUrl: 'https://growxth.example',
      campaign: {
        id: 'camp-1',
        opportunityId: 'opp-1',
        title: 'Test',
        variantA: 'Message A',
        variantB: 'Message B',
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.run?.status, 'draft');
    assert.equal(calls.length, 3);
    assert.ok(calls.every((call) => !call.url.endsWith('/launch')));
    const body = JSON.parse(String(calls[2]?.init?.body)) as {
      expected_days_to_complete: number;
      num_participants: number;
      tasks: Array<{ task_url: string; review_type: string }>;
    };
    assert.equal(body.expected_days_to_complete, 5);
    assert.equal(body.num_participants, 12);
    assert.equal(body.tasks[0]?.review_type, 'auto_approve');
    assert.equal(
      body.tasks[0]?.task_url,
      'https://growxth.example/research/campaign?campaignId=camp-1',
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey == null) delete process.env.TERAC_API_KEY;
    else process.env.TERAC_API_KEY = originalKey;
    if (originalProject == null) delete process.env.TERAC_PROJECT_ID;
    else process.env.TERAC_PROJECT_ID = originalProject;
  }
});
