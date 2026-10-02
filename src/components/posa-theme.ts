export const colors = {
  background: '#04065E',
  gradientEnd: '#0077B6',
  panel: 'rgba(255,255,255,0.10)',
  panelRaised: 'rgba(255,255,255,0.14)',
  panelDeep: 'rgba(2,3,58,0.72)',
  glassBase: 'rgba(2,3,58,0.52)',
  border: 'rgba(202,240,248,0.18)',
  text: '#CAF0F8',
  textSoft: '#CAF0F8',
  muted: '#90E0EF',
  accent: '#90E0EF',
  accentText: '#02033A',
  coral: '#FF6B57',
  scrim: 'rgba(2,3,58,0.52)',
  cyan: '#90E0EF',
  cyanSoft: 'rgba(144,224,239,0.16)',
};

export const fonts = {
  regular: 'Nunito_400Regular',
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extraBold: 'Nunito_800ExtraBold',
} as const;

export const navItems = [
  { href: '/', label: 'Home' },
  { href: '/upload', label: 'Upload' },
  { href: '/processing', label: 'Processing' },
  { href: '/detail', label: 'Detail' },
  { href: '/summary', label: 'Summary' },
] as const;

export type PosaRoute = (typeof navItems)[number]['href'];
