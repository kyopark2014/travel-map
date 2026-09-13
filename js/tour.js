/**
 * Animate the camera along tour stops (preferred) or a LineString path.
 */
export function createPathTour(map) {
  let timer = null;
  let running = false;

  function flattenCoordinates(geometry) {
    if (!geometry) return [];
    if (geometry.type === 'LineString') return geometry.coordinates;
    if (geometry.type === 'MultiLineString') return geometry.coordinates.flat();
    if (geometry.type === 'GeometryCollection') {
      return geometry.geometries.flatMap(flattenCoordinates);
    }
    return [];
  }

  function bearingBetween(a, b) {
    const toRad = (d) => (d * Math.PI) / 180;
    const toDeg = (r) => (r * 180) / Math.PI;
    const [lng1, lat1] = a;
    const [lng2, lat2] = b;
    const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
    const x =
      Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
      Math.sin(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.cos(toRad(lng2 - lng1));
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function stop() {
    running = false;
    clearTimer();
  }

  function startStopTour(stops, options = {}) {
    const {
      pitch = 58,
      zoom = 13.2,
      flyMs = 2200,
      dwellMs = 2800,
    } = options;

    running = true;
    let index = 0;

    const visit = () => {
      if (!running) return;
      if (index >= stops.length) {
        stop();
        options.onDone?.();
        return;
      }

      const stopPoint = stops[index];
      const prev = index > 0 ? stops[index - 1] : null;
      const from = prev
        ? [prev.lng, prev.lat]
        : [stopPoint.lng, stopPoint.lat];
      const to = [stopPoint.lng, stopPoint.lat];
      const bearing =
        prev && (from[0] !== to[0] || from[1] !== to[1])
          ? bearingBetween(from, to)
          : map.getBearing();

      map.flyTo({
        center: to,
        zoom: stopPoint.zoom ?? zoom,
        pitch,
        bearing,
        duration: flyMs,
        essential: true,
      });

      // Show bubble shortly after camera settles near destination
      clearTimer();
      timer = setTimeout(() => {
        if (!running) return;
        options.onArrive?.(stopPoint, index);
        clearTimer();
        timer = setTimeout(() => {
          if (!running) return;
          index += 1;
          visit();
        }, dwellMs);
      }, flyMs + 120);
    };

    visit();
  }

  function startPathTour(feature, options = {}) {
    const coords = flattenCoordinates(feature.geometry);
    if (coords.length < 2) return;

    const {
      pitch = 62,
      zoom = 14.2,
      stepMs = 900,
      stride = 2,
    } = options;

    running = true;
    let i = 0;

    const step = () => {
      if (!running) return;
      if (i >= coords.length - 1) {
        stop();
        options.onDone?.();
        return;
      }

      const from = coords[i];
      const to = coords[Math.min(i + stride, coords.length - 1)];
      map.easeTo({
        center: to,
        zoom,
        pitch,
        bearing: bearingBetween(from, to),
        duration: stepMs,
        easing: (t) => t,
      });

      i += stride;
      timer = setTimeout(step, stepMs);
    };

    map.flyTo({
      center: coords[0],
      zoom,
      pitch,
      bearing: bearingBetween(coords[0], coords[1]),
      duration: 2200,
      essential: true,
    });

    timer = setTimeout(step, 2300);
  }

  function start(feature, options = {}) {
    stop();
    const stops = Array.isArray(options.stops) ? options.stops : null;
    if (stops?.length) {
      startStopTour(stops, options);
      return;
    }
    if (!feature) return;
    startPathTour(feature, options);
  }

  return {
    start,
    stop,
    isRunning: () => running,
  };
}
