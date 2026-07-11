import { ObjectStorageService } from './object-storage.service';

describe('ObjectStorageService', () => {
  const envKeys = [
    'OBJECT_STORAGE_ENDPOINT',
    'OBJECT_STORAGE_BUCKET',
    'OBJECT_STORAGE_ACCESS_KEY_ID',
    'OBJECT_STORAGE_SECRET_ACCESS_KEY',
    'OBJECT_STORAGE_PUBLIC_URL',
  ] as const;
  const savedEnv = new Map(envKeys.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of envKeys) {
      const value = savedEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('conserve l’URL locale sans configuration S3, pour le développement', async () => {
    for (const key of envKeys) delete process.env[key];
    const service = new ObjectStorageService();

    await expect(
      service.store(
        {
          filename: 'avatar.jpg',
          mimetype: 'image/jpeg',
          path: 'uploads/avatar.jpg',
        },
        'avatars',
        '/uploads/avatar.jpg',
      ),
    ).resolves.toBe('/uploads/avatar.jpg');
  });
});
