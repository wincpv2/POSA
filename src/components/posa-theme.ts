export const colors = {
  background: '#080F21',
  backgroundSoft: '#0C152A',
  panel: '#131D34',
  panelRaised: '#19243D',
  panelDeep: '#060D1F',
  border: 'rgba(170, 190, 220, 0.11)',
  text: '#E7ECFA',
  textSoft: '#B7C2D7',
  muted: '#8391AA',
  mint: '#67F5C3',
  mintDeep: '#16D6A5',
  cyan: '#75CCF4',
  rose: '#FF9AAE',
  roseDeep: '#A81749',
  amber: '#F5C771',
};

export const navItems = [
  { href: '/', label: 'Home', mark: '▦', hint: 'Overview' },
  { href: '/upload', label: 'Upload', mark: '↑', hint: 'New study' },
  { href: '/processing', label: 'Processing', mark: '◉', hint: 'Analysis preview' },
  { href: '/detail', label: 'Detail', mark: '♡', hint: 'Signal review' },
  { href: '/summary', label: 'Summary', mark: '▤', hint: 'Study report' },
] as const;

export type PosaRoute = (typeof navItems)[number]['href'];
