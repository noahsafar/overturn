// S3 Storage utilities for document uploads.
//
// Handles uploading original files to S3 for reference and audit trail.
// Falls back to local filesystem storage in development.

import { randomUUID } from "crypto";

interface UploadResult {
  key: string;
  url?: string;
  size: number;
}

type StorageBackend = "s3" | "local";

// Detect storage backend based on environment
const STORAGE_BACKEND: StorageBackend =
  process.env.S3_BUCKET && process.env.NODE_ENV !== "development"
    ? "s3"
    : "local";

const LOCAL_STORAGE_DIR = process.env.STORAGE_DIR || "./uploads";

/**
 * Upload a file to storage (S3 or local filesystem).
 * @param file - The file to upload
 * @param prefix - Optional prefix for the storage key (e.g., "denials/", "documents/")
 * @returns Upload result with storage key and optional public URL
 */
export async function uploadFile(
  file: File | Buffer,
  prefix: string = "documents/",
  filename?: string
): Promise<UploadResult> {
  const key = `${prefix}${randomUUID()}-${filename || "file"}`;

  if (STORAGE_BACKEND === "s3") {
    return uploadToS3(file, key);
  } else {
    return uploadToLocal(file, key);
  }
}

/**
 * Upload to S3 using AWS SDK.
 */
async function uploadToS3(
  file: File | Buffer,
  key: string
): Promise<UploadResult> {
  try {
    // Lazy import AWS SDK (only needed in production)
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");

    const client = new S3Client({
      region: process.env.AWS_REGION || "us-east-1",
    });

    const buffer = Buffer.isBuffer(file)
      ? file
      : Buffer.from(await file.arrayBuffer());

    await client.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: key,
        Body: buffer,
        ContentType: file instanceof File ? file.type : "application/octet-stream",
      })
    );

    // Generate a URL (this is a presigned URL or just the S3 URI)
    const url = `s3://${process.env.S3_BUCKET}/${key}`;

    return { key, url, size: buffer.length };
  } catch (error) {
    console.error("S3 upload failed:", error);
    throw new Error(`Failed to upload to S3: ${error}`);
  }
}

/**
 * Upload to local filesystem (development fallback).
 */
async function uploadToLocal(
  file: File | Buffer,
  key: string
): Promise<UploadResult> {
  try {
    const fs = await import("fs/promises");
    const path = await import("path");

    const buffer = Buffer.isBuffer(file)
      ? file
      : Buffer.from(await file.arrayBuffer());

    const fullPath = path.join(LOCAL_STORAGE_DIR, key);

    // Ensure directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    await fs.writeFile(fullPath, buffer);

    return { key, url: fullPath, size: buffer.length };
  } catch (error) {
    console.error("Local storage upload failed:", error);
    throw new Error(`Failed to upload to local storage: ${error}`);
  }
}

/**
 * Generate a presigned URL for private S3 objects.
 * @param key - The storage key
 * @param expiresIn - URL expiration in seconds (default: 3600 = 1 hour)
 */
export async function getPresignedUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  if (STORAGE_BACKEND === "local") {
    // For local storage, just return the file path
    return key;
  }

  try {
    const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");

    const client = new S3Client({
      region: process.env.AWS_REGION || "us-east-1",
    });

    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: key,
    });

    return await getSignedUrl(client, command, { expiresIn });
  } catch (error) {
    console.error("Failed to generate presigned URL:", error);
    throw error;
  }
}

/**
 * Delete a file from storage.
 */
export async function deleteFile(key: string): Promise<void> {
  if (STORAGE_BACKEND === "s3") {
    try {
      const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");

      const client = new S3Client({
        region: process.env.AWS_REGION || "us-east-1",
      });

      await client.send(
        new DeleteObjectCommand({
          Bucket: process.env.S3_BUCKET!,
          Key: key,
        })
      );
    } catch (error) {
      console.error("S3 delete failed:", error);
      throw new Error(`Failed to delete from S3: ${error}`);
    }
  } else {
    try {
      const fs = await import("fs/promises");
      const path = await import("path");

      const fullPath = path.join(LOCAL_STORAGE_DIR, key);
      await fs.unlink(fullPath);
    } catch (error) {
      console.error("Local storage delete failed:", error);
      throw new Error(`Failed to delete from local storage: ${error}`);
    }
  }
}

/**
 * Get storage backend type.
 */
export function getStorageBackend(): StorageBackend {
  return STORAGE_BACKEND;
}
