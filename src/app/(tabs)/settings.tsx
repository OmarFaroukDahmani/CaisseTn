import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  useColorScheme,
  ScrollView,
  Image,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useOnboardingGuide } from '../../components/onboarding-guide';
import { getSetting, setSetting, getRegisterHistory, getRegisterDetails } from '../../services/db';
import {
  isGoogleConnected,
  getGoogleUser,
  disconnectGoogle,
  syncRegisterToGoogle,
} from '../../services/googleSheets';
import { getCurrency, useLanguage, Language } from '../../constants/translations';

// Complete authentication sessions on web
WebBrowser.maybeCompleteAuthSession();

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t, language, setLanguage, isRTL } = useLanguage();
  const { replayGuide } = useOnboardingGuide();
  const router = useRouter();

  const [connected, setConnected] = useState(isGoogleConnected);
  const [user, setUser] = useState(getGoogleUser);
  const [spreadsheetId, setSpreadsheetId] = useState(() => getSetting('google_spreadsheet_id') || 'Not created yet');
  const [restaurantName, setRestaurantName] = useState(() => getSetting('restaurant_name') || '');
  const [restaurantAddress, setRestaurantAddress] = useState(() => getSetting('restaurant_address') || '');
  const [restaurantPhone, setRestaurantPhone] = useState(() => getSetting('restaurant_phone') || '');
  const [currencySymbol, setCurrencySymbol] = useState(() => getSetting('currency_symbol') || getCurrency(language));
  const [restaurantLogoUri, setRestaurantLogoUri] = useState<string | null>(() => getSetting('restaurant_logo_uri'));
  const [settingsOffset, setSettingsOffset] = useState<number | null>(null);
  const profileScrollRef = React.useRef<ScrollView>(null);
  
  // Custom Client IDs for self-hosting (optional for users)
  const [customWebClientId, setCustomWebClientId] = useState(() => getSetting('custom_web_client_id') || '');
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

  const refreshSyncStatus = useCallback(() => {
    const isConn = isGoogleConnected();
    setConnected(isConn);
    setUser(getGoogleUser());
    setSpreadsheetId(getSetting('google_spreadsheet_id') || 'Not created yet');
  }, []);

  const handleGoogleLoginSuccess = useCallback(async (accessToken: string) => {
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
  }, [refreshSyncStatus]);

  useEffect(() => {
    if (response?.type === 'success' && response.authentication?.accessToken) {
      void handleGoogleLoginSuccess(response.authentication.accessToken);
    }
  }, [response, handleGoogleLoginSuccess]);

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

  const saveRestaurantProfile = () => {
    try {
      setSetting('restaurant_name', restaurantName.trim());
      setSetting('restaurant_address', restaurantAddress.trim());
      setSetting('restaurant_phone', restaurantPhone.trim());
      setSetting('currency_symbol', currencySymbol.trim());
      Alert.alert(t('saved'), t('profile_saved'));
    } catch (error) {
      console.error('Could not save restaurant profile:', error);
      Alert.alert(t('db_error'), String(error));
    }
  };

  const showPermissionRationale = () => new Promise<boolean>((resolve) => {
    Alert.alert(t('logo_permission_title'), t('logo_permission_message'), [
      { text: t('cancel'), style: 'cancel', onPress: () => resolve(false) },
      { text: t('continue'), onPress: () => resolve(true) },
    ]);
  });

  const chooseRestaurantImage = async (source: 'camera' | 'gallery') => {
    if (!(await showPermissionRationale())) return;

    try {
      let permission = source === 'camera'
        ? await ImagePicker.getCameraPermissionsAsync()
        : await ImagePicker.getMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        permission = source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      }

      if (!permission.granted) {
        Alert.alert(t('permission_denied_title'), t('permission_denied_message'), [
          { text: t('cancel'), style: 'cancel' },
          {
            text: t('open_settings'),
            onPress: () => {
              void Linking.openSettings().catch((error) => {
                console.error('Could not open device settings:', error);
                Alert.alert(t('permission_denied_title'), String(error));
              });
            },
          },
        ]);
        return;
      }

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.85 });
      const asset = result.assets?.[0];
      if (result.canceled || !asset) return;
      if (!FileSystem.documentDirectory) throw new Error('Document storage is not available.');

      const suggestedExtension = asset.fileName?.split('.').pop() || asset.uri.split('.').pop()?.split('?')[0];
      const extension = suggestedExtension && /^[a-zA-Z0-9]+$/.test(suggestedExtension)
        ? suggestedExtension
        : 'jpg';
      const destination = `${FileSystem.documentDirectory}restaurant-branding-${Date.now()}.${extension}`;
      await FileSystem.copyAsync({ from: asset.uri, to: destination });
      setSetting('restaurant_logo_uri', destination);
      setRestaurantLogoUri(destination);
    } catch (error) {
      console.error('Could not select restaurant image:', error);
      Alert.alert(t('db_error'), String(error));
    }
  };

  const showImageSourceOptions = () => {
    Alert.alert(t('restaurant_image'), t('logo_permission_message'), [
      { text: t('take_photo'), onPress: () => { void chooseRestaurantImage('camera'); } },
      { text: t('choose_gallery'), onPress: () => { void chooseRestaurantImage('gallery'); } },
      { text: t('cancel'), style: 'cancel' },
    ]);
  };

  const openAppSettings = () => {
    if (settingsOffset !== null) {
      profileScrollRef.current?.scrollTo({ y: settingsOffset, animated: true });
    }
  };

  return (
    <ScrollView ref={profileScrollRef} style={[styles.container, isDark ? styles.bgDark : styles.bgLight]}>
      <TouchableOpacity
        style={styles.brandCover}
        onPress={showImageSourceOptions}
        accessibilityRole="button"
        accessibilityLabel={t('restaurant_image')}
      >
        {restaurantLogoUri ? (
          <Image source={{ uri: restaurantLogoUri }} style={styles.brandCoverImage} />
        ) : (
          <Ionicons name="restaurant-outline" size={48} color="#fff" />
        )}
        <View style={styles.brandCoverOverlay}>
          <Text style={styles.brandCoverTitle}>{restaurantName || t('profile')}</Text>
          <View style={styles.changeImageLabel}>
            <Ionicons name="camera-outline" size={16} color="#fff" />
            <Text style={styles.changeImageText}>{t('change_restaurant_image')}</Text>
          </View>
        </View>
      </TouchableOpacity>

      <View style={styles.sectionHeader}>
        <Ionicons name="business-outline" size={20} color={isDark ? '#38bdf8' : '#0284c7'} />
        <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>{t('restaurant_profile')}</Text>
      </View>
      <View style={[styles.card, isDark ? styles.cardDark : styles.cardLight]}>
        <Text style={[styles.profileFieldLabel, isDark ? styles.textDark : styles.textLight]}>{t('restaurant_name')}</Text>
        <TextInput
          value={restaurantName}
          onChangeText={setRestaurantName}
          placeholder={t('restaurant_name')}
          placeholderTextColor="#888"
          style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
        />
        <Text style={[styles.profileFieldLabel, isDark ? styles.textDark : styles.textLight]}>{t('restaurant_address')}</Text>
        <TextInput
          value={restaurantAddress}
          onChangeText={setRestaurantAddress}
          placeholder={t('restaurant_address')}
          placeholderTextColor="#888"
          style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
        />
        <Text style={[styles.profileFieldLabel, isDark ? styles.textDark : styles.textLight]}>{t('restaurant_phone')}</Text>
        <TextInput
          value={restaurantPhone}
          onChangeText={setRestaurantPhone}
          placeholder={t('restaurant_phone')}
          placeholderTextColor="#888"
          keyboardType="phone-pad"
          style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
        />
        <Text style={[styles.profileFieldLabel, isDark ? styles.textDark : styles.textLight]}>{t('currency_symbol')}</Text>
        <TextInput
          value={currencySymbol}
          onChangeText={setCurrencySymbol}
          placeholder="TND"
          placeholderTextColor="#888"
          style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
        />
        <TouchableOpacity style={styles.saveBtn} onPress={saveRestaurantProfile}>
          <Text style={styles.saveBtnText}>{t('save_profile')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.sectionHeader}>
        <Ionicons name="grid-outline" size={20} color={isDark ? '#38bdf8' : '#0284c7'} />
        <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>{t('quick_access')}</Text>
      </View>
      <View style={[styles.menuCard, isDark ? styles.cardDark : styles.cardLight]}>
        <TouchableOpacity style={styles.menuRow} onPress={() => router.push('/analytics')}>
          <Ionicons name="bar-chart-outline" size={22} color="#0284c7" />
          <View style={styles.menuTextColumn}>
            <Text style={[styles.menuLabel, isDark ? styles.textDark : styles.textLight]}>{t('analytics_reports')}</Text>
            <Text style={styles.menuDescription}>{t('analytics_reports_desc')}</Text>
          </View>
          <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color="#94a3b8" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuRow} onPress={() => router.push('/history')}>
          <Ionicons name="time-outline" size={22} color="#0284c7" />
          <View style={styles.menuTextColumn}>
            <Text style={[styles.menuLabel, isDark ? styles.textDark : styles.textLight]}>{t('sales_shift_history')}</Text>
            <Text style={styles.menuDescription}>{t('sales_shift_history_desc')}</Text>
          </View>
          <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color="#94a3b8" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.menuRow, styles.menuRowLast]} onPress={openAppSettings}>
          <Ionicons name="settings-outline" size={22} color="#0284c7" />
          <View style={styles.menuTextColumn}>
            <Text style={[styles.menuLabel, isDark ? styles.textDark : styles.textLight]}>{t('app_settings')}</Text>
            <Text style={styles.menuDescription}>{t('app_settings_desc')}</Text>
          </View>
          <Ionicons name="chevron-down" size={18} color="#94a3b8" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.menuRow, styles.menuRowLast]} onPress={replayGuide}>
          <Ionicons name="help-circle-outline" size={22} color="#0284c7" />
          <View style={styles.menuTextColumn}>
            <Text style={[styles.menuLabel, isDark ? styles.textDark : styles.textLight]}>{t('rewatch_guide')}</Text>
            <Text style={styles.menuDescription}>{t('rewatch_guide_desc')}</Text>
          </View>
          <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* Language Section */}
      <View style={styles.sectionHeader} onLayout={(event) => setSettingsOffset(event.nativeEvent.layout.y)}>
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
  brandCover: {
    height: 176,
    marginBottom: 4,
    backgroundColor: '#0369a1',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  brandCoverImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  brandCoverOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  brandCoverTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  changeImageLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  changeImageText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
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
  profileFieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  menuCard: {
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  menuRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#94a3b8',
  },
  menuRowLast: {
    borderBottomWidth: 0,
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  menuTextColumn: {
    flex: 1,
    paddingVertical: 8,
  },
  menuDescription: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
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
