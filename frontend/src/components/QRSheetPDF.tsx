import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { 
    padding: 30, 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    justifyContent: 'space-between'
  },
  qrCard: { 
    width: '47%', 
    marginBottom: 20, 
    padding: 20, 
    border: '1pt solid #cbd5e1', 
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#ffffff'
  },
  image: { width: 220, height: 220, marginBottom: 15 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#0f172a', marginBottom: 6 },
  subtitle: { fontSize: 12, color: '#64748b' }
});

export interface QRData {
  id: string;
  name: string;
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
        </View>
      ))}
    </Page>
  </Document>
);