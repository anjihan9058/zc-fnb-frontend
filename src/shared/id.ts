// getRandomValues is also available on local HTTP addresses used for phone previews.
export function createId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export async function fileHash(file: File): Promise<string | undefined> {
  if (!crypto.subtle) return undefined;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())), (value) => value.toString(16).padStart(2, '0')).join('');
}
