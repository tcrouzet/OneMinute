(function () {
  "use strict";

  function createLinkManager({ Cesium, viewer, markerByChapterId, pickTolerance = 10 }) {
    const entities = [];
    const visibleEdges = [];
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
        existing.type = type;
        existing.label = label;
        return;
      }
      edges.push({ id: `unlock_${sequence += 1}`, key, from, to, type, label });
    }

    function redraw(edges, isEdgeVisible) {
      clear();
      visibleEdges.length = 0;
      for (const edge of edges) {
        const fromMarker = markerByChapterId.get(edge.from);
        const toMarker = markerByChapterId.get(edge.to);
        if (!fromMarker || !toMarker || !isEdgeVisible(edge)) continue;
        if (fromMarker === toMarker) continue;
        const color = edge.type === "retour" ? "#4aa3ff" : "#62dd72";
        visibleEdges.push(edge);
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
            width: edge.type === "retour" ? 5 : 4,
            material: Cesium.Color.fromCssColorString(color).withAlpha(0.82),
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
      const picked = pickedRenderedLink(screenPosition);
      return picked || pickedLinkByScreenDistance(screenPosition);
    }

    function pickedRenderedLink(screenPosition) {
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

    function pickedLinkByScreenDistance(screenPosition) {
      let best = null;
      let bestDistance = Infinity;
      const occluder = new Cesium.EllipsoidalOccluder(Cesium.Ellipsoid.WGS84, viewer.camera.positionWC);

      for (const edge of visibleEdges) {
        const fromMarker = markerByChapterId.get(edge.from);
        const toMarker = markerByChapterId.get(edge.to);
        if (!fromMarker || !toMarker) continue;
        const points = positionsFor(visibleEdges, fromMarker, toMarker, edge);
        for (let index = 1; index < points.length; index += 1) {
          const start = points[index - 1];
          const end = points[index];
          if (!segmentVisible(start, end, occluder, fromMarker, toMarker)) continue;
          const a = worldToScreen(start);
          const b = worldToScreen(end);
          if (!screenPointVisible(a) || !screenPointVisible(b)) continue;
          const distance = distanceToSegment(screenPosition, a, b);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = edge;
          }
        }
      }

      if (!best || bestDistance > pickTolerance) return null;
      return {
        from: best.from,
        to: best.to,
        type: best.type,
        label: best.label,
      };
    }

    function segmentVisible(start, end, occluder, fromMarker, toMarker) {
      const midpoint = Cesium.Cartesian3.midpoint(start, end, new Cesium.Cartesian3());
      if (fromMarker.type === "space" || toMarker.type === "space") {
        return occluder.isPointVisible(midpoint);
      }
      return occluder.isPointVisible(start)
        && occluder.isPointVisible(midpoint)
        && occluder.isPointVisible(end);
    }

    function screenPointVisible(point) {
      if (!point) return false;
      const margin = pickTolerance + 2;
      return point.x >= -margin
        && point.y >= -margin
        && point.x <= window.innerWidth + margin
        && point.y <= window.innerHeight + margin;
    }

    function worldToScreen(position) {
      const point = Cesium.SceneTransforms.worldToWindowCoordinates
        ? Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, position)
        : viewer.scene.cartesianToCanvasCoordinates?.(position);
      if (!point) return null;
      const dpr = window.devicePixelRatio || 1;
      if (dpr > 1 && (point.x > window.innerWidth || point.y > window.innerHeight)) {
        return new Cesium.Cartesian2(point.x / dpr, point.y / dpr);
      }
      return point;
    }

    function distanceToSegment(point, a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      if (!lengthSquared) return Math.hypot(point.x - a.x, point.y - a.y);
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
      const x = a.x + dx * t;
      const y = a.y + dy * t;
      return Math.hypot(point.x - x, point.y - y);
    }

    function positionsFor(edges, fromMarker, toMarker, edge) {
      if (fromMarker.type === "earth" && toMarker.type === "earth") {
        return earthCurvePositions(edges, fromMarker, toMarker, edge);
      }
      if (fromMarker.type === "space" || toMarker.type === "space") {
        return spaceCurvePositions(fromMarker, toMarker);
      }
      return [fromMarker.position, toMarker.position];
    }

    function spaceCurvePositions(fromMarker, toMarker) {
      const fromRadius = Cesium.Cartesian3.magnitude(fromMarker.position);
      const toRadius = Cesium.Cartesian3.magnitude(toMarker.position);
      const nearOrbit = Math.max(fromRadius, toRadius) < 6378137 * 3;
      if (nearOrbit) return nearSpaceCurvePositions(fromMarker, toMarker, fromRadius, toRadius);

      const points = [];
      const fromNormal = Cesium.Cartesian3.normalize(fromMarker.position, new Cesium.Cartesian3());
      const toNormal = Cesium.Cartesian3.normalize(toMarker.position, new Cesium.Cartesian3());
      const peakLift = Math.max(450000, Math.abs(toRadius - fromRadius) * 0.18);

      for (let step = 0; step <= 40; step += 1) {
        const t = step / 40;
        if (t === 0) {
          points.push(fromMarker.position);
          continue;
        }
        if (t === 1) {
          points.push(toMarker.position);
          continue;
        }

        const normal = Cesium.Cartesian3.lerp(fromNormal, toNormal, t, new Cesium.Cartesian3());
        Cesium.Cartesian3.normalize(normal, normal);
        const radius = lerp(fromRadius, toRadius, t) + Math.sin(Math.PI * t) * peakLift;
        points.push(Cesium.Cartesian3.multiplyByScalar(normal, radius, new Cesium.Cartesian3()));
      }

      return points;
    }

    function nearSpaceCurvePositions(fromMarker, toMarker, fromRadius, toRadius) {
      const points = [];
      const maxRadius = Math.max(fromRadius, toRadius);
      const lift = Math.max(180000, Math.abs(toRadius - fromRadius) * 0.55);

      for (let step = 0; step <= 28; step += 1) {
        const t = step / 28;
        if (t === 0) {
          points.push(fromMarker.position);
          continue;
        }
        if (t === 1) {
          points.push(toMarker.position);
          continue;
        }

        const point = Cesium.Cartesian3.lerp(fromMarker.position, toMarker.position, t, new Cesium.Cartesian3());
        const normal = Cesium.Cartesian3.normalize(point, new Cesium.Cartesian3());
        const currentRadius = Cesium.Cartesian3.magnitude(point);
        const raisedRadius = Math.max(currentRadius, maxRadius + Math.sin(Math.PI * t) * lift);
        points.push(Cesium.Cartesian3.multiplyByScalar(normal, raisedRadius, new Cesium.Cartesian3()));
      }

      return points;
    }

    function earthCurvePositions(edges, fromMarker, toMarker, edge) {
      const sameRouteEdges = edges.filter((item) => item.from === edge.from && item.to === edge.to);
      const routeIndex = Math.max(0, sameRouteEdges.findIndex((item) => item.id === edge.id));
      const dx = toMarker.lon - fromMarker.lon;
      const dy = toMarker.lat - fromMarker.lat;
      const length = Math.max(0.0001, Math.sqrt(dx * dx + dy * dy));
      const routeSpread = Math.min(1.8, Math.max(0, length * 0.18));
      const offset = (routeIndex - (sameRouteEdges.length - 1) / 2) * routeSpread;
      const peakHeight = Math.max(12000, Math.min(160000, length * 14000 + routeIndex * 18000));
      const normalLon = -dy / length;
      const normalLat = dx / length;
      const points = [];
      for (let step = 0; step <= 36; step += 1) {
        const t = step / 36;
        const bow = Math.sin(Math.PI * t) * offset;
        points.push(Cesium.Cartesian3.fromDegrees(
          lerp(fromMarker.lon, toMarker.lon, t) + normalLon * bow,
          lerp(fromMarker.lat, toMarker.lat, t) + normalLat * bow,
          Math.sin(Math.PI * t) * peakHeight
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
