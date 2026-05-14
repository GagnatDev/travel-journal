/** Mapbox marker DOM for the device GPS position (active trips only). */
export function createUserLocationMarkerElement(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'map-user-location-marker';
  root.setAttribute('aria-hidden', 'true');

  const pulse = document.createElement('div');
  pulse.className = 'map-user-location-marker__pulse';

  const dot = document.createElement('div');
  dot.className = 'map-user-location-marker__dot';

  root.append(pulse, dot);
  return root;
}
