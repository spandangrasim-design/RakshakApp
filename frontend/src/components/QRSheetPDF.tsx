import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { 
    padding: 30, 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    justifyContent: 'flex-start' 
  },
  qrCard: { 
    width: '30%', 
    margin: '1.5%', 
    padding: 15, 
    border: '1pt solid #cbd5e1', 
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#ffffff'
  },
  image: { width: 120, height: 120, marginBottom: 10 },
  title: { fontSize: 14, fontWeight: 'bold', color: '#0f172a', marginBottom: 4 },
  subtitle: { fontSize: 8, color: '#64748b' }
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