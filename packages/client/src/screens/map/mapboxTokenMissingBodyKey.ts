export function mapboxTokenMissingBodyKey():
  | 'map.mapboxTokenMissingDev'
  | 'map.mapboxTokenMissingStaging'
  | 'map.mapboxTokenMissingProd' {
  const mode = import.meta.env.MODE;
  if (mode === 'production') return 'map.mapboxTokenMissingProd';
  if (mode === 'staging') return 'map.mapboxTokenMissingStaging';
  return 'map.mapboxTokenMissingDev';
}
