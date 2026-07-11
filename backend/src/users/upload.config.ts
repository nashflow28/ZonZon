import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';

export const profilePhotoStorage = diskStorage({
  destination: process.env.UPLOAD_DIR || 'uploads',
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${ext}`);
  },
});

/**
 * Stockage dédié pour les photos de pièce d'identité des livreurs (données
 * sensibles) : écrit dans un sous-dossier `identity` séparé de la racine des
 * avatars, cf. pattern `makeStorage` de shops/upload.config.ts.
 */
export const idCardPhotoStorage = diskStorage({
  destination: process.env.IDENTITY_UPLOAD_DIR || 'private_uploads/identity',
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${ext}`);
  },
});

export const imageFileFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: (err: Error | null, accept: boolean) => void,
) => {
  if (!/\.(jpe?g|png|webp)$/i.test(file.originalname)) {
    return cb(
      new BadRequestException('Format accepté : jpg, png, webp'),
      false,
    );
  }
  cb(null, true);
};
