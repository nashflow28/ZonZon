import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  App,
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { User } from '../entities/user.entity';
import { Notification } from '../entities/notification.entity';
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
  private app: App | null = null;
  private initAttempted = false;

  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    @InjectRepository(Notification)
    private notificationsRepo: Repository<Notification>,
    private deviceTokens: DeviceTokensService,
  ) {}

  /**
   * Persiste une ligne `Notification` pour le centre de notifications
   * (CDC V1 §18.12). Fire-and-forget : ne bloque JAMAIS l'envoi FCM ni
   * l'appelant, et fonctionne indépendamment de la config Firebase.
   */
  private async persistNotification(
    userId: string,
    payload: PushPayload,
  ): Promise<void> {
    try {
      await this.notificationsRepo.save(
        this.notificationsRepo.create({
          userId,
          deliveryId: payload.data?.orderId ?? null,
          type: payload.data?.kind ?? 'generic',
          title: payload.title,
          body: payload.body,
          data: payload.data ?? null,
          readAt: null,
        }),
      );
    } catch (err) {
      this.logger.warn(
        `Échec de persistance de la notification (user ${userId}) : ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private ensureInit(): App | null {
    if (this.initAttempted) return this.app;
    this.initAttempted = true;
    try {
      const inlineCred = process.env.FIREBASE_CREDENTIALS_JSON;
      if (inlineCred) {
        const parsed = JSON.parse(inlineCred);
        this.app = getApps()[0] ?? initializeApp({ credential: cert(parsed) });
        this.logger.log('Firebase Admin initialisé (credentials inline)');
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        this.app =
          getApps()[0] ?? initializeApp({ credential: applicationDefault() });
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

  /**
   * Contrat : cette méthode ne rejette JAMAIS.
   *
   * Elle est appelée en « fire-and-forget » (`void sendToUser(...)`) depuis les
   * flux métier. Sans cette garantie, une simple coupure TiDB pendant un envoi
   * produisait une `unhandledRejection` — qui, sur Node 22, **termine le
   * process** : la VM Fly redémarre et toutes les connexions Socket.IO
   * (courses en cours, positions livreurs, chat) tombent.
   *
   * L'envoi de notification est accessoire au flux métier : son échec doit être
   * journalisé, jamais propagé.
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    try {
      await this.deliverToUser(userId, payload);
    } catch (err) {
      this.logger.error(
        `Échec de l'envoi de notification à ${userId} : ${(err as Error).message}`,
      );
    }
  }

  private async deliverToUser(
    userId: string,
    payload: PushPayload,
  ): Promise<void> {
    // Persistance indépendante de l'envoi FCM : même si Firebase n'est pas
    // configuré (no-op ci-dessous), la notification reste consultable via
    // le centre de notifications (GET /notifications). Les erreurs sont
    // interceptées dans `persistNotification` elle-même (try/catch +
    // Logger.warn) : cet `await` ne peut donc jamais rejeter et ne bloque
    // jamais l'envoi FCM qui suit (persistance DB locale, quasi instantanée).
    await this.persistNotification(userId, payload);

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
        getMessaging(app).send({
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
          await this.deviceTokens.deleteByToken(token, userId);
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
