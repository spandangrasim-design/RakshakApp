import CryptoJS from 'crypto-js';

// In production, this should map to a VITE_QR_SECRET environment variable
const QR_SECRET = import.meta.env.VITE_QR_SECRET || 'default_rakshak_secret_key';

export const generateSignedQRPayload = (checkpointId: string, lat: string, lng: string): string => {
  // We sign the ID and coordinates together. If anyone alters the lat/long, the signature breaks.
  const dataToSign = `${checkpointId}|${lat}|${lng}`;
  const signature = CryptoJS.HmacSHA256(dataToSign, QR_SECRET).toString(CryptoJS.enc.Hex);
  
  // The Flutter app will parse this URL to get the expected location and verify the signature
  return `rakshak://cp?id=${checkpointId}&lat=${lat}&lng=${lng}&s=${signature}`;
};