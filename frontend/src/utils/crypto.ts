import CryptoJS from 'crypto-js';

// In production, this should map to a VITE_QR_SECRET environment variable in Cloudflare
const QR_SECRET = import.meta.env.VITE_QR_SECRET || 'default_rakshak_secret_key';

export const generateSignedQRPayload = (checkpointId: string): string => {
  const signature = CryptoJS.HmacSHA256(checkpointId, QR_SECRET).toString(CryptoJS.enc.Hex);
  // Matches the required payload structure for the Flutter mobile scanner
  return `rakshak://cp?id=${checkpointId}&s=${signature}`;
};