// backend/src/utils/geo.ts

interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Calculates the distance between two geographical points using the Haversine formula.
 * @param point1 - The first point (latitude, longitude).
 * @param point2 - The second point (latitude, longitude).
 * @returns Distance in kilometers.
 */
export const calculateDistance = (point1: LatLng, point2: LatLng): number => {
  const R = 6371; // Radius of Earth in kilometers

  const toRadians = (deg: number): number => deg * (Math.PI / 180);

  const lat1Rad = toRadians(point1.latitude);
  const lon1Rad = toRadians(point1.longitude);
  const lat2Rad = toRadians(point2.latitude);
  const lon2Rad = toRadians(point2.longitude);

  const dLat = lat2Rad - lat1Rad;
  const dLon = lon2Rad - lon1Rad;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c; // Distance in kilometers
  return distance;
};
