const ID = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const EXAMPLE = '0x followed by 64 hex characters, or a SettleTag invoice link';

export function parseInvoiceReference(input) {
  const raw = String(input ?? '').trim();
  let id = raw;
  let contract = null;
  try {
    if (/^(?:https?:\/\/|[\w.-]+\/)/i.test(raw)) {
      const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      id = url.searchParams.get('invoice') ?? '';
      contract = url.searchParams.get('contract');
    } else if (/^(?:\?|invoice=)/i.test(raw)) {
      const params = new URLSearchParams(raw.replace(/^\?/, ''));
      id = params.get('invoice') ?? '';
      contract = params.get('contract');
    } else if (raw.includes('&')) {
      const [reference, ...rest] = raw.split('&');
      id = reference;
      contract = new URLSearchParams(rest.join('&')).get('contract');
    }
  } catch { /* the specific format message below is more useful than a URL parser error */ }
  id = id.trim();
  if (!ID.test(id)) throw new Error(`Enter ${EXAMPLE}. Example: ${'0x' + 'a'.repeat(64)}.`);
  if (contract !== null && !ADDRESS.test(contract.trim())) throw new Error('The invoice link has an invalid contract address. Ask the merchant to copy the link again.');
  return { id, contract: contract?.trim() ?? null };
}
