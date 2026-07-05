import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsWhere,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import axios from 'axios';
import {
  DeliveryOrder,
  OrderStatus,
  PaymentStatus,
} from '../entities/delivery-order.entity';
import { UsersService } from '../users/users.service';
import { OrdersGateway } from './orders.gateway';
import { PositionsService } from './positions.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateMerchantOrderDto } from './dto/create-merchant-order.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { DriverApprovalStatus, UserRole } from '../entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { haversineKm } from '../common/geo';
import { PricingService } from '../pricing/pricing.service';
import { MerchantDriversService } from '../merchant-drivers/merchant-drivers.service';

type RouteCacheEntry = { km: number; at: number };
type RouteWithGeometry = { km: number; geometry: number[][] };
type RouteCacheGeomEntry = { route: RouteWithGeometry; at: number };

/**
 * Machine à états des livraisons — Priorité 3 (Lot 2) : ajout de statuts
 * granulaires (EN_ROUTE_PICKUP, AT_PICKUP, NEAR_CLIENT, FAILED) SANS retirer
 * ni changer la sémantique des 5 statuts historiques. Les transitions
 * ACCEPTED→IN_PROGRESS et IN_PROGRESS→COMPLETED (utilisées par le
 * géofencing mobile) restent valides pour la rétro-compatibilité.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.ACCEPTED, OrderStatus.CANCELLED],
  [OrderStatus.ACCEPTED]: [
    OrderStatus.EN_ROUTE_PICKUP,
    OrderStatus.AT_PICKUP,
    OrderStatus.IN_PROGRESS,
    OrderStatus.CANCELLED,
    OrderStatus.FAILED,
  ],
  [OrderStatus.EN_ROUTE_PICKUP]: [
    OrderStatus.AT_PICKUP,
    OrderStatus.IN_PROGRESS,
    OrderStatus.CANCELLED,
    OrderStatus.FAILED,
  ],
  [OrderStatus.AT_PICKUP]: [
    OrderStatus.IN_PROGRESS,
    OrderStatus.CANCELLED,
    OrderStatus.FAILED,
  ],
  [OrderStatus.IN_PROGRESS]: [
    OrderStatus.NEAR_CLIENT,
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED,
    OrderStatus.FAILED,
  ],
  [OrderStatus.NEAR_CLIENT]: [
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED,
    OrderStatus.FAILED,
  ],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.FAILED]: [],
};

/**
 * Statuts d'avancement de la course que seul le livreur (ou un admin) peut
 * déclencher — le client ne garde que la capacité d'annuler (CANCELLED).
 */
const LIVREUR_ONLY_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.EN_ROUTE_PICKUP,
  OrderStatus.AT_PICKUP,
  OrderStatus.IN_PROGRESS,
  OrderStatus.NEAR_CLIENT,
  OrderStatus.COMPLETED,
  OrderStatus.FAILED,
]);

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  /**
   * Fallback si la config DB (`PricingService`) est indisponible.
   * La source de vérité reste `pricing_config.pricePerKm` (200 FCFA/km par
   * défaut, modifiable par l'admin via `PATCH /admin/pricing`).
   */
  private readonly PRICE_PER_KM = 200;
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
    private positionsService: PositionsService,
    private pricing: PricingService,
    @Optional() private merchantDriversService?: MerchantDriversService,
  ) {}

  /** Tarif au km courant, avec fallback sur la constante si la config DB échoue. */
  private async getPricePerKm(): Promise<number> {
    try {
      return await this.pricing.getPricePerKm();
    } catch (err) {
      this.logger.warn(
        `PricingService indisponible, fallback PRICE_PER_KM=${this.PRICE_PER_KM}: ${(err as Error).message}`,
      );
      return this.PRICE_PER_KM;
    }
  }

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
    const pricePerKm = await this.getPricePerKm();
    const minPriceFcfa = await this.pricing
      .getMinPriceFcfa()
      .catch(() => null);
    let priceFcfa = Math.round(km * pricePerKm);
    if (minPriceFcfa != null) {
      priceFcfa = Math.max(priceFcfa, minPriceFcfa);
    }
    return {
      distanceKm: parseFloat(km.toFixed(2)),
      priceFcfa,
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

  /**
   * Calcule distance (km, arrondie à 2 décimales, min 0.5) + prix (FCFA)
   * pour un pickup/delivery donné. Factorisé entre `createOrder` (Type 2 —
   * client) et `createMerchantOrder` (Type 1 — commerçant).
   */
  private async buildOrderPricing(dto: {
    pickupLat?: number;
    pickupLng?: number;
    deliveryLat?: number;
    deliveryLng?: number;
  }): Promise<{ distanceKm: number; priceFcfa: number }> {
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

    const pricePerKm = await this.getPricePerKm();
    const minPriceFcfa = await this.pricing
      .getMinPriceFcfa()
      .catch(() => null);
    let priceFcfa = Math.round(distanceKm * pricePerKm);
    if (minPriceFcfa != null) {
      priceFcfa = Math.max(priceFcfa, minPriceFcfa);
    }

    return {
      distanceKm: parseFloat(distanceKm.toFixed(2)),
      priceFcfa,
    };
  }

  /**
   * Vérifie qu'un `preferredLivreurId` (attribution manuelle, Priorité 3
   * Lot 3 item 1) désigne bien un livreur APPROVED. Lève BadRequestException
   * sinon. Renvoie le User chargé (utile pour la notif FCM ciblée).
   */
  private async assertValidPreferredLivreur(preferredLivreurId: string) {
    const driver = await this.usersService.findOne(preferredLivreurId);
    if (driver.role !== UserRole.LIVREUR) {
      throw new BadRequestException(
        'Le livreur sélectionné doit être un livreur',
      );
    }
    if (driver.driverApprovalStatus !== DriverApprovalStatus.APPROVED) {
      throw new BadRequestException(
        "Le livreur sélectionné n'est pas encore validé par un administrateur",
      );
    }
    return driver;
  }

  /**
   * Diffuse une nouvelle course : broadcast ciblé (1 seul livreur) si
   * `preferredLivreur` est défini, sinon broadcast large classique (tous
   * les livreurs éligibles). Factorisé entre `createOrder` et
   * `createMerchantOrder`.
   */
  private async dispatchNewOrder(
    saved: DeliveryOrder,
    preferredLivreurId?: string,
  ): Promise<void> {
    if (preferredLivreurId) {
      const targetIds = new Set([preferredLivreurId]);
      this.ordersGateway.broadcastNewOrder(saved, targetIds);
      // Notifie directement CE livreur en FCM s'il est offline, au lieu du
      // fallback large `notifyOfflineLivreurs` (qui viserait tous les
      // livreurs éligibles).
      if (!this.ordersGateway.isUserConnected(preferredLivreurId)) {
        void this.notifications.sendToUser(preferredLivreurId, {
          title: 'Course réservée pour vous',
          body: `Pickup: ${saved.pickupAddress ?? 'adresse non renseignée'}`,
          data: { kind: 'new_order', orderId: saved.id },
        });
      }
      return;
    }

    const eligibleIds = new Set(
      await this.usersService.findEligibleLivreurIds(),
    );
    this.ordersGateway.broadcastNewOrder(saved, eligibleIds);

    // Fallback FCM : un livreur qui a fermé l'app (donc pas connecté au WS)
    // ne reçoit pas l'évent `newOrderAvailable`. On lui envoie une push.
    // Fire-and-forget pour ne pas bloquer la réponse HTTP.
    void this.notifyOfflineLivreurs(saved);
  }

  async createOrder(clientId: string, dto: CreateOrderDto) {
    const client = await this.usersService.findOne(clientId);
    if (client.role !== UserRole.CLIENT) {
      throw new ForbiddenException('Seul un client peut créer une commande');
    }

    let preferredLivreur: any = null;
    if (dto.preferredLivreurId) {
      preferredLivreur = await this.assertValidPreferredLivreur(
        dto.preferredLivreurId,
      );
    }

    const { distanceKm, priceFcfa } = await this.buildOrderPricing(dto);

    const order = this.ordersRepository.create({
      client,
      pickupAddress: dto.pickupAddress,
      pickupLat: dto.pickupLat,
      pickupLng: dto.pickupLng,
      deliveryAddress: dto.deliveryAddress,
      deliveryLat: dto.deliveryLat,
      deliveryLng: dto.deliveryLng,
      description: dto.description,
      distanceKm,
      priceFcfa,
      status: OrderStatus.PENDING,
      preferredLivreur,
    });

    const saved = await this.ordersRepository.save(order);

    await this.dispatchNewOrder(saved, preferredLivreur?.id);

    return saved;
  }

  /**
   * Priorité 2 (Type 1) : un COMMERCANT crée une livraison pour un client.
   * Le client peut être identifié par son compte (`clientId`) ou par son
   * numéro de téléphone (`clientPhone`, avec ou sans compte associé).
   * Le commerçant ne peut jamais devenir livreur (aucune modification des
   * règles d'acceptation : @Roles(LIVREUR) reste seul habilité).
   */
  async createMerchantOrder(merchantId: string, dto: CreateMerchantOrderDto) {
    const merchant = await this.usersService.findOne(merchantId);
    if (merchant.role !== UserRole.COMMERCANT) {
      throw new ForbiddenException(
        'Seul un commerçant peut créer une livraison pour un client',
      );
    }

    // Attribution manuelle (Priorité 3, Lot 3, item 1) : le livreur doit
    // être APPROVED. Pour un commerçant on accepte soit un livreur affilié
    // (relation de confiance via `merchant-drivers`), soit un livreur
    // APPROVED + actuellement disponible (comme pour un broadcast normal) —
    // ce qui permet aussi de réserver un livreur externe recommandé.
    let preferredLivreur: any = null;
    if (dto.preferredLivreurId) {
      preferredLivreur = await this.assertValidPreferredLivreur(
        dto.preferredLivreurId,
      );
      const affiliated = await this.merchantDriversService?.isAffiliated(
        merchantId,
        dto.preferredLivreurId,
      );
      if (!affiliated && !preferredLivreur.isAvailable) {
        throw new BadRequestException(
          'Ce livreur doit être affilié à votre compte ou actuellement disponible',
        );
      }
    }

    let client: any = null;
    let clientPhone: string | null = null;
    let clientName: string | null = null;

    if (dto.clientId) {
      const found = await this.usersService.findOne(dto.clientId);
      if (found.role !== UserRole.CLIENT) {
        throw new BadRequestException('Le destinataire doit être un client');
      }
      client = found;
      clientPhone = found.phone ?? null;
      clientName = `${found.firstName ?? ''} ${found.lastName ?? ''}`.trim() || null;
    } else if (dto.clientPhone) {
      const found = await this.usersService.findByPhone(dto.clientPhone);
      if (found && found.role === UserRole.CLIENT) {
        client = found;
        clientPhone = found.phone ?? null;
        clientName =
          `${found.firstName ?? ''} ${found.lastName ?? ''}`.trim() || null;
      } else {
        client = null;
        clientPhone = dto.clientPhone;
        clientName = dto.clientName ?? null;
      }
    } else {
      throw new BadRequestException(
        'Client requis (compte ou numéro de téléphone)',
      );
    }

    // Le commerçant peut ajuster manuellement le prix à la création. On
    // calcule quand même `distanceKm` (utile pour les stats/ETA), mais le
    // prix final est celui fourni par le commerçant s'il est présent.
    const computed = await this.buildOrderPricing(dto);
    const distanceKm = computed.distanceKm;
    const priceFcfa =
      dto.priceFcfa !== undefined ? dto.priceFcfa : computed.priceFcfa;

    const order = this.ordersRepository.create({
      merchant,
      client,
      clientPhone,
      clientName,
      pickupAddress: dto.pickupAddress,
      pickupLat: dto.pickupLat,
      pickupLng: dto.pickupLng,
      deliveryAddress: dto.deliveryAddress,
      deliveryLat: dto.deliveryLat,
      deliveryLng: dto.deliveryLng,
      description: dto.description,
      distanceKm,
      priceFcfa,
      status: OrderStatus.PENDING,
      preferredLivreur,
    });

    const saved = await this.ordersRepository.save(order);

    await this.dispatchNewOrder(saved, preferredLivreur?.id);

    if (client?.id) {
      void this.notifications.sendToUser(client.id, {
        title: 'Nouvelle livraison',
        body: 'Une livraison a été créée pour vous',
        data: { kind: 'new_order', orderId: saved.id },
      });
    }

    return saved;
  }

  /**
   * Envoie une push FCM aux livreurs offline (= pas connectés au WS).
   *
   * Stratégie en 2 temps :
   *  1. On préfère les livreurs qui ont une POSITION récente (≤ 5 min) :
   *     ils sont actifs et on peut filtrer par distance ≤ NOTIFY_RADIUS_KM
   *     (default 5 km) pour ne notifier que ceux qui sont à portée.
   *  2. Si aucun livreur n'a de position récente (par exemple juste après
   *     un redéploiement Fly.io où le cache mémoire est vide et personne
   *     n'a encore émis), on retombe sur le comportement précédent : on
   *     notifie TOUS les livreurs avec un fcmToken, sans filtre géo.
   *
   * Cela évite un trou de service au démarrage tout en restant ciblé
   * dès que le cache de positions se reconstitue.
   */
  private async notifyOfflineLivreurs(order: DeliveryOrder): Promise<void> {
    try {
      const radiusKm = Number(process.env.NOTIFY_RADIUS_KM) || 5;
      const pickupLat = Number(order?.pickupLat);
      const pickupLng = Number(order?.pickupLng);
      const hasPickupCoords =
        Number.isFinite(pickupLat) && Number.isFinite(pickupLng);

      const recentPositions =
        await this.positionsService.findRecentLivreurPositions(5);

      // Cas 1 : on a des positions récentes ET les coordonnées pickup → filtre géo actif
      if (recentPositions.length > 0 && hasPickupCoords) {
        const candidates = recentPositions.filter((p) => {
          // Skip si le livreur est connecté au WS (déjà notifié par newOrderAvailable)
          if (this.ordersGateway.isUserConnected(p.livreurId)) return false;
          // Filtre distance
          const distance = haversineKm(p.lat, p.lng, pickupLat, pickupLng);
          return distance <= radiusKm;
        });

        if (candidates.length === 0) {
          this.logger.log(
            `FCM fallback géo: 0 livreur offline dans le rayon ${radiusKm} km ` +
              `(${recentPositions.length} position(s) récente(s) au total)`,
          );
          return;
        }

        const pickup = order.pickupAddress ?? 'adresse non renseignée';
        const body =
          pickup.length > 80
            ? `Pickup: ${pickup.slice(0, 77)}...`
            : `Pickup: ${pickup}`;

        await Promise.all(
          candidates.map((p) =>
            this.notifications.sendToUser(p.livreurId, {
              title: 'Nouvelle course disponible',
              body,
              data: { kind: 'new_order', orderId: order.id },
            }),
          ),
        );
        this.logger.log(
          `FCM fallback géo: ${candidates.length} livreur(s) offline notifié(s) (rayon ${radiusKm} km)`,
        );
        return;
      }

      // Cas 2 : pas de positions récentes (ou pas de coords pickup) → fallback "global"
      // (rétro-compat avec le comportement pré-persistance, évite le trou au démarrage)
      const livreurs = await this.usersService.findLivreursWithFcmToken();
      const offline = livreurs.filter(
        (l) => !this.ordersGateway.isUserConnected(l.id),
      );
      if (offline.length === 0) {
        this.logger.log(
          `FCM fallback: aucun livreur offline à notifier (${livreurs.length} livreur(s) avec token, tous connectés)`,
        );
        return;
      }

      const pickup = order.pickupAddress ?? 'adresse non renseignée';
      const body =
        pickup.length > 80
          ? `Pickup: ${pickup.slice(0, 77)}...`
          : `Pickup: ${pickup}`;

      await Promise.all(
        offline.map((livreur) =>
          this.notifications.sendToUser(livreur.id, {
            title: 'Nouvelle course disponible',
            body,
            data: { kind: 'new_order', orderId: order.id },
          }),
        ),
      );
      this.logger.log(
        `FCM fallback (sans filtre géo): ${offline.length} livreur(s) offline notifié(s) ` +
          `(sur ${livreurs.length} avec token, ${recentPositions.length} position(s) récente(s))`,
      );
    } catch (err) {
      this.logger.warn(`FCM fallback échoué: ${(err as Error).message}`);
    }
  }

  /**
   * Liste paginée des courses (ADMIN, LIVREUR).
   * Filtres : status, createdAt entre `from` et `to` (inclus).
   * Retourne `{ items, total, page, limit, hasMore }`.
   */
  async findAll(query: ListOrdersDto = {}) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;

    const where: FindOptionsWhere<DeliveryOrder> = {};
    if (query.status) {
      where.status = query.status;
    }

    const fromDate = query.from ? new Date(query.from) : null;
    const toDate = query.to ? new Date(query.to) : null;
    // Si `to` est une date sans heure (YYYY-MM-DD), on étend à fin de journée
    // pour que le filtre soit inclusif comme attendu par les utilisateurs.
    if (toDate && /^\d{4}-\d{2}-\d{2}$/.test(query.to ?? '')) {
      toDate.setHours(23, 59, 59, 999);
    }
    if (fromDate && toDate) {
      where.createdAt = Between(fromDate, toDate);
    } else if (fromDate) {
      where.createdAt = MoreThanOrEqual(fromDate);
    } else if (toDate) {
      where.createdAt = LessThanOrEqual(toDate);
    }

    const [items, total] = await this.ordersRepository.findAndCount({
      where,
      relations: ['client', 'livreur'],
      order: { createdAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });

    return {
      items,
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };
  }

  /**
   * Liste des courses disponibles pour un livreur :
   * status = PENDING ET livreur IS NULL.
   * Tri par createdAt DESC, avec relation client.
   *
   * Le JWT ne contenant que { sub, phone, role }, on recharge systématiquement
   * le livreur depuis la DB pour connaître son statut de validation/dispo.
   * - Non validé (PENDING/REJECTED) → ForbiddenException (ne doit rien voir).
   * - Validé mais indisponible → [] (pas d'erreur, juste aucune course visible).
   */
  async findAvailable(livreur: any) {
    const u = await this.usersService.findOne(livreur.id ?? livreur.sub);
    if (u.driverApprovalStatus !== DriverApprovalStatus.APPROVED) {
      throw new ForbiddenException(
        'Votre compte livreur est en attente de validation par un administrateur',
      );
    }
    if (!u.isAvailable) {
      return [];
    }
    // Exclut les courses réservées à un AUTRE livreur (attribution manuelle,
    // Priorité 3 Lot 3 item 1). Une course sans preferredLivreurId reste
    // visible par tous (rétro-compat) ; une course réservée à CE livreur
    // reste visible pour lui.
    return this.ordersRepository.find({
      where: [
        {
          status: OrderStatus.PENDING,
          livreur: IsNull(),
          preferredLivreur: IsNull(),
        },
        {
          status: OrderStatus.PENDING,
          livreur: IsNull(),
          preferredLivreur: { id: u.id },
        },
      ],
      relations: ['client'],
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
    if (user.role === UserRole.COMMERCANT) {
      return this.ordersRepository.find({
        where: { merchant: { id: userId } },
        relations: ['client', 'livreur'],
        order: { createdAt: 'DESC' },
      });
    }
    // ADMIN tombant sur /orders/mine : on renvoie la première page paginée.
    return this.findAll();
  }

  async acceptOrder(orderId: string, livreurId: string) {
    // 0) Le JWT ne contient que { sub, phone, role } → on recharge toujours
    //    le livreur depuis la DB pour vérifier statut de validation + dispo
    //    AVANT toute autre opération.
    const livreur = await this.usersService.findOne(livreurId);
    if (livreur.driverApprovalStatus !== DriverApprovalStatus.APPROVED) {
      throw new ForbiddenException(
        'Votre compte livreur est en attente de validation',
      );
    }
    if (!livreur.isAvailable) {
      throw new ForbiddenException(
        'Vous êtes indisponible — passez disponible pour accepter une course',
      );
    }

    // 1) Vérifier l'existence avant l'UPDATE pour distinguer 404 (introuvable)
    //    de 409 (déjà prise par un autre livreur) et 403 (réservée à un
    //    autre livreur — attribution manuelle, Priorité 3 Lot 3 item 1).
    const existing = await this.ordersRepository.findOne({
      where: { id: orderId },
      relations: ['preferredLivreur'],
    });
    if (!existing) throw new NotFoundException('Commande introuvable');

    if (
      existing.preferredLivreur?.id &&
      existing.preferredLivreur.id !== livreurId
    ) {
      throw new ForbiddenException(
        'Cette course est réservée à un autre livreur',
      );
    }

    // 2) UPDATE atomique : seul le premier livreur dont la transaction
    //    arrive en DB matchera (status=PENDING ET livreurId IS NULL ET
    //    (preferredLivreurId IS NULL OU = ce livreur)).
    const result = await this.ordersRepository
      .createQueryBuilder()
      .update(DeliveryOrder)
      .set({
        status: OrderStatus.ACCEPTED,
        livreur: { id: livreurId } as any,
        acceptedAt: () => 'CURRENT_TIMESTAMP',
      })
      .where('id = :id', { id: orderId })
      .andWhere('status = :pending', { pending: OrderStatus.PENDING })
      .andWhere('livreurId IS NULL')
      .andWhere(
        '(preferredLivreurId IS NULL OR preferredLivreurId = :livreurId)',
        { livreurId },
      )
      .execute();

    if (!result.affected || result.affected === 0) {
      throw new ConflictException(
        'Cette course a déjà été prise par un autre livreur',
      );
    }

    // 3) Recharger l'order avec ses relations pour le broadcast et la push
    const updated = await this.ordersRepository.findOne({
      where: { id: orderId },
      relations: ['client', 'livreur'],
    });
    if (!updated) {
      // Edge case ultra-improbable (suppression concurrente)
      throw new NotFoundException('Commande introuvable après acceptation');
    }

    // 4) Le livreur (firstName utilisé dans la notif) a déjà été chargé en (0).
    this.ordersGateway.broadcastOrderAccepted(
      updated.id,
      livreur.id,
      updated.client?.id,
    );

    // Push notification au client si offline
    if (
      updated.client?.id &&
      !this.ordersGateway.isUserConnected(updated.client.id)
    ) {
      void this.notifications.sendToUser(updated.client.id, {
        title: 'Coursier en route !',
        body: `${livreur.firstName ?? 'Votre livreur'} a accepté votre course`,
        data: { kind: 'order_accepted', orderId: updated.id },
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

    if (LIVREUR_ONLY_STATUSES.has(status)) {
      if (!isLivreur && !isAdmin) {
        throw new ForbiddenException(
          'Seul le livreur peut faire avancer la course',
        );
      }
    }

    order.status = status;
    if (status === OrderStatus.IN_PROGRESS) {
      order.inProgressAt = new Date();
    }
    if (status === OrderStatus.COMPLETED) {
      order.completedAt = new Date();
    }
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
          [OrderStatus.EN_ROUTE_PICKUP]: {
            title: 'Coursier en route',
            body: 'Votre coursier est en route vers le point de retrait',
          },
          [OrderStatus.AT_PICKUP]: {
            title: 'Coursier arrivé',
            body: 'Votre coursier est arrivé au point de retrait',
          },
          [OrderStatus.IN_PROGRESS]: {
            title: 'Livraison en cours',
            body: 'Votre coursier a récupéré le colis',
          },
          [OrderStatus.NEAR_CLIENT]: {
            title: 'Coursier proche',
            body: 'Votre coursier est proche, préparez-vous',
          },
          [OrderStatus.COMPLETED]: {
            title: 'Course terminée',
            body: 'Votre colis a bien été livré, merci !',
          },
          [OrderStatus.CANCELLED]: {
            title: 'Course annulée',
            body: 'La course a été annulée',
          },
          [OrderStatus.FAILED]: {
            title: 'Livraison échouée',
            body: 'La livraison a échoué',
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

    // Push au LIVREUR si la course est annulée par le CLIENT ou un ADMIN
    // (le livreur peut être en route et doit être prévenu).
    // Ne s'applique pas si c'est le livreur lui-même qui a annulé.
    if (status === OrderStatus.CANCELLED) {
      const livreurId = order.livreur?.id;
      const cancelledByLivreur = order.cancelledBy === 'LIVREUR';
      if (
        livreurId &&
        !cancelledByLivreur &&
        !this.ordersGateway.isUserConnected(livreurId)
      ) {
        const body =
          order.cancelledBy === 'ADMIN'
            ? "La course a été annulée par l'administration."
            : 'Le client a annulé la course en cours.';
        void this.notifications.sendToUser(livreurId, {
          title: 'Course annulée',
          body,
          data: { kind: 'order_cancelled', orderId: order.id },
        });
      }
    }
    return saved;
  }

  /**
   * Calcule un ETA pour la course `orderId` du point de vue du livreur.
   *
   * Stratégie :
   * - Course `ACCEPTED` → ETA livreur → pickup
   * - Course `IN_PROGRESS` → ETA livreur → delivery
   * - Autres statuts → `basedOn: 'unavailable'` (la course n'est pas en route)
   *
   * Source de la position du livreur :
   *  1. Dernière position persistée (fraîche < 5 min) → `basedOn: 'driver_position'`
   *  2. Si la course est `IN_PROGRESS` mais qu'on n'a pas de position fraîche,
   *     on suppose que le livreur est encore au pickup (point de retrait
   *     connu) → `basedOn: 'pickup'`. Cas ACCEPTED sans position fraîche →
   *     `basedOn: 'unavailable'` (estimer un ETA = 0 vers le pickup serait
   *     trompeur).
   *
   * Vitesse moyenne retenue : 25 km/h (motos prédominantes à Lomé, ville
   * dense). Distance via Haversine (suffisant à la résolution minute, et
   * évite un appel ORS à chaque refresh client).
   *
   * Auth : seul le client/livreur de la course ou un admin peut consulter.
   */
  async computeEta(
    orderId: string,
    actor: any,
  ): Promise<{
    distanceKm: number | null;
    etaMinutes: number | null;
    basedOn: 'driver_position' | 'pickup' | 'unavailable';
  }> {
    const order = await this.ordersRepository.findOne({
      where: { id: orderId },
      relations: ['client', 'livreur'],
    });
    if (!order) throw new NotFoundException('Commande introuvable');

    const actorId = actor.id ?? actor.sub;
    const isClient = order.client?.id === actorId;
    const isLivreur = order.livreur?.id === actorId;
    const isAdmin = actor.role === UserRole.ADMIN;
    if (!isClient && !isLivreur && !isAdmin) {
      throw new ForbiddenException();
    }

    if (
      order.status !== OrderStatus.ACCEPTED &&
      order.status !== OrderStatus.IN_PROGRESS
    ) {
      return { distanceKm: null, etaMinutes: null, basedOn: 'unavailable' };
    }

    if (!order.livreur?.id) {
      return { distanceKm: null, etaMinutes: null, basedOn: 'unavailable' };
    }

    const position = await this.positionsService.findLatestForLivreur(
      order.livreur.id,
    );

    let driverLat: number | null = null;
    let driverLng: number | null = null;
    let basedOn: 'driver_position' | 'pickup' | 'unavailable' = 'unavailable';

    const positionFresh =
      position &&
      position.updatedAt &&
      Date.now() - new Date(position.updatedAt).getTime() < 5 * 60 * 1000;

    if (positionFresh) {
      driverLat = position!.lat;
      driverLng = position!.lng;
      basedOn = 'driver_position';
    } else if (order.status === OrderStatus.ACCEPTED) {
      // Pas de position fraîche en ACCEPTED : estimer ETA=0 vers pickup
      // serait trompeur (on ne sait pas où il est). On retourne unavailable.
      return { distanceKm: null, etaMinutes: null, basedOn: 'unavailable' };
    } else {
      // IN_PROGRESS sans position fraîche → on suppose que le livreur a
      // récupéré le colis et qu'il est au pickup (au pire des cas).
      if (order.pickupLat && order.pickupLng) {
        driverLat = order.pickupLat;
        driverLng = order.pickupLng;
        basedOn = 'pickup';
      } else {
        return { distanceKm: null, etaMinutes: null, basedOn: 'unavailable' };
      }
    }

    let targetLat: number;
    let targetLng: number;
    if (order.status === OrderStatus.ACCEPTED) {
      if (!order.pickupLat || !order.pickupLng) {
        return { distanceKm: null, etaMinutes: null, basedOn: 'unavailable' };
      }
      targetLat = order.pickupLat;
      targetLng = order.pickupLng;
    } else {
      if (!order.deliveryLat || !order.deliveryLng) {
        return { distanceKm: null, etaMinutes: null, basedOn: 'unavailable' };
      }
      targetLat = order.deliveryLat;
      targetLng = order.deliveryLng;
    }

    const distanceKm = haversineKm(driverLat, driverLng, targetLat, targetLng);
    // Vitesse moyenne en ville (Lomé, motos prédominantes) : ~25 km/h.
    const speedKmh = 25;
    const etaMinutes = Math.max(
      1,
      Math.round((distanceKm / speedKmh) * 60),
    );

    return {
      distanceKm: parseFloat(distanceKm.toFixed(2)),
      etaMinutes,
      basedOn,
    };
  }

  /**
   * Met à jour le statut de paiement d'une course (Priorité 3, Lot 2).
   * Indépendant de la machine à états `status` (peut évoluer à tout moment,
   * ex. le commerçant marque la livraison payée avant même son acceptation).
   *
   * Autorisé pour : le client de la course, le livreur assigné, le
   * commerçant créateur (Type 1), ou un admin. Tout autre acteur → 403.
   */
  async updatePaymentStatus(
    orderId: string,
    paymentStatus: PaymentStatus,
    actor: any,
  ): Promise<DeliveryOrder> {
    const order = await this.ordersRepository.findOne({
      where: { id: orderId },
      relations: ['client', 'livreur', 'merchant'],
    });
    if (!order) throw new NotFoundException('Commande introuvable');

    const actorId = actor.id ?? actor.sub;
    const isClient = order.client?.id === actorId;
    const isLivreur = order.livreur?.id === actorId;
    const isMerchant = order.merchant?.id === actorId;
    const isAdmin = actor.role === UserRole.ADMIN;

    if (!isClient && !isLivreur && !isMerchant && !isAdmin) {
      throw new ForbiddenException(
        'Vous ne pouvez pas modifier le statut de paiement de cette course',
      );
    }

    order.paymentStatus = paymentStatus;
    return this.ordersRepository.save(order);
  }

  /**
   * Liste des livreurs disponibles pour un choix manuel (Priorité 3, Lot 3,
   * item 1) : `GET /orders/available-drivers`. Renvoie les livreurs
   * APPROVED + isAvailable, chacun avec `{ id, firstName, lastName,
   * vehicle?, distanceKm? }`.
   *
   * - Si `lat`/`lng` sont fournis, on calcule la distance depuis la
   *   dernière position connue du livreur (PositionsService) et on trie par
   *   distance croissante ; les livreurs sans position connue sont mis en
   *   fin de liste.
   * - Si l'acteur est un COMMERCANT, ses livreurs affiliés sont placés en
   *   tête (flag `isAffiliated: true`), triés eux-mêmes par distance si
   *   disponible.
   */
  async findAvailableDriversForActor(
    actor: any,
    lat?: number,
    lng?: number,
  ): Promise<
    Array<{
      id: string;
      firstName: string;
      lastName: string;
      vehicle: any;
      distanceKm: number | null;
      isAffiliated: boolean;
    }>
  > {
    const drivers = await this.usersService.findAvailableDrivers();

    const hasCoords =
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      Number.isFinite(lat) &&
      Number.isFinite(lng);

    let affiliatedIds = new Set<string>();
    const actorId = actor?.id ?? actor?.sub;
    if (actor?.role === UserRole.COMMERCANT && actorId) {
      const affiliatedDrivers =
        (await this.merchantDriversService?.listDriversForMerchant(
          actorId,
        )) ?? [];
      affiliatedIds = new Set(affiliatedDrivers.map((d: any) => d.id));
    }

    const enriched = await Promise.all(
      drivers.map(async (driver) => {
        let distanceKm: number | null = null;
        if (hasCoords) {
          const pos = await this.positionsService.findLatestForLivreur(
            driver.id,
          );
          if (pos) {
            distanceKm = parseFloat(
              haversineKm(pos.lat, pos.lng, lat!, lng!).toFixed(2),
            );
          }
        }
        return {
          id: driver.id,
          firstName: driver.firstName,
          lastName: driver.lastName,
          vehicle: (driver as any).vehicle ?? null,
          distanceKm,
          isAffiliated: affiliatedIds.has(driver.id),
        };
      }),
    );

    enriched.sort((a, b) => {
      // Affiliés d'abord
      if (a.isAffiliated !== b.isAffiliated) {
        return a.isAffiliated ? -1 : 1;
      }
      // Puis par distance croissante (null = fin de liste)
      if (a.distanceKm === null && b.distanceKm === null) return 0;
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm;
    });

    return enriched;
  }

  /**
   * Réassignation manuelle (optionnelle, Priorité 3 Lot 3 item 1) : permet
   * à un commerçant/admin de désigner (ou changer) le livreur préféré d'une
   * course encore PENDING et non acceptée, par exemple si le premier
   * livreur ciblé n'a pas répondu. Re-déclenche le broadcast ciblé + la
   * notification FCM vers ce nouveau livreur.
   */
  async assignPreferredLivreur(
    orderId: string,
    livreurId: string,
  ): Promise<DeliveryOrder> {
    const order = await this.ordersRepository.findOne({
      where: { id: orderId },
      relations: ['client', 'livreur', 'preferredLivreur'],
    });
    if (!order) throw new NotFoundException('Commande introuvable');

    if (order.status !== OrderStatus.PENDING || order.livreur) {
      throw new BadRequestException(
        'Seule une course PENDING non encore acceptée peut être réassignée',
      );
    }

    const driver = await this.assertValidPreferredLivreur(livreurId);
    order.preferredLivreur = driver;
    const saved = await this.ordersRepository.save(order);

    await this.dispatchNewOrder(saved, driver.id);

    return saved;
  }
}
