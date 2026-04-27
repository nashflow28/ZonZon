import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuid } from 'uuid';
import { BadRequestException } from '@nestjs/common';

const ROOT = process.env.UPLOAD_DIR || 'uploads';

const makeStorage = (subDir: string) =>
  diskStorage({
    destination: `${ROOT}/${subDir}`,
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      cb(null, `${uuid()}${ext}`);
    },
  });

export const shopLogoStorage = makeStorage('shops');
export const productPhotoStorage = makeStorage('products');

export const imageFileFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: (e: any, ok: boolean) => void,
) => {
  if (!/^image\/(jpeg|png|webp|jpg)$/i.test(file.mimetype)) {
    return cb(new BadRequestException('Format image non supporté'), false);
  }
  cb(null, true);
};
