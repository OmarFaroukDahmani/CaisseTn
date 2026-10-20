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
  getBackupSpreadsheetUrl,
  disconnectGoogle,
  syncRegisterToGoogle,
} from '../../services/googleSheets';
import { getCurrency, useLanguage, Language } from '../../constants/translations';
import { Typography } from '../../constants/theme';

WebBrowser.maybeCompleteAuthSession();

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim();
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
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState(restaurantName);
  const [editAddress, setEditAddress] = useState(restaurantAddress);
  const [editPhone, setEditPhone] = useState(restaurantPhone);
  const [editCurrency, setEditCurrency] = useState(currencySymbol);

  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: googleAndroidClientId || 'missing-android-client-id.apps.googleusercontent.com',
    iosClientId: '768910411894-dummyios.apps.googleusercontent.com',
    webClientId: '768910411894-dummyweb.apps.googleusercontent.com',
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

  const handleOpenGoogleSheet = async () => {
    const accessToken = getSetting('google_access_token');
    if (!accessToken) {
      Alert.alert('Not Connected', 'Please sign in with Google to open the backup spreadsheet.');
      return;
    }

    try {
      const url = await getBackupSpreadsheetUrl(accessToken);
      refreshSyncStatus();
      await Linking.openURL(url);
    } catch (error) {
      console.error('Failed to open Google Sheets backup:', error);
      Alert.alert('Unable to Open Google Sheet', 'Please check your Google connection and try again.');
    }
  };

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

  const startEditingProfile = () => {
    setEditName(restaurantName);
    setEditAddress(restaurantAddress);
    setEditPhone(restaurantPhone);
    setEditCurrency(currencySymbol);
    setIsEditingProfile(true);
  };

  const cancelEditingProfile = () => {
    setIsEditingProfile(false);
  };

  const saveRestaurantProfile = () => {
    try {
      setSetting('restaurant_name', editName.trim());
      setSetting('restaurant_address', editAddress.trim());
      setSetting('restaurant_phone', editPhone.trim());
      setSetting('currency_symbol', editCurrency.trim());
      setRestaurantName(editName.trim());
      setRestaurantAddress(editAddress.trim());
      setRestaurantPhone(editPhone.trim());
      setCurrencySymbol(editCurrency.trim());
      setIsEditingProfile(false);
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
      const extension = suggestedExtension && /^[a-zA-Z0-9]+$/.test(suggestedExtension) ? suggestedExtension : 'jpg';
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

  return (
    <ScrollView style={[styles.container, isDark ? styles.bgDark : styles.bgLight, { direction: isRTL ? 'rtl' : 'ltr' }]}>
      <View style={[styles.profileHeader, isDark ? styles.cardDark : styles.cardLight]}>
        <TouchableOpacity style={styles.avatarContainer} onPress={showImageSourceOptions}>
          {restaurantLogoUri ? (
            <Image source={{ uri: restaurantLogoUri }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="restaurant-outline" size={40} color="#fff" />
            </View>
          )}
          <View style={styles.cameraBadge}>
            <Ionicons name="camera" size={14} color="#fff" />
          </View>
        </TouchableOpacity>
        <View style={styles.profileInfo}>
          <Text style={[styles.profileName, isDark ? styles.textDark : styles.textLight]}>
            {restaurantName || t('profile')}
          </Text>
          {restaurantPhone ? (
            <Text style={styles.profileDetail}>{restaurantPhone}</Text>
          ) : null}
          {restaurantAddress ? (
            <Text style={styles.profileDetail}>{restaurantAddress}</Text>
          ) : null}
        </View>
        {!isEditingProfile && (
          <TouchableOpacity style={styles.editButton} onPress={startEditingProfile}>
            <Ionicons name="pencil" size={18} color="#0284c7" />
          </TouchableOpacity>
        )}
      </View>

      {isEditingProfile && (
        <View style={[styles.card, isDark ? styles.cardDark : styles.cardLight]}>
          <Text style={[styles.profileFieldLabel, isDark ? styles.textDark : styles.textLight]}>{t('restaurant_name')}</Text>
          <TextInput
            value={editName}
            onChangeText={setEditName}
            placeholder={t('restaurant_name')}
            placeholderTextColor="#888"
            style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
          />
          <Text style={[styles.profileFieldLabel, isDark ? styles.textDark : styles.textLight]}>{t('restaurant_address')}</Text>
          <TextInput
            value={editAddress}
            onChangeText={setEditAddress}
            placeholder={t('restaurant_address')}
            placeholderTextColor="#888"
            style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
          />
          <Text style={[styles.profileFieldLabel, isDark ? styles.textDark : styles.textLight]}>{t('restaurant_phone')}</Text>
          <TextInput
            value={editPhone}
            onChangeText={setEditPhone}
            placeholder={t('restaurant_phone')}
            placeholderTextColor="#888"
            keyboardType="phone-pad"
            style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
          />
          <Text style={[styles.profileFieldLabel, isDark ? styles.textDark : styles.textLight]}>{t('currency_symbol')}</Text>
          <TextInput
            value={editCurrency}
            onChangeText={setEditCurrency}
            placeholder="TND"
            placeholderTextColor="#888"
            style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
          />
          <View style={styles.editActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={cancelEditingProfile}>
              <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={saveRestaurantProfile}>
              <Text style={styles.saveBtnText}>{t('save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.sectionHeader}>
        <Ionicons name="grid-outline" size={20} color={isDark ? '#38bdf8' : '#0284c7'} />
        <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>{t('quick_access')}</Text>
      </View>
      <View style={[styles.quickAccessGrid, isDark ? styles.cardDark : styles.cardLight]}>
        <TouchableOpacity style={styles.quickAccessItem} onPress={() => router.push('/analytics')}>
          <View style={[styles.quickAccessIcon, { backgroundColor: '#e0f2fe' }]}>
            <Ionicons name="bar-chart" size={24} color="#0284c7" />
          </View>
          <Text style={[styles.quickAccessLabel, isDark ? styles.textDark : styles.textLight]}>{t('analytics_reports')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickAccessItem} onPress={() => router.push('/history')}>
          <View style={[styles.quickAccessIcon, { backgroundColor: '#fce7f3' }]}>
            <Ionicons name="time" size={24} color="#db2777" />
          </View>
          <Text style={[styles.quickAccessLabel, isDark ? styles.textDark : styles.textLight]}>{t('sales_shift_history')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickAccessItem} onPress={replayGuide}>
          <View style={[styles.quickAccessIcon, { backgroundColor: '#d1fae5' }]}>
            <Ionicons name="help-circle" size={24} color="#059669" />
          </View>
          <Text style={[styles.quickAccessLabel, isDark ? styles.textDark : styles.textLight]}>{t('rewatch_guide')}</Text>
        </TouchableOpacity>
      </View>

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
                <Ionicons name="checkmark-circle" size={18} color="#0284c7" style={{ marginStart: 6 }} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Ionicons name="cloud-done-outline" size={20} color={isDark ? '#38bdf8' : '#0284c7'} />
        <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>Cloud Sync</Text>
      </View>
      <View style={[styles.card, isDark ? styles.cardDark : styles.cardLight]}>
        {connected ? (
          <View>
            <View style={styles.syncUserRow}>
              <View style={styles.syncAvatar}>
                <Ionicons name="person" size={22} color="#fff" />
              </View>
              <View style={styles.syncUserInfo}>
                <Text style={[styles.syncUserName, isDark ? styles.textDark : styles.textLight]}>{user?.name}</Text>
                <Text style={styles.syncUserEmail}>{user?.email}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.backupBtn} onPress={handleFullBackup}>
              <Ionicons name="sync" size={18} color="#fff" />
              <Text style={styles.backupBtnText}>Force Backup</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backupBtn} onPress={handleOpenGoogleSheet}>
              <Ionicons name="open-outline" size={18} color="#fff" />
              <Text style={styles.backupBtnText}>Open Google Sheet</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
              <Ionicons name="log-out" size={18} color="#ef4444" />
              <Text style={styles.disconnectBtnText}>Disconnect</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.disconnectedContainer}>
            <Ionicons name="logo-google" size={36} color="#ea4335" style={{ marginBottom: 10 }} />
            <Text style={[styles.promptTitle, isDark ? styles.textDark : styles.textLight]}>Link Google Sheets</Text>
            <Text style={styles.promptDesc}>Sync daily sales to Google Drive for backup.</Text>
            {!googleAndroidClientId && (
              <Text style={styles.configWarning}>
                Google Sign-In is not configured in this build. Set EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID in the EAS build environment and rebuild.
              </Text>
            )}
            <TouchableOpacity
              style={[styles.connectBtn, (!request || !googleAndroidClientId) && styles.connectBtnDisabled]}
              disabled={!request || !googleAndroidClientId}
              onPress={() => { void promptAsync(); }}
            >
              <Text style={styles.connectBtnText}>Sign In with Google</Text>
            </TouchableOpacity>
          </View>
        )}
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
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    borderRadius: 16,
    gap: 16,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#0284c7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    end: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#0284c7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: Typography.sectionTitle,
    fontWeight: Typography.bold,
    marginBottom: 4,
  },
  profileDetail: {
    fontSize: Typography.label,
    color: '#64748b',
    marginTop: 2,
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 8,
  },
  sectionTitle: {
    fontSize: Typography.sectionTitle,
    fontWeight: Typography.bold,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
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
    fontSize: Typography.label,
    fontWeight: Typography.semibold,
    marginBottom: 6,
  },
  input: {
    borderRadius: 8,
    padding: 12,
    fontSize: Typography.body,
    borderWidth: 1,
    marginBottom: 12,
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
  editActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#64748b',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#fff',
    fontSize: Typography.label,
    fontWeight: Typography.bold,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#0284c7',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: Typography.label,
    fontWeight: Typography.bold,
  },
  quickAccessGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
  },
  quickAccessItem: {
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  quickAccessIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickAccessLabel: {
    fontSize: Typography.caption,
    fontWeight: Typography.semibold,
    textAlign: 'center',
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
    fontSize: Typography.label,
    fontWeight: Typography.semibold,
    color: '#475569',
  },
  languageButtonTextActive: {
    color: '#0284c7',
  },
  syncUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  syncAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0284c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginStart: 12,
  },
  syncUserInfo: {
    flex: 1,
  },
  syncUserName: {
    fontSize: Typography.bodyLarge,
    fontWeight: Typography.bold,
  },
  syncUserEmail: {
    fontSize: Typography.label,
    color: '#64748b',
    marginTop: 2,
  },
  backupBtn: {
    backgroundColor: '#0284c7',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    gap: 8,
  },
  backupBtnText: {
    color: '#fff',
    fontSize: Typography.label,
    fontWeight: Typography.bold,
  },
  disconnectBtn: {
    borderColor: '#ef4444',
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  disconnectBtnText: {
    color: '#ef4444',
    fontSize: Typography.label,
    fontWeight: Typography.bold,
  },
  disconnectedContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  promptTitle: {
    fontSize: Typography.sectionTitle,
    fontWeight: Typography.bold,
    marginBottom: 6,
  },
  promptDesc: {
    fontSize: Typography.label,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
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
  connectBtnDisabled: {
    opacity: 0.5,
  },
  configWarning: {
    color: '#b45309',
    fontSize: Typography.label,
    lineHeight: 18,
    marginBottom: 12,
    paddingHorizontal: 8,
    textAlign: 'center',
  },
  connectBtnText: {
    color: '#fff',
    fontSize: Typography.body,
    fontWeight: Typography.bold,
  },
});
