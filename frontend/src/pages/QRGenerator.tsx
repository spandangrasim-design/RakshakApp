import React, { useState } from 'react';
import QRCode from 'qrcode';
import { pdf } from '@react-pdf/renderer';
import { Shield, Download, Plus, Loader2, MapPin, X, ZoomIn } from 'lucide-react';
import { generateSignedQRPayload } from '../utils/crypto';
import { QRSheetPDF, QRData } from '../components/QRSheetPDF';

interface Checkpoint {
  id: string;
  name: string;
  lat: string;
  lng: string;
}

const QRGenerator: React.FC = () => {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [qrData, setQrData] = useState<QRData[]>([]);
  
  const [cpName, setCpName] = useState('');
  const [cpId, setCpId] = useState('');
  const [cpLat, setCpLat] = useState('');
  const [cpLng, setCpLng] = useState('');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  
  // State for the full-screen zoom modal
  const [enlargedQR, setEnlargedQR] = useState<QRData | null>(null);

  const handleAddCheckpoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (cpName && cpId && cpLat && cpLng) {
      setCheckpoints([...checkpoints, { id: cpId, name: cpName, lat: cpLat, lng: cpLng }]);
      setCpName('');
      setCpId('');
      setCpLat('');
      setCpLng('');
    }
  };

  const generateQRCodes = async () => {
    setIsGenerating(true);
    const generated: QRData[] = [];
    
    for (const cp of checkpoints) {
      const payload = generateSignedQRPayload(cp.id, cp.lat, cp.lng);
      // Generate a high-resolution image for zooming and printing
      const dataUri = await QRCode.toDataURL(payload, { 
        width: 600,
        margin: 1,
        color: { dark: '#0f172a', light: '#ffffff' }
      });
      generated.push({ id: cp.id, name: cp.name, lat: cp.lat, lng: cp.lng, qrDataUri: dataUri });
    }
    
    setQrData(generated);
    setIsGenerating(false);
  };

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    try {
      const blob = await pdf(<QRSheetPDF checkpoints={qrData} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'rakshak-checkpoints.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to generate PDF:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto text-slate-800">
      <div className="flex items-center gap-3 mb-8">
        <Shield className="h-8 w-8 text-blue-600" />
        <h1 className="text-3xl font-bold">Cryptographic QR Generator</h1>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8">
        <form onSubmit={handleAddCheckpoint} className="flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-600 mb-1">Checkpoint Name</label>
            <input 
              type="text" value={cpName} onChange={(e) => setCpName(e.target.value)} 
              placeholder="e.g., North Gate" className="w-full rounded-lg border border-slate-300 px-4 py-2" required
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-slate-600 mb-1">Checkpoint ID</label>
            <input 
              type="text" value={cpId} onChange={(e) => setCpId(e.target.value)} 
              placeholder="e.g., CP-001" className="w-full rounded-lg border border-slate-300 px-4 py-2" required
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-slate-600 mb-1">Latitude</label>
            <input 
              type="number" step="any" value={cpLat} onChange={(e) => setCpLat(e.target.value)} 
              placeholder="e.g., 20.5937" className="w-full rounded-lg border border-slate-300 px-4 py-2" required
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-slate-600 mb-1">Longitude</label>
            <input 
              type="number" step="any" value={cpLng} onChange={(e) => setCpLng(e.target.value)} 
              placeholder="e.g., 78.9629" className="w-full rounded-lg border border-slate-300 px-4 py-2" required
            />
          </div>
          <button type="submit" className="bg-slate-800 text-white px-6 py-2.5 rounded-lg flex items-center gap-2 hover:bg-slate-700 h-[42px]">
            <Plus className="h-4 w-4" /> Add
          </button>
        </form>
      </div>

      {checkpoints.length > 0 && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-xl font-semibold mb-4">Checkpoints ({checkpoints.length})</h2>
          
          {qrData.length === 0 && (
            <ul className="mb-6 divide-y divide-slate-100">
              {checkpoints.map(cp => (
                <li key={cp.id} className="py-3 text-slate-600 flex items-center gap-4">
                  <span className="font-medium">{cp.name}</span> 
                  <span className="text-xs bg-slate-100 px-2 py-1 rounded">{cp.id}</span>
                  <span className="text-xs flex items-center gap-1 text-slate-500">
                    <MapPin className="h-3 w-3"/> {cp.lat}, {cp.lng}
                  </span>
                </li>
              ))}
            </ul>
          )}
          
          {qrData.length === checkpoints.length ? (
            <div className="mt-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 mb-8">
                {qrData.map(cp => (
                  <div 
                    key={cp.id} 
                    onClick={() => setEnlargedQR(cp)}
                    className="border border-slate-200 rounded-xl p-4 flex flex-col items-center bg-slate-50 relative group cursor-pointer hover:border-blue-400 hover:shadow-md transition-all"
                  >
                    <div className="relative mb-3">
                      <img src={cp.qrDataUri} alt={cp.name} className="w-40 h-40 rounded-lg shadow-sm bg-white" />
                      <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                        <ZoomIn className="text-white h-8 w-8" />
                      </div>
                    </div>
                    <span className="font-bold text-slate-800 text-center">{cp.name}</span>
                    <span className="text-xs text-slate-500">ID: {cp.id}</span>
                  </div>
                ))}
              </div>
              
              <div className="flex justify-center border-t border-slate-100 pt-6">
                <button
                  onClick={handleDownloadPDF}
                  disabled={isDownloading}
                  className="bg-blue-600 text-white px-8 py-3 rounded-lg inline-flex items-center gap-2 hover:bg-blue-700 font-semibold disabled:opacity-70 shadow-sm"
                >
                  {isDownloading ? (
                    <><Loader2 className="h-5 w-5 animate-spin" /> Preparing PDF...</>
                  ) : (
                    <><Download className="h-5 w-5"/> Download Printable PDF Sheet</>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <button 
              onClick={generateQRCodes} 
              disabled={isGenerating}
              className="bg-emerald-600 text-white px-6 py-3 rounded-lg inline-flex items-center gap-2 hover:bg-emerald-700 font-semibold"
            >
              {isGenerating ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> Signing...</>
              ) : (
                'Generate Cryptographic Codes'
              )}
            </button>
          )}
        </div>
      )}

      {/* Full-screen Zoom Modal */}
      {enlargedQR && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm" 
          onClick={() => setEnlargedQR(null)}
        >
          <div 
            className="bg-white rounded-2xl p-8 max-w-md w-full relative flex flex-col items-center shadow-2xl" 
            onClick={e => e.stopPropagation()}
          >
            <button 
              onClick={() => setEnlargedQR(null)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
            <h3 className="text-3xl font-bold text-slate-800 mb-2 text-center">{enlargedQR.name}</h3>
            <p className="text-slate-500 mb-6 font-medium">ID: {enlargedQR.id}</p>
            
            <img 
              src={enlargedQR.qrDataUri} 
              alt={enlargedQR.name} 
              className="w-72 h-72 rounded-xl shadow-sm border border-slate-200 mb-6" 
            />
            
            <div className="flex items-center gap-2 text-slate-600 bg-slate-50 px-4 py-2 rounded-lg border border-slate-100">
              <MapPin className="h-5 w-5 text-blue-500"/> 
              <span className="font-mono text-sm">{enlargedQR.lat}, {enlargedQR.lng}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QRGenerator;