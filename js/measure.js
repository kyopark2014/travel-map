/** Haversine distance in meters between two [lng, lat] points. */
export function haversineMeters(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h =
    s1 * s1 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

/**
 * Click-to-measure helper for a MapLibre map.
 * Expects GeoJSON source `measure` with line + points layers already present,
 * or will create them on first enable.
 */
export function createMeasureTool(map, { onUpdate } = {}) {
  let enabled = false;
  const points = [];

  function ensureLayers() {
    if (!map.getSource('measure')) {
      map.addSource('measure', {
        type: 'geojson',
        data: emptyFeatureCollection(),
      });
    }
    if (!map.getLayer('measure-line')) {
      map.addLayer({
        id: 'measure-line',
        type: 'line',
        source: 'measure',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: {
          'line-color': '#ffb703',
          'line-width': 3,
          'line-opacity': 0.95,
        },
      });
    }
    if (!map.getLayer('measure-points')) {
      map.addLayer({
        id: 'measure-points',
        type: 'circle',
        source: 'measure',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 5,
          'circle-color': '#fff',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffb703',
        },
      });
    }
  }

  function emptyFeatureCollection() {
    return { type: 'FeatureCollection', features: [] };
  }

  function syncSource() {
    const features = points.map((coords, i) => ({
      type: 'Feature',
      properties: { index: i },
      geometry: { type: 'Point', coordinates: coords },
    }));
    if (points.length >= 2) {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: points },
      });
    }
    map.getSource('measure').setData({
      type: 'FeatureCollection',
      features,
    });

    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      total += haversineMeters(points[i - 1], points[i]);
    }
    onUpdate?.({ points: [...points], totalMeters: total });
  }

  function onClick(e) {
    if (!enabled) return;
    points.push([e.lngLat.lng, e.lngLat.lat]);
    syncSource();
  }

  function setEnabled(next) {
    enabled = next;
    ensureLayers();
    map.getCanvas().style.cursor = enabled ? 'crosshair' : '';
  }

  function clear() {
    points.length = 0;
    if (map.getSource('measure')) {
      map.getSource('measure').setData(emptyFeatureCollection());
    }
    onUpdate?.({ points: [], totalMeters: 0 });
  }

  map.on('click', onClick);

  return {
    setEnabled,
    clear,
    isEnabled: () => enabled,
    destroy() {
      map.off('click', onClick);
    },
  };
}
