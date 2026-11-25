import assert from 'node:assert/strict';
import test from 'node:test';

import { localServiceUrl } from '../src/lib/local-service-url.ts';

test('accepts the local web and Android emulator endpoints', () => {
  assert.equal(localServiceUrl('http://127.0.0.1:54321', 'DATABASE_URL'), 'http://127.0.0.1:54321');
  assert.equal(localServiceUrl('http://localhost:8010/', 'INFERENCE_URL'), 'http://localhost:8010');
  assert.equal(localServiceUrl('http://10.0.2.2:54321', 'DATABASE_URL'), 'http://10.0.2.2:54321');
});

test('rejects hosted endpoints and URLs containing more than a local origin', () => {
  for (const url of [
    'https://database.example.com',
    'http://localhost.example.com',
    'http://127.0.0.1:54321/rest/v1',
    'http://localhost:54321?key=value',
    'http://user@localhost:54321',
  ]) {
    assert.throws(() => localServiceUrl(url, 'DATABASE_URL'), /DATABASE_URL must be a local HTTP origin/);
  }
});
