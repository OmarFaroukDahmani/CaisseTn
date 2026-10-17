import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'], fontFamily: Fonts.sans },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'code' && styles.code,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: Typography.label,
    lineHeight: 18,
    fontWeight: Typography.medium,
  },
  smallBold: {
    fontSize: Typography.label,
    lineHeight: 18,
    fontWeight: Typography.bold,
  },
  default: {
    fontSize: Typography.body,
    lineHeight: 22,
    fontWeight: Typography.regular,
  },
  title: {
    fontSize: Typography.screenTitle,
    fontWeight: Typography.bold,
    lineHeight: 28,
  },
  subtitle: {
    fontSize: Typography.sectionTitle,
    lineHeight: 24,
    fontWeight: Typography.semibold,
  },
  link: {
    lineHeight: 20,
    fontSize: Typography.label,
  },
  linkPrimary: {
    lineHeight: 20,
    fontSize: Typography.label,
    color: '#3c87f7',
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: Typography.bold }) ?? Typography.medium,
    fontSize: Typography.caption,
  },
});
