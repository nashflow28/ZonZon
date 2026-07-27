import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createReadStream, promises as fs } from 'fs';
import { basename, extname, join } from 'path';
import { Readable } from 'stream';

type UploadedFile = Pick<Express.Multer.File, 'filename' | 'mimetype' | 'path'>;

/**
 * Stockage privé des pièces d'identité. Aucune URL publique n'est générée :
 * on persiste uniquement une clé opaque `identity/<filename>` en base, puis
 * on sert le binaire via un endpoint authentifié.
 */
@Injectable()
export class IdentityStorageService {
  private readonly endpoint = process.env.IDENTITY_STORAGE_ENDPOINT;
  private readonly bucket = process.env.IDENTITY_STORAGE_BUCKET;
  private readonly accessKeyId = process.env.IDENTITY_STORAGE_ACCESS_KEY_ID;
  private readonly secretAccessKey =
    process.env.IDENTITY_STORAGE_SECRET_ACCESS_KEY;
  private readonly region = process.env.IDENTITY_STORAGE_REGION || 'auto';
  private readonly forcePathStyle =
    process.env.IDENTITY_STORAGE_FORCE_PATH_STYLE === 'true';
  private readonly localRoot =
    process.env.IDENTITY_UPLOAD_DIR || 'private_uploads/identity';

  private readonly client = this.isConfigured
    ? new S3Client({
        endpoint: this.endpoint,
        region: this.region,
        forcePathStyle: this.forcePathStyle,
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
      this.secretAccessKey
    );
  }

  private normalizeKey(reference: string): string {
    const cleaned = reference.replace(/^\/+/, '');
    if (cleaned.startsWith('identity/')) return cleaned;
    return `identity/${basename(cleaned)}`;
  }

  private contentTypeForKey(key: string): string {
    switch (extname(key).toLowerCase()) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.webp':
        return 'image/webp';
      default:
        return 'application/octet-stream';
    }
  }

  private toReadable(body: unknown): Readable {
    if (body instanceof Readable) return body;
    if (body && typeof (body as any).pipe === 'function') {
      return body as Readable;
    }
    if (body && typeof (body as any).getReader === 'function') {
      return Readable.fromWeb(body as any);
    }
    throw new ServiceUnavailableException(
      'Corps de fichier privé indisponible',
    );
  }

  async store(file: UploadedFile): Promise<string> {
    const key = this.normalizeKey(file.filename);
    if (!this.isConfigured) return key;

    try {
      await this.client!.send(
        new PutObjectCommand({
          Bucket: this.bucket!,
          Key: key,
          Body: createReadStream(file.path),
          ContentType: file.mimetype,
          CacheControl: 'private, max-age=300',
        }),
      );
      await fs.unlink(file.path).catch(() => undefined);
      return key;
    } catch (error) {
      throw new ServiceUnavailableException(
        `Échec du stockage privé de la pièce d'identité: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Supprime définitivement une pièce d'identité (S3 ou disque local).
   *
   * Appelée lors de la suppression d'un compte : effacer la seule référence en
   * base laisserait le fichier orphelin mais toujours lisible sur le volume
   * `zonzon_identity`, ce qui contredirait ce qu'on annonce à l'utilisateur.
   *
   * Ne lève JAMAIS : la suppression du compte a déjà été committée quand on
   * arrive ici, et un incident de stockage ne doit pas faire échouer une
   * requête déjà réussie. Retourne `false` si le fichier n'a pas pu être
   * supprimé, pour que l'appelant puisse le journaliser.
   */
  async remove(reference: string): Promise<boolean> {
    if (!reference || !reference.trim()) return true;
    const key = this.normalizeKey(reference);

    try {
      if (this.isConfigured) {
        await this.client!.send(
          new DeleteObjectCommand({ Bucket: this.bucket!, Key: key }),
        );
        return true;
      }
      await fs.unlink(join(process.cwd(), this.localRoot, basename(key)));
      return true;
    } catch (error) {
      // Fichier déjà absent : l'objectif (il n'existe plus) est atteint.
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return true;
      return false;
    }
  }

  async open(reference: string): Promise<{
    stream: Readable;
    contentType: string;
  }> {
    const key = this.normalizeKey(reference);

    try {
      if (this.isConfigured) {
        const head = await this.client!.send(
          new HeadObjectCommand({
            Bucket: this.bucket!,
            Key: key,
          }),
        );
        const response = await this.client!.send(
          new GetObjectCommand({
            Bucket: this.bucket!,
            Key: key,
          }),
        );
        if (!response.Body) {
          throw new ServiceUnavailableException(
            "Pièce d'identité privée indisponible",
          );
        }
        return {
          stream: this.toReadable(response.Body),
          contentType: head.ContentType ?? this.contentTypeForKey(key),
        };
      }

      const localPath = join(process.cwd(), this.localRoot, basename(key));
      await fs.access(localPath).catch(() => {
        throw new NotFoundException("Pièce d'identité introuvable");
      });
      return {
        stream: createReadStream(localPath),
        contentType: this.contentTypeForKey(key),
      };
    } catch (error) {
      if (
        (error as any)?.name === 'NotFound' ||
        (error as any)?.name === 'NoSuchKey' ||
        (error as any)?.$metadata?.httpStatusCode === 404
      ) {
        throw new NotFoundException("Pièce d'identité introuvable");
      }
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException(
        `Échec de lecture de la pièce d'identité: ${(error as Error).message}`,
      );
    }
  }
}
