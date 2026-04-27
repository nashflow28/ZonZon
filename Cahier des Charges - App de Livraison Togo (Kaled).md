# **Cahier des Charges Fonctionnel : Application de Gestion de Livraisons (Togo)**

## **1\. Présentation du Projet**

L'objectif est de déployer une solution mobile et web de livraison, initialement conçue pour un milieu universitaire, à l'ensemble du territoire national \[cite: 1, 6, 7\]. L'application vise à mettre en relation des clients et des coursiers indépendants pour le transport de marchandises diverses.

## **2\. Profils Utilisateurs**

| Rôle | Description & Prérequis |
| :---- | :---- |
| **Livreur (Coursier)** | Doit s'enregistrer avec : Nom, Prénoms, Numéro de téléphone, Type d'engin et Photo de profil \[cite: 8, 11\]. |
| **Client (Acheteur)** | Utilisateur final passant commande via géolocalisation et description d'articles \[cite: 13, 14\]. |
| **Administrateur** | Gestion des comptes, suivi des archives et collecte des commissions hebdomadaires \[cite: 55, 57\]. |

## **3\. Fonctionnalités Principales**

### **3.1. Système de Commande et Livraison**

* **Double Géolocalisation :** Le client doit renseigner précisément le point d'achat (source) et le point de livraison (destination) \[cite: 13, 14\].  
* **Description de l'Article :** Champ de texte libre pour spécifier le contenu du colis (ex: "1 sac de riz", "articles divers") afin d'informer le livreur \[cite: 14, 15\].  
* **Acceptation de Course :** Notification push envoyée aux coursiers à proximité ; le premier à accepter prend en charge la livraison \[cite: 14\].

### **3.2. Communication & Intégration**

* **Lien WhatsApp Direct :** Intégration d'un bouton de chat WhatsApp automatique permettant au livreur et au client de communiquer instantanément dès que la commande est validée \[cite: 20, 33, 34\].

## **4\. Modèle Économique et Paiement**

L'application repose sur un modèle de tarification à la distance et un système de commissionnement différé :

* **Grille Tarifaire :** 150 FCFA par kilomètre parcouru (ex: 300 FCFA pour 2 km) \[cite: 53, 54\].  
* **Mode de Paiement :** Les transactions se font exclusivement en **espèces** directement entre le client et le livreur à la fin de la course \[cite: 54, 55\].  
* **Gestion des Commissions :** Les livreurs reversent entre **35 % et 40 %** de leurs bénéfices hebdomadaires à la plateforme, sur la base des archives de courses enregistrées \[cite: 55, 57, 58, 59\].

## **5\. Spécifications Techniques Suggestion**

Au vu de votre profil de développeur, la pile technologique suivante est recommandée :

* **Application Mobile :** Flutter (pour une base de code unique iOS/Android).  
* **Dashboard Admin :** Angular 21 (migration de vos projets actuels).  
* **Backend :** Node.js ou Kotlin avec intégration de l'API Google Maps pour le calcul des distances.

## **6\. Archives et Suivi**

L'application doit maintenir un historique rigoureux pour chaque livreur afin de faciliter le calcul des commissions en fin de semaine \[cite: 57, 60\].

### **Références**

1\. \[Audio WhatsApp \- Expansion et Profils\](WhatsApp-Ptt-2026-04-20-at-10.26.35.mp3)