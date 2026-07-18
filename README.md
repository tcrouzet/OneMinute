# OneMinute

Prototype de web app narrative sur globe 3D.

## Site

Le site statique est servi directement depuis `web/`.

Une fois GitHub Pages active en mode GitHub Actions, l'application sera disponible ici :

https://tcrouzet.github.io/OneMinute/

## Structure

- `web/` : application statique Cesium, donnees de carte et chapitres JSON publies par GitHub Pages.
- `script/` : scripts Python de generation de carte et de graphe.
- `output/map/` : donnees sources consolidees utiles au mapping.

## Developpement local

Depuis la racine :

```bash
python3 -m http.server 8787
```

Puis ouvrir :

```text
http://127.0.0.1:8787/web/
```
