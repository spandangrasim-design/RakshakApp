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
    padding: 24,
    backgroundColor: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    height: '100%',
  },
  outerFrame: {
    border: '4pt solid #000000',
    borderRadius: 12,
    padding: 20,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerBox: {
    width: '100%',
    borderBottom: '2.5pt solid #000000',
    paddingBottom: 12,
    alignItems: 'center',
  },
  industryLogo: {
    height: 52,
    objectFit: 'contain',
    marginBottom: 6,
  },
  industryName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000000',
    textTransform: 'uppercase',
    textAlign: 'center',
    letterSpacing: 1,
  },
  securityTag: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: 'bold',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  checkpointBanner: {
    width: '100%',
    backgroundColor: '#f1f5f9',
    border: '1.5pt solid #000000',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  cpLabel: {
    fontSize: 9,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  cpName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'center',
    marginTop: 3,
  },
  qrContainer: {
    border: '3pt solid #000000',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  // 340pt is ~62% of A4 Portrait width (595pt)
  qrImage: {
    width: 330,
    height: 330,
  },
  idBox: {
    border: '1.5pt solid #000000',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    marginTop: 4,
  },
  idText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#000000',
    fontFamily: 'Courier',
  },
  scanPrompt: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000000',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 6,
  },
  coordsText: {
    fontSize: 8.5,
    color: '#475569',
    fontFamily: 'Courier',
    marginTop: 2,
  },
  footer: {
    width: '100%',
    borderTop: '2.5pt solid #000000',
    paddingTop: 10,
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerColLeft: {
    display: 'flex',
    flexDirection: 'column',
  },
  footerColRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  poweredLabel: {
    fontSize: 7.5,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  rakshakTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#000000',
    textTransform: 'uppercase',
    marginTop: 1,
  },
  spandanLogo: {
    width: 38,
    height: 38,
    objectFit: 'contain',
    marginBottom: 4,
  },
  footerIndustryLogo: {
    width: 38,
    height: 38,
    objectFit: 'contain',
    marginBottom: 4,
  },
  industryFooterName: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'right',
  },
  industryFooterAddress: {
    fontSize: 7.5,
    color: '#475569',
    textAlign: 'right',
    marginTop: 2,
    maxWidth: 220,
  },
  spandanTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#000000',
    marginTop: 1,
  },
  partnerLogo: {
    height: 26,
    objectFit: 'contain',
    marginBottom: 2,
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
                {spandanLogoUrl ? <Image src={spandanLogoUrl} style={styles.spandanLogo} /> : null}
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
