import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as admin from 'firebase-admin';
import { User } from '../entities/user.entity';
import { DeviceTokensService } from '../users/device-tokens.service';

export interface PushPayload {
  title: string;
  body: string;
  /** Données structurées que le client lira au tap pour router. */
  data?: Record<string, string>;
}

/**
 * Envoie des notifications FCM aux utilisateurs.
 *
 * Init lazy : si FIREBASE_CREDENTIALS_JSON (ou GOOGLE_APPLICATION_CREDENTIALS)
 * n'est pas configuré, le service no-op silencieusement et le serveur
 * continue à fonctionner sans push (logs warn une fois au démarrage).
 *
 * Multi-tokens : un user peut avoir plusieurs devices (table `device_tokens`).
 * Chaque envoi est diffusé en parallèle à tous ses tokens. En fallback
 * rétro-compat, on lit aussi `User.fcmToken` (legacy mono-token) si la table
 * `device_tokens` est vide pour cet user. Cela couvre les anciens APK qui
 * n'ont pas encore migré vers le nouveau endpoint d'enregistrement.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private app: admin.app.App | null = null;
  private initAttempted = false;

  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    private deviceTokens: DeviceTokensService,
  ) {}

  private ensureInit(): admin.app.App | null {
    if (this.initAttempted) return this.app;
    this.initAttempted = true;
    try {
      const inlineCred = process.env.FIREBASE_CREDENTIALS_JSON;
      if (inlineCred) {
        const parsed = JSON.parse(inlineCred);
        this.app = admin.initializeApp({
          credential: admin.credential.cert(parsed),
        });
        this.logger.log('Firebase Admin initialisé (credentials inline)');
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        this.app = admin.initializeApp({
          credential: admin.credential.applicationDefault(),
        });
        this.logger.log(
          'Firebase Admin initialisé (GOOGLE_APPLICATION_CREDENTIALS)',
        );
      } else {
        this.logger.warn(
          'FIREBASE_CREDENTIALS_JSON manquant : les notifications push sont désactivées',
        );
      }
    } catch (err) {
      this.logger.error('Échec init Firebase Admin', (err as Error).message);
    }
    return this.app;
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    const app = this.ensureInit();
    if (!app) return;

    // 1) Récupère tous les tokens du user (multi-devices)
    const deviceTokens = await this.deviceTokens.listForUser(userId);
    let tokens = deviceTokens.map((dt) => dt.token).filter(Boolean);

    // 2) Rétro-compat : si aucun device_token, fallback sur User.fcmToken legacy
    if (tokens.length === 0) {
      const user = await this.usersRepo.findOne({
        where: { id: userId },
        select: ['id', 'fcmToken'],
      });
      const legacyToken = user?.fcmToken;
      if (legacyToken) {
        tokens = [legacyToken];
      }
    }

    if (tokens.length === 0) return;

    // 3) Envoi en parallèle, on traite les échecs token-par-token
    const results = await Promise.allSettled(
      tokens.map((token) =>
        admin.messaging().send({
          token,
          notification: { title: payload.title, body: payload.body },
          data: payload.data ?? {},
          android: {
            priority: 'high',
            notification: {
              channelId: 'zonzon_default',
              sound: 'default',
              defaultSound: true,
            },
          },
          apns: {
            payload: {
              aps: { sound: 'default', contentAvailable: true },
            },
          },
        }),
      ),
    );

    // 4) Cleanup des tokens invalides
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const token = tokens[i];
      if (r.status === 'rejected') {
        const err = r.reason as { errorInfo?: { code?: string } } & Error;
        const code = err?.errorInfo?.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          // Token périmé → on le supprime de device_tokens
          await this.deviceTokens.deleteByToken(token);
          // Et on nettoie aussi le champ legacy s'il pointait sur le même
          await this.usersRepo
            .createQueryBuilder()
            .update(User)
            .set({ fcmToken: null })
            .where('id = :id AND fcmToken = :tok', { id: userId, tok: token })
            .execute();
          this.logger.log(
            `FCM token invalidé pour user ${userId} (${token.slice(0, 12)}...), effacé`,
          );
          continue;
        }
        this.logger.warn(
          `Push échoué (${userId}, token ${token.slice(0, 12)}...) : ${err.message}`,
        );
      }
    }
  }
}
