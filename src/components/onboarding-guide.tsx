import React, { createContext, useContext, useState, type ReactNode } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getSetting, setSetting } from '../services/db';
import { useLanguage, type TranslationKey } from '../constants/translations';

type OnboardingContextValue = {
  replayGuide: () => void;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

const steps: { icon: keyof typeof Ionicons.glyphMap; title: TranslationKey; description: TranslationKey }[] = [
  { icon: 'sparkles-outline' as const, title: 'tour_welcome_title', description: 'tour_welcome_description' },
  { icon: 'cart-outline' as const, title: 'tour_sales_title', description: 'tour_sales_description' },
  { icon: 'wallet-outline' as const, title: 'tour_cash_title', description: 'tour_cash_description' },
  { icon: 'person-circle-outline' as const, title: 'tour_profile_title', description: 'tour_profile_description' },
];

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const isDark = useColorScheme() === 'dark';
  const [stepIndex, setStepIndex] = useState(0);
  const [visible, setVisible] = useState(() => getSetting('hasCompletedOnboarding') !== 'true');

  const finish = () => {
    try {
      setSetting('hasCompletedOnboarding', 'true');
      setVisible(false);
      setStepIndex(0);
    } catch (error) {
      console.error('Could not save onboarding status:', error);
      Alert.alert(t('db_error'), String(error));
    }
  };

  const replayGuide = () => {
    setStepIndex(0);
    setVisible(true);
  };

  const step = steps[stepIndex];
  const advance = () => {
    if (stepIndex === steps.length - 1) {
      finish();
      return;
    }
    setStepIndex((current) => current + 1);
  };

  return (
    <OnboardingContext.Provider value={{ replayGuide }}>
      {children}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={finish}
        statusBarTranslucent
      >
        <View style={styles.backdrop}>
          <View style={[styles.card, isDark && styles.cardDark]}>
            <View style={styles.topRow}>
              <Text style={[styles.stepCount, isDark && styles.secondaryDark]}>
                {t('tour_step', { current: String(stepIndex + 1), total: String(steps.length) })}
              </Text>
              <Pressable onPress={finish} accessibilityRole="button" accessibilityLabel={t('skip_tour')}>
                <Text style={styles.skip}>{t('skip_tour')}</Text>
              </Pressable>
            </View>
            <View style={styles.iconCircle}>
              <Ionicons name={step.icon} size={38} color="#0284c7" />
            </View>
            <Text style={[styles.title, isDark && styles.textDark]}>{t(step.title)}</Text>
            <Text style={[styles.description, isDark && styles.secondaryDark]}>{t(step.description)}</Text>
            <View style={styles.dots}>
              {steps.map((item, index) => (
                <View key={item.title} style={[styles.dot, index === stepIndex && styles.activeDot]} />
              ))}
            </View>
            <Pressable style={styles.nextButton} onPress={advance} accessibilityRole="button">
              <Text style={styles.nextText}>
                {stepIndex === steps.length - 1 ? t('finish_tour') : t('next_tour_step')}
              </Text>
              {stepIndex < steps.length - 1 && (
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </OnboardingContext.Provider>
  );
}

export function useOnboardingGuide(): OnboardingContextValue {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error('useOnboardingGuide must be used within OnboardingProvider');
  return context;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
    elevation: 8,
  },
  cardDark: {
    backgroundColor: '#1e293b',
  },
  topRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepCount: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
  skip: {
    color: '#0284c7',
    fontSize: 14,
    fontWeight: '700',
    padding: 6,
  },
  iconCircle: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
    marginBottom: 18,
  },
  title: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  textDark: {
    color: '#f8fafc',
  },
  description: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    marginTop: 12,
    minHeight: 68,
  },
  secondaryDark: {
    color: '#cbd5e1',
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 22,
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#cbd5e1',
  },
  activeDot: {
    width: 22,
    backgroundColor: '#0284c7',
  },
  nextButton: {
    width: '100%',
    minHeight: 48,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    backgroundColor: '#0284c7',
  },
  nextText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
