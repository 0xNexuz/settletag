import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInvoiceReference } from '../src/invoice-link.js';

const id = `0x${'a'.repeat(64)}`;
const contract = `0x${'B'.repeat(40)}`;

test('accepts the copied invoice link and its common pasted forms', () => {
  for (const input of [
    `https://settletag.vercel.app/?invoice=${id}&contract=${contract}`,
    `settletag.vercel.app/?invoice=${id}&contract=${contract}`,
    `${id}&contract=${contract}`,
    `?invoice=${id}&contract=${contract}`
  ]) assert.deepEqual(parseInvoiceReference(`  ${input}  `), { id, contract });
  assert.deepEqual(parseInvoiceReference(id), { id, contract: null });
});

test('rejects malformed references and contract addresses with actionable errors', () => {
  assert.throws(() => parseInvoiceReference('0x1234'), /0x followed by 64 hex characters.*Example:/);
  assert.throws(() => parseInvoiceReference(`${id}&contract=0x1234`), /invalid contract address/);
});
