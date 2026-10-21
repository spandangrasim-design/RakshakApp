import React, { useState } from 'react';
import QRCode from 'qrcode';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { Shield, Download, Plus } from 'lucide-react';
import { generateSignedQRPayload } from '../utils/crypto';
import { QRSheetPDF, QRData } from '../components/QRSheetPDF';

const QRGenerator: React.FC = () => {
  const [checkpoints, setCheckpoints] = useState<{ id: string; name: string }[]>([]);
  const [qrData, setQrData] = useState<QRData[]>([]);
  const [cpName, setCpName] = useState('');
  const [cpId, setCpId] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleAddCheckpoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (cpName && cpId) {
      setCheckpoints([...checkpoints, { id: cpId, name: cpName }]);
      setCpName('');
      setCpId('');
    }
  };

  const generateQRCodes = async () => {
    setIsGenerating(true);
    const generated: QRData[] = [];
    
    for (const cp of checkpoints) {
      const payload = generateSignedQRPayload(cp.id);
      // Convert the payload directly into a Base64 image string for the PDF
      const dataUri = await QRCode.toDataURL(payload, { 
        width: 300,
        margin: 1,
        color: { dark: '#0f172a', light: '#ffffff' }
      });
      generated.push({ id: cp.id, name: cp.name, qrDataUri: dataUri });
    }
    
    setQrData(generated);
    setIsGenerating(false);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto text-slate-800">
      <div className="flex items-center gap-3 mb-8">
        <Shield className="h-8 w-8 text-blue-600" />
        <h1 className="text-3xl font-bold">Cryptographic QR Generator</h1>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8">
        <form onSubmit={handleAddCheckpoint} className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-600 mb-1">Checkpoint Name</label>
            <input 
              type="text" 
              value={cpName} 
              onChange={(e) => setCpName(e.target.value)} 
              placeholder="e.g., North Gate"
              className="w-full rounded-lg border border-slate-300 px-4 py-2"
              required
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-600 mb-1">Checkpoint ID</label>
            <input 
              type="text" 
              value={cpId} 
              onChange={(e) => setCpId(e.target.value)} 
              placeholder="e.g., CP-001"
              className="w-full rounded-lg border border-slate-300 px-4 py-2"
              required
            />
          </div>
          <button type="submit" className="bg-slate-800 text-white px-6 py-2.5 rounded-lg flex items-center gap-2 hover:bg-slate-700">
            <Plus className="h-4 w-4" /> Add
          </button>
        </form>
      </div>

      {checkpoints.length > 0 && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-xl font-semibold mb-4">Pending Checkpoints ({checkpoints.length})</h2>
          <ul className="mb-6 divide-y divide-slate-100">
            {checkpoints.map(cp => (
              <li key={cp.id} className="py-2 text-slate-600">{cp.name} <span className="text-xs bg-slate-100 px-2 py-1 rounded ml-2">{cp.id}</span></li>
            ))}
          </ul>
          
          {qrData.length === checkpoints.length ? (
            <PDFDownloadLink
              document={<QRSheetPDF checkpoints={qrData} />}
              fileName="rakshak-checkpoints.pdf"
              className="bg-blue-600 text-white px-6 py-3 rounded-lg inline-flex items-center gap-2 hover:bg-blue-700 font-semibold"
            >
              {({ loading }) => loading ? 'Preparing PDF...' : <><Download className="h-5 w-5"/> Download QR Sheet</>}
            </PDFDownloadLink>
          ) : (
            <button 
              onClick={generateQRCodes} 
              disabled={isGenerating}
              className="bg-emerald-600 text-white px-6 py-3 rounded-lg inline-flex items-center gap-2 hover:bg-emerald-700 font-semibold"
            >
              {isGenerating ? 'Signing...' : 'Generate Cryptographic Codes'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default QRGenerator;