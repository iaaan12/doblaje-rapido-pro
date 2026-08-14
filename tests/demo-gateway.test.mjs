import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoGateway } from '../app/demo-gateway.mjs';

test('demo gateway has the same paginated library contract as the real gateway', async () => {
  const gateway = createDemoGateway();
  assert.equal(gateway.resumeRemoteJobs, false);
  await gateway.createDub({ name: 'Demo', targetLang: 'es' });

  const response = await gateway.listAllDubs();

  assert.equal(response.dubs.length, 1);
  assert.equal(response.has_more, false);
});
