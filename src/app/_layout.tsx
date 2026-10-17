import { DarkTheme, DefaultTheme, ThemeProvider, Stack, useRouter } from 'expo-router';
import { useColorScheme, I18nManager, TouchableOpacity, View } from 'react-native';
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { initDatabase } from '../services/db';
import { LanguageProvider, useLanguage } from '../constants/translations';
import { OnboardingProvider } from '../components/onboarding-guide';

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { t, isRTL } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(isRTL);
  }, [isRTL]);

  const renderBackButton = () => (
    <TouchableOpacity
      onPress={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/settings');
      }}
      accessibilityRole="button"
      accessibilityLabel={t('back')}
      style={{ paddingHorizontal: 12, paddingVertical: 8 }}
    >
      <Ionicons
        name={isRTL ? 'arrow-forward' : 'arrow-back'}
        size={23}
        color={colorScheme === 'dark' ? '#f8fafc' : '#0f172a'}
      />
    </TouchableOpacity>
  );

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1, direction: isRTL ? 'rtl' : 'ltr' }}>
        <Stack
          screenOptions={{
            headerShown: true,
            headerTitleStyle: {
              fontWeight: 'bold',
            },
            headerTitleAlign: isRTL ? 'right' : 'left',
          }}
        >
          <Stack.Screen
            name="(tabs)"
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="analytics"
            options={{
              title: t('z_report'),
              headerBackTitle: t('profile'),
              headerLeft: renderBackButton,
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="history"
            options={{
              title: t('closed_registers'),
              headerBackTitle: t('profile'),
              headerLeft: renderBackButton,
              gestureEnabled: true,
            }}
          />
        </Stack>
      </View>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  useEffect(() => {
    initDatabase();
  }, []);

  return (
    <LanguageProvider>
      <OnboardingProvider>
        <RootLayoutNav />
      </OnboardingProvider>
    </LanguageProvider>
  );
}
