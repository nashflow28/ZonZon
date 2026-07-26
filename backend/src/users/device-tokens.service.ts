import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DevicePlatform,
  DeviceToken,
} from '../entities/device-token.entity';

@Injectable()
export class DeviceTokensService {
  private readonly logger = new Logger(DeviceTokensService.name);

  constructor(
    @InjectRepository(DeviceToken)
    private repo: Repository<DeviceToken>,
  ) {}

  /**
   * Enregistre un token pour un user.
   * Si le token existe déjà : update userId, platform et lastSeenAt
   * (cas appareil revendu, ou même user avec une nouvelle plateforme).
   * Si déjà associé au même user : update lastSeenAt (et platform si changée).
   */
  async upsert(
    userId: string,
    token: string,
    platform: DevicePlatform = 'android',
  ): Promise<void> {
    try {
      await this.repo
        .createQueryBuilder()
        .insert()
        .into(DeviceToken)
        .values({ userId, token, platform })
        .orUpdate(['userId', 'platform'], ['token'])
        .execute();
    } catch (err) {
      this.logger.warn(
        `upsert device token échoué (${userId}): ${(err as Error).message}`,
      );
    }
  }

  /**
   * Liste les tokens associés à un user (un user peut en avoir plusieurs).
   */
  listForUser(userId: string): Promise<DeviceToken[]> {
    return this.repo.find({ where: { userId } });
  }

  /**
   * Supprime un token précis (logout d'un device, ou token expiré côté FCM).
   *
   * `userId` est obligatoire : sans ce filtre, un utilisateur authentifié
   * pouvait envoyer le token FCM d'un tiers via `previousToken` et le priver
   * silencieusement de toute notification (nouvelle course, message,
   * validation de compte).
   */
  async deleteByToken(token: string, userId: string): Promise<void> {
    if (!token || !userId) return;
    await this.repo.delete({ token, userId });
  }

  /**
   * Supprime tous les tokens d'un user (logout du dernier device, suppression
   * de compte, etc.). Sert aussi de chemin de rétro-compat quand le mobile
   * envoie `{token: null}` sans `previousToken` à l'endpoint d'enregistrement.
   */
  async deleteAllForUser(userId: string): Promise<void> {
    await this.repo.delete({ userId });
  }

  /**
   * Pour le fallback FCM : tous les userIds qui ont au moins un token enregistré.
   */
  async findUserIdsWithToken(): Promise<string[]> {
    const rows = await this.repo
      .createQueryBuilder('dt')
      .select('DISTINCT dt.userId', 'userId')
      .getRawMany<{ userId: string }>();
    return rows.map((r) => r.userId);
  }
}
