import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createReadStream, promises as fs } from 'fs';

type UploadedFile = Pick<Express.Multer.File, 'filename' | 'mimetype' | 'path'>;

/**
 * Stockage objet S3-compatible. Cloudflare R2 est activé en renseignant les
 * variables OBJECT_STORAGE_*; sans elles, le stockage local reste disponible
 * pour le développement.
 */
@Injectable()
export class ObjectStorageService {
  private readonly endpoint = process.env.OBJECT_STORAGE_ENDPOINT;
  private readonly bucket = process.env.OBJECT_STORAGE_BUCKET;
  private readonly accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY_ID;
  private readonly secretAccessKey =
    process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY;
  private readonly publicUrl = process.env.OBJECT_STORAGE_PUBLIC_URL?.replace(
    /\/$/,
    '',
  );

  private readonly client = this.isConfigured
    ? new S3Client({
        endpoint: this.endpoint,
        region: process.env.OBJECT_STORAGE_REGION || 'auto',
        forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE === 'true',
        credentials: {
          accessKeyId: this.accessKeyId!,
          secretAccessKey: this.secretAccessKey!,
        },
      })
    : null;

  get isConfigured(): boolean {
    return !!(
      this.endpoint &&
      this.bucket &&
      this.accessKeyId &&
      this.secretAccessKey &&
      this.publicUrl
    );
  }

  async store(
    file: UploadedFile,
    keyPrefix: string,
    localUrl: string,
  ): Promise<string> {
    if (!this.isConfigured) return localUrl;

    const key = `${keyPrefix}/${file.filename}`;
    try {
      await this.client!.send(
        new PutObjectCommand({
          Bucket: this.bucket!,
          Key: key,
          Body: createReadStream(file.path),
          ContentType: file.mimetype,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      await fs.unlink(file.path).catch(() => undefined);
      return `${this.publicUrl}/${key}`;
    } catch (error) {
      throw new ServiceUnavailableException(
        `Échec du stockage persistant de l'image: ${(error as Error).message}`,
      );
    }
  }
}
