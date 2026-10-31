// SettleTag v1 (0x53eCBb8891Df17927d40E4FbF234a80cB82EC456): direct wallet settlement, no fee.
// Its exact source is preserved in verification/SettleTag-v1.input.json.
export const LEGACY_ABI = [
  'function musd() view returns (address)',
  'function createInvoice(bytes32 id, uint128 amount, uint64 deadline)',
  'function cancelInvoice(bytes32 id)',
  'function payInvoice(bytes32 id)',
  'function invoices(bytes32 id) view returns (address merchant, uint128 amount, uint64 deadline, uint8 status, address payer)',
  'event InvoicePaid(bytes32 indexed id, address indexed merchant, address indexed payer, uint256 amount)'
];
