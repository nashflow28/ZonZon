import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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
import { haversineKm } from '../common/geo';

type DriverPosition = { lat: number; lng: number; at: number };
type ActiveOrderRef = { orderId: string; clientId?: string };

const POSITION_TTL_MS = 5 * 60 * 1000;

function resolveWsCorsOrigin(): string[] | boolean {
  const origins = process.env.FRONTEND_URLS?.split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (origins && origins.length > 0) {
    return origins;
  }
  // Liste vide : on refuse en prod, on autorise tout en dev
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

  constructor(private jwtService: JwtService) {}

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

  broadcastNewOrder(order: any) {
    this.purgeStalePositions();

    const radiusKm = Number(process.env.NOTIFY_RADIUS_KM) || 5;
    const pickupLat = Number(order?.pickupLat);
    const pickupLng = Number(order?.pickupLng);

    const connectedDrivers = this.getConnectedDriverIds();
    const totalDrivers = connectedDrivers.size;

    // Si pas de coordonnées pickup exploitables, fallback broadcast global
    if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) {
      this.server
        .to(`role:${UserRole.LIVREUR}`)
        .emit('newOrderAvailable', order);
      this.logger.log(
        `Nouvelle course diffusée à ${totalDrivers}/${totalDrivers} livreurs (coordonnées pickup manquantes, broadcast global)`,
      );
      return;
    }

    let notified = 0;
    for (const driverId of connectedDrivers) {
      const pos = this.driverPositions.get(driverId);
      if (!pos) {
        // Fallback : livreur connecté mais position inconnue → on notifie quand même
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

    // Cleanup du mapping quand la course se termine
    if (livreurId && (status === 'COMPLETED' || status === 'CANCELLED')) {
      this.activeOrders.delete(livreurId);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Chat par commande
  // ──────────────────────────────────────────────────────────────────────────

  @SubscribeMessage('chat:join')
  handleChatJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string },
  ) {
    if (!data?.orderId) return;
    client.join(`order:${data.orderId}:chat`);
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
