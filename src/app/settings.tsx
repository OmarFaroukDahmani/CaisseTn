import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  useColorScheme,
  ScrollView,
  Switch,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { Ionicons } from '@expo/vector-icons';
import { getSetting, setSetting, deleteSetting, getRegisterHistory, getRegisterDetails } from '../services/db';
import {
  isGoogleConnected,
  getGoogleUser,
  disconnectGoogle,
  syncRegisterToGoogle,
} from '../services/googleSheets';
import { useLanguage, Language } from '../constants/translations';

// Complete authentication sessions on web
WebBrowser.maybeCompleteAuthSession();

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t, language, setLanguage } = useLanguage();

  const [connected, setConnected] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState('');
  
  // Custom Client IDs for self-hosting (optional for users)
  const [customWebClientId, setCustomWebClientId] = useState('');
  const [manualTokenInput, setManualTokenInput] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Initialize expo-auth-session with custom or default IDs
  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: '768910411894-dummyandroid.apps.googleusercontent.com',
    iosClientId: '768910411894-dummyios.apps.googleusercontent.com',
    webClientId: customWebClientId || '768910411894-dummyweb.apps.googleusercontent.com',
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file'
    ],
  });

  useEffect(() => {
    refreshSyncStatus();
    const storedWebId = getSetting('custom_web_client_id') || '';
    setCustomWebClientId(storedWebId);
  }, []);

  useEffect(() => {
    if (response?.type === 'success' && response.authentication?.accessToken) {
      const token = response.authentication.accessToken;
      handleGoogleLoginSuccess(token);
    }
  }, [response]);

  const refreshSyncStatus = () => {
    const isConn = isGoogleConnected();
    setConnected(isConn);
    setUser(getGoogleUser());
    setSpreadsheetId(getSetting('google_spreadsheet_id') || 'Not created yet');
  };

  const handleGoogleLoginSuccess = async (accessToken: string) => {
    try {
      setSetting('google_access_token', accessToken);
      
      // Fetch user profile info from Google API
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      
      if (res.ok) {
        const profile = await res.json();
        setSetting('google_user_name', profile.name || 'Google User');
        setSetting('google_user_email', profile.email || 'user@gmail.com');
      } else {
        setSetting('google_user_name', 'Sync Account');
        setSetting('google_user_email', 'connected@gmail.com');
      }
      
      Alert.alert('Google Connected', 'Your Google account was linked successfully.');
      refreshSyncStatus();
    } catch (error) {
      console.error('Error fetching Google user details:', error);
      Alert.alert('Sync Error', 'Connected to Google, but failed to retrieve user details.');
    }
  };

  const handleManualTokenSubmit = () => {
    if (!manualTokenInput.trim()) {
      Alert.alert('Error', 'Please enter a valid Google OAuth Access Token.');
      return;
    }
    handleGoogleLoginSuccess(manualTokenInput.trim());
    setManualTokenInput('');
  };

  const handleSaveCustomWebId = () => {
    setSetting('custom_web_client_id', customWebClientId.trim());
    Alert.alert('Saved', 'Custom Web Client ID saved successfully.');
  };

  const handleDisconnect = () => {
    Alert.alert('Disconnect Google', 'Are you sure you want to stop syncing and sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          disconnectGoogle();
          refreshSyncStatus();
          Alert.alert('Disconnected', 'Successfully unlinked your Google Drive.');
        },
      },
    ]);
  };

  // Full manual backup flow
  const handleFullBackup = async () => {
    if (!connected) {
      Alert.alert('Not Connected', 'Please sign in with Google to sync backups.');
      return;
    }

    try {
      const history = getRegisterHistory().filter((r) => r.is_closed === 1);
      
      if (history.length === 0) {
        Alert.alert('No Data', 'No closed daily registers are available to back up.');
        return;
      }

      Alert.alert('Backup in Progress', `Backing up ${history.length} historical closed days. Please wait...`);

      let successCount = 0;
      for (const reg of history) {
        const details = getRegisterDetails(reg.id);
        if (!details) continue;

        let expectedRevenue = 0;
        let expectedCost = 0;
        details.items.forEach((item) => {
          const sold = Math.max(0, item.opening_count - item.closing_count);
          expectedRevenue += sold * (item.selling_price || 0);
          expectedCost += sold * (item.cost_price || 0);
        });

        const grossProfit = Math.max(0, expectedRevenue - expectedCost);
        const netProfit = grossProfit - reg.expenses;
        const discrepancy = reg.actual_cash - (expectedRevenue - reg.expenses);

        const syncSuccess = await syncRegisterToGoogle({
          date: reg.date,
          expenses: reg.expenses,
          actual_cash: reg.actual_cash,
          expected_revenue: expectedRevenue,
          gross_profit: grossProfit,
          net_profit: netProfit,
          discrepancy: discrepancy,
        });

        if (syncSuccess) successCount++;
      }

      Alert.alert('Backup Complete', `Successfully backed up ${successCount}/${history.length} daily logs to Google Sheets.`);
      refreshSyncStatus();
    } catch (err) {
      console.error('Manual backup error:', err);
      Alert.alert('Backup Failed', 'An error occurred during full sync.');
    }
  };

  return (
    <ScrollView style={[styles.container, isDark ? styles.bgDark : styles.bgLight]}>
      {/* Language Section */}
      <View style={styles.sectionHeader}>
        <Ionicons name="language-outline" size={20} color={isDark ? '#38bdf8' : '#0284c7'} />
        <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>{t('language')}</Text>
      </View>

      <View style={[styles.card, isDark ? styles.cardDark : styles.cardLight]}>
        <View style={styles.languageOptions}>
          {([
            { code: 'ar', label: t('language_ar') },
            { code: 'fr', label: t('language_fr') },
            { code: 'en', label: t('language_en') },
          ] as { code: Language; label: string }[]).map(({ code, label }) => (
            <TouchableOpacity
              key={code}
              style={[
                styles.languageButton,
                language === code && styles.languageButtonActive,
                isDark && language !== code && styles.languageButtonDark,
              ]}
              onPress={() => setLanguage(code)}
            >
              <Text
                style={[
                  styles.languageButtonText,
                  language === code && styles.languageButtonTextActive,
                ]}
              >
                {label}
              </Text>
              {language === code && (
                <Ionicons name="checkmark-circle" size={18} color="#0284c7" style={{ marginLeft: 6 }} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Google Cloud Backup Section */}
      <View style={styles.sectionHeader}>
        <Ionicons name="cloud-done-outline" size={20} color={isDark ? '#38bdf8' : '#0284c7'} />
        <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>Cloud Sync Backup</Text>
      </View>

      <View style={[styles.card, isDark ? styles.cardDark : styles.cardLight]}>
        {connected ? (
          <View>
            <View style={styles.profileRow}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={24} color="#fff" />
              </View>
              <View style={styles.profileInfo}>
                <Text style={[styles.profileName, isDark ? styles.textDark : styles.textLight]}>
                  {user?.name}
                </Text>
                <Text style={styles.profileEmail}>{user?.email}</Text>
              </View>
            </View>

            <View style={styles.sheetInfoRow}>
              <Text style={styles.sheetInfoLabel}>Target Google Sheet:</Text>
              <Text style={[styles.sheetInfoValue, isDark ? styles.textDark : styles.textLight]} numberOfLines={1}>
                Shop_Daily_Register_Backup
              </Text>
            </View>

            {spreadsheetId !== 'Not created yet' && (
              <View style={styles.sheetInfoRow}>
                <Text style={styles.sheetInfoLabel}>Spreadsheet ID:</Text>
                <Text style={styles.sheetIdText} numberOfLines={1}>
                  {spreadsheetId}
                </Text>
              </View>
            )}

            <View style={styles.actionsDivider} />

            <TouchableOpacity style={styles.backupBtn} onPress={handleFullBackup}>
              <Ionicons name="sync" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.backupBtnText}>Force Backup Historical Records</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
              <Ionicons name="log-out" size={18} color="#ef4444" style={{ marginRight: 6 }} />
              <Text style={styles.disconnectBtnText}>Disconnect Google Account</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.disconnectedContainer}>
            <Ionicons name="logo-google" size={40} color="#ea4335" style={{ marginBottom: 12 }} />
            <Text style={[styles.promptTitle, isDark ? styles.textDark : styles.textLight]}>
              Link Google Sheets
            </Text>
            <Text style={styles.promptDesc}>
              Automatically sync your daily sales registers to a spreadsheet in your personal Google Drive for easy access and backup.
            </Text>

            <TouchableOpacity
              style={styles.connectBtn}
              disabled={!request}
              onPress={() => {
                promptAsync();
              }}
            >
              <Text style={styles.connectBtnText}>Sign In with Google</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Advanced / Troubleshooting Section */}
      <TouchableOpacity
        style={styles.advancedToggle}
        onPress={() => setShowAdvanced(!showAdvanced)}
      >
        <Text style={[styles.advancedToggleText, isDark ? styles.textDarkSub : styles.textLightSub]}>
          {showAdvanced ? 'Hide Advanced Options' : 'Show Advanced & Sandbox Sync'}
        </Text>
        <Ionicons
          name={showAdvanced ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={isDark ? '#94a3b8' : '#475569'}
        />
      </TouchableOpacity>

      {showAdvanced && (
        <View style={[styles.card, isDark ? styles.cardDark : styles.cardLight]}>
          <Text style={[styles.advancedTitle, isDark ? styles.textDark : styles.textLight]}>
            Developer Sandbox
          </Text>
          <Text style={styles.advancedDesc}>
            In development environments, you can manually supply a Google Access Token from OAuth Playground or Cloud Console.
          </Text>

          <TextInput
            placeholder="Paste Google Access Token (ya29...)"
            placeholderTextColor="#888"
            style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
            value={manualTokenInput}
            onChangeText={setManualTokenInput}
          />
          <TouchableOpacity style={styles.saveBtn} onPress={handleManualTokenSubmit}>
            <Text style={styles.saveBtnText}>Connect Using Token</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <Text style={[styles.advancedTitle, isDark ? styles.textDark : styles.textLight]}>
            Custom Web Client ID
          </Text>
          <TextInput
            placeholder="Google Web Client ID"
            placeholderTextColor="#888"
            style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
            value={customWebClientId}
            onChangeText={setCustomWebClientId}
          />
          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveCustomWebId}>
            <Text style={styles.saveBtnText}>Save Web Client ID</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* App Info / Documentation Section */}
      <View style={styles.sectionHeader}>
        <Ionicons name="information-circle-outline" size={20} color={isDark ? '#38bdf8' : '#0284c7'} />
        <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>App Information</Text>
      </View>

      <View style={[styles.card, isDark ? styles.cardDark : styles.cardLight]}>
        <Text style={[styles.infoTitle, isDark ? styles.textDark : styles.textLight]}>
          Local-First Architecture
        </Text>
        <Text style={styles.infoDesc}>
          Hsabi stores 100% of your products and daily journals on your device locally via SQLite. This means you do not need any internet connection to catalog, manage, count stock, or generate PDF reports. Your records stay yours.
        </Text>

        <View style={styles.divider} />

        <Text style={[styles.infoTitle, isDark ? styles.textDark : styles.textLight]}>
          Math & Math Integrity
        </Text>
        <Text style={styles.infoDesc}>
          1. Items Sold is calculated as Opening Stock minus Closing Stock.{'\n'}
          2. Expected Revenue is Items Sold multiplied by Selling Price.{'\n'}
          3. Drawer Discrepancy shows the variance between actual physical cash inside the drawer and the theoretical net sales (Expected Revenue minus Expenses). Positive indicates surplus, negative indicates cash shortage.
        </Text>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bgLight: {
    backgroundColor: '#f8fafc',
  },
  bgDark: {
    backgroundColor: '#0f172a',
  },
  textLight: {
    color: '#0f172a',
  },
  textDark: {
    color: '#f8fafc',
  },
  textLightSub: {
    color: '#475569',
  },
  textDarkSub: {
    color: '#94a3b8',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardLight: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderWidth: 1,
  },
  cardDark: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    borderWidth: 1,
  },
  disconnectedContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  promptTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  promptDesc: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 12,
  },
  connectBtn: {
    backgroundColor: '#ea4335',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  connectBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0284c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  profileInfo: {
    justifyContent: 'center',
  },
  profileName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  profileEmail: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  sheetInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  sheetInfoLabel: {
    fontSize: 13,
    color: '#64748b',
  },
  sheetInfoValue: {
    fontSize: 13,
    fontWeight: '600',
    maxWidth: '60%',
  },
  sheetIdText: {
    fontSize: 11,
    color: '#64748b',
    maxWidth: '50%',
  },
  actionsDivider: {
    height: 1,
    backgroundColor: '#475569',
    opacity: 0.15,
    marginVertical: 16,
  },
  backupBtn: {
    backgroundColor: '#0284c7',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  backupBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  disconnectBtn: {
    borderColor: '#ef4444',
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
  },
  disconnectBtnText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: 'bold',
  },
  advancedToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  advancedToggleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  advancedTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  advancedDesc: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 16,
    marginBottom: 12,
  },
  input: {
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  inputLight: {
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5e1',
    color: '#0f172a',
  },
  inputDark: {
    backgroundColor: '#0f172a',
    borderColor: '#334155',
    color: '#f8fafc',
  },
  saveBtn: {
    backgroundColor: '#475569',
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
    marginBottom: 16,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: '#475569',
    opacity: 0.15,
    marginVertical: 12,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  infoDesc: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
  languageOptions: {
    flexDirection: 'row',
    gap: 10,
  },
  languageButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f1f5f9',
  },
  languageButtonDark: {
    backgroundColor: '#0f172a',
    borderColor: '#334155',
  },
  languageButtonActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0284c7',
    borderWidth: 2,
  },
  languageButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  languageButtonTextActive: {
    color: '#0284c7',
  },
});
