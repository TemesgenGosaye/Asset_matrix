import type { StorageProvider } from "./types";

export class S3StorageProvider implements StorageProvider {
  private bucket: string;
  private client: any;
  private presigner: any;

  constructor() {
    this.bucket = process.env.STORAGE_BUCKET!;
    if (!this.bucket)
      throw new Error("STORAGE_BUCKET is required for S3 storage");
  }

  private async getClient() {
    if (!this.client) {
      const { S3Client } = await import("@aws-sdk/client-s3");
      this.client = new S3Client({
        region: process.env.STORAGE_REGION || "us-east-1",
        ...(process.env.STORAGE_ENDPOINT
          ? { endpoint: process.env.STORAGE_ENDPOINT, forcePathStyle: true }
          : {}),
        ...(process.env.STORAGE_ACCESS_KEY && process.env.STORAGE_SECRET_KEY
          ? {
              credentials: {
                accessKeyId: process.env.STORAGE_ACCESS_KEY,
                secretAccessKey: process.env.STORAGE_SECRET_KEY,
              },
            }
          : {}),
      });
    }
    return this.client;
  }

  async upload(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
  }

  async download(
    key: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();
    const resp = await client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const chunks: Uint8Array[] = [];
    for await (const chunk of resp.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return {
      buffer: Buffer.concat(chunks),
      contentType: resp.ContentType || "application/octet-stream",
    };
  }

  async delete(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();
    await client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async getUrl(key: string): Promise<string | null> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const client = await this.getClient();
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: 3600 },
    );
  }
}
