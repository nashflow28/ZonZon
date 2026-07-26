import { JwtService } from '@nestjs/jwt';
import { OrdersGateway } from './orders.gateway';
import { UserRole } from '../entities/user.entity';

/**
 * Construit un mock minimal de socket.io Server qui :
 *  - expose `emit`, `to(room).emit(...)` chaînable
 *  - expose `sockets.adapter.rooms` (Map<roomName, Set<socketId>>)
 *  - expose `sockets.sockets` (Map<socketId, Socket>) pour résoudre data.user.sub
 *
 * `emitCalls` capture tous les appels `(room, event, payload)` pour assertion.
 */
function buildMockServer(
  driverSockets: Array<{ socketId: string; userId: string }>,
) {
  type EmitCall = { room: string; event: string; payload: any };
  const emitCalls: EmitCall[] = [];

  // Map socketId → socket (avec data.user.sub)
  const socketsMap = new Map<string, any>();
  const driverRoomMembers = new Set<string>();
  for (const d of driverSockets) {
    socketsMap.set(d.socketId, {
      data: { user: { sub: d.userId, role: UserRole.LIVREUR } },
    });
    driverRoomMembers.add(d.socketId);
  }

  const roomsMap = new Map<string, Set<string>>();
  roomsMap.set(`role:${UserRole.LIVREUR}`, driverRoomMembers);

  const server: any = {
    sockets: {
      adapter: { rooms: roomsMap },
      sockets: socketsMap,
    },
    to(room: string) {
      // Reproduit l'opérateur de diffusion de socket.io : `.to(...)` est
      // chaînable avec `.except(...)` avant `.emit(...)`.
      const makeOperator = (except?: string) => ({
        except(excludedRoom: string) {
          return makeOperator(excludedRoom);
        },
        emit(event: string, payload: any) {
          emitCalls.push({ room, event, payload, except });
        },
      });
      return makeOperator();
    },
    emit(event: string, payload: any) {
      emitCalls.push({ room: '__broadcast__', event, payload });
    },
  };

  return { server, emitCalls };
}

describe('OrdersGateway', () => {
  let jwtService: { verify: jest.Mock; sign: jest.Mock };
  let ordersRepository: { find: jest.Mock; findOne: jest.Mock };
  let gateway: OrdersGateway;

  beforeEach(() => {
    jwtService = { verify: jest.fn(), sign: jest.fn() };
    ordersRepository = { find: jest.fn(), findOne: jest.fn() };
    gateway = new OrdersGateway(
      jwtService as unknown as JwtService,
      ordersRepository as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.NOTIFY_RADIUS_KM;
  });

  describe('broadcastNewOrder', () => {
    // Lomé centre approximativement
    const pickupLat = 6.13;
    const pickupLng = 1.22;

    const order = {
      id: 'ord-1',
      pickupLat,
      pickupLng,
      deliveryLat: 6.17,
      deliveryLng: 1.23,
      pickupAddress: 'A',
      deliveryAddress: 'B',
    };

    it('notifie uniquement les livreurs dans le rayon (NOTIFY_RADIUS_KM=5)', () => {
      process.env.NOTIFY_RADIUS_KM = '5';

      // 3 livreurs : 1 proche (~0.5km) et 2 hors rayon (~50km+)
      const drivers = [
        { socketId: 's1', userId: 'driver-near' },
        { socketId: 's2', userId: 'driver-far-1' },
        { socketId: 's3', userId: 'driver-far-2' },
      ];
      const { server, emitCalls } = buildMockServer(drivers);
      gateway.server = server;

      // Set positions: near (within 5km), far-1 (~50km), far-2 (~100km)
      const driverPositions: Map<string, any> = (gateway as any)
        .driverPositions;
      driverPositions.set('driver-near', {
        lat: pickupLat + 0.005,
        lng: pickupLng + 0.005,
        at: Date.now(),
      });
      driverPositions.set('driver-far-1', {
        lat: pickupLat + 0.5, // ~55 km
        lng: pickupLng,
        at: Date.now(),
      });
      driverPositions.set('driver-far-2', {
        lat: pickupLat + 1.0, // ~111 km
        lng: pickupLng,
        at: Date.now(),
      });

      gateway.broadcastNewOrder(order);

      const newOrderEmits = emitCalls.filter(
        (c) => c.event === 'newOrderAvailable',
      );
      expect(newOrderEmits).toHaveLength(1);
      expect(newOrderEmits[0].room).toBe('user:driver-near');
      expect(newOrderEmits[0].payload).toBe(order);
    });

    it('coordonnées pickup invalides → fallback broadcast global à role:LIVREUR', () => {
      const drivers = [
        { socketId: 's1', userId: 'd-1' },
        { socketId: 's2', userId: 'd-2' },
      ];
      const { server, emitCalls } = buildMockServer(drivers);
      gateway.server = server;

      // Coordonnées NaN → fallback global
      const badOrder = {
        id: 'ord-bad',
        pickupLat: 'invalid' as any,
        pickupLng: undefined,
      };

      gateway.broadcastNewOrder(badOrder);

      const newOrderEmits = emitCalls.filter(
        (c) => c.event === 'newOrderAvailable',
      );
      expect(newOrderEmits).toHaveLength(1);
      expect(newOrderEmits[0].room).toBe(`role:${UserRole.LIVREUR}`);
      expect(newOrderEmits[0].payload).toBe(badOrder);
    });

    it('livreur connecté sans position connue → notifié quand même (fallback)', () => {
      const drivers = [
        { socketId: 's1', userId: 'driver-known' },
        { socketId: 's2', userId: 'driver-unknown' },
      ];
      const { server, emitCalls } = buildMockServer(drivers);
      gateway.server = server;

      // Seul driver-known a une position (et il est dans le rayon)
      const driverPositions: Map<string, any> = (gateway as any)
        .driverPositions;
      driverPositions.set('driver-known', {
        lat: pickupLat + 0.001,
        lng: pickupLng + 0.001,
        at: Date.now(),
      });
      // driver-unknown : pas dans driverPositions → fallback notify

      gateway.broadcastNewOrder(order);

      const newOrderEmits = emitCalls.filter(
        (c) => c.event === 'newOrderAvailable',
      );
      // Les deux doivent être notifiés
      expect(newOrderEmits).toHaveLength(2);
      const rooms = newOrderEmits.map((e) => e.room).sort();
      expect(rooms).toEqual(['user:driver-known', 'user:driver-unknown']);
    });

    it('tous les livreurs hors rayon → fallback broadcast à tous les connectés', () => {
      process.env.NOTIFY_RADIUS_KM = '5';

      const drivers = [
        { socketId: 's1', userId: 'driver-far-1' },
        { socketId: 's2', userId: 'driver-far-2' },
      ];
      const { server, emitCalls } = buildMockServer(drivers);
      gateway.server = server;

      // Les deux livreurs sont loin du pickup (> 5km)
      const driverPositions: Map<string, any> = (gateway as any)
        .driverPositions;
      driverPositions.set('driver-far-1', {
        lat: pickupLat + 1.0, // ~111 km
        lng: pickupLng,
        at: Date.now(),
      });
      driverPositions.set('driver-far-2', {
        lat: pickupLat + 2.0, // ~222 km
        lng: pickupLng,
        at: Date.now(),
      });

      gateway.broadcastNewOrder(order);

      const newOrderEmits = emitCalls.filter(
        (c) => c.event === 'newOrderAvailable',
      );
      // Fallback : les deux reçoivent quand même la course
      expect(newOrderEmits).toHaveLength(2);
      const rooms = newOrderEmits.map((e) => e.room).sort();
      expect(rooms).toEqual(['user:driver-far-1', 'user:driver-far-2']);
    });

    it('coordonnées pickup nulles (0,0) → traité comme manquant, broadcast global', () => {
      const drivers = [{ socketId: 's1', userId: 'd-1' }];
      const { server, emitCalls } = buildMockServer(drivers);
      gateway.server = server;

      // pickupLat/Lng = 0 → position océan invalide → fallback global
      const zeroOrder = { id: 'ord-zero', pickupLat: 0, pickupLng: 0 };
      gateway.broadcastNewOrder(zeroOrder);

      const newOrderEmits = emitCalls.filter(
        (c) => c.event === 'newOrderAvailable',
      );
      expect(newOrderEmits).toHaveLength(1);
      expect(newOrderEmits[0].room).toBe(`role:${UserRole.LIVREUR}`);
    });

    it('aucun livreur connecté → aucun emit newOrderAvailable', () => {
      const { server, emitCalls } = buildMockServer([]);
      gateway.server = server;

      gateway.broadcastNewOrder(order);
      const newOrderEmits = emitCalls.filter(
        (c) => c.event === 'newOrderAvailable',
      );
      expect(newOrderEmits).toHaveLength(0);
    });

    it('avec eligibleDriverIds fourni : seuls les livreurs connectés ET éligibles reçoivent la course', () => {
      // 3 livreurs connectés, tous proches du pickup (dans le rayon), mais
      // seuls 2 sont éligibles (validés + disponibles).
      const drivers = [
        { socketId: 's1', userId: 'driver-eligible-1' },
        { socketId: 's2', userId: 'driver-eligible-2' },
        { socketId: 's3', userId: 'driver-not-eligible' },
      ];
      const { server, emitCalls } = buildMockServer(drivers);
      gateway.server = server;

      const driverPositions: Map<string, any> = (gateway as any)
        .driverPositions;
      driverPositions.set('driver-eligible-1', {
        lat: pickupLat + 0.001,
        lng: pickupLng + 0.001,
        at: Date.now(),
      });
      driverPositions.set('driver-eligible-2', {
        lat: pickupLat + 0.002,
        lng: pickupLng + 0.002,
        at: Date.now(),
      });
      driverPositions.set('driver-not-eligible', {
        lat: pickupLat + 0.001,
        lng: pickupLng + 0.001,
        at: Date.now(),
      });

      const eligibleDriverIds = new Set([
        'driver-eligible-1',
        'driver-eligible-2',
      ]);

      gateway.broadcastNewOrder(order, eligibleDriverIds);

      const newOrderEmits = emitCalls.filter(
        (c) => c.event === 'newOrderAvailable',
      );
      const rooms = newOrderEmits.map((e) => e.room).sort();
      expect(rooms).toEqual([
        'user:driver-eligible-1',
        'user:driver-eligible-2',
      ]);
    });

    it('avec eligibleDriverIds fourni ET coordonnées pickup manquantes : notifie uniquement les éligibles (pas de broadcast global)', () => {
      const drivers = [
        { socketId: 's1', userId: 'driver-eligible' },
        { socketId: 's2', userId: 'driver-not-eligible' },
      ];
      const { server, emitCalls } = buildMockServer(drivers);
      gateway.server = server;

      const badOrder = {
        id: 'ord-bad-eligible',
        pickupLat: 'invalid' as any,
        pickupLng: undefined,
      };

      gateway.broadcastNewOrder(badOrder, new Set(['driver-eligible']));

      const newOrderEmits = emitCalls.filter(
        (c) => c.event === 'newOrderAvailable',
      );
      expect(newOrderEmits).toHaveLength(1);
      expect(newOrderEmits[0].room).toBe('user:driver-eligible');
    });
  });

  describe('broadcastStatusUpdate', () => {
    it('émet orderStatusUpdated au client et au livreur', () => {
      const { server, emitCalls } = buildMockServer([]);
      gateway.server = server;

      gateway.broadcastStatusUpdate(
        'ord-1',
        'EN_ROUTE_PICKUP',
        'client-1',
        'driver-1',
      );

      const emits = emitCalls.filter((c) => c.event === 'orderStatusUpdated');
      expect(emits).toHaveLength(2);
      const rooms = emits.map((e) => e.room).sort();
      expect(rooms).toEqual(['user:client-1', 'user:driver-1']);
      expect(emits[0].payload).toEqual({
        orderId: 'ord-1',
        status: 'EN_ROUTE_PICKUP',
      });
    });

    it.each(['COMPLETED', 'CANCELLED', 'FAILED'])(
      'retire seulement la commande terminale du mapping activeOrders du livreur pour le statut terminal %s',
      (status) => {
        const { server } = buildMockServer([]);
        gateway.server = server;
        const activeOrders: Map<string, any> = (gateway as any).activeOrders;
        activeOrders.set('driver-1', [
          { orderId: 'ord-1', clientId: 'client-1' },
          { orderId: 'ord-2', clientId: 'client-2' },
        ]);

        gateway.broadcastStatusUpdate('ord-1', status, 'client-1', 'driver-1');

        expect(activeOrders.get('driver-1')).toEqual([
          { orderId: 'ord-2', clientId: 'client-2' },
        ]);
      },
    );

    it('ne nettoie PAS le mapping pour un statut non terminal (EN_ROUTE_PICKUP)', () => {
      const { server } = buildMockServer([]);
      gateway.server = server;
      const activeOrders: Map<string, any> = (gateway as any).activeOrders;
      activeOrders.set('driver-1', [
        { orderId: 'ord-1', clientId: 'client-1' },
      ]);

      gateway.broadcastStatusUpdate(
        'ord-1',
        'EN_ROUTE_PICKUP',
        'client-1',
        'driver-1',
      );

      expect(activeOrders.has('driver-1')).toBe(true);
    });

    // ── P2 (CDC V1 §11.2) : accès commerçant ──────────────────────────────

    it('émet aussi orderStatusUpdated au commerçant quand merchantId est fourni', () => {
      const { server, emitCalls } = buildMockServer([]);
      gateway.server = server;

      gateway.broadcastStatusUpdate(
        'ord-1',
        'EN_ROUTE_PICKUP',
        'client-1',
        'driver-1',
        'merchant-1',
      );

      const emits = emitCalls.filter((c) => c.event === 'orderStatusUpdated');
      expect(emits).toHaveLength(3);
      const rooms = emits.map((e) => e.room).sort();
      expect(rooms).toEqual([
        'user:client-1',
        'user:driver-1',
        'user:merchant-1',
      ]);
    });

    it("n'émet pas au commerçant si merchantId est absent", () => {
      const { server, emitCalls } = buildMockServer([]);
      gateway.server = server;

      gateway.broadcastStatusUpdate('ord-1', 'EN_ROUTE_PICKUP', 'client-1');

      const emits = emitCalls.filter((c) => c.event === 'orderStatusUpdated');
      expect(emits).toHaveLength(1);
    });
  });

  describe('broadcastPaymentUpdate (P1 — diffusion temps réel du paiement)', () => {
    it('émet orderPaymentUpdated au client, au livreur et au commerçant', () => {
      const { server, emitCalls } = buildMockServer([]);
      gateway.server = server;

      gateway.broadcastPaymentUpdate(
        'ord-1',
        'PAID',
        'client-1',
        'driver-1',
        'merchant-1',
      );

      const emits = emitCalls.filter((c) => c.event === 'orderPaymentUpdated');
      expect(emits).toHaveLength(3);
      const rooms = emits.map((e) => e.room).sort();
      expect(rooms).toEqual([
        'user:client-1',
        'user:driver-1',
        'user:merchant-1',
      ]);
      expect(emits[0].payload).toEqual({
        orderId: 'ord-1',
        paymentStatus: 'PAID',
      });
    });

    it("n'émet qu'aux parties présentes (ids optionnels absents)", () => {
      const { server, emitCalls } = buildMockServer([]);
      gateway.server = server;

      gateway.broadcastPaymentUpdate('ord-1', 'PAID', 'client-1');

      const emits = emitCalls.filter((c) => c.event === 'orderPaymentUpdated');
      expect(emits).toHaveLength(1);
      expect(emits[0].room).toBe('user:client-1');
    });
  });

  describe('broadcastOrderAccepted (merchant)', () => {
    it('émet orderAccepted au commerçant et mémorise merchantId dans activeOrders', () => {
      const { server, emitCalls } = buildMockServer([]);
      gateway.server = server;

      gateway.broadcastOrderAccepted(
        'ord-1',
        'driver-1',
        'client-1',
        'merchant-1',
      );

      const emits = emitCalls.filter(
        (c) => c.event === 'orderAccepted' && c.room === 'user:merchant-1',
      );
      expect(emits).toHaveLength(1);

      const activeOrders: Map<string, any> = (gateway as any).activeOrders;
      expect(activeOrders.get('driver-1')).toEqual([
        {
          orderId: 'ord-1',
          clientId: 'client-1',
          merchantId: 'merchant-1',
        },
      ]);
    });

    it("n'émet pas au commerçant si merchantId est absent (rétro-compat)", () => {
      const { server, emitCalls } = buildMockServer([]);
      gateway.server = server;

      gateway.broadcastOrderAccepted('ord-1', 'driver-1', 'client-1');

      const merchantEmits = emitCalls.filter(
        (c) =>
          c.event === 'orderAccepted' &&
          c.room.startsWith('user:') &&
          c.room !== 'user:client-1' &&
          // Le livreur gagnant reçoit légitimement le payload complet sur sa
          // room personnelle (il en a besoin pour ouvrir sa course active).
          c.room !== 'user:driver-1',
      );
      expect(merchantEmits).toHaveLength(0);
    });

    it("ne diffuse pas les données de la commande à la room globale des livreurs", () => {
      const { server, emitCalls } = buildMockServer([]);
      gateway.server = server;

      const order = {
        id: 'ord-1',
        clientPhone: '+22890000000',
        deliveryAddress: 'Rue X, Lomé',
      };
      gateway.broadcastOrderAccepted(
        'ord-1',
        'driver-1',
        'client-1',
        'merchant-1',
        { id: 'driver-1', phone: '+22891111111' },
        order,
      );

      const radarEmit = emitCalls.find(
        (c) =>
          c.event === 'orderAccepted' &&
          c.room === `role:${UserRole.LIVREUR}`,
      );
      expect(radarEmit).toBeDefined();
      // Payload minimal : aucune donnée personnelle du client ni du livreur.
      expect(radarEmit!.payload).toEqual({
        orderId: 'ord-1',
        livreurId: 'driver-1',
      });
      // Et le livreur gagnant est exclu de cette diffusion (il reçoit le
      // payload complet sur sa room personnelle).
      expect(radarEmit!.except).toBe('user:driver-1');

      const winnerEmit = emitCalls.find(
        (c) => c.event === 'orderAccepted' && c.room === 'user:driver-1',
      );
      expect(winnerEmit!.payload.order).toEqual(order);
    });

    it('pousse immédiatement la dernière position connue au client et au commerçant', () => {
      const { server, emitCalls } = buildMockServer([]);
      gateway.server = server;
      const driverPositions: Map<string, any> = (gateway as any)
        .driverPositions;
      driverPositions.set('driver-1', {
        lat: 6.13,
        lng: 1.22,
        at: 1234567890,
      });

      gateway.broadcastOrderAccepted(
        'ord-1',
        'driver-1',
        'client-1',
        'merchant-1',
      );

      const emits = emitCalls.filter(
        (call) => call.event === 'driver:position',
      );
      const rooms = emits.map((call) => call.room).sort();
      expect(rooms).toEqual(['user:client-1', 'user:merchant-1']);
      expect(emits[0].payload).toEqual(
        expect.objectContaining({
          orderId: 'ord-1',
          livreurId: 'driver-1',
          lat: 6.13,
          lng: 1.22,
          at: 1234567890,
        }),
      );
    });
  });

  describe('handleDriverLocation', () => {
    function buildLivreurClientMock(sub: string) {
      return {
        data: { user: { sub, role: UserRole.LIVREUR } },
      } as any;
    }

    it('ignore silencieusement si le livreur n’a pas de course active (GPS strict §11.2)', async () => {
      const { server, emitCalls } = buildMockServer([]);
      gateway.server = server;
      const client = buildLivreurClientMock('driver-1');

      await gateway.handleDriverLocation(client, { lat: 6.13, lng: 1.22 });

      const positionEmits = emitCalls.filter(
        (c) => c.event === 'driver:position',
      );
      expect(positionEmits).toHaveLength(0);
      const driverPositions: Map<string, any> = (gateway as any)
        .driverPositions;
      expect(driverPositions.has('driver-1')).toBe(false);
    });

    it('forward la position au client ET au commerçant si course active avec les deux', async () => {
      const { server, emitCalls } = buildMockServer([]);
      gateway.server = server;
      const activeOrders: Map<string, any> = (gateway as any).activeOrders;
      activeOrders.set('driver-1', [
        {
          orderId: 'ord-1',
          clientId: 'client-1',
          merchantId: 'merchant-1',
        },
      ]);
      const client = buildLivreurClientMock('driver-1');

      await gateway.handleDriverLocation(client, { lat: 6.13, lng: 1.22 });

      const positionEmits = emitCalls.filter(
        (c) => c.event === 'driver:position',
      );
      const rooms = positionEmits.map((e) => e.room).sort();
      expect(rooms).toEqual(['user:client-1', 'user:merchant-1']);
    });

    it('persiste la position (via positionsService) uniquement quand une course est active', async () => {
      const { server } = buildMockServer([]);
      gateway.server = server;
      const positionsService = { upsertPosition: jest.fn() };
      (gateway as any).positionsService = positionsService;

      const activeOrders: Map<string, any> = (gateway as any).activeOrders;
      activeOrders.set('driver-1', [
        { orderId: 'ord-1', clientId: 'client-1' },
      ]);
      const client = buildLivreurClientMock('driver-1');

      await gateway.handleDriverLocation(client, { lat: 6.13, lng: 1.22 });

      expect(positionsService.upsertPosition).toHaveBeenCalledWith(
        'driver-1',
        6.13,
        1.22,
        'ord-1',
      );
    });

    it('ignore les coordonnées invalides même avec une course active', async () => {
      const { server, emitCalls } = buildMockServer([]);
      gateway.server = server;
      const activeOrders: Map<string, any> = (gateway as any).activeOrders;
      activeOrders.set('driver-1', [
        { orderId: 'ord-1', clientId: 'client-1' },
      ]);
      const client = buildLivreurClientMock('driver-1');

      await gateway.handleDriverLocation(client, {
        lat: 999,
        lng: 1.22,
      });

      const positionEmits = emitCalls.filter(
        (c) => c.event === 'driver:position',
      );
      expect(positionEmits).toHaveLength(0);
    });

    it('ignore si le user n’est pas un livreur', async () => {
      const { server, emitCalls } = buildMockServer([]);
      gateway.server = server;
      const activeOrders: Map<string, any> = (gateway as any).activeOrders;
      activeOrders.set('client-not-driver', [
        {
          orderId: 'ord-1',
          clientId: 'client-1',
        },
      ]);
      const client = {
        data: { user: { sub: 'client-not-driver', role: UserRole.CLIENT } },
      } as any;

      await gateway.handleDriverLocation(client, { lat: 6.13, lng: 1.22 });

      const positionEmits = emitCalls.filter(
        (c) => c.event === 'driver:position',
      );
      expect(positionEmits).toHaveLength(0);
    });

    it('rehydrate la course active depuis la DB après redémarrage puis forward la position', async () => {
      const { server, emitCalls } = buildMockServer([]);
      gateway.server = server;
      ordersRepository.find.mockResolvedValue([
        {
          id: 'ord-hydrated',
          client: { id: 'client-1' },
          merchant: { id: 'merchant-1' },
        },
      ]);
      const client = buildLivreurClientMock('driver-1');

      await gateway.handleDriverLocation(client, { lat: 6.13, lng: 1.22 });

      expect(ordersRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            livreur: { id: 'driver-1' },
          }),
        }),
      );
      const positionEmits = emitCalls.filter(
        (c) => c.event === 'driver:position',
      );
      const rooms = positionEmits.map((event) => event.room).sort();
      expect(rooms).toEqual(['user:client-1', 'user:merchant-1']);
      const activeOrders: Map<string, any> = (gateway as any).activeOrders;
      expect(activeOrders.get('driver-1')).toEqual([
        {
          orderId: 'ord-hydrated',
          clientId: 'client-1',
          merchantId: 'merchant-1',
        },
      ]);
    });

    it('forward la position à plusieurs commandes actives de la même tournée', async () => {
      const { server, emitCalls } = buildMockServer([]);
      gateway.server = server;
      const activeOrders: Map<string, any> = (gateway as any).activeOrders;
      activeOrders.set('driver-1', [
        { orderId: 'ord-1', clientId: 'client-1', merchantId: 'merchant-1' },
        { orderId: 'ord-2', clientId: 'client-2', merchantId: 'merchant-1' },
      ]);
      const client = buildLivreurClientMock('driver-1');

      await gateway.handleDriverLocation(client, { lat: 6.13, lng: 1.22 });

      const positionEmits = emitCalls.filter(
        (c) => c.event === 'driver:position',
      );
      expect(positionEmits).toHaveLength(4);
    });
  });

  describe('handleChatTyping', () => {
    function buildTypingClient(userId: string, role: UserRole) {
      const emits: Array<{ room: string; event: string; payload: any }> = [];
      const client: any = {
        data: { user: { sub: userId, role } },
        to(room: string) {
          return {
            emit(event: string, payload: any) {
              emits.push({ room, event, payload });
            },
          };
        },
      };
      return { client, emits };
    }

    it('n’émet pas si l’utilisateur n’est pas partie à la commande', async () => {
      const { client, emits } = buildTypingClient('intrus-1', UserRole.CLIENT);
      ordersRepository.findOne.mockResolvedValue({
        client: { id: 'client-1' },
        livreur: { id: 'driver-1' },
        merchant: { id: 'merchant-1' },
      });

      await gateway.handleChatTyping(client, {
        orderId: 'order-1',
        isTyping: true,
      });

      expect(emits).toEqual([]);
    });

    it('émet chat:typing pour une partie autorisée', async () => {
      const { client, emits } = buildTypingClient(
        'merchant-1',
        UserRole.COMMERCANT,
      );
      ordersRepository.findOne.mockResolvedValue({
        client: { id: 'client-1' },
        livreur: { id: 'driver-1' },
        merchant: { id: 'merchant-1' },
      });

      await gateway.handleChatTyping(client, {
        orderId: 'order-1',
        isTyping: true,
      });

      expect(emits).toEqual([
        {
          room: 'order:order-1:chat',
          event: 'chat:typing',
          payload: {
            orderId: 'order-1',
            userId: 'merchant-1',
            isTyping: true,
          },
        },
      ]);
    });
  });

  describe('handleChatJoin', () => {
    function buildClientMock(user: { sub: string; role?: string } | null) {
      const joinedRooms: string[] = [];
      const client: any = {
        data: user ? { user } : {},
        join: jest.fn((room: string) => joinedRooms.push(room)),
      };
      return { client, joinedRooms };
    }

    it('rejoint la room si le user est le client de la commande', async () => {
      const { client, joinedRooms } = buildClientMock({
        sub: 'client-1',
        role: UserRole.CLIENT,
      });
      ordersRepository.findOne.mockResolvedValue({
        client: { id: 'client-1' },
        livreur: { id: 'driver-1' },
      });

      await gateway.handleChatJoin(client, { orderId: 'order-1' });

      expect(joinedRooms).toEqual(['order:order-1:chat']);
    });

    it('rejoint la room si le user est le livreur de la commande', async () => {
      const { client, joinedRooms } = buildClientMock({
        sub: 'driver-1',
        role: UserRole.LIVREUR,
      });
      ordersRepository.findOne.mockResolvedValue({
        client: { id: 'client-1' },
        livreur: { id: 'driver-1' },
      });

      await gateway.handleChatJoin(client, { orderId: 'order-1' });

      expect(joinedRooms).toEqual(['order:order-1:chat']);
    });

    // ── P2 (CDC V1 §13.2) : commerçant dans le chat ───────────────────────

    it('rejoint la room si le user est le commerçant créateur de la commande', async () => {
      const { client, joinedRooms } = buildClientMock({
        sub: 'merchant-1',
        role: UserRole.COMMERCANT,
      });
      ordersRepository.findOne.mockResolvedValue({
        client: { id: 'client-1' },
        livreur: { id: 'driver-1' },
        merchant: { id: 'merchant-1' },
      });

      await gateway.handleChatJoin(client, { orderId: 'order-1' });

      expect(joinedRooms).toEqual(['order:order-1:chat']);
      expect(ordersRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: expect.arrayContaining(['merchant']),
        }),
      );
    });

    it("refuse un commerçant qui n'est pas le créateur de la commande", async () => {
      const { client, joinedRooms } = buildClientMock({
        sub: 'merchant-intrus',
        role: UserRole.COMMERCANT,
      });
      ordersRepository.findOne.mockResolvedValue({
        client: { id: 'client-1' },
        livreur: { id: 'driver-1' },
        merchant: { id: 'merchant-1' },
      });

      await gateway.handleChatJoin(client, { orderId: 'order-1' });

      expect(joinedRooms).toEqual([]);
    });

    it('rejoint la room si le user est ADMIN (sans requête DB)', async () => {
      const { client, joinedRooms } = buildClientMock({
        sub: 'admin-1',
        role: UserRole.ADMIN,
      });

      await gateway.handleChatJoin(client, { orderId: 'order-1' });

      expect(joinedRooms).toEqual(['order:order-1:chat']);
      expect(ordersRepository.findOne).not.toHaveBeenCalled();
    });

    it("refuse si le user n'est ni client ni livreur de la commande", async () => {
      const { client, joinedRooms } = buildClientMock({
        sub: 'intrus-1',
        role: UserRole.CLIENT,
      });
      ordersRepository.findOne.mockResolvedValue({
        client: { id: 'client-1' },
        livreur: { id: 'driver-1' },
      });

      await gateway.handleChatJoin(client, { orderId: 'order-1' });

      expect(joinedRooms).toEqual([]);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('refuse si la commande est introuvable', async () => {
      const { client, joinedRooms } = buildClientMock({
        sub: 'client-1',
        role: UserRole.CLIENT,
      });
      ordersRepository.findOne.mockResolvedValue(null);

      await gateway.handleChatJoin(client, { orderId: 'order-inexistante' });

      expect(joinedRooms).toEqual([]);
    });

    it('refuse silencieusement si aucun user authentifié', async () => {
      const { client, joinedRooms } = buildClientMock(null);

      await gateway.handleChatJoin(client, { orderId: 'order-1' });

      expect(joinedRooms).toEqual([]);
      expect(ordersRepository.findOne).not.toHaveBeenCalled();
    });

    it('ne fait rien si orderId manquant', async () => {
      const { client, joinedRooms } = buildClientMock({
        sub: 'client-1',
        role: UserRole.CLIENT,
      });

      await gateway.handleChatJoin(client, { orderId: '' as any });

      expect(joinedRooms).toEqual([]);
      expect(ordersRepository.findOne).not.toHaveBeenCalled();
    });
  });
});
