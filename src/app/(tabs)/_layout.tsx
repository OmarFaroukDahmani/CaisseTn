import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../../constants/translations';

export default function TabsLayout() {
  const colorScheme = useColorScheme();
  const { t, isRTL } = useLanguage();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colorScheme === 'dark' ? '#38bdf8' : '#0369a1',
        tabBarInactiveTintColor: colorScheme === 'dark' ? '#94a3b8' : '#64748b',
        tabBarStyle: {
          direction: isRTL ? 'rtl' : 'ltr',
          backgroundColor: colorScheme === 'dark' ? '#0f172a' : '#ffffff',
          borderTopColor: colorScheme === 'dark' ? '#334155' : '#e2e8f0',
          paddingBottom: 8,
          paddingTop: 6,
          height: 64,
        },
        headerShown: true,
        headerStyle: {
          backgroundColor: colorScheme === 'dark' ? '#0f172a' : '#ffffff',
        },
        headerTintColor: colorScheme === 'dark' ? '#f8fafc' : '#0f172a',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        headerTitleAlign: isRTL ? 'right' : 'left',
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
        name="pos"
        options={{
          title: t('pos_register'),
          tabBarLabel: t('pos_register'),
          headerTitle: t('pos_register'),
          tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
            <Ionicons name={focused ? 'cart' : 'cart-outline'} size={24} color={color} />
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
        name="analytics"
        options={{
          title: t('analytics_reports'),
          tabBarLabel: t('analytics_reports'),
          headerTitle: t('analytics_reports'),
          tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
            <Ionicons name={focused ? 'bar-chart' : 'bar-chart-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="inventory" options={{ href: null }} />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('profile'),
          tabBarLabel: t('profile'),
          headerTitle: t('profile'),
          tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
            <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
