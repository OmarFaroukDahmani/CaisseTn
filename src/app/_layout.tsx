import { DarkTheme, DefaultTheme, ThemeProvider, Tabs } from 'expo-router';
import { useColorScheme, I18nManager } from 'react-native';
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { initDatabase } from '../services/db';
import { LanguageProvider, useLanguage } from '../constants/translations';

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { t, isRTL } = useLanguage();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colorScheme === 'dark' ? '#38bdf8' : '#0284c7',
          tabBarInactiveTintColor: '#888888',
          tabBarStyle: {
            paddingBottom: 6,
            paddingTop: 6,
            height: 60,
          },
          headerShown: true,
          headerStyle: {
            elevation: 1,
            shadowOpacity: 0.1,
          },
          headerTitleStyle: {
            fontWeight: 'bold',
            textAlign: isRTL ? 'right' : 'left',
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t('active_day'),
            tabBarLabel: t('active_day'),
            headerTitle: t('daily_reconciliation'),
            tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
              <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="products"
          options={{
            title: t('products'),
            tabBarLabel: t('products'),
            headerTitle: t('product_inventory'),
            tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
              <Ionicons name={focused ? 'list' : 'list-outline'} size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: t('history'),
            tabBarLabel: t('history'),
            headerTitle: t('closed_registers'),
            tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
              <Ionicons name={focused ? 'time' : 'time-outline'} size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: t('settings'),
            tabBarLabel: t('settings'),
            headerTitle: t('settings_cloud'),
            tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
              <Ionicons name={focused ? 'settings' : 'settings-outline'} size={24} color={color} />
            ),
          }}
        />
      </Tabs>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  useEffect(() => {
    initDatabase();

    if (!I18nManager.isRTL) {
      I18nManager.allowRTL(true);
      I18nManager.forceRTL(true);
    }
  }, []);

  return (
    <LanguageProvider>
      <RootLayoutNav />
    </LanguageProvider>
  );
}
