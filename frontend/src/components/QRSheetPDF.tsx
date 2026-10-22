import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { 
    padding: 30, 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    justifyContent: 'center', // Centers everything on the A4 page
  },
  qrCard: { 
    width: '46%', // Two large cards per row
    margin: '2%', // Spacing to keep them centered and breathing
    padding: 24, 
    border: '2pt solid #cbd5e1', 
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#ffffff'
  },
  image: { width: 250, height: 250, marginBottom: 16 }, // Massive print size
  title: { fontSize: 22, fontWeight: 'bold', color: '#0f172a', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#64748b', marginBottom: 4 },
  coords: { fontSize: 10, color: '#94a3b8' }
});

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

export const QRSheetPDF: React.FC<QRSheetPDFProps> = ({ checkpoints }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {checkpoints.map((cp) => (
        <View key={cp.id} style={styles.qrCard}>
          <Image src={cp.qrDataUri} style={styles.image} />
          <Text style={styles.title}>{cp.name}</Text>
          <Text style={styles.subtitle}>ID: {cp.id}</Text>
          <Text style={styles.coords}>{cp.lat}, {cp.lng}</Text>
        </View>
      ))}
    </Page>
  </Document>
);