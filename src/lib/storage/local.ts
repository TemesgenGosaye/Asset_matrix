import { mkdir, readFile, writeFile, unlink } from "fs/promises";
import { join, dirname, extname } from "path";
import type { StorageProvider } from "./types";

const UPLOAD_DIR = join(process.cwd(), "uploads/attachments");

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".rtf": "application/rtf",
  ".zip": "application/zip",
  ".gz": "application/gzip",
  ".tiff": "image/tiff",
  ".bmp": "image/bmp",
};

export class LocalStorageProvider implements StorageProvider {
  async upload(
    key: string,
    buffer: Buffer,
    _contentType: string,
  ): Promise<void> {
    const filePath = join(UPLOAD_DIR, key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
  }

  async download(
    key: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const filePath = join(UPLOAD_DIR, key);
    const buffer = await readFile(filePath);
    const contentType =
      MIME_MAP[extname(key).toLowerCase()] || "application/octet-stream";
    return { buffer, contentType };
  }

  async delete(key: string): Promise<void> {
    const filePath = join(UPLOAD_DIR, key);
    try {
      await unlink(filePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  async getUrl(_key: string): Promise<string | null> {
    return null;
  }
}
