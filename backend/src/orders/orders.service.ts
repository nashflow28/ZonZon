import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { DeliveryOrder, OrderStatus } from '../entities/delivery-order.entity';
import { UsersService } from '../users/users.service';
import { OrdersGateway } from './orders.gateway';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UserRole } from '../entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';

type RouteCacheEntry = { km: number; at: number };
type RouteWithGeometry = { km: number; geometry: number[][] };
type RouteCacheGeomEntry = { route: RouteWithGeometry; at: number };

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.ACCEPTED, OrderStatus.CANCELLED],
  [OrderStatus.ACCEPTED]: [OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED],
  [OrderStatus.IN_PROGRESS]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly PRICE_PER_KM = 150;
  private readonly orsBase =
    'https://api.openrouteservice.org/v2/directions/driving-car';
  private readonly orsApiKey = process.env.ORS_API_KEY;
  private orsKeyWarned = false;
  private readonly cacheTtlMs = 24 * 60 * 60 * 1000;
  private readonly routeCache = new Map<string, RouteCacheEntry>();
  private readonly routeGeomCache = new Map<string, RouteCacheGeomEntry>();

  constructor(
    @InjectRepository(DeliveryOrder)
    private ordersRepository: Repository<DeliveryOrder>,
    private usersService: UsersService,
    private ordersGateway: OrdersGateway,
    private notifications: NotificationsService,
  ) {}

  private cacheKey(lat1: number, lng1: number, lat2: number, lng2: number) {
    return [lat1, lng1, lat2, lng2].map((v) => v.toFixed(4)).join(',');
  }

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a)) * 1.3;
  }

  private warnMissingOrsKeyOnce() {
    if (!this.orsKeyWarned) {
      this.logger.warn(
        'ORS_API_KEY missing — falling back to Haversine×1.3 (dev mode). ' +
          'Set ORS_API_KEY in .env to enable OpenRouteService routing.',
      );
      this.orsKeyWarned = true;
    }
  }

  private async calculateRealDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): Promise<number> {
    const key = this.cacheKey(lat1, lng1, lat2, lng2);
    const cached = this.routeCache.get(key);
    if (cached && Date.now() - cached.at < this.cacheTtlMs) {
      return cached.km;
    }

    if (!this.orsApiKey) {
      this.warnMissingOrsKeyOnce();
      const fallback = this.haversineKm(lat1, lng1, lat2, lng2);
      this.routeCache.set(key, { km: fallback, at: Date.now() });
      return fallback;
    }

    const url =
      `${this.orsBase}?api_key=${encodeURIComponent(this.orsApiKey)}` +
      `&start=${lng1},${lat1}&end=${lng2},${lat2}`;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await axios.get(url, {
          timeout: 5000,
          headers: {
            Accept:
              'application/json, application/geo+json, application/gpx+xml',
          },
        });
        const meters =
          response.data?.features?.[0]?.properties?.summary?.distance;
        if (typeof meters === 'number') {
          const km = meters / 1000;
          this.routeCache.set(key, { km, at: Date.now() });
          return km;
        }
      } catch (err) {
        this.logger.warn(
          `ORS attempt ${attempt}/${maxAttempts} failed: ${(err as Error).message}`,
        );
        if (attempt === maxAttempts) break;
        await new Promise((r) => setTimeout(r, 300 * attempt));
      }
    }

    const fallback = this.haversineKm(lat1, lng1, lat2, lng2);
    this.logger.warn(
      `ORS unavailable, fallback Haversine×1.3 = ${fallback.toFixed(2)} km`,
    );
    return fallback;
  }

  /**
   * Calcule la route avec géométrie pour un preview côté client.
   * Renvoie distance + polyline (paires [lat, lng] pour flutter_map).
   * Si ORS indispo, fallback Haversine sans géométrie (juste 2 points).
   */
  async estimateRoute(
    pickupLat: number,
    pickupLng: number,
    deliveryLat: number,
    deliveryLng: number,
  ): Promise<{ distanceKm: number; priceFcfa: number; polyline: number[][] }> {
    const route = await this.calculateRouteWithGeometry(
      pickupLat,
      pickupLng,
      deliveryLat,
      deliveryLng,
    );
    let km = route.km;
    if (km < 0.5) km = 0.5;
    return {
      distanceKm: parseFloat(km.toFixed(2)),
      priceFcfa: Math.round(km * this.PRICE_PER_KM),
      polyline: route.geometry,
    };
  }

  private async calculateRouteWithGeometry(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): Promise<RouteWithGeometry> {
    const key = this.cacheKey(lat1, lng1, lat2, lng2);
    const cached = this.routeGeomCache.get(key);
    if (cached && Date.now() - cached.at < this.cacheTtlMs) {
      return cached.route;
    }

    if (!this.orsApiKey) {
      this.warnMissingOrsKeyOnce();
      const fallbackKm = this.haversineKm(lat1, lng1, lat2, lng2);
      const fallbackResult: RouteWithGeometry = {
        km: fallbackKm,
        geometry: [
          [lat1, lng1],
          [lat2, lng2],
        ],
      };
      this.routeGeomCache.set(key, { route: fallbackResult, at: Date.now() });
      this.routeCache.set(key, { km: fallbackKm, at: Date.now() });
      return fallbackResult;
    }

    const url =
      `${this.orsBase}?api_key=${encodeURIComponent(this.orsApiKey)}` +
      `&start=${lng1},${lat1}&end=${lng2},${lat2}`;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await axios.get(url, {
          timeout: 6000,
          headers: {
            Accept:
              'application/json, application/geo+json, application/gpx+xml',
          },
        });
        const feature = response.data?.features?.[0];
        const meters = feature?.properties?.summary?.distance;
        const coords = feature?.geometry?.coordinates;
        if (typeof meters === 'number' && Array.isArray(coords)) {
          const km = meters / 1000;
          // ORS renvoie [lng, lat] → on convertit en [lat, lng] pour flutter_map
          const polyline = coords
            .filter(
              (c: any) =>
                Array.isArray(c) &&
                typeof c[0] === 'number' &&
                typeof c[1] === 'number',
            )
            .map((c: number[]) => [c[1], c[0]]);
          const result: RouteWithGeometry = { km, geometry: polyline };
          this.routeGeomCache.set(key, { route: result, at: Date.now() });
          // Mémorise aussi la distance dans le cache de createOrder
          this.routeCache.set(key, { km, at: Date.now() });
          return result;
        }
      } catch (err) {
        this.logger.warn(
          `ORS-geom attempt ${attempt}/${maxAttempts} failed: ${(err as Error).message}`,
        );
        if (attempt === maxAttempts) break;
        await new Promise((r) => setTimeout(r, 300 * attempt));
      }
    }

    // Fallback : ligne droite + Haversine×1.3
    const fallbackKm = this.haversineKm(lat1, lng1, lat2, lng2);
    return {
      km: fallbackKm,
      geometry: [
        [lat1, lng1],
        [lat2, lng2],
      ],
    };
  }

  async createOrder(clientId: string, dto: CreateOrderDto) {
    const client = await this.usersService.findOne(clientId);
    if (client.role !== UserRole.CLIENT) {
      throw new ForbiddenException('Seul un client peut créer une commande');
    }

    let distanceKm = 0;
    if (dto.pickupLat && dto.pickupLng && dto.deliveryLat && dto.deliveryLng) {
      distanceKm = await this.calculateRealDistance(
        dto.pickupLat,
        dto.pickupLng,
        dto.deliveryLat,
        dto.deliveryLng,
      );
    } else {
      throw new BadRequestException('Coordonnées GPS manquantes');
    }

    if (distanceKm < 0.5) distanceKm = 0.5;

    const price = distanceKm * this.PRICE_PER_KM;

    const order = this.ordersRepository.create({
      client,
      pickupAddress: dto.pickupAddress,
      pickupLat: dto.pickupLat,
      pickupLng: dto.pickupLng,
      deliveryAddress: dto.deliveryAddress,
      deliveryLat: dto.deliveryLat,
      deliveryLng: dto.deliveryLng,
      description: dto.description,
      distanceKm: parseFloat(distanceKm.toFixed(2)),
      priceFcfa: Math.round(price),
      status: OrderStatus.PENDING,
    });

    const saved = await this.ordersRepository.save(order);
    this.ordersGateway.broadcastNewOrder(saved);
    return saved;
  }

  findAll() {
    return this.ordersRepository.find({
      relations: ['client', 'livreur'],
      order: { createdAt: 'DESC' },
    });
  }

  findForUser(user: any) {
    const userId = user.id ?? user.sub;
    if (user.role === UserRole.CLIENT) {
      return this.ordersRepository.find({
        where: { client: { id: userId } },
        relations: ['livreur'],
        order: { createdAt: 'DESC' },
      });
    }
    if (user.role === UserRole.LIVREUR) {
      return this.ordersRepository.find({
        where: { livreur: { id: userId } },
        relations: ['client'],
        order: { createdAt: 'DESC' },
      });
    }
    return this.findAll();
  }

  async acceptOrder(orderId: string, livreurId: string) {
    const order = await this.ordersRepository.findOne({
      where: { id: orderId },
      relations: ['client'],
    });
    if (!order) throw new NotFoundException('Commande introuvable');
    if (order.status !== OrderStatus.PENDING) {
      throw new ConflictException(
        'Cette course a déjà été prise par un autre livreur',
      );
    }

    const livreur = await this.usersService.findOne(livreurId);
    order.status = OrderStatus.ACCEPTED;
    order.livreur = livreur;

    const updated = await this.ordersRepository.save(order);
    this.ordersGateway.broadcastOrderAccepted(
      order.id,
      livreur.id,
      order.client?.id,
    );

    // Push notification au client si offline
    if (
      order.client?.id &&
      !this.ordersGateway.isUserConnected(order.client.id)
    ) {
      void this.notifications.sendToUser(order.client.id, {
        title: 'Coursier en route !',
        body: `${livreur.firstName ?? 'Votre livreur'} a accepté votre course`,
        data: { kind: 'order_accepted', orderId: order.id },
      });
    }
    return updated;
  }

  async updateStatus(
    id: string,
    status: OrderStatus,
    actor: any,
    dto?: UpdateStatusDto,
  ) {
    const order = await this.ordersRepository.findOne({
      where: { id },
      relations: ['client', 'livreur'],
    });
    if (!order) throw new NotFoundException('Commande introuvable');

    const actorId = actor.id ?? actor.sub;
    const isClient = order.client?.id === actorId;
    const isLivreur = order.livreur?.id === actorId;
    const isAdmin = actor.role === UserRole.ADMIN;
    if (!isClient && !isLivreur && !isAdmin) {
      throw new ForbiddenException('Vous ne pouvez pas modifier cette course');
    }

    const allowed = ALLOWED_TRANSITIONS[order.status];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Transition interdite : ${order.status} → ${status}`,
      );
    }

    if (
      status === OrderStatus.IN_PROGRESS ||
      status === OrderStatus.COMPLETED
    ) {
      if (!isLivreur && !isAdmin) {
        throw new ForbiddenException(
          'Seul le livreur peut faire avancer la course',
        );
      }
    }

    order.status = status;
    if (status === OrderStatus.CANCELLED) {
      order.cancellationReason = dto?.cancellationReason?.trim() || null;
      const role = actor.role as UserRole | string | undefined;
      if (role === UserRole.ADMIN) {
        order.cancelledBy = 'ADMIN';
      } else if (role === UserRole.LIVREUR) {
        order.cancelledBy = 'LIVREUR';
      } else if (role === UserRole.CLIENT) {
        order.cancelledBy = 'CLIENT';
      } else {
        order.cancelledBy = null;
      }
    }
    const saved = await this.ordersRepository.save(order);
    this.ordersGateway.broadcastStatusUpdate(
      order.id,
      status,
      order.client?.id,
      order.livreur?.id,
    );

    // Push au client pour les transitions importantes
    const clientId = order.client?.id;
    if (clientId && !this.ordersGateway.isUserConnected(clientId)) {
      const map: Partial<Record<OrderStatus, { title: string; body: string }>> =
        {
          [OrderStatus.IN_PROGRESS]: {
            title: 'Livraison en cours',
            body: 'Votre coursier a récupéré le colis',
          },
          [OrderStatus.COMPLETED]: {
            title: 'Course terminée',
            body: 'Votre colis a bien été livré, merci !',
          },
          [OrderStatus.CANCELLED]: {
            title: 'Course annulée',
            body: 'La course a été annulée',
          },
        };
      const payload = map[status];
      if (payload) {
        void this.notifications.sendToUser(clientId, {
          ...payload,
          data: { kind: 'order_status', orderId: order.id, status },
        });
      }
    }
    return saved;
  }
}
