import { Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
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
type ActiveOrderRef = { orderId: string; clientId?: string };

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
  /** Pour chaque livreur, l'ordre actif (ACCEPTED/IN_PROGRESS) → sert au forwarding live de la position. */
  private activeOrders = new Map<string, ActiveOrderRef>();

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

  @SubscribeMessage('driver:location')
  handleDriverLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { lat: number; lng: number },
  ) {
    const user = client.data?.user;
    if (!user || user.role !== UserRole.LIVREUR) {
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

    // Forward au client de l'ordre actif (s'il y en a un)
    const active = this.activeOrders.get(user.sub);
    if (active?.clientId) {
      this.server.to(`user:${active.clientId}`).emit('driver:position', {
        orderId: active.orderId,
        livreurId: user.sub,
        lat,
        lng,
        at,
      });
    }

    // Persistance fire-and-forget (n'attend pas la DB pour ne pas bloquer le forwarding WS).
    // Sert au fallback FCM (filtre géo sur les livreurs offline) et au tracking historique.
    if (this.positionsService) {
      void this.positionsService.upsertPosition(
        user.sub,
        lat,
        lng,
        active?.orderId ?? null,
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
    const pickupLat =
      rawLat != null && rawLat !== 0 ? Number(rawLat) : null;
    const pickupLng =
      rawLng != null && rawLng !== 0 ? Number(rawLng) : null;

    const connectedDrivers = this.getConnectedDriverIds();
    const targetDrivers = eligibleDriverIds
      ? new Set(
          [...connectedDrivers].filter((id) => eligibleDriverIds.has(id)),
        )
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
  ) {
    this.server
      .to(`role:${UserRole.LIVREUR}`)
      .emit('orderAccepted', { orderId, livreurId });
    if (clientId) {
      this.server
        .to(`user:${clientId}`)
        .emit('orderAccepted', { orderId, livreurId });
    }
    // Mémorise le mapping pour forwarder la position du livreur au client
    this.activeOrders.set(livreurId, { orderId, clientId });

    // Si on a déjà la dernière position connue du livreur, on la pousse tout de suite
    // pour que le client voie un marker dès l'acceptation (sinon il faut attendre ~30s).
    if (clientId) {
      const pos = this.driverPositions.get(livreurId);
      if (pos) {
        this.server.to(`user:${clientId}`).emit('driver:position', {
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
  ) {
    const payload = { orderId, status };
    if (clientId)
      this.server.to(`user:${clientId}`).emit('orderStatusUpdated', payload);
    if (livreurId)
      this.server.to(`user:${livreurId}`).emit('orderStatusUpdated', payload);

    // Cleanup du mapping quand la course se termine (statuts terminaux)
    if (
      livreurId &&
      (status === 'COMPLETED' || status === 'CANCELLED' || status === 'FAILED')
    ) {
      this.activeOrders.delete(livreurId);
    }
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
   * `orderId` : il doit être le client OU le livreur de cette commande,
   * ou un ADMIN. Utilisé pour empêcher n'importe quel utilisateur
   * authentifié de rejoindre une room de chat qui ne le concerne pas.
   */
  private async isUserPartyToOrder(
    orderId: string,
    userId: string,
    role?: string,
  ): Promise<boolean> {
    if (role === UserRole.ADMIN) return true;

    const order = await this.ordersRepository.findOne({
      where: { id: orderId },
      relations: ['client', 'livreur'],
    });
    if (!order) return false;

    return order.client?.id === userId || order.livreur?.id === userId;
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
  handleChatTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string; isTyping: boolean },
  ) {
    const user = client.data?.user;
    if (!user || !data?.orderId) return;
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
      clientId?: string;
      livreurId?: string;
      senderId: string;
      recipientId?: string;
    },
  ) {
    const payload = { orderId, message };
    // Tout le monde dans la room reçoit (chat ouvert)
    this.server.to(`order:${orderId}:chat`).emit('chat:message', payload);
    // Et notification "tap" personnelle à l'autre partie (pour badge non-lu)
    if (parties.recipientId) {
      this.server
        .to(`user:${parties.recipientId}`)
        .emit('chat:message', payload);
    }
  }

  broadcastChatRead(
    orderId: string,
    data: { readerId: string; otherPartyId: string; at: string },
  ) {
    const payload = { orderId, readerId: data.readerId, at: data.at };
    this.server.to(`order:${orderId}:chat`).emit('chat:read', payload);
    this.server.to(`user:${data.otherPartyId}`).emit('chat:read', payload);
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
}
