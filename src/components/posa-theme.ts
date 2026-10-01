export const colors = {
  background: '#EBF4F8',
  backgroundSoft: '#F4F9FB',
  panel: '#FFFFFF',
  panelRaised: '#F1F7FA',
  panelDeep: '#082032',
  border: '#DCEAF0',
  text: '#0B1D3A',
  textSoft: '#3D484E',
  muted: '#6D797F',
  mint: '#006B56',
  mintDeep: '#00C49F',
  cyan: '#006782',
  cyanSoft: '#E5F6FB',
  mintSoft: '#E2F5EF',
  rose: '#BA1A1A',
  roseDeep: '#FA5252',
  roseSoft: '#FFF0F0',
  amber: '#8A5700',
  amberSoft: '#FFF5DB',
};

export const navItems = [
  { href: '/', label: 'Home', mark: '▦', hint: 'Overview' },
  { href: '/upload', label: 'Upload', mark: '↑', hint: 'New study' },
  { href: '/processing', label: 'Processing', mark: '◉', hint: 'Analysis preview' },
  { href: '/detail', label: 'Detail', mark: '♡', hint: 'Signal review' },
  { href: '/summary', label: 'Summary', mark: '▤', hint: 'Study report' },
] as const;

export type PosaRoute = (typeof navItems)[number]['href'];
