export async function confirmed(provider, hash) {
  for (let attempt = 0; attempt < 90; attempt++) {
    const receipt = await provider.send('eth_getTransactionReceipt', [hash]);
    if (receipt) {
      if (BigInt(receipt.status) !== 1n) throw new Error(`Transaction reverted: ${hash}`);
      return { blockNumber: Number(BigInt(receipt.blockNumber)), hash };
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error(`Timed out waiting for transaction receipt: ${hash}`);
}
