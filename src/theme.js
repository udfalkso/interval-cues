// Centralized design tokens (ported from the eden podcast player).

export const colors = {
  // Backgrounds
  background: '#0F0F0F',
  bgElevated: '#1A1A1A',
  bgCard: '#1F1F1F',
  bgOverlay: 'rgba(0, 0, 0, 0.6)',

  // Accent
  accent: '#4A8FE2',
  accentDark: '#3A7BC8',
  accentLight: 'rgba(74, 143, 226, 0.15)',
  accentBorder: 'rgba(74, 143, 226, 0.3)',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#B3B3B3',
  textTertiary: '#888888',
  textDisabled: '#555555',

  // Borders
  border: '#1F1F1F',
  borderLight: 'rgba(255, 255, 255, 0.08)',
  borderMedium: '#282828',
  separator: '#1F1F1F',

  // Semantic
  error: '#FF6B6B',
  errorBg: '#3D1515',
  success: '#22C55E',
  warning: '#FFB800',
  warningBg: '#332800',
  danger: '#E74C3C',

  // Interval phase colors
  fast: '#FF7A59', // energetic orange-red for hard efforts
  slow: '#4A8FE2', // calm blue for recovery
  warmup: '#B3B3B3', // muted for warm up
  cooldown: '#7CC4A4', // soft green for cool down
  walk: '#9B8CFF', // lavender for walk
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 100,
  image: 8,
};

export const typography = {
  largeTitle: { fontSize: 32, fontWeight: '700', letterSpacing: 0.37 },
  title1: { fontSize: 28, fontWeight: '700', letterSpacing: 0.36 },
  title2: { fontSize: 24, fontWeight: '700', letterSpacing: 0.35 },
  title3: { fontSize: 20, fontWeight: '600', letterSpacing: 0.38 },
  headline: { fontSize: 17, fontWeight: '600', letterSpacing: -0.41 },
  body: { fontSize: 17, fontWeight: '400', letterSpacing: -0.41 },
  callout: { fontSize: 16, fontWeight: '400', letterSpacing: -0.32 },
  subhead: { fontSize: 15, fontWeight: '400', letterSpacing: -0.24 },
  footnote: { fontSize: 13, fontWeight: '400', letterSpacing: -0.08 },
  caption1: { fontSize: 12, fontWeight: '400', letterSpacing: 0 },
  caption2: { fontSize: 11, fontWeight: '400', letterSpacing: 0.07 },
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
};

// Map an interval "kind" to its accent color.
export function kindColor(kind) {
  return colors[kind] || colors.accent;
}

const theme = { colors, spacing, radius, typography, shadows, kindColor };
export default theme;
