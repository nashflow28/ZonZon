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
      return {
        emit(event: string, payload: any) {
          emitCalls.push({ room, event, payload });
        },
      };
    },
    emit(event: string, payload: any) {
      emitCalls.push({ room: '__broadcast__', event, payload });
    },
  };

  return { server, emitCalls };
}

describe('OrdersGateway', () => {
  let jwtService: { verify: jest.Mock; sign: jest.Mock };
  let ordersRepository: { findOne: jest.Mock };
  let gateway: OrdersGateway;

  beforeEach(() => {
    jwtService = { verify: jest.fn(), sign: jest.fn() };
    ordersRepository = { findOne: jest.fn() };
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
      expect(rooms).toEqual(['user:driver-eligible-1', 'user:driver-eligible-2']);
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
