import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
} from 'typeorm';
import { User } from './user.entity';
import { Zone } from './zone.entity';
import { DeliveryRun } from './delivery-run.entity';

export enum OrderStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  /** Livreur en route vers le point de retrait (nouveau — granularité cahier des charges). */
  EN_ROUTE_PICKUP = 'EN_ROUTE_PICKUP',
  /** Livreur arrivé au point de retrait (nouveau). */
  AT_PICKUP = 'AT_PICKUP',
  // IN_PROGRESS conserve sa sémantique historique : « colis récupéré / en
  // route vers le client ». Ne pas créer de statut « colis récupéré »
  // séparé pour ne pas casser le géofencing mobile actuel
  // (ACCEPTED → IN_PROGRESS → COMPLETED).
  IN_PROGRESS = 'IN_PROGRESS',
  /** Livreur proche du client, en phase finale de livraison (nouveau). */
  NEAR_CLIENT = 'NEAR_CLIENT',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  /** Livraison échouée (terminal, nouveau). */
  FAILED = 'FAILED',
}

export enum PaymentStatus {
  UNPAID = 'UNPAID',
  PAID = 'PAID',
  PAY_ON_DELIVERY = 'PAY_ON_DELIVERY',
  RECEIVED_BY_MERCHANT = 'RECEIVED_BY_MERCHANT',
  RECEIVED_BY_LIVREUR = 'RECEIVED_BY_LIVREUR',
  /** Paiement cash confirmé à la livraison (nouveau — CDC V1 §5.2/§18.13). */
  CASH_ON_DELIVERY = 'CASH_ON_DELIVERY',
  /** Paiement remboursé (nouveau — CDC V1 §5.2/§18.13). */
  REFUNDED = 'REFUNDED',
}

@Entity('delivery_orders')
export class DeliveryOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.clientOrders, { nullable: true })
  client: User | null;

  @ManyToOne(() => User, (user) => user.livreurOrders, { nullable: true })
  livreur: User;

  /**
   * Commerçant créateur de la livraison (Type 1 : commerçant → client).
   * `null` pour les livraisons Type 2 créées directement par le client.
   */
  @ManyToOne(() => User, { nullable: true })
  merchant: User | null;

  /**
   * Livreur choisi manuellement à la création (réservation) — Priorité 3,
   * Lot 3, item 1. `null` = comportement par défaut (broadcast à tous les
   * livreurs éligibles, acceptation par le premier). Quand renseigné, seul
   * ce livreur peut voir/accepter la course (cf. `findAvailable`,
   * `acceptOrder` dans `OrdersService`).
   */
  @ManyToOne(() => User, { nullable: true })
  preferredLivreur: User | null;

  /** Optional merchant delivery batch; orders keep independent statuses. */
  @ManyToOne(() => DeliveryRun, (run) => run.orders, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  run: DeliveryRun | null;

  /**
   * Zone de retrait (référentiel `zones`, CDC V1 §7) — renseignée
   * optionnellement par le client/commerçant à la création. PAS de
   * dérivation automatique depuis les coordonnées GPS en V1.
   */
  @ManyToOne(() => Zone, { nullable: true, onDelete: 'SET NULL' })
  pickupZone: Zone | null;

  /**
   * Zone de destination (référentiel `zones`, CDC V1 §7) — mêmes règles que
   * `pickupZone`.
   */
  @ManyToOne(() => Zone, { nullable: true, onDelete: 'SET NULL' })
  destinationZone: Zone | null;

  /**
   * Numéro de téléphone du destinataire quand la livraison est créée par un
   * commerçant pour un client SANS compte ZonZon. Renseigné également (pour
   * cohérence d'affichage) quand un compte client existe.
   */
  @Column({ type: 'varchar', length: 32, nullable: true })
  clientPhone: string | null;

  /**
   * Nom du destinataire sans compte (saisi par le commerçant). Renseigné
   * aussi depuis le compte quand le client a un compte existant.
   */
  @Column({ type: 'varchar', length: 120, nullable: true })
  clientName: string | null;

  @Column('text')
  pickupAddress: string;

  @Column('float', { nullable: true })
  pickupLat: number;

  @Column('float', { nullable: true })
  pickupLng: number;

  @Column('text')
  deliveryAddress: string;

  @Column('float', { nullable: true })
  deliveryLat: number;

  @Column('float', { nullable: true })
  deliveryLng: number;

  @Column('text')
  description: string;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  distanceKm: number;

  @Column({ type: 'int', nullable: true })
  priceFcfa: number;

  /**
   * Prix calculé automatiquement (distance × tarif/km), avant tout
   * ajustement manuel (CDC V1 §6.3 — traçabilité du prix). `priceFcfa`
   * reste le prix effectif/final utilisé partout ailleurs (mobile/admin) ;
   * ce champ ne sert qu'à comparer/tracer.
   */
  @Column({ type: 'int', nullable: true })
  estimatedPrice: number | null;

  /** `true` si `priceFcfa` a été ajusté manuellement (commerçant ou admin). */
  @Column({ type: 'boolean', default: false })
  priceWasManuallyAdjusted: boolean;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.UNPAID,
  })
  paymentStatus: PaymentStatus;

  @Column({ type: 'text', nullable: true })
  cancellationReason: string | null;

  @Column({
    type: 'enum',
    enum: ['CLIENT', 'LIVREUR', 'ADMIN', 'COMMERCANT'],
    nullable: true,
  })
  cancelledBy: 'CLIENT' | 'LIVREUR' | 'ADMIN' | 'COMMERCANT' | null;

  @Column({ type: 'datetime', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  inProgressAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
