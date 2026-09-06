/**
 * KMA "동네예보" grid conversion: WGS84 lat/lng → (nx, ny).
 *
 * This is the Lambert Conformal Conic projection KMA publishes for its 5km grid
 * (the DFS_XY_CONV algorithm). Pure deterministic math — no API call, no guess.
 * Constants are from KMA's reference implementation.
 */
const RE = 6371.00877; // earth radius (km)
const GRID = 5.0; // grid spacing (km)
const SLAT1 = 30.0; // projection latitude 1 (deg)
const SLAT2 = 60.0; // projection latitude 2 (deg)
const OLON = 126.0; // origin longitude (deg)
const OLAT = 38.0; // origin latitude (deg)
const XO = 43; // origin X grid point
const YO = 136; // origin Y grid point

export interface Grid {
  nx: number;
  ny: number;
}

export function latLngToGrid(lat: number, lng: number): Grid {
  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn =
    Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lng * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}
