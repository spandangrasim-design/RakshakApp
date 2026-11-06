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
  industryName?: string;
  industryLogoUrl?: string | null;
  industryAddress?: string;
  spandanLogoUrl?: string;
  rakshakLogoUrl?: string;
}

const getStoredBranding = () => {
  try {
    const custom = JSON.parse(localStorage.getItem('active_tenant_branding') || 'null');
    if (custom && custom.name) {
      return { name: custom.name, logoUrl: custom.logo_url || null };
    }
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    return {
      name: u.tenant_name || 'Rakshak Industrial Security',
      logoUrl: u.tenant_logo_url || null,
    };
  } catch {
    return { name: 'Rakshak Industrial Security', logoUrl: null };
  }
};

const styles = StyleSheet.create({
  page: {
    padding: 16,
    backgroundColor: '#ffffff',
  },
  outerFrame: {
    border: '3.5pt solid #000000',
    borderRadius: 10,
    padding: 14,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerBox: {
    width: '100%',
    borderBottom: '2pt solid #000000',
    paddingBottom: 6,
    alignItems: 'center',
  },
  industryLogo: {
    maxHeight: 46,
    maxWidth: 160,
    objectFit: 'contain',
    marginBottom: 4,
  },
  industryName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
    textTransform: 'uppercase',
    textAlign: 'center',
    letterSpacing: 1,
  },
  securityTag: {
    marginTop: 2,
    fontSize: 8.5,
    fontWeight: 'bold',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  checkpointBanner: {
    width: '100%',
    backgroundColor: '#f8fafc',
    border: '1.5pt solid #000000',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  cpLabel: {
    fontSize: 8.5,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  cpName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'center',
    marginTop: 2,
  },
  qrContainer: {
    border: '2.5pt solid #000000',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  qrImage: {
    width: 330,
    height: 330,
  },
  scanPrompt: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000000',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 4,
  },
  footer: {
    width: '100%',
    borderTop: '2pt solid #000000',
    paddingTop: 6,
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  footerColLeft: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  footerColRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    maxWidth: 240,
  },
  spandanLogo: {
    width: 115,
    height: 46,
    objectFit: 'contain',
    objectPosition: 'left',
    marginBottom: 4,
  },
  poweredLabel: {
    fontSize: 7.5,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  spandanTitle: {
    fontSize: 9.5,
    fontWeight: 'bold',
    color: '#000000',
    marginTop: 1,
  },
  footerIndustryLogo: {
    maxHeight: 32,
    maxWidth: 100,
    objectFit: 'contain',
    marginBottom: 3,
  },
  industryFooterName: {
    fontSize: 9.5,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'right',
  },
  industryFooterAddress: {
    fontSize: 7,
    color: '#64748b',
    textAlign: 'right',
    marginTop: 2,
    lineHeight: 1.2,
  },
});

export const QRSheetPDF: React.FC<QRSheetPDFProps> = ({
  checkpoints,
  industryName,
  industryAddress,
  industryLogoUrl,
  spandanLogoUrl,
}) => {
  const brand = getStoredBranding();
  const resolvedName = industryName || brand.name;
  const resolvedLogo = industryLogoUrl !== undefined ? industryLogoUrl : brand.logoUrl;
  const resolvedAddress = industryAddress || (brand as any).address || '';
  const resolvedSpandanLogo = spandanLogoUrl || (typeof window !== 'undefined' ? window.location.origin + '/branding/spandan-it-logo.png' : '/branding/spandan-it-logo.png');

  return (
    <Document>
      {checkpoints.map((cp) => (
        <Page key={cp.id} size="A4" orientation="portrait" style={styles.page}>
          <View style={styles.outerFrame}>
            {/* Top: Industry Logo & Industry Name */}
            <View style={styles.headerBox}>
              {resolvedLogo ? <Image src={resolvedLogo} style={styles.industryLogo} /> : null}
              <Text style={styles.industryName}>{resolvedName}</Text>
              <Text style={styles.securityTag}>Official Security Checkpoint</Text>
            </View>

            {/* Checkpoint / Patrol Point Name */}
            <View style={styles.checkpointBanner}>
              <Text style={styles.cpLabel}>Checkpoint / Patrol Point Name</Text>
              <Text style={styles.cpName}>{cp.name}</Text>
            </View>

            {/* Large QR Code (>60% A4 width) */}
            <View style={styles.qrContainer}>
              <Image src={cp.qrDataUri} style={styles.qrImage} />
            </View>

            {/* Scan Instruction */}
            <Text style={styles.scanPrompt}>Scan During Patrol Round</Text>

            {/* Footer: Powered By Spandan IT & Industry Info */}
            <View style={styles.footer}>
              {/* Left: Spandan IT Professionals */}
              <View style={styles.footerColLeft}>
                {resolvedSpandanLogo ? <Image src={resolvedSpandanLogo} style={styles.spandanLogo} /> : null}
                <Text style={styles.poweredLabel}>POWERED BY</Text>
                <Text style={styles.spandanTitle}>Spandan IT Professionals</Text>
              </View>

              {/* Right: Industry Name, Address & Logo */}
              <View style={styles.footerColRight}>
                {resolvedLogo ? <Image src={resolvedLogo} style={styles.footerIndustryLogo} /> : null}
                <Text style={styles.industryFooterName}>{resolvedName}</Text>
                {resolvedAddress ? <Text style={styles.industryFooterAddress}>{resolvedAddress}</Text> : null}
              </View>
            </View>
          </View>
        </Page>
      ))}
    </Document>
  );
};

export default QRSheetPDF;
