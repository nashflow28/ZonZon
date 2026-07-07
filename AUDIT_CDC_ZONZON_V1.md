# AUDIT — CDC Zonzon V1 vs existant

> Date : 2026-07-05 · Branche : `main` (à jour, jest backend 221/221).
> Méthode : comparaison du CDC fonctionnel V1 avec le code réellement présent (backend NestJS, mobile Flutter, admin Angular). Aucune modification faite pendant l'audit (conforme §25).

## Résumé global

Le socle Zonzon est **solide et déjà très avancé** sur le cœur métier : les Priorités 1, 2 et 3 du backlog précédent ont été livrées et mergées (validation/disponibilité livreurs, livraison commerçant→client, tarif configurable 200 FCFA/km, zones, statuts étendus, `paymentStatus`, attribution manuelle, livreurs affiliés, profil livreur complet). Ce CDC-ci est **plus détaillé** et fait apparaître de nouveaux écarts, surtout sur : **suspension des comptes**, **règle « une seule course active »**, **historisation** (statuts, prix, paiement), **signalements**, **modèle de conversation multi-participants**, et **gating strict du GPS**.

**Conformité estimée : ~68%** (cœur métier ~85%, sécurité/règles ~60%, historisation/traçabilité ~25%, signalement ~0%).

## Tableau de synthèse par domaine

| Domaine | État | Détail |
|---|---|---|
| Auth multi-rôles (JWT, 4 rôles) | ✅ FAIT | 4 rôles, guard global, `@Public`, throttling |
| Validation admin livreurs (PENDING/APPROVED/REJECTED) | ✅ FAIT | P1 livrée |
| **Suspension de compte (SUSPENDED) + blocage** | ❌ MANQUANT | Aucun champ `status` sur `User`. P0 |
| Disponibilité livreur | ✅ FAIT | `isAvailable`, blocage voir/accepter |
| **Règle « une seule course active »** | ⚠️ À CORRIGER | `acceptOrder` ne vérifie pas les courses actives du livreur. P0 |
| Blocage livreur non validé/indisponible | ✅ FAIT | `findAvailable` + `acceptOrder` |
| Double-acceptation impossible | ✅ FAIT | UPDATE atomique |
| Livraison client→livreur (Type 2) | ✅ FAIT | |
| Livraison commerçant→client (Type 1) | ✅ FAIT | `POST /orders/merchant`, client compte/téléphone |
| Attribution manuelle (preferredLivreur) | ✅ FAIT | + `GET /orders/available-drivers`, `assign` |
| Livreurs affiliés (MerchantDriver) | 🟡 PARTIEL | M:N OK, mais pas de `isPublic`/statut d'affiliation (PENDING/ACTIVE/REJECTED/REMOVED) |
| Tarif configurable 200/km + prix manuel | 🟡 PARTIEL | `PricingConfig` OK, prix manuel commerçant OK, mais **pas de traçabilité** (ancien/nouveau/par qui/raison) ni `estimatedPrice` vs `finalPrice` distincts |
| Statuts de livraison | 🟡 PARTIEL | 9 statuts (EN_ROUTE_PICKUP/AT_PICKUP/NEAR_CLIENT/FAILED) ; noms ≠ CDC (CREATED/PENDING_DRIVER/DRIVER_ASSIGNED/…). Sémantiquement proche, **pas de DRIVER_ASSIGNED distinct** |
| **Historique des statuts (DeliveryStatusHistory)** | ❌ MANQUANT | Seuls des timestamps ponctuels. P1 |
| paymentStatus | 🟡 PARTIEL | Enum + `PATCH /orders/:id/payment-status` OK. Valeur `RECEIVED_BY_LIVREUR` (CDC: `RECEIVED_BY_DRIVER`), pas de `REFUNDED`. **Pas d'historique de paiement** |
| Zones de Lomé | 🟡 PARTIEL | Entité `Zone` + CRUD + seed 16 quartiers. **Manque** : `description`, `basePrice`, `pricePerKmOverride`, et **liaison zone↔livraison** (pickupZoneId/destinationZoneId). Le CDC liste 22 quartiers (6 de plus) |
| Zone habituelle livreur | ✅ FAIT | `Vehicle.usualZone` |
| Tracking GPS temps réel | 🟡 PARTIEL / ⚠️ | Émission/persistance/forward client OK. **À corriger** : position acceptée même sans course active ; **commerçant ne reçoit pas** le GPS de ses livraisons ; pas de room GPS par livraison avec autorisation stricte |
| Messagerie par livraison | 🟡 PARTIEL | Chat client↔livreur (room `order:<id>:chat` + authz appartenance déjà ajoutée). **Manque** : modèle `Conversation`/`ConversationParticipants`, inclusion optionnelle du commerçant, accès admin litige |
| Notifications FCM | 🟡 PARTIEL | Push sur la plupart des transitions. **Manque** : table `Notifications` persistée, notifs sur validation/refus livreur et paiement reçu |
| **Signalement (reports utilisateur/livraison)** | ❌ MANQUANT | Le module `reports` = **commissions**, pas de signalement. P2 |
| Historique client / livreur | ✅ FAIT | `GET /orders/mine` |
| Historique commerçant | 🟡 PARTIEL | `findForUser` COMMERCANT OK côté backend ; UI/stats commerçant minimales |
| Dashboard admin (users, validation, zones, tarifs, archives, audit) | ✅ FAIT | + écrans P3 |
| **Admin : suspension/réactivation compte** | ❌ MANQUANT | Dépend du champ `status` (P0) |
| **Admin : gestion des signalements** | ❌ MANQUANT | P2 |
| Audit log admin (actions sensibles) | ✅ FAIT | `admin_audit_logs` |
| Séparation entités Client/Merchant/Driver | 🟢 BONUS/écart | Modèle **consolidé** `User`+`role`+`Vehicle` (choix assumé, non bloquant — ne pas reconstruire) |

## Détail des écarts prioritaires (format §19.1)

### P0-1 — Suspension de compte
- **État** : MANQUANT
- **Preuves** : `backend/src/entities/user.entity.ts` (aucun champ `status`) ; seul `driverApprovalStatus` existe (spécifique livreur).
- **Écart CDC** : §2.4, §8.3 (SUSPENDED), §17.2, §17.3 — l'admin doit suspendre/réactiver ; un compte suspendu ne peut ni accepter (livreur), ni créer une livraison (client/commerçant).
- **Risque** : impossible d'exclure un acteur malveillant → risque opérationnel et sécurité.
- **Travail** : `User.status` (`ACTIVE`/`SUSPENDED`) + endpoints admin `PATCH /users/:id/suspend|reactivate` + audit + blocage dans `createOrder`, `createMerchantOrder`, `acceptOrder`, et idéalement à l'authentification. UI admin.
- **Priorité** : **P0**.

### P0-2 — Une seule course active par livreur
- **État** : À CORRIGER
- **Preuves** : `backend/src/orders/orders.service.ts` `acceptOrder` (l.800+) vérifie APPROVED + `isAvailable` + `preferredLivreur`, mais **pas** l'existence d'une course déjà active pour ce livreur.
- **Écart CDC** : §2.3, §8.4, §10.3 — un livreur avec une course active ne doit pas pouvoir en accepter une autre.
- **Risque** : un livreur peut accaparer plusieurs courses simultanées.
- **Travail** : avant l'UPDATE atomique, vérifier qu'aucune course du livreur n'est dans un statut actif (ACCEPTED…NEAR_CLIENT) → `ConflictException`. Décider si l'acceptation bascule aussi `isAvailable=false` (recommandé).
- **Priorité** : **P0**.

### P1-1 — Historique des statuts (DeliveryStatusHistory)
- **État** : MANQUANT · **Preuves** : `delivery-order.entity.ts` a `acceptedAt/inProgressAt/completedAt` mais pas de journal. **CDC** §4, §18.7, §23. **Travail** : entité `DeliveryStatusHistory(deliveryId, oldStatus, newStatus, changedBy, reason, createdAt)` + log dans `updateStatus`/`acceptOrder`/`assign`. **P1**.

### P1-2 — Traçabilité du prix
- **État** : PARTIEL/À CORRIGER · **CDC** §6.3. Distinguer `estimatedPrice` / `finalPrice` + `priceWasManuallyAdjusted` + journal (ancien, nouveau, par qui, date, raison). Aujourd'hui un seul champ `priceFcfa`. **P1**.

### P1-3 — Historique de paiement
- **État** : MANQUANT · **CDC** §5.2, §18.13. Journaliser chaque changement de `paymentStatus` (par qui, quand). Aligner l'enum (`RECEIVED_BY_DRIVER`, ajouter `CASH_ON_DELIVERY`/`REFUNDED` optionnels). **P1**.

### P2-1 — Signalements · MANQUANT · **CDC** §17.1, §18.x. Entité `Report` + endpoints (signaler livraison/user) + écran admin. **P2**.
### P2-2 — Conversation multi-participants · PARTIEL · **CDC** §13. Modèle `Conversation`/`Participants`, inclusion commerçant, accès admin. **P2**.
### P2-3 — GPS strict + commerçant · À CORRIGER · **CDC** §11.2. Refuser position hors course active ; diffuser au commerçant de la livraison. **P2**.
### P2-4 — Zones enrichies + liaison livraison · PARTIEL · **CDC** §7. `basePrice`/`pricePerKmOverride`/`description`, `pickupZoneId`/`destinationZoneId`, +6 quartiers. **P2**.
### P2-5 — Notifications persistées · PARTIEL · **CDC** §18.12. Table `Notifications`. **P2**.

## Backlog priorisé

- **P0 (sécurité/règles — ce round)** : suspension de compte + blocage ; règle une-seule-course-active ; durcissement permissions ; tests associés.
- **P1 (traçabilité — round suivant)** : DeliveryStatusHistory ; estimatedPrice/finalPrice + journal ; historique paiement.
- **P2** : signalements ; conversation multi-participants + commerçant ; GPS strict + commerçant ; zones enrichies ; notifications persistées ; stats commerçant.
- **P3 (après V1)** : Mobile Money, preuve photo, QR, attribution auto avancée, PWA.

## Ordre d'implémentation recommandé (round en cours)

1. **Backend P0** : `User.status`, endpoints suspend/reactivate + audit, blocages (create/accept/auth), règle course-active dans `acceptOrder`, tests unitaires. *(Agent backend)*
2. **Tests** : suite e2e/permissions sur le comportement déjà mergé (validation, disponibilité, double-accept, propriété des ressources) + `TEST_PLAN_ZONZON_V1.md`. *(Agent tests, `backend/test/`)*
3. **Admin** : gestion des livraisons — édition du statut de paiement, réassignation livreur, affichage des statuts étendus (endpoints déjà mergés). *(Agent admin)*

> Round suivant : P1 (historisation statuts/prix/paiement) puis P2. Les livrables `TODO_ZONZON_V1.md` / `IMPLEMENTATION_PLAN_ZONZON_V1.md` du CDC sont fusionnés dans les sections « Backlog priorisé » et « Ordre d'implémentation » ci-dessus ; `TEST_PLAN_ZONZON_V1.md` est produit par l'agent de tests.
