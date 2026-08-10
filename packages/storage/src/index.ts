/**
 * Object storage port.
 *
 * No assets are generated in M0/M1 (no audio, no artwork), but avatars, cover
 * art and rendered audio all land here later, so the boundary exists now and
 * callers never learn whether they are talking to a disk or a bucket.
 */
export type StoredObject = {
  key: string;
  url: string;
  contentType: string;
  size: number;
};

export interface ObjectStorage {
  put(key: string, data: Uint8Array, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  url(key: string): string;
}

/** Default for tests and local development. */
export class MemoryObjectStorage implements ObjectStorage {
  private readonly objects = new Map<string, { data: Uint8Array; contentType: string }>();

  async put(key: string, data: Uint8Array, contentType: string): Promise<StoredObject> {
    this.objects.set(key, { data, contentType });
    return { key, url: this.url(key), contentType, size: data.byteLength };
  }

  async get(key: string): Promise<Uint8Array | null> {
    return this.objects.get(key)?.data ?? null;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  url(key: string): string {
    return `/_storage/${key}`;
  }
}

export function createObjectStorage(): ObjectStorage {
  return new MemoryObjectStorage();
}
