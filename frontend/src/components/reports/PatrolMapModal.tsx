import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { CheckpointScanDetail } from '../../types/patrol';
import { X } from 'lucide-react';

// Custom Map Pin Icons using Leaflet SVG DivIcons
const createIcon = (color: string) =>
  L.divIcon({
    className: 'custom-pin',
    html: `<div style="background-color: ${color}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

const masterIcon = createIcon('#2563eb'); // Blue
const verifiedScanIcon = createIcon('#16a34a'); // Green
const varianceScanIcon = createIcon('#d97706'); // Amber

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

  // Determine initial center
  const firstPoint = scans.find((s) => s.scan_lat && s.scan_lng) || scans[0];
  const center: [number, number] = firstPoint
    ? [firstPoint.scan_lat ?? firstPoint.master_lat, firstPoint.scan_lng ?? firstPoint.master_lng]
    : [22.3072, 73.1812]; // Fallback coordinates

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex h-[90vh] w-full max-w-5xl flex-col rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Patrol GPS Audit Map</h2>
            <p className="text-xs text-gray-500">{roundTitle}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-block h-3 w-3 rounded-full bg-blue-600"></span> Master Point
              <span className="inline-block h-3 w-3 rounded-full bg-green-600"></span> Verified Scan
              <span className="inline-block h-3 w-3 rounded-full bg-amber-600"></span> Drift Flagged
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Map Body */}
        <div className="relative flex-1">
          <MapContainer center={center} zoom={17} className="h-full w-full">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {scans.map((scan) => {
              const hasScanGps = scan.scan_lat !== null && scan.scan_lng !== null;
              return (
                <React.Fragment key={scan.scan_id}>
                  {/* Master Checkpoint Pin */}
                  <Marker
                    position={[scan.master_lat, scan.master_lng]}
                    icon={masterIcon}
                  >
                    <Popup>
                      <div className="text-xs">
                        <strong>Master: {scan.checkpoint_name}</strong>
                        <br />
                        Lat: {scan.master_lat}, Lng: {scan.master_lng}
                      </div>
                    </Popup>
                  </Marker>

                  {/* Guard Live Scan Pin */}
                  {hasScanGps && (
                    <>
                      <Marker
                        position={[scan.scan_lat!, scan.scan_lng!]}
                        icon={scan.is_gps_verified ? verifiedScanIcon : varianceScanIcon}
                      >
                        <Popup>
                          <div className="text-xs">
                            <strong>Guard Scan: {scan.checkpoint_name}</strong>
                            <br />
                            Status: {scan.status}
                            <br />
                            Drift: {scan.calculated_distance_m?.toFixed(1) ?? 'N/A'} m
                          </div>
                        </Popup>
                      </Marker>

                      {/* Connect Line showing drift between expected and actual */}
                      <Polyline
                        positions={[
                          [scan.master_lat, scan.master_lng],
                          [scan.scan_lat!, scan.scan_lng!],
                        ]}
                        color={scan.is_gps_verified ? '#16a34a' : '#d97706'}
                        dashArray="4"
                        weight={2}
                      />
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