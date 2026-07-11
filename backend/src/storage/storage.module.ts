import { Global, Module } from '@nestjs/common';
import { ObjectStorageService } from './object-storage.service';
import { IdentityStorageService } from './identity-storage.service';

@Global()
@Module({
  providers: [ObjectStorageService, IdentityStorageService],
  exports: [ObjectStorageService, IdentityStorageService],
})
export class StorageModule {}
