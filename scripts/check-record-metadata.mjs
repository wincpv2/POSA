import assert from 'node:assert/strict';
import { formatDeidentifiedStudyId, parseRecordHeader } from '../src/components/record-metadata.ts';

assert.deepEqual(parseRecordHeader('sample.hea', new TextEncoder().encode('sample 1 250\nsample.dat 16 200(0)/mV 16 0 0 0 0 ECG\n')), { format: 'wfdb', sampleRate: 250, lead: 'ECG' });
const header = new Uint8Array(512);
const write = (at, size, value) => header.set(new TextEncoder().encode(String(value).padEnd(size)), at);
write(184, 8, 512); write(244, 8, 1); write(252, 4, 1); write(256, 16, 'ECG'); write(472, 8, 250);
assert.deepEqual(parseRecordHeader('sample.edf', header), { format: 'edf', sampleRate: 250, lead: 'ECG' });
assert.throws(() => parseRecordHeader('sample.dcm', new Uint8Array()));
assert.deepEqual(formatDeidentifiedStudyId('8842'), { value: '', preview: 'REC-8842-...', valid: false });
assert.deepEqual(formatDeidentifiedStudyId('8842ws'), { value: 'REC-8842-WS', preview: 'REC-8842-WS', valid: true });
assert.equal(formatDeidentifiedStudyId('REC-8842-WS').value, 'REC-8842-WS');
assert.equal(formatDeidentifiedStudyId('88A2WS').valid, false);
console.log('EDF and WFDB metadata checks passed.');
