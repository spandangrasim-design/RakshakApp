import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { CheckpointScanDetail } from '../../types/patrol';
import { X, ExternalLink, AlertTriangle, CheckCircle2 } from 'lucide-react';

// Custom Map Pin Icons using Leaflet SVG DivIcons
const createIcon = (color: string, label?: string) =>
  L.divIcon({
    className: 'custom-pin',
    html: `
      <div style="position: relative; display: flex; align-items: center; justify-content: center;">
        <div style="background-color: ${color}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.45);"></div>
        ${
          label
            ? `<span style="position: absolute; top: -18px; font-size: 10px; font-weight: bold; background: white; padding: 1px 4px; border-radius: 3px; border: 1px solid #ccc; white-space: nowrap; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">${label}</span>`
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

// Helper Component to dynamically fit bounds to all visible markers
const FitMapBounds: React.FC<{ coords: [number, number][] }> = ({ coords }) => {
  const map = useMap();

  useEffect(() => {
    if (coords.length > 0) {
      const bounds = L.latLngBounds(coords.map((c) => L.latLng(c[0], c[1])));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 });
    }
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

  // Collect all valid LatLng points for the bounding box
  const validCoordinates: [number, number][] = [];

  scans.forEach((scan) => {
    if (typeof scan.master_lat === 'number' && typeof scan.master_lng === 'number' && !isNaN(scan.master_lat)) {
      validCoordinates.push([scan.master_lat, scan.master_lng]);
    }
    if (typeof scan.scan_lat === 'number' && typeof scan.scan_lng === 'number' && !isNaN(scan.scan_lat)) {
      validCoordinates.push([scan.scan_lat, scan.scan_lng]);
    }
  });

  const defaultCenter: [number, number] = validCoordinates[0] || [22.3072, 73.1812];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6 backdrop-blur-sm">
      <div className="flex h-[92vh] w-full max-w-6xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden ring-1 ring-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Patrol GPS Audit Map</h2>
            <p className="text-xs text-slate-500">{roundTitle}</p>
          </div>
          <div className="flex items-center gap-5">
            <div className="hidden sm:flex items-center gap-3 text-xs text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-600 inline-block"></span> Master Point
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-green-600 inline-block"></span> Verified Scan (≤50m)
              </span>
              <span className="flex items-center gap-1.5">
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
        <div className="relative flex-1 bg-slate-100">
          <MapContainer center={defaultCenter} zoom={17} className="h-full w-full">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {validCoordinates.length > 0 && <FitMapBounds coords={validCoordinates} />}

            {scans.map((scan, idx) => {
              const hasScanGps =
                scan.scan_lat !== null &&
                scan.scan_lng !== null &&
                !isNaN(scan.scan_lat) &&
                !isNaN(scan.scan_lng);

              const hasMasterGps =
                scan.master_lat !== null &&
                scan.master_lng !== null &&
                !isNaN(scan.master_lat) &&
                !isNaN(scan.master_lng);

              return (
                <React.Fragment key={scan.scan_id || idx}>
                  {/* Master Checkpoint Pin */}
                  {hasMasterGps && (
                    <Marker
                      position={[scan.master_lat, scan.master_lng]}
                      icon={masterIcon(`#${idx + 1}`)}
                    >
                      <Popup>
                        <div className="p-1 text-slate-800 text-xs max-w-xs">
                          <span className="font-semibold text-blue-600 block">Master Checkpoint #{idx + 1}</span>
                          <div className="font-bold text-sm text-slate-900 mt-0.5">{scan.checkpoint_name}</div>
                          <div className="text-[11px] text-slate-500 mt-1">
                            Target Coordinates: {scan.master_lat.toFixed(6)}, {scan.master_lng.toFixed(6)}
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  )}

                  {/* Guard Live Scan Pin */}
                  {hasScanGps && (
                    <>
                      <Marker
                        position={[scan.scan_lat!, scan.scan_lng!]}
                        icon={scan.is_gps_verified ? verifiedScanIcon : varianceScanIcon}
                      >
                        <Popup>
                          <div className="p-1 text-slate-800 text-xs w-56">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-slate-600">Scan Proof #{idx + 1}</span>
                              {scan.is_gps_verified ? (
                                <span className="inline-flex items-center text-[10px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded font-medium">
                                  <CheckCircle2 className="h-3 w-3 mr-0.5" /> Verified
                                </span>
                              ) : (
                                <span className="inline-flex items-center text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-medium">
                                  <AlertTriangle className="h-3 w-3 mr-0.5" /> Drifted
                                </span>
                              )}
                            </div>

                            <div className="font-bold text-slate-900 mb-1">{scan.checkpoint_name}</div>
                            <div className="text-[11px] text-slate-500 mb-2">
                              Recorded: {new Date(scan.scanned_at).toLocaleTimeString()}
                              <br />
                              Drift: {scan.calculated_distance_m !== null ? `${scan.calculated_distance_m.toFixed(1)} m` : 'No GPS / Indoor'}
                            </div>

                            {/* Popup Photo Preview */}
                            <div className="grid grid-cols-2 gap-1.5 mb-2">
                              {scan.selfie_url && (
                                <a href={scan.selfie_url} target="_blank" rel="noreferrer" className="block relative group">
                                  <img
                                    src={scan.selfie_url}
                                    alt="Selfie"
                                    className="h-16 w-full object-cover rounded border border-slate-200"
                                  />
                                  <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] text-center py-0.5 opacity-0 group-hover:opacity-100 transition">
                                    Selfie
                                  </span>
                                </a>
                              )}
                              {scan.location_photo_url && (
                                <a href={scan.location_photo_url} target="_blank" rel="noreferrer" className="block relative group">
                                  <img
                                    src={scan.location_photo_url}
                                    alt="Location"
                                    className="h-16 w-full object-cover rounded border border-slate-200"
                                  />
                                  <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] text-center py-0.5 opacity-0 group-hover:opacity-100 transition">
                                    Location
                                  </span>
                                </a>
                              )}
                            </div>

                            {scan.remarks && (
                              <p className="text-[10px] bg-slate-50 p-1.5 rounded text-slate-600 border border-slate-100">
                                <strong>Remark:</strong> {scan.remarks}
                              </p>
                            )}
                          </div>
                        </Popup>
                      </Marker>

                      {/* Dashed Drift Vector connecting Master to Actual Scan */}
                      {hasMasterGps && (
                        <Polyline
                          positions={[
                            [scan.master_lat, scan.master_lng],
                            [scan.scan_lat!, scan.scan_lng!],
                          ]}
                          color={scan.is_gps_verified ? '#16a34a' : '#d97706'}
                          dashArray="5, 8"
                          weight={2}
                          opacity={0.8}
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