(function () {
  "use strict";

  function createLinkManager({ Cesium, viewer, markerByChapterId }) {
    const entities = [];
    let sequence = 0;

    function remember(edges, from, to, link = {}) {
      const fromMarker = markerByChapterId.get(from);
      const toMarker = markerByChapterId.get(to);
      if (!fromMarker || !toMarker) return;
      const type = link.type === "retour" ? "retour" : "actif";
      const label = link.label || type;
      const key = `${fromMarker.id}|${toMarker.id}`;
      const existing = edges.find((edge) => edge.key === key);
      if (existing) {
        if (existing.type === "retour" && type === "actif") {
          existing.from = from;
          existing.to = to;
          existing.type = type;
          existing.label = label;
        }
        return;
      }
      edges.push({ id: `unlock_${sequence += 1}`, key, from, to, type, label });
    }

    function redraw(edges, isTargetVisible) {
      clear();
      for (const edge of edges) {
        const fromMarker = markerByChapterId.get(edge.from);
        const toMarker = markerByChapterId.get(edge.to);
        if (!fromMarker || !toMarker || !isTargetVisible(edge.to)) continue;
        if (fromMarker === toMarker) continue;
        entities.push(viewer.entities.add({
          id: edge.id,
          properties: {
            role: "unlock-link",
            from: edge.from,
            to: edge.to,
            label: edge.label,
            type: edge.type,
          },
          polyline: {
            positions: new Cesium.CallbackProperty(() => positionsFor(edges, fromMarker, toMarker, edge), false),
            width: 3,
            material: Cesium.Color.fromCssColorString("#62dd72").withAlpha(0.78),
            depthFailMaterial: Cesium.Color.fromCssColorString("#62dd72").withAlpha(0.78),
            arcType: Cesium.ArcType.GEODESIC,
          },
        }));
      }
    }

    function clear() {
      while (entities.length) viewer.entities.remove(entities.pop());
    }

    function pickedTarget(screenPosition) {
      return pickedLink(screenPosition)?.to || null;
    }

    function pickedLink(screenPosition) {
      const picked = viewer.scene.pick(screenPosition);
      const entity = picked?.id;
      const role = entity?.properties?.role?.getValue?.();
      if (role !== "unlock-link") return null;
      return {
        from: entity.properties.from?.getValue?.() || null,
        to: entity.properties.to?.getValue?.() || null,
        type: entity.properties.type?.getValue?.() || null,
        label: entity.properties.label?.getValue?.() || null,
      };
    }

    function positionsFor(edges, fromMarker, toMarker, edge) {
      if (fromMarker.type === "earth" && toMarker.type === "earth") {
        return earthCurvePositions(edges, fromMarker, toMarker, edge);
      }
      return [fromMarker.position, toMarker.position];
    }

    function earthCurvePositions(edges, fromMarker, toMarker, edge) {
      const sameRouteEdges = edges.filter((item) => item.from === edge.from && item.to === edge.to);
      const routeIndex = Math.max(0, sameRouteEdges.findIndex((item) => item.id === edge.id));
      const offset = (routeIndex - (sameRouteEdges.length - 1) / 2) * 2.4;
      const dx = toMarker.lon - fromMarker.lon;
      const dy = toMarker.lat - fromMarker.lat;
      const length = Math.max(0.0001, Math.sqrt(dx * dx + dy * dy));
      const normalLon = -dy / length;
      const normalLat = dx / length;
      const points = [];
      for (let step = 0; step <= 36; step += 1) {
        const t = step / 36;
        const bow = Math.sin(Math.PI * t) * offset;
        points.push(Cesium.Cartesian3.fromDegrees(
          lerp(fromMarker.lon, toMarker.lon, t) + normalLon * bow,
          lerp(fromMarker.lat, toMarker.lat, t) + normalLat * bow,
          Math.sin(Math.PI * t) * (160000 + routeIndex * 35000)
        ));
      }
      return points;
    }

    function lerp(a, b, t) {
      return a + (b - a) * t;
    }

    return {
      clear,
      pickedLink,
      pickedTarget,
      redraw,
      remember,
    };
  }

  window.OneMinuteLinks = { createLinkManager };
})();
