import { Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { In, Repository } from 'typeorm';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UserRole } from '../entities/user.entity';
import { DeliveryOrder } from '../entities/delivery-order.entity';
import { haversineKm } from '../common/geo';
import {
  hasAnyCorsConfig,
  isOriginAllowed,
  loadCorsConfig,
} from '../common/cors';
import { PositionsService } from './positions.service';

type DriverPosition = { lat: number; lng: number; at: number };
type ActiveOrderRef = {
  orderId: string;
  clientId?: string;
  merchantId?: string;
};

const POSITION_TTL_MS = 5 * 60 * 1000;

/**
 * Construit l'option `cors.origin` pour Socket.IO.
 *
 * Socket.IO accepte trois formes :
 *  - `boolean` (true = tout autorisé, false = tout refusé)
 *  - `string | string[]` (liste d'origines exactes)
 *  - `(origin, cb) => cb(err, ok)` (callback dynamique)
 *
 * On utilise le callback dès qu'au moins une `FRONTEND_URLS` ou
 * `FRONTEND_URL_PATTERNS` est définie, pour pouvoir matcher les patterns
 * regex (URLs preview Cloudflare Pages notamment).
 *
 * Exemple FRONTEND_URL_PATTERNS="^https://[a-z0-9-]+\\.zonzon-admin\\.pages\\.dev$"
 */
function resolveWsCorsOrigin():
  | boolean
  | ((
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => void) {
  const config = loadCorsConfig();
  if (hasAnyCorsConfig(config)) {
    return (origin, cb) => {
      if (isOriginAllowed(origin, config)) {
        cb(null, true);
      } else {
        cb(new Error(`Origin ${origin} non autorisé (WS)`), false);
      }
    };
  }
  // Aucune config : on refuse en prod, on autorise tout en dev
  return process.env.NODE_ENV === 'production' ? false : true;
}

@WebSocketGateway({
  cors: {
    origin: resolveWsCorsOrigin(),
    credentials: true,
  },
})
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(OrdersGateway.name);
  private driverPositions = new Map<string, DriverPosition>();
  /** Pour chaque livreur, toutes les commandes actives (supporte plusieurs commandes d'une même tournée). */
  private activeOrders = new Map<string, ActiveOrderRef[]>();

  constructor(
    private jwtService: JwtService,
    @InjectRepository(DeliveryOrder)
    private ordersRepository: Repository<DeliveryOrder>,
    @Optional() private positionsService?: PositionsService,
  ) {}

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const token =
      (client.handshake.auth?.token as string) ||
      (client.handshake.headers?.authorization as string)?.replace(
        /^Bearer\s+/i,
        '',
      );

    if (!token) {
      this.logger.warn(`Socket ${client.id} rejected: no token`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify(token);
      client.data.user = payload;
      client.join(`user:${payload.sub}`);
      client.join(`role:${payload.role}`);
      this.logger.log(
        `Socket connected: ${client.id} (user ${payload.sub}, role ${payload.role})`,
      );
    } catch (err) {
      this.logger.warn(`Socket ${client.id} rejected: invalid token`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data?.user;
    if (user?.sub) {
      this.driverPositions.delete(user.sub);
    }
    this.logger.log(`Socket disconnected: ${client.id}`);
  }

  /**
   * GPS strict (CDC V1 §11.2) : on ne persiste/forward la position QUE si le
   * livreur a une course active (`activeOrders` mappé par `broadcastOrderAccepted`
   * et purgé sur statut terminal). En cas de redémarrage backend, le mapping
   * en mémoire peut être vide alors qu'une course est toujours active : on le
   * rehydrate à la demande depuis la DB. Un livreur sans course active qui émet sa
   * position ne doit pas la voir relayée ni stockée — évite un tracking
   * hors-course. Forward au client ET au commerçant de la course active.
   */
  @SubscribeMessage('driver:location')
  async handleDriverLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { lat: number; lng: number },
  ) {
    const user = client.data?.user;
    if (!user || user.role !== UserRole.LIVREUR) {
      return;
    }

    const activeOrders =
      this.activeOrders.get(user.sub) ??
      (await this.hydrateActiveOrdersForDriver(user.sub));
    if (!activeOrders || activeOrders.length === 0) {
      // Pas de course active : on ignore silencieusement (pas de forward,
      // pas de persistance).
      return;
    }

    const lat = typeof data?.lat === 'number' ? data.lat : Number(data?.lat);
    const lng = typeof data?.lng === 'number' ? data.lng : Number(data?.lng);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return;
    }

    this.purgeStalePositions();
    const at = Date.now();
    this.driverPositions.set(user.sub, { lat, lng, at });

    // Forward au client ET au commerçant de la course active.
    for (const active of activeOrders) {
      if (active.clientId) {
        this.server.to(`user:${active.clientId}`).emit('driver:position', {
          orderId: active.orderId,
          livreurId: user.sub,
          lat,
          lng,
          at,
        });
      }
      if (active.merchantId) {
        this.server.to(`user:${active.merchantId}`).emit('driver:position', {
          orderId: active.orderId,
          livreurId: user.sub,
          lat,
          lng,
          at,
        });
      }
    }

    // Persistance fire-and-forget (n'attend pas la DB pour ne pas bloquer le forwarding WS).
    // Sert au fallback FCM (filtre géo sur les livreurs offline) et au tracking historique.
    if (this.positionsService) {
      void this.positionsService.upsertPosition(
        user.sub,
        lat,
        lng,
        activeOrders[0].orderId,
      );
    }
  }

  private purgeStalePositions() {
    const now = Date.now();
    for (const [id, pos] of this.driverPositions) {
      if (now - pos.at > POSITION_TTL_MS) {
        this.driverPositions.delete(id);
      }
    }
  }

  private getConnectedDriverIds(): Set<string> {
    const ids = new Set<string>();
    const room = this.server?.sockets?.adapter?.rooms?.get(
      `role:${UserRole.LIVREUR}`,
    );
    if (!room) return ids;
    for (const socketId of room) {
      const socket = this.server.sockets.sockets.get(socketId);
      const sub = socket?.data?.user?.sub;
      if (sub) ids.add(sub);
    }
    return ids;
  }

  /**
   * Diffuse une nouvelle course aux livreurs connectés.
   *
   * `eligibleDriverIds`, quand fourni, restreint la diffusion aux livreurs
   * validés par un admin ET disponibles (cf. UsersService.findEligibleLivreurIds).
   * Sans cette liste (legacy / appels existants), le comportement historique
   * est conservé (tous les livreurs connectés sont des cibles potentielles).
   */
  broadcastNewOrder(order: any, eligibleDriverIds?: Set<string>) {
    this.purgeStalePositions();

    const radiusKm = Number(process.env.NOTIFY_RADIUS_KM) || 5;

    // Coordonnées pickup : null si manquantes (on refuse de traiter 0,0 comme
    // une vraie position — ça placerait le pickup dans l'Océan Atlantique et
    // exclurait tous les livreurs du rayon).
    const rawLat = order?.pickupLat;
    const rawLng = order?.pickupLng;
    const pickupLat = rawLat != null && rawLat !== 0 ? Number(rawLat) : null;
    const pickupLng = rawLng != null && rawLng !== 0 ? Number(rawLng) : null;

    const connectedDrivers = this.getConnectedDriverIds();
    const targetDrivers = eligibleDriverIds
      ? new Set([...connectedDrivers].filter((id) => eligibleDriverIds.has(id)))
      : connectedDrivers;
    const totalDrivers = targetDrivers.size;

    // Si pas de coordonnées pickup exploitables → broadcast global immédiat
    if (
      pickupLat === null ||
      pickupLng === null ||
      !Number.isFinite(pickupLat) ||
      !Number.isFinite(pickupLng)
    ) {
      if (eligibleDriverIds) {
        // On connaît la liste des éligibles : on ne notifie qu'eux, même en
        // l'absence de coordonnées pickup exploitables.
        for (const id of targetDrivers) {
          this.server.to(`user:${id}`).emit('newOrderAvailable', order);
        }
        this.logger.log(
          `Nouvelle course diffusée à ${totalDrivers}/${totalDrivers} livreurs éligibles (coordonnées pickup manquantes)`,
        );
        return;
      }
      // Comportement legacy : pas de liste d'éligibles fournie → broadcast
      // global sur la room role:LIVREUR.
      this.server
        .to(`role:${UserRole.LIVREUR}`)
        .emit('newOrderAvailable', order);
      this.logger.log(
        `Nouvelle course diffusée à ${totalDrivers}/${totalDrivers} livreurs (coordonnées pickup manquantes, broadcast global)`,
      );
      return;
    }

    let notified = 0;
    for (const driverId of targetDrivers) {
      const pos = this.driverPositions.get(driverId);
      if (!pos) {
        // Livreur connecté mais position inconnue → on notifie quand même
        this.server.to(`user:${driverId}`).emit('newOrderAvailable', order);
        notified++;
        continue;
      }
      const distance = haversineKm(pos.lat, pos.lng, pickupLat, pickupLng);
      if (distance <= radiusKm) {
        this.server.to(`user:${driverId}`).emit('newOrderAvailable', order);
        notified++;
      }
    }

    // Fallback : aucun livreur dans le rayon → broadcast à tous les connectés
    // (éligibles) pour éviter qu'une course reste sans preneur (cas fréquent
    // en phase de test ou quand tous les livreurs actifs sont légèrement hors
    // rayon).
    if (notified === 0 && totalDrivers > 0) {
      for (const driverId of targetDrivers) {
        this.server.to(`user:${driverId}`).emit('newOrderAvailable', order);
      }
      this.logger.log(
        `Nouvelle course diffusée à ${totalDrivers}/${totalDrivers} livreurs (fallback — aucun dans le rayon ${radiusKm} km)`,
      );
      return;
    }

    this.logger.log(
      `Nouvelle course diffusée à ${notified}/${totalDrivers} livreurs (rayon ${radiusKm} km)`,
    );
  }

  broadcastOrderAccepted(
    orderId: string,
    livreurId: string,
    clientId?: string,
    merchantId?: string,
    livreur?: Record<string, unknown>,
    order?: Record<string, unknown>,
  ) {
    // Payload complet (contient l'entité commande : adresses, clientPhone,
    // clientName, entités User) — réservé aux parties prenantes de la course.
    const payload = { orderId, livreurId, livreur, order };
    // Payload minimal pour les autres livreurs : leur seul besoin est de retirer
    // la carte du radar. Diffuser `order` à toute la room `role:LIVREUR` exposait
    // les données personnelles du client à tous les livreurs connectés.
    const radarPayload = { orderId, livreurId };

    this.server
      .to(`role:${UserRole.LIVREUR}`)
      .except(`user:${livreurId}`)
      .emit('orderAccepted', radarPayload);
    // Le livreur gagnant reçoit le payload complet : il en a besoin pour ouvrir
    // sa course active et démarrer le suivi GPS.
    this.server.to(`user:${livreurId}`).emit('orderAccepted', payload);
    if (clientId) {
      this.server.to(`user:${clientId}`).emit('orderAccepted', payload);
    }
    if (merchantId) {
      this.server.to(`user:${merchantId}`).emit('orderAccepted', payload);
    }
    // Mémorise le mapping pour forwarder la position du livreur à toutes les
    // commandes actives de sa tournée éventuelle (GPS strict, CDC V1 §11.2).
    this.upsertActiveOrder(livreurId, { orderId, clientId, merchantId });

    // Si on a déjà la dernière position connue du livreur, on la pousse tout de suite
    // pour que le client voie un marker dès l'acceptation (sinon il faut attendre ~30s).
    const pos = this.driverPositions.get(livreurId);
    if (pos) {
      if (clientId) {
        this.server.to(`user:${clientId}`).emit('driver:position', {
          orderId,
          livreurId,
          lat: pos.lat,
          lng: pos.lng,
          at: pos.at,
        });
      }
      if (merchantId) {
        this.server.to(`user:${merchantId}`).emit('driver:position', {
          orderId,
          livreurId,
          lat: pos.lat,
          lng: pos.lng,
          at: pos.at,
        });
      }
    }
  }

  broadcastStatusUpdate(
    orderId: string,
    status: string,
    clientId?: string,
    livreurId?: string,
    merchantId?: string,
  ) {
    const payload = { orderId, status };
    if (clientId)
      this.server.to(`user:${clientId}`).emit('orderStatusUpdated', payload);
    if (livreurId)
      this.server.to(`user:${livreurId}`).emit('orderStatusUpdated', payload);
    if (merchantId)
      this.server.to(`user:${merchantId}`).emit('orderStatusUpdated', payload);

    // Cleanup du mapping quand la course se termine (statuts terminaux)
    if (
      livreurId &&
      (status === 'COMPLETED' || status === 'CANCELLED' || status === 'FAILED')
    ) {
      this.removeActiveOrder(livreurId, orderId);
    }
  }

  /**
   * Diffuse un changement de statut de PAIEMENT aux parties de la course
   * (client, livreur, commerçant créateur). Sans cet event, un changement
   * fait par une partie (ex. commerçant marque « payé ») restait invisible
   * pour les autres jusqu'au prochain rechargement d'écran.
   */
  broadcastPaymentUpdate(
    orderId: string,
    paymentStatus: string,
    clientId?: string,
    livreurId?: string,
    merchantId?: string,
  ) {
    const payload = { orderId, paymentStatus };
    if (clientId)
      this.server.to(`user:${clientId}`).emit('orderPaymentUpdated', payload);
    if (livreurId)
      this.server.to(`user:${livreurId}`).emit('orderPaymentUpdated', payload);
    if (merchantId)
      this.server.to(`user:${merchantId}`).emit('orderPaymentUpdated', payload);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Chat par commande
  // ──────────────────────────────────────────────────────────────────────────

  @SubscribeMessage('chat:join')
  async handleChatJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string },
  ) {
    if (!data?.orderId) return;
    const user = client.data?.user;
    if (!user?.sub) return;

    const authorized = await this.isUserPartyToOrder(
      data.orderId,
      user.sub,
      user.role,
    );
    if (!authorized) {
      this.logger.warn(
        `chat:join refusé — user ${user.sub} n'est pas partie à la commande ${data.orderId}`,
      );
      return;
    }

    client.join(`order:${data.orderId}:chat`);
  }

  /**
   * Vérifie que `userId` est autorisé à accéder au chat de la commande
   * `orderId` : il doit être le client, le livreur, OU le commerçant
   * créateur de cette commande (CDC V1 §13.2 — le commerçant peut
   * participer à la conversation de SES livraisons), ou un ADMIN. Utilisé
   * pour empêcher n'importe quel utilisateur authentifié de rejoindre une
   * room de chat qui ne le concerne pas.
   */
  private async isUserPartyToOrder(
    orderId: string,
    userId: string,
    role?: string,
  ): Promise<boolean> {
    if (role === UserRole.ADMIN) return true;

    const order = await this.ordersRepository.findOne({
      where: { id: orderId },
      relations: ['client', 'livreur', 'merchant'],
    });
    if (!order) return false;

    return (
      order.client?.id === userId ||
      order.livreur?.id === userId ||
      order.merchant?.id === userId
    );
  }

  @SubscribeMessage('chat:leave')
  handleChatLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string },
  ) {
    if (!data?.orderId) return;
    client.leave(`order:${data.orderId}:chat`);
  }

  @SubscribeMessage('chat:typing')
  async handleChatTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string; isTyping: boolean },
  ) {
    const user = client.data?.user;
    if (!user || !data?.orderId) return;
    const authorized = await this.isUserPartyToOrder(
      data.orderId,
      user.sub,
      user.role,
    );
    if (!authorized) return;
    // Diffuse à la room sauf l'émetteur
    client.to(`order:${data.orderId}:chat`).emit('chat:typing', {
      orderId: data.orderId,
      userId: user.sub,
      isTyping: !!data.isTyping,
    });
  }

  broadcastChatMessage(
    orderId: string,
    message: any,
    parties: {
      senderId: string;
      recipientIds: string[];
    },
  ) {
    const payload = { orderId, message };
    // Tout le monde dans la room reçoit (chat ouvert)
    this.server.to(`order:${orderId}:chat`).emit('chat:message', payload);
    for (const recipientId of parties.recipientIds) {
      this.server.to(`user:${recipientId}`).emit('chat:message', payload);
    }
  }

  broadcastChatRead(
    orderId: string,
    data: { readerId: string; recipientIds: string[]; at: string },
  ) {
    const payload = { orderId, readerId: data.readerId, at: data.at };
    this.server.to(`order:${orderId}:chat`).emit('chat:read', payload);
    for (const recipientId of data.recipientIds) {
      this.server.to(`user:${recipientId}`).emit('chat:read', payload);
    }
  }

  /** Real-time event for an affiliation-scoped general message. */
  broadcastDirectMessage(message: any, senderId: string, recipientId: string) {
    const payload = { senderId, recipientId, message };
    this.server.to(`user:${recipientId}`).emit('direct:message', payload);
    this.server.to(`user:${senderId}`).emit('direct:message', payload);
  }

  /**
   * Indique si un user est actuellement dans la room du chat d'une commande
   * (chat ouvert dans l'app). Sert à décider d'envoyer une push notification
   * uniquement quand le destinataire n'est PAS dans le chat.
   */
  isInChatRoom(orderId: string, userId: string): boolean {
    const chatRoom = this.server?.sockets?.adapter?.rooms?.get(
      `order:${orderId}:chat`,
    );
    if (!chatRoom) return false;
    for (const socketId of chatRoom) {
      const socket = this.server.sockets.sockets.get(socketId);
      const sub = socket?.data?.user?.sub;
      if (sub === userId) return true;
    }
    return false;
  }

  /** True si au moins un socket de l'utilisateur est connecté au gateway. */
  isUserConnected(userId: string): boolean {
    const room = this.server?.sockets?.adapter?.rooms?.get(`user:${userId}`);
    return !!room && room.size > 0;
  }

  private upsertActiveOrder(livreurId: string, activeOrder: ActiveOrderRef) {
    const existing = this.activeOrders.get(livreurId) ?? [];
    const next = existing.filter(
      (order) => order.orderId !== activeOrder.orderId,
    );
    next.push(activeOrder);
    this.activeOrders.set(livreurId, next);
  }

  private removeActiveOrder(livreurId: string, orderId: string) {
    const existing = this.activeOrders.get(livreurId) ?? [];
    const next = existing.filter((order) => order.orderId !== orderId);
    if (next.length === 0) {
      this.activeOrders.delete(livreurId);
      return;
    }
    this.activeOrders.set(livreurId, next);
  }

  private async hydrateActiveOrdersForDriver(
    livreurId: string,
  ): Promise<ActiveOrderRef[]> {
    const activeOrders =
      (await this.ordersRepository.find({
        where: {
          livreur: { id: livreurId } as any,
          status: In([
            'ACCEPTED',
            'EN_ROUTE_PICKUP',
            'AT_PICKUP',
            'IN_PROGRESS',
            'NEAR_CLIENT',
          ]),
        },
        relations: ['client', 'merchant'],
        order: { updatedAt: 'DESC' as any, createdAt: 'DESC' as any },
      })) ?? [];
    const hydrated = activeOrders.map((activeOrder) => ({
      orderId: activeOrder.id,
      clientId: activeOrder.client?.id,
      merchantId: activeOrder.merchant?.id,
    }));
    if (hydrated.length > 0) {
      this.activeOrders.set(livreurId, hydrated);
    }
    return hydrated;
  }
}
