import type { MapRenderablePin } from './types.js';

export function createMarkerElementForPin(pin: MapRenderablePin): HTMLElement {
  if (pin.kind === 'pendingSavedLocation') {
    const el = document.createElement('div');
    el.style.cssText = [
      'width: 26px',
      'height: 26px',
      'background-color: #fcd34d',
      'border: 2px dashed #b45309',
      'border-radius: 50%',
      'cursor: pointer',
      'box-shadow: 0 2px 6px rgba(0,0,0,0.35)',
    ].join(';');
    return el;
  }

  if (pin.kind === 'savedLocation') {
    const el = document.createElement('div');
    el.className = pin.isFavorite ? 'map-marker-favorite' : 'map-marker-saved';
    el.style.cssText = [
      'width: 26px',
      'height: 26px',
      `background-color: ${pin.isFavorite ? '#f59e0b' : '#2563eb'}`,
      'border: 2px solid #fff',
      'border-radius: 50%',
      'cursor: pointer',
      'box-shadow: 0 2px 6px rgba(0,0,0,0.35)',
      'display: flex',
      'align-items: center',
      'justify-content: center',
    ].join(';');
    if (pin.isFavorite) {
      el.textContent = '★';
      el.style.color = '#fff';
      el.style.fontSize = '14px';
      el.style.lineHeight = '1';
    }
    return el;
  }

  const el = document.createElement('div');
  el.className = 'map-marker';
  el.style.cssText = [
    'width: 28px',
    'height: 28px',
    'background-color: #9b3f2b',
    'border: 2px solid #fff',
    'border-radius: 50% 50% 50% 0',
    'transform: rotate(-45deg)',
    'cursor: pointer',
    'box-shadow: 0 2px 6px rgba(0,0,0,0.35)',
  ].join(';');
  return el;
}
