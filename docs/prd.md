---
title: Product Requirements Document
update: 2026-11-13
---


## Pitch

**Votre communauté vous dit déjà ce qu'elle veut acheter : nous transformons ses commentaires et ses DMs en ventes.** Notre outil détecte les intentions d'achat, classe vos posts par potentiel de conversion, puis relance chaque prospect en DM et booste vos meilleurs posts.

*Nom de travail : Social Intent Converter. À remplacer avant la démo.*

## Problem Statement

**Les fondateurs reçoivent des centaines de signaux d'achat sur les réseaux sociaux. Ils en convertissent très peu.**

**Qui a ce problème ?** Les SaaS builders et les e-commerçants qui vendent via leur audience. Ils publient souvent sur Instagram, LinkedIn, X ou TikTok. Ils gèrent seuls ou en petite équipe.

**Quel est le problème ?**

- **Signaux perdus.** Un commentaire comme « c'est combien ? » ou « ça marche avec Shopify ? » reste souvent sans réponse. Le prospect part.
- **Mauvaise métrique.** Les likes et les vues ne montrent pas quel post vend. Un post viral peut générer zéro intention d'achat.
- **Insights dispersés.** Les besoins, les objections et les demandes de features sont éparpillés dans des milliers de messages. Personne ne les lit tous.
- **Pub à l'aveugle.** Le fondateur booste un post au hasard. Il ne sait pas quel post génère des intentions d'achat.

**Pourquoi c'est important ?** Une intention d'achat non traitée dans l'heure perd vite sa valeur. Le fondateur paie pour acquérir une audience. Il ne récupère pas la valeur de cette audience.

## Goals & Success Metrics

**Objectif du hackathon : montrer une boucle complète en démo live. Commentaire détecté, DM envoyé, post classé, post boosté.**

### Objectifs produit

1. Identifier les posts qui génèrent le plus d'intentions d'achat.
2. Extraire les besoins, les objections et les demandes de features de la communauté.
3. Convertir les commentaires à forte intention en visites sur la landing page.
4. Booster les posts qui génèrent le plus d'intentions d'achat.

### KPIs

| KPI | Définition | Cible démo |
| --- | --- | --- |
| Purchase Intent Rate | Commentaires et DMs « intention d'achat » ÷ total des commentaires du post | Calculé pour 100 % des posts importés |
| Précision de la classification | Labels corrects sur un échantillon vérifié à la main | ≥ 80 % sur 50 commentaires |
| Temps de réponse DM | Délai entre le commentaire et le DM automatique | < 60 s |
| Taux de clic DM | Clics sur le lien tracké ÷ DMs envoyés | Lien tracké fonctionnel en démo |
| Revenu attribué (post-hackathon) | Ventes issues des liens trackés, par post | Hors périmètre démo |

### Garde-fous

- Un seul DM automatique par personne et par post.
- Aucun DM aux commentaires classés « négatif » ou « spam » sans validation humaine.
- Aucune campagne publicitaire lancée sans clic de confirmation et budget plafonné.
- Aucun DM automatique vers un produit non identifié : l'utilisateur choisit le produit et valide le DM.
- L'agent conversationnel envoie au plus 3 réponses automatiques par conversation, puis passe la main à un humain.
- L'agent s'arrête dès que le prospect demande d'arrêter (« stop ») et ne lui écrit plus.

## Target Audience & Use Cases

**Cible principale : le fondateur qui vend grâce à son contenu et qui n'a pas d'équipe marketing.**

### Personas

| Persona | Profil | Besoin principal |
| --- | --- | --- |
| Léa, SaaS builder | Solo founder, build in public sur LinkedIn et X, 5 000 à 30 000 abonnés | Savoir quelles features demander et quels posts amener des trials |
| Karim, e-commerçant | Marque DTC sur Instagram et TikTok, 10 000 à 100 000 abonnés | Répondre vite aux questions prix, taille, livraison et convertir en panier |
| Agence social media (secondaire) | Gère 5 à 20 comptes clients | Prouver le ROI des posts organiques et des boosts |

### Parcours utilisateur clés (CUJs)

0. **Décrire son catalogue.** Karim ouvre la page « Mes produits ». Il ajoute ses 3 produits : le hoodie noir, le hoodie vert sauge en précommande et le hoodie zippé. Pour chacun, il donne un titre, le lien de la page produit et une description.
1. **Connecter et analyser.** Léa connecte son compte via Zernio. Le système importe ses 30 derniers posts, leurs commentaires et ses DMs. Il classe chaque message.
2. **Trouver le post qui vend.** Léa ouvre le dashboard. Elle voit ses posts triés par Purchase Intent Rate. Elle découvre qu'un tutoriel vend mieux qu'un post viral.
3. **Comprendre sa communauté.** Léa ouvre l'onglet Insights. Elle lit les 5 objections et les 5 features les plus demandées, avec des citations réelles.
4. **Convertir en DM.** Karim active l'auto-DM sur un post. Un abonné commente « dispo en M ? ». Il reçoit en moins d'une minute un DM personnalisé avec un lien vers la page du bon produit. Un autre abonné commente « vous l'avez en zippé ? » sous le même post : son DM renvoie vers le hoodie zippé.
5. **Booster le meilleur post.** Karim clique sur « Booster ». Il choisit un budget. Le système crée la campagne via Zernio.
6. **Suivre les conversations de l'agent.** Le prospect répond au DM : « je fais 1m80, quelle taille ? ». L'agent lui répond. Karim ouvre la liste des conversations, lit le fil complet et voit celles qui demandent son intervention. Il reprend la main sur une conversation quand il le souhaite.

## Functional & Non-Functional Requirements

**P0 = obligatoire pour la démo. P1 = si le temps le permet. P2 = roadmap post-hackathon.**

### Taxonomie des intentions

Le classifieur attribue à chaque message une intention, un sentiment (positif, neutre, négatif) et un score de confiance de 0 à 1.

| Intention | Exemple | Action par défaut |
| --- | --- | --- |
| Intention d'achat forte | « Je prends, où je commande ? » | DM avec lien direct |
| Question pré-achat | « C'est combien ? », « Compatible Shopify ? » | DM avec réponse + lien |
| Objection | « Trop cher », « Pas confiance » | DM qui traite l'objection |
| Demande de feature | « Il manque l'export CSV » | Insight produit, pas de DM |
| Témoignage / éloge | « Je l'utilise depuis 3 mois, top » | Insight marketing (preuve sociale) |
| Support / plainte | « Ma commande n'est pas arrivée » | Alerte, validation humaine |
| Neutre / spam | « 🔥 », liens de spam | Ignoré |

### Exigences fonctionnelles

| ID | Module | Exigence | Priorité |
| --- | --- | --- | --- |
| F1 | Ingestion | Connecter un compte social via Zernio et importer les posts, commentaires et DMs | P0 |
| F2 | Ingestion | Recevoir les nouveaux commentaires et DMs en temps réel via les webhooks Zernio | P0 |
| F3 | Analyse | Classer chaque message par intention, sentiment et confiance avec un LLM | P0 |
| F4 | Analyse | Calculer le Purchase Intent Rate et un Intent Score pondéré par post | P0 |
| F5 | Dashboard | Afficher les posts triés du meilleur au moins bon Intent Score. Afficher à côté des KPIs maison les métriques de la plateforme : vues, commentaires, likes, partages et reposts | P0 |
| F6 | Dashboard | Afficher le détail d'un post : répartition des intentions, commentaires clés et métriques de la plateforme (vues, commentaires, likes, partages, reposts) | P0 |
| F7 | Auto-DM | Envoyer un DM personnalisé aux auteurs de commentaires « achat », « question » ou « objection » | P0 |
| F7 bis | Catalogue | L'utilisateur gère un catalogue de plusieurs produits ou landing pages, sur une page qui les liste. Pour chacun : un titre, un lien de redirection, une description et un profil. **SaaS builder** : lien vers la landing page et description libre de ce que propose le SaaS (problème résolu, fonctionnalités, intégrations, prix, essai gratuit). **E-commerçant** : lien vers la page produit et description des faits (prix, tailles, livraison, retours, paiement, garanties). Le lien et la description sont obligatoires. Il faut au moins un produit actif pour activer les DMs automatiques. Un produit retiré est désactivé, pas supprimé. Le LLM adapte le ton au profil et utilise seulement la description pour répondre, sans inventer d'information | P0 |
| F7 ter | Analyse | Identifier le produit du catalogue auquel chaque commentaire ou DM réagit, à partir de la légende du post, du texte du message et du catalogue. Le DM propose ce produit et renvoie vers son lien. L'utilisateur peut forcer un produit pour tous les DMs d'un post. Si le produit n'est pas identifié, le DM attend que l'utilisateur choisisse le produit et le valide | P0 |
| F8 | Auto-DM | Ajouter au DM un lien court tracké, un par commentaire (`/r/{code}`). L'API FastAPI compte le clic, puis redirige (302) vers la page du produit identifié (F7 ter) avec les paramètres UTM (`utm_source` = réseau, `utm_medium=dm`, `utm_campaign=auto_dm`, `utm_content` = post, `utm_term` = intention). Les visites des robots d'aperçu (Instagram, Messenger) ne comptent pas comme des clics. Aucune IP ni aucun user agent n'est stocké. L'API calcule le taux de clic DM (liens cliqués ÷ DMs envoyés), au total, par post et par produit. Si l'API n'a pas d'URL publique (`TRACKING_BASE_URL`), le DM contient directement l'URL avec les UTM, sans comptage des clics | P0 |
| F9 | Ads | Bouton « Booster » : booster un post Instagram publié via `POST /v1/ads/boost` (le post garde ses likes et ses commentaires). Prérequis Meta : un compte publicitaire Meta et une Page Facebook liée au compte Instagram. Garde-fous : clic de confirmation, budget total plafonné, campagne créée en pause par défaut. Le compte de démo reçoit une campagne simulée en `pending_review` | P0 |
| F12 | Insights | Regrouper les commentaires et DMs classés en thèmes, par catégorie : objections, demandes de features, besoins (questions pré-achat) et éloges. Chaque thème a un titre, une phrase qui décrit l'insight, un nombre de mentions, jusqu'à 3 citations courtes (sans nom d'utilisateur) et la liste de tous les commentaires et DMs du thème. L'analyse peut porter sur un compte, un post ou un produit. Le LLM regroupe les messages ; un regroupement par mots-clés sert de secours | P1 |
| F13 | Auto-DM | Agent conversationnel : quand le prospect répond au DM automatique, l'agent lui répond avec les faits du produit (ou d'un autre produit du catalogue s'il en parle). Garde-fous : au plus 3 réponses automatiques, passage à un humain en cas de plainte, de message négatif, de demande d'un humain, de négociation ou d'échec du LLM, arrêt définitif sur « stop ». L'utilisateur voit la liste des conversations de l'agent (statut, produit, dernier message, conversations à reprendre) et le fil complet de chacune. Il peut reprendre la main ou la rendre à l'agent | P1 |
| F14 | Insights | Générer 3 idées de posts à partir des thèmes détectés (F12), du catalogue et des posts qui vendent le mieux. Chaque idée répond à un thème différent, de préférence une objection ou un besoin. Elle donne un titre, un format (reel, carrousel, image, story), une accroche, un plan en 3 à 5 étapes, une légende avec des faits du produit, un appel à l'action, le produit mis en avant et la raison (l'insight et son nombre de mentions). Si le compte n'a pas encore d'insights, l'analyse F12 tourne d'abord | P1 |
| F16 | Auto-DM | Après chaque DM envoyé, répondre publiquement sous le commentaire (ex. « Bonne question ! Je t'ai envoyé les infos sur la taille M en DM »). Le LLM écrit une réponse sur mesure : même langue que le commentaire, sujet de la demande nommé, sans prix, sans lien et sans détail inventé. Aucun texte écrit en dur : si le LLM ne donne pas de texte sûr, aucune réponse n'est publiée. Option par post (activée par défaut), envoi manuel ou nouvel essai possible | P1 |
| F17 | Pilotage | Mode validation : l'utilisateur approuve les DMs avant envoi | P1 |

### Exigences non fonctionnelles

- **Performance.** Le système classe un commentaire en moins de 5 s. Il envoie le DM en moins de 60 s après le webhook.
- **Fiabilité.** Une file d'attente absorbe les pics de commentaires. Chaque envoi utilise une clé d'idempotence pour éviter les doublons.
- **Sécurité.** Les clés API restent dans les secrets Cloudflare. Le Worker vérifie la signature de chaque webhook.
- **Confidentialité.** Le système stocke uniquement les données nécessaires. Il respecte le RGPD et les règles des plateformes sur les DMs.
- **Coût.** Le classifieur utilise un petit modèle. Seuls les cas ambigus passent par un modèle plus gros.
- **Démo.** Un mode « données de démo » charge un jeu de commentaires réalistes si l'API ou un compte échoue.

### Architecture cible

| Brique | Service | Rôle |
| --- | --- | --- |
| Ingestion | Zernio Inbox API + webhooks | Posts, commentaires, DMs |
| API et webhooks | Cloudflare Workers | Point d'entrée, routage, liens trackés |
| Traitement asynchrone | Cloudflare Queues | Classification en tâche de fond |
| Classification et génération | Workers AI (LLM) via AI Gateway | Intention, sentiment, textes de DM |
| Clustering des insights | Workers AI (LLM) | Regrouper les messages similaires en thèmes nommés |
| Base de données | D1 | Posts, messages, scores, conversations |
| État des conversations | Durable Objects ou Agents SDK | Mémoire du workflow DM par prospect |
| Anti-doublon | KV | Un DM par personne et par post |
| Front-end | Cloudflare Pages | Dashboard |
| Envoi et publicité | Zernio Inbox API + Ads API | DMs, réponses, boost |

## Assumptions, Constraints & Dependencies

**Contrainte principale : 5 heures de build. La démo doit fonctionner de bout en bout sur un seul réseau social.**

### Hypothèses

- Les commentaires contiennent assez de signaux pour détecter une intention d'achat avec un LLM.
- Le Purchase Intent Rate prédit mieux les ventes que le taux d'engagement.
- Un DM rapide et personnalisé convertit mieux qu'une réponse publique générique.
- Instagram est le meilleur réseau pour la démo : il couvre commentaires, DMs et Meta Ads.

### Contraintes

- **Temps.** 5 h. Le périmètre P0 doit tenir en 3 h 30 pour garder du temps pour la démo.
- **Stack imposée.** Usage maximal de l'API Zernio et de Cloudflare.
- **Plateformes.** Les règles de messagerie varient selon le réseau. Sur Instagram, Meta limite les réponses privées aux commentaires et impose une fenêtre de messagerie. Pinterest n'expose ni DMs ni commentaires.
- **Ads.** Un boost réel demande un compte publicitaire connecté et du budget. Les campagnes passent en revue chez la plateforme.

### Dépendances

| Dépendance | Usage | Action avant le build |
| --- | --- | --- |
| Clé API Zernio | Toutes les requêtes | Créer la clé, tester un appel |
| Compte Instagram Business connecté | Commentaires, DMs, posts | Connecter via OAuth Zernio |
| Compte Meta Ads connecté | Boost (compte publicitaire Meta + Page Facebook liée) | Vérifier l'accès et fixer un budget minimal |
| Compte Cloudflare | Workers, D1, Queues, Workers AI, Vectorize, Pages | Créer le projet et les bindings |
| Jeu de données de démo | Plan B si l'API échoue | Préparer 100 à 200 commentaires réalistes |
| Landing page cible | Destination des DMs | Choisir une page existante |

## Open Questions & Risks

**Risque principal : la démo dépend d'APIs tierces en live. Prévoir un plan B pour chaque appel.**

### Questions ouvertes

- [x] Quel réseau pour la démo : Instagram seul pour l'instant.
- [ ] Quel compte réel utiliser ? A-t-il assez de commentaires récents ?
- [ ] Quelle formule pour l'Intent Score ? Proposition : (achat × 3 + question × 2 + objection × 1) ÷ total des commentaires.
- [ ] Quel modèle Workers AI pour la classification ? Faut-il un modèle plus gros pour les cas ambigus ?
- [x] Le bouton « Booster » lance-t-il une vraie campagne en démo, ou une campagne en pause ? Campagne créée en pause par défaut ; campagne simulée pour le compte de démo.
- [ ] Comment se différencier de l'automatisation comment-to-DM native de Zernio ? Proposition : le routage par intention et les insights.
- [ ] Quel nom de produit ?

### Risques

| Risque | Impact | Mitigation |
| --- | --- | --- |
| Règles Meta sur les DMs (réponse privée unique, fenêtre de messagerie) | DMs refusés ou compte limité | Un DM par commentaire, mode validation, gérer l'erreur 422 |
| Classification imprécise (ironie, emojis, langues mixtes) | Mauvais classement des posts | Few-shot prompt, score de confiance, seuil de validation humaine |
| Pas assez de données réelles | Dashboard vide en démo | Jeu de données de démo préchargé |
| Campagne pub en revue ou refusée | Bouton « Booster » sans résultat visible | Montrer le statut `pending_review` comme succès |
| Webhooks lents ou absents | Auto-DM non déclenché en live | Bouton « Sync » manuel qui interroge l'Inbox API |
| Périmètre trop large | Rien ne marche à H+5 | Geler le périmètre P0 à H+0:30 |
| DMs perçus comme du spam | Image de marque dégradée | Messages courts, personnalisés, opt-out clair |

## Plan de build 5 h

**Le P0 se termine à H+3:30. La dernière heure sert au polish et à la répétition de la démo.**

1. **H+0:00 → H+0:30 — Cadrage.** Geler le périmètre P0. Connecter Zernio et Cloudflare. Tester un appel Inbox API.
2. **H+0:30 → H+1:30 — Ingestion et classification.** Importer posts et commentaires dans D1. Écrire le prompt de classification. Brancher la Queue.
3. **H+1:30 → H+2:30 — Dashboard.** Afficher le classement des posts et le détail par post. En parallèle : webhook + auto-DM + lien tracké.
4. **H+2:30 → H+3:30 — Ads.** Bouton « Booster ».
5. **H+3:30 → H+4:15 — P1.** Regroupement des insights en thèmes (LLM). Workflow DM conversationnel si le temps le permet.
6. **H+4:15 → H+5:00 — Démo.** Charger le jeu de données de secours. Répéter le scénario deux fois.

**Répartition suggérée pour 3 personnes :** une personne sur le back-end et Zernio, une sur l'IA et les prompts, une sur le front-end et la démo.

### Sources

- [Zernio — Social media inbox API](https://zernio.com/social-media-inbox)
- [Zernio — Boost post as ad](https://docs.zernio.com/ad-campaigns/boost-post)
- [Zernio — Meta Ads API](https://changelog.zernio.com/meta-ads)
- [Zernio — Comment-to-DM automation](https://zernio.com/comment-to-dm)
- [Zernio — Platforms et limites inbox](https://docs.zernio.com/platforms)
