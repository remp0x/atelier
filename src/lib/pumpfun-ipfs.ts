export interface PumpFunIpfsResult {
  metadataUri: string;
}

export async function uploadToPumpFunIpfs(
  file: Blob,
  name: string,
  symbol: string,
  description?: string,
): Promise<PumpFunIpfsResult> {
  const pumpFormData = new FormData();
  pumpFormData.append('file', file);
  pumpFormData.append('name', name);
  pumpFormData.append('symbol', symbol);
  if (description) pumpFormData.append('description', description);

  const response = await fetch('https://pump.fun/api/ipfs', {
    method: 'POST',
    body: pumpFormData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('PumpFun IPFS error:', response.status, errorText);
    throw new Error(`PumpFun IPFS upload failed: ${response.status}`);
  }

  const data = await response.json();
  const metadataUri = data.metadataUri || data.uri || data.metadata?.uri;
  if (!metadataUri) throw new Error('No metadataUri in PumpFun IPFS response');

  return { metadataUri };
}
