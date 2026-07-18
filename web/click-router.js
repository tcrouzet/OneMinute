(function () {
  "use strict";

  function createClickRouter({
    directMarker,
    nearbyMarker,
    link,
    onMarker,
    onLink,
    onEmpty,
  }) {
    function route(position) {
      const marker = directMarker(position);
      if (marker) {
        onMarker(marker, position);
        return "marker";
      }

      const pickedLink = link(position);
      if (pickedLink?.to) {
        onLink(pickedLink, position);
        return "link";
      }

      const fallbackMarker = nearbyMarker(position);
      if (fallbackMarker) {
        onMarker(fallbackMarker, position);
        return "marker-fallback";
      }

      onEmpty(position);
      return "empty";
    }

    function hover(position) {
      if (directMarker(position)) return "pointer";
      if (link(position)?.to) return "pointer";
      if (nearbyMarker(position)) return "pointer";
      return "";
    }

    return { hover, route };
  }

  window.OneMinuteClickRouter = { createClickRouter };
})();
