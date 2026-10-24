import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { CheckpointScanDetail } from '../../types/patrol';
import { X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { getSecureMediaUrl } from '../../utils/secureMedia';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet Default Icon Assets
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
}

// Custom Map Pin Icons using Leaflet SVG DivIcons
const createPinIcon = (color: string, label?: string, symbol?: string) =>
  L.divIcon({
    className: 'custom-map-pin',
    html: `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        ${
          label
            ? `<span style="font-size: 11px; font-weight: 800; background: white; padding: 2px 6px; border-radius: 4px; border: 1.5px solid ${color}; white-space: nowrap; box-shadow: 0 2px 5px rgba(0,0,0,0.3); color: #0f172a; margin-bottom: 3px;">${label}</span>`
            : ''
        }
        <div style="background-color: ${color}; width: 18px; height: 18px; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; color: white; font-size: 10px; font-weight: bold;">
          ${symbol || ''}
        </div>
      </div>
    `,
    iconSize: [30, 42],
    iconAnchor: [15, 38],
  });

const masterPinIcon = (label?: string) => createPinIcon('#2563eb', label); // Blue: Master Target
const verifiedPinIcon = (label?: string) => createPinIcon('#16a34a', label, '✓'); // Green: Verified (≤50m)
const driftPinIcon = (label?: string) => createPinIcon('#d97706', label, '!'); // Amber: Drifted

const FitMapBoundsAndResize: React.FC<{ coords: [number, number][] }> = ({ coords }) => {
  const map = useMap();

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        map.invalidateSize();
      } catch (_) {}
    }, 250);

    if (coords && coords.length > 0) {
      try {
        const bounds = L.latLngBounds(coords.map((c) => L.latLng(c[0], c[1])));
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17 });
      } catch (_) {}
    }

    return () => clearTimeout(timer);
  }, [coords, map]);

  return null;
};

interface PatrolMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  scans: CheckpointScanDetail[];
  roundTitle: string;
}

export const PatrolMapModal: React.FC<PatrolMapModalProps> = ({
  isOpen,
  onClose,
  scans = [],
  roundTitle,
}) => {
  if (!isOpen) return null;

  const safeScans = Array.isArray(scans) ? scans : [];

  const getCoordinates = (scan: any) => {
    // Master / Expected Checkpoint Coordinates
    const rawMasterLat = scan?.master_lat ?? scan?.expected_lat ?? scan?.qr_lat ?? scan?.checkpoint_lat ?? scan?.lat;
    const rawMasterLng = scan?.master_lng ?? scan?.expected_lng ?? scan?.qr_lng ?? scan?.checkpoint_lng ?? scan?.lng;

    // Guard Actual Scan Coordinates
    const rawScanLat = scan?.scan_lat ?? scan?.guard_lat ?? scan?.actual_lat ?? scan?.scanned_lat ?? scan?.latitude;
    const rawScanLng = scan?.scan_lng ?? scan?.guard_lng ?? scan?.actual_lng ?? scan?.scanned_lng ?? scan?.longitude;

    const masterLat = rawMasterLat !== undefined && rawMasterLat !== null && rawMasterLat !== '' ? parseFloat(rawMasterLat) : null;
    const masterLng = rawMasterLng !== undefined && rawMasterLng !== null && rawMasterLng !== '' ? parseFloat(rawMasterLng) : null;
    const scanLat = rawScanLat !== undefined && rawScanLat !== null && rawScanLat !== '' ? parseFloat(rawScanLat) : null;
    const scanLng = rawScanLng !== undefined && rawScanLng !== null && rawScanLng !== '' ? parseFloat(rawScanLng) : null;

    return {
      hasMaster: masterLat !== null && masterLng !== null && !isNaN(masterLat) && !isNaN(masterLng),
      masterLat,
      masterLng,
      hasScan: scanLat !== null && scanLng !== null && !isNaN(scanLat) && !isNaN(scanLng),
      scanLat,
      scanLng,
    };
  };

  const validCoordinates: [number, number][] = [];
  safeScans.forEach((s) => {
    const { hasMaster, masterLat, masterLng, hasScan, scanLat, scanLng } = getCoordinates(s);
    if (hasMaster) validCoordinates.push([masterLat!, masterLng!]);
    if (hasScan) validCoordinates.push([scanLat!, scanLng!]);
  });

  const defaultCenter: [number, number] = validCoordinates[0] || [22.3072, 73.1812];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-6 backdrop-blur-sm font-sans">
      <div className="flex h-[92vh] w-full max-w-6xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden ring-1 ring-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 z-10">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Patrol GPS Audit Map</h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">{roundTitle}</p>
          </div>
          <div className="flex items-center gap-5">
            <div className="hidden sm:flex items-center gap-4 text-xs font-bold">
              <span className="flex items-center gap-1.5 text-blue-700">
                <span className="h-3 w-3 rounded-full bg-blue-600 inline-block border border-white shadow-sm" /> Master Point
              </span>
              <span className="flex items-center gap-1.5 text-green-700">
                <span className="h-3 w-3 rounded-full bg-green-600 inline-block border border-white shadow-sm" /> Verified Scan (≤50m)
              </span>
              <span className="flex items-center gap-1.5 text-amber-700">
                <span className="h-3 w-3 rounded-full bg-amber-600 inline-block border border-white shadow-sm" /> Drift Flagged
              </span>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Map View */}
        <div className="relative flex-1 bg-slate-100 w-full h-full">
          <MapContainer center={defaultCenter} zoom={16} className="h-full w-full">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <FitMapBoundsAndResize coords={validCoordinates} />

            {safeScans.map((scan: any, idx: number) => {
              const { hasMaster, masterLat, masterLng, hasScan, scanLat, scanLng } = getCoordinates(scan);

              const checkpointName = scan?.checkpoint_name || scan?.checkpoint_id || `Stop #${idx + 1}`;
              const isGpsVerified = scan?.is_gps_verified ?? (scan?.status === 'VERIFIED');
              const driftMeters = scan?.calculated_distance_m ?? scan?.distance_meters;
              const scanTime = scan?.scanned_at || scan?.scan_time;

              const selfie = getSecureMediaUrl(scan?.selfie_url);
              const locationPhoto = getSecureMediaUrl(scan?.location_photo_url || scan?.photo_url);

              return (
                <React.Fragment key={scan?.scan_id || scan?.id || idx}>
                  {/* CASE 1: VERIFIED SCAN (≤50m) -> Render Green Verified Marker directly */}
                  {hasScan && isGpsVerified && (
                    <Marker
                      position={[scanLat!, scanLng!]}
                      icon={verifiedPinIcon(`#${idx + 1} Verified`)}
                    >
                      <Popup>
                        <div className="p-1 text-slate-800 text-xs w-60">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-green-700 flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" /> GPS Verified (≤50m)
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">#{idx + 1}</span>
                          </div>
                          <div className="font-extrabold text-sm text-slate-900 mb-1">{checkpointName}</div>
                          <div className="text-[11px] text-slate-500 mb-2">
                            Recorded: {scanTime ? new Date(scanTime).toLocaleTimeString() : 'N/A'}
                            <br />
                            Distance Drift: {driftMeters !== undefined && driftMeters !== null ? `${Number(driftMeters).toFixed(1)} m` : 'On spot'}
                          </div>

                          {(selfie || locationPhoto) && (
                            <div className="grid grid-cols-2 gap-1.5 mb-2">
                              {selfie && (
                                <a href={selfie} target="_blank" rel="noreferrer" className="block relative group">
                                  <img src={selfie} alt="Selfie" className="h-16 w-full object-cover rounded border border-slate-200" />
                                  <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] text-center py-0.5">Selfie</span>
                                </a>
                              )}
                              {locationPhoto && (
                                <a href={locationPhoto} target="_blank" rel="noreferrer" className="block relative group">
                                  <img src={locationPhoto} alt="Location" className="h-16 w-full object-cover rounded border border-slate-200" />
                                  <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] text-center py-0.5">Location</span>
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  )}

                  {/* CASE 2: DRIFTED SCAN (>50m) -> Render BOTH Master (Blue) and Actual (Amber) + Line */}
                  {hasScan && !isGpsVerified && (
                    <>
                      {/* Master Location */}
                      {hasMaster && (
                        <Marker position={[masterLat!, masterLng!]} icon={masterPinIcon(`#${idx + 1} Master`)}>
                          <Popup>
                            <div className="p-1 text-slate-800 text-xs">
                              <span className="font-bold text-blue-600 block">Master Target Checkpoint</span>
                              <div className="font-bold text-sm text-slate-900">{checkpointName}</div>
                            </div>
                          </Popup>
                        </Marker>
                      )}

                      {/* Actual Guard Location */}
                      <Marker position={[scanLat!, scanLng!]} icon={driftPinIcon(`#${idx + 1} Drifted`)}>
                        <Popup>
                          <div className="p-1 text-slate-800 text-xs w-60">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-bold text-amber-700 flex items-center gap-1">
                                <AlertTriangle className="h-3.5 w-3.5" /> Drift Flagged
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">#{idx + 1}</span>
                            </div>
                            <div className="font-extrabold text-sm text-slate-900 mb-1">{checkpointName}</div>
                            <div className="text-[11px] text-slate-500 mb-2">
                              Drift: {driftMeters !== undefined && driftMeters !== null ? `${Number(driftMeters).toFixed(1)} m` : 'Off-site'}
                            </div>
                          </div>
                        </Popup>
                      </Marker>

                      {/* Drift Line */}
                      {hasMaster && (
                        <Polyline
                          positions={[
                            [masterLat!, masterLng!],
                            [scanLat!, scanLng!],
                          ]}
                          color="#d97706"
                          dashArray="6, 8"
                          weight={3}
                          opacity={0.85}
                        />
                      )}
                    </>
                  )}

                  {/* CASE 3: NO SCAN RECORDED YET -> Render Master Point only */}
                  {!hasScan && hasMaster && (
                    <Marker position={[masterLat!, masterLng!]} icon={masterPinIcon(`#${idx + 1}`)}>
                      <Popup>
                        <div className="p-1 text-slate-800 text-xs">
                          <span className="font-bold text-blue-600 block">Master Checkpoint</span>
                          <div className="font-bold text-sm text-slate-900">{checkpointName}</div>
                        </div>
                      </Popup>
                    </Marker>
                  )}
                </React.Fragment>
              );
            })}
          </MapContainer>
        </div>
      </div>
    </div>
  );
};

export default PatrolMapModal;