import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { CheckpointScanDetail } from '../../types/patrol';
import { X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getSecureMediaUrl } from '../../utils/secureMedia';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet Default Icon Assets
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom Map Pin Icons using Leaflet SVG DivIcons
const createIcon = (color: string, label?: string) =>
  L.divIcon({
    className: 'custom-pin',
    html: `
      <div style="position: relative; display: flex; align-items: center; justify-content: center;">
        <div style="background-color: ${color}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.45);"></div>
        ${
          label
            ? `<span style="position: absolute; top: -18px; font-size: 10px; font-weight: bold; background: white; padding: 1px 4px; border-radius: 3px; border: 1px solid #ccc; white-space: nowrap; box-shadow: 0 1px 3px rgba(0,0,0,0.2); color: #1e293b;">${label}</span>`
            : ''
        }
      </div>
    `,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

const masterIcon = (label?: string) => createIcon('#2563eb', label); // Blue: Master Location
const verifiedScanIcon = createIcon('#16a34a'); // Green: Verified (<=50m)
const varianceScanIcon = createIcon('#d97706'); // Amber: Drift Flagged (>50m)

// Controller Component to fix Leaflet grey screen bug & fit bounds to all coordinates
const FitMapBoundsAndResize: React.FC<{ coords: [number, number][] }> = ({ coords }) => {
  const map = useMap();

  useEffect(() => {
    // 1. Force Leaflet to recalculate container dimensions when modal mounts
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    // 2. Dynamically fit all points into view
    if (coords.length > 0) {
      const bounds = L.latLngBounds(coords.map((c) => L.latLng(c[0], c[1])));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
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
  scans,
  roundTitle,
}) => {
  if (!isOpen) return null;

  // Normalization helper: supports master_lat/scan_lat and expected_lat/guard_lat schemas
  const getCoordinates = (scan: any) => {
    const rawMasterLat = scan.master_lat ?? scan.expected_lat ?? scan.lat;
    const rawMasterLng = scan.master_lng ?? scan.expected_lng ?? scan.lng;
    const rawScanLat = scan.scan_lat ?? scan.guard_lat;
    const rawScanLng = scan.scan_lng ?? scan.guard_lng;

    const masterLat = rawMasterLat !== undefined && rawMasterLat !== null ? parseFloat(rawMasterLat) : null;
    const masterLng = rawMasterLng !== undefined && rawMasterLng !== null ? parseFloat(rawMasterLng) : null;
    const scanLat = rawScanLat !== undefined && rawScanLat !== null ? parseFloat(rawScanLat) : null;
    const scanLng = rawScanLng !== undefined && rawScanLng !== null ? parseFloat(rawScanLng) : null;

    return {
      hasMaster: masterLat !== null && masterLng !== null && !isNaN(masterLat) && !isNaN(masterLng),
      masterLat,
      masterLng,
      hasScan: scanLat !== null && scanLng !== null && !isNaN(scanLat) && !isNaN(scanLng),
      scanLat,
      scanLng,
    };
  };

  // Collect all coordinates to fit boundary
  const validCoordinates: [number, number][] = [];
  scans.forEach((s) => {
    const { hasMaster, masterLat, masterLng, hasScan, scanLat, scanLng } = getCoordinates(s);
    if (hasMaster) validCoordinates.push([masterLat!, masterLng!]);
    if (hasScan) validCoordinates.push([scanLat!, scanLng!]);
  });

  const defaultCenter: [number, number] = validCoordinates[0] || [22.3072, 73.1812];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-6 backdrop-blur-sm">
      <div className="flex h-[92vh] w-full max-w-6xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden ring-1 ring-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Patrol GPS Audit Map</h2>
            <p className="text-xs text-slate-500 font-mono">{roundTitle}</p>
          </div>
          <div className="flex items-center gap-5">
            <div className="hidden sm:flex items-center gap-3 text-xs text-slate-600 font-medium">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-600 inline-block"></span> Master Point
              </span>
              <span className="flex items-center gap-1.5 text-green-700">
                <span className="h-2.5 w-2.5 rounded-full bg-green-600 inline-block"></span> Verified Scan (≤50m)
              </span>
              <span className="flex items-center gap-1.5 text-amber-700">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-600 inline-block"></span> Drift Flagged
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

            {/* Recalculate size and center map */}
            <FitMapBoundsAndResize coords={validCoordinates} />

            {scans.map((scan: any, idx) => {
              const { hasMaster, masterLat, masterLng, hasScan, scanLat, scanLng } = getCoordinates(scan);

              const checkpointName = scan.checkpoint_name || scan.checkpoint_id || `Checkpoint #${idx + 1}`;
              const isGpsVerified = scan.is_gps_verified ?? (scan.status === 'VERIFIED');
              const driftMeters = scan.calculated_distance_m ?? scan.distance_meters;
              const scanTime = scan.scanned_at || scan.scan_time;

              // Secure media conversion for private R2 tokens
              const selfie = getSecureMediaUrl(scan.selfie_url || scan.photo_url);
              const locationPhoto = getSecureMediaUrl(scan.location_photo_url || scan.photo_url);

              return (
                <React.Fragment key={scan.scan_id || scan.id || idx}>
                  {/* Master Checkpoint Pin (Target Location) */}
                  {hasMaster && (
                    <Marker
                      position={[masterLat!, masterLng!]}
                      icon={masterIcon(`#${idx + 1}`)}
                    >
                      <Popup>
                        <div className="p-1 text-slate-800 text-xs max-w-xs">
                          <span className="font-semibold text-blue-600 block">Master Checkpoint #{idx + 1}</span>
                          <div className="font-bold text-sm text-slate-900 mt-0.5">{checkpointName}</div>
                          <div className="text-[11px] text-slate-500 mt-1 font-mono">
                            Target Coordinates: {masterLat!.toFixed(6)}, {masterLng!.toFixed(6)}
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  )}

                  {/* Guard Live Scan Pin */}
                  {hasScan && (
                    <>
                      <Marker
                        position={[scanLat!, scanLng!]}
                        icon={isGpsVerified ? verifiedScanIcon : varianceScanIcon}
                      >
                        <Popup>
                          <div className="p-1 text-slate-800 text-xs w-60">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-slate-600">Scan Proof #{idx + 1}</span>
                              {isGpsVerified ? (
                                <span className="inline-flex items-center text-[10px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded font-medium">
                                  <CheckCircle2 className="h-3 w-3 mr-0.5" /> Verified
                                </span>
                              ) : (
                                <span className="inline-flex items-center text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-medium">
                                  <AlertTriangle className="h-3 w-3 mr-0.5" /> Drifted
                                </span>
                              )}
                            </div>

                            <div className="font-bold text-slate-900 mb-1">{checkpointName}</div>
                            <div className="text-[11px] text-slate-500 mb-2">
                              Recorded: {scanTime ? new Date(scanTime).toLocaleTimeString() : 'N/A'}
                              <br />
                              Drift: {driftMeters !== undefined && driftMeters !== null ? `${Number(driftMeters).toFixed(1)} m` : 'Verified on spot'}
                            </div>

                            {/* Popup Photo Previews */}
                            {(selfie || locationPhoto) && (
                              <div className="grid grid-cols-2 gap-1.5 mb-2">
                                {selfie && (
                                  <a href={selfie} target="_blank" rel="noreferrer" className="block relative group">
                                    <img
                                      src={selfie}
                                      alt="Selfie"
                                      className="h-16 w-full object-cover rounded border border-slate-200"
                                    />
                                    <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] text-center py-0.5 opacity-0 group-hover:opacity-100 transition">
                                      Selfie
                                    </span>
                                  </a>
                                )}
                                {locationPhoto && (
                                  <a href={locationPhoto} target="_blank" rel="noreferrer" className="block relative group">
                                    <img
                                      src={locationPhoto}
                                      alt="Location"
                                      className="h-16 w-full object-cover rounded border border-slate-200"
                                    />
                                    <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] text-center py-0.5 opacity-0 group-hover:opacity-100 transition">
                                      Location
                                    </span>
                                  </a>
                                )}
                              </div>
                            )}

                            {scan.remarks && (
                              <p className="text-[10px] bg-slate-50 p-1.5 rounded text-slate-600 border border-slate-100">
                                <strong>Remark:</strong> {scan.remarks}
                              </p>
                            )}
                          </div>
                        </Popup>
                      </Marker>

                      {/* Dashed Drift Vector connecting Master to Actual Guard Scan */}
                      {hasMaster && (
                        <Polyline
                          positions={[
                            [masterLat!, masterLng!],
                            [scanLat!, scanLng!],
                          ]}
                          color={isGpsVerified ? '#16a34a' : '#d97706'}
                          dashArray="5, 8"
                          weight={2.5}
                          opacity={0.85}
                        />
                      )}
                    </>
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