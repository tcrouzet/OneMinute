# One Minute

Une lecture interactive de *One Minute*, roman en quatre tomes de [Thierry Crouzet](https://tcrouzet.com/), publié par [PVH Éditions](https://pvh-editions.com/product/one-minute-integrale-papier) et disponible en librairie.

Ce dépôt transforme le livre en territoire jouable : un globe 3D, des points d'entrée, des lieux verrouillés, des liens narratifs, des chapitres à débloquer. On ne parcourt pas seulement une table des matières, on explore une carte du récit.

## Lire

Version web :

https://tcrouzet.github.io/OneMinute/

Le premier point d'entrée est Versailles. Chaque chapitre lu ouvre de nouvelles routes selon les lieux, les tags narratifs et la progression dans les tomes. La Terre peut se dézoomer jusqu'à l'espace : station orbitale, Mars, Vesta, nuage d'Oort.

## Experience

- Globe 3D Cesium avec points de lecture géolocalisés.
- Progression de type jeu : points verts lisibles, jaunes déjà lus, rouges verrouillés.
- Réseau de liens narratifs affiché autour du point actif.
- Lecture classique verticale ou lecture RSVP.
- Profil avec progression par tome et par zone géographique.
- Sauvegarde/rechargement de la progression pour poursuivre sur un autre appareil.

## Données

La version interactive embarque :

- 380 chapitres JSON.
- 210 points de lecture.
- 7 points dans l'espace.
- 1 point d'entrée initial : Versailles, Tome 1.

Les chapitres et la carte sont générés dans `web/data/` à partir des sources de mapping du projet.

## Structure

- `web/` : application statique publiée par GitHub Pages.
- `web/data/map-points.json` : carte consolidée, points géographiques, liens et chemins de chapitres.
- `web/data/chapters/` : textes des chapitres au format JSON.
- `web/assets/` : couvertures, image sociale, textes éditoriaux du profil.
- `script/` : scripts Python de génération de carte et de données.
- `.github/workflows/pages.yml` : déploiement GitHub Pages.

## Developpement local

Depuis la racine du dépôt :

```bash
python3 -m http.server 8787
```

Puis ouvrir :

```text
http://127.0.0.1:8787/web/
```

## Publication

Le site est une application statique. GitHub Pages sert directement le dossier `web/` via le workflow Actions.

## Licence

[Cette version interactive de *One Minute* est distribuée sous licence libre, (cc) Thierry Crouzet, 2026.](https://github.com/tcrouzet/OneMinute)

Les livres papier et numériques restent disponibles chez [PVH Éditions](https://pvh-editions.com/product/one-minute-integrale-papier).
