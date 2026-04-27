import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as admin from 'firebase-admin';
import { User } from '../entities/user.entity';

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
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private app: admin.app.App | null = null;
  private initAttempted = false;

  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,
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

    const user = await this.usersRepo.findOne({
      where: { id: userId },
      select: ['id', 'fcmToken'],
    });
    const token = user?.fcmToken;
    if (!token) return;

    try {
      await admin.messaging().send({
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
      });
    } catch (err) {
      const code = err?.errorInfo?.code;
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        // Token périmé → on l'efface pour ne pas accumuler d'échecs
        await this.usersRepo.update({ id: userId }, { fcmToken: null });
        this.logger.log(`FCM token invalidé pour user ${userId}, effacé`);
        return;
      }
      this.logger.warn(`Push échoué (${userId}) : ${(err as Error).message}`);
    }
  }
}
