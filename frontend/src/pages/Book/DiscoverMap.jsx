import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { Link } from "react-router-dom";
import {
  DEFAULT_CENTER,
  DISCOVER_ZOOM,
  createColoredMarker,
  createUserLocationMarker,
  formatDistance,
  haversineKm,
} from "../../utils/mapUtils";
import { resolveMediaUrl } from "../../utils/assets";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function FitToPoints({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], DISCOVER_ZOOM + 1);
      return;
    }
    const bounds = points.map((p) => [p.lat, p.lng]);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [points, map]);
  return null;
}

/**
 * Auto-resize the Leaflet map when its container becomes visible (e.g.,
 * toggling from List to Map view). Otherwise Leaflet keeps its initial
 * "0x0" viewport and tiles render weirdly until the user interacts.
 */
function AutoResize() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 120);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

/**
 * @param {object} props
 * @param {Array} props.businesses — list of public business records with `coordinates`.
 * @param {{lat: number, lng: number}|null} props.userLocation
 */
const DiscoverMap = ({ businesses, userLocation }) => {
  const mapRef = useRef(null);

  const pinnable = useMemo(
    () =>
      (businesses || []).filter(
        (b) =>
          b.coordinates &&
          Number.isFinite(Number(b.coordinates.lat)) &&
          Number.isFinite(Number(b.coordinates.lng)),
      ),
    [businesses],
  );

  const points = useMemo(() => {
    const list = pinnable.map((b) => ({
      lat: Number(b.coordinates.lat),
      lng: Number(b.coordinates.lng),
    }));
    if (userLocation) list.push(userLocation);
    return list;
  }, [pinnable, userLocation]);

  const initialCenter = useMemo(() => {
    if (userLocation) return userLocation;
    if (points[0]) return points[0];
    return DEFAULT_CENTER;
  }, [userLocation, points]);

  const icon = useMemo(() => createColoredMarker({ color: "#4f46e5" }), []);
  const userIcon = useMemo(() => createUserLocationMarker(), []);

  return (
    <div className="discover-map-wrap">
      {pinnable.length === 0 ? (
        <div className="discover-map-empty">
          <p>
            None of the businesses matching your filters have a map location
            yet. Try clearing filters or switching back to the list view.
          </p>
        </div>
      ) : null}

      <MapContainer
        center={[initialCenter.lat, initialCenter.lng]}
        zoom={DISCOVER_ZOOM}
        scrollWheelZoom
        className="discover-leaflet"
        ref={mapRef}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <AutoResize />
        <FitToPoints points={points} />

        {userLocation ? (
          <Marker
            position={[userLocation.lat, userLocation.lng]}
            icon={userIcon}
            zIndexOffset={1000}
          >
            <Popup>You are here</Popup>
          </Marker>
        ) : null}

        {pinnable.map((b) => {
          const lat = Number(b.coordinates.lat);
          const lng = Number(b.coordinates.lng);
          const distanceKm = userLocation
            ? haversineKm(userLocation, { lat, lng })
            : null;
          const img = b.image || b.logo;
          return (
            <Marker key={b.id} position={[lat, lng]} icon={icon}>
              <Popup>
                <div className="dm-popup">
                  {img ? (
                    <div className="dm-popup-img">
                      <img src={resolveMediaUrl(img)} alt={b.name} />
                    </div>
                  ) : null}
                  <div className="dm-popup-body">
                    <h4 className="dm-popup-title">{b.name}</h4>
                    {b.address ? (
                      <p className="dm-popup-meta">{b.address}</p>
                    ) : null}
                    <p className="dm-popup-meta">
                      <span className="dm-popup-rating">
                        ★ {Number(b.rating || 0).toFixed(1)}
                      </span>
                      {b.reviewCount ? (
                        <span className="dm-popup-reviews">
                          {" "}
                          ({b.reviewCount})
                        </span>
                      ) : null}
                      {distanceKm != null ? (
                        <span className="dm-popup-dist">
                          {" "}
                          · {formatDistance(distanceKm)}
                        </span>
                      ) : null}
                    </p>
                    <Link
                      to={`/business/${b.slug || b.id}`}
                      className="dm-popup-cta"
                    >
                      View &amp; Book →
                    </Link>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default DiscoverMap;
