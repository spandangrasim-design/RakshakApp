import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';

export interface QRData {
  id: string;
  name: string;
  lat: string;
  lng: string;
  qrDataUri: string;
}

interface QRSheetPDFProps {
  checkpoints: QRData[];
}

const styles = StyleSheet.create({
  page: {
    padding: 35,
    backgroundColor: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '100%',
  },
  header: {
    alignItems: 'center',
    marginBottom: 10,
  },
  appName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e3a8a', // Deep Blue
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  subHeader: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 4,
  },
  card: {
    border: '2px solid #e2e8f0',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '85%',
    backgroundColor: '#f8fafc',
  },
  qrImage: {
    width: 280,
    height: 280,
    marginBottom: 20,
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 8,
  },
  cpName: {
    fontSize: 24,
    fontWeight: 'heavy',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 6,
  },
  cpIdBadge: {
    fontSize: 12,
    color: '#1e40af',
    backgroundColor: '#dbeafe',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 10,
    fontWeight: 'bold',
  },
  coordsText: {
    fontSize: 10,
    color: '#64748b',
    fontFamily: 'Courier',
  },
  footer: {
    alignItems: 'center',
    borderTop: '1px dashed #cbd5e1',
    paddingTop: 12,
    width: '100%',
  },
  instructionText: {
    fontSize: 9,
    color: '#94a3b8',
    textAlign: 'center',
  },
});

export const QRSheetPDF: React.FC<QRSheetPDFProps> = ({ checkpoints }) => (
  <Document>
    {checkpoints.map((cp) => (
      // A separate <Page> for EVERY checkpoint -> 1 QR per page!
      <Page key={cp.id} size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.appName}>Rakshak Security Patrol</Text>
          <Text style={styles.subHeader}>Official Guard Tour Verification Checkpoint</Text>
        </View>

        <View style={styles.card}>
          <Image src={cp.qrDataUri} style={styles.qrImage} />
          <Text style={styles.cpName}>{cp.name}</Text>
          <Text style={styles.cpIdBadge}>ID: {cp.id}</Text>
          <Text style={styles.coordsText}>
            Lat: {cp.lat} | Lng: {cp.lng}
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.instructionText}>
            Scan using Rakshak Guard App during assigned patrol routine.
          </Text>
          <Text style={styles.instructionText}>
            Tampering with or relocating this QR code will invalidate patrol logs.
          </Text>
        </View>
      </Page>
    ))}
  </Document>
);