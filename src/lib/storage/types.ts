export interface StorageProvider {
  upload(key: string, buffer: Buffer, contentType: string): Promise<void>;
  download(key: string): Promise<{ buffer: Buffer; contentType: string }>;
  delete(key: string): Promise<void>;
  /** Returns a pre-signed/SAS URL for cloud providers, null for local (use streaming route). */
  getUrl(key: string): Promise<string | null>;
}
