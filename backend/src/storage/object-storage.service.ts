import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createReadStream, promises as fs } from 'fs';
import { basename, join } from 'path';

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

  /**
   * Supprime définitivement une image à partir de l'URL stockée en base
   * (photo de profil notamment). Accepte les deux formes produites par
   * `store()` : une URL publique R2 (`<publicUrl>/<key>`) ou un chemin local
   * (`/uploads/<fichier>`).
   *
   * Ne lève JAMAIS, pour la même raison que `IdentityStorageService.remove` :
   * elle est appelée après une suppression de compte déjà committée.
   * Retourne `false` si le fichier n'a pas pu être supprimé.
   */
  async remove(url: string): Promise<boolean> {
    if (!url || !url.trim()) return true;

    try {
      if (this.isConfigured && url.startsWith(`${this.publicUrl}/`)) {
        const key = url.slice(this.publicUrl!.length + 1);
        await this.client!.send(
          new DeleteObjectCommand({ Bucket: this.bucket!, Key: key }),
        );
        return true;
      }

      // Chemin local : on ne garde que le nom de fichier pour éviter toute
      // traversée de répertoire à partir d'une valeur venue de la base.
      const filename = basename(url.split('?')[0]);
      if (!filename || filename === '.' || filename === '..') return false;
      await fs.unlink(
        join(process.cwd(), process.env.UPLOAD_DIR || 'uploads', filename),
      );
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return true;
      return false;
    }
  }
}
