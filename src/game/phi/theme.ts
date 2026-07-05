import { PhiFloorId } from '../types';

export interface FloorTheme {
  primary: string;      // hex
  secondary: string;    // hex
  accent: string;       // hex accent
  bgTint: string;       // rgba background overlay for HUD
  borderClass: string;  // tailwind border color
  textClass: string;    // tailwind text color
  bgClass: string;      // tailwind bg color
  glow: string;         // css box-shadow color
  name: string;
}

export const FLOOR_THEME: Record<PhiFloorId, FloorTheme> = {
  mars: {
    primary: '#ff8a3d', secondary: '#e03030', accent: '#ffd68a',
    bgTint: 'rgba(60,15,10,0.75)', borderClass: 'border-orange-400/70',
    textClass: 'text-orange-300', bgClass: 'bg-orange-950/70',
    glow: 'rgba(255,120,60,0.55)', name: 'MARS COLONY',
  },
  nucleus: {
    primary: '#7fff5a', secondary: '#2dd46a', accent: '#c8ff9a',
    bgTint: 'rgba(10,40,15,0.75)', borderClass: 'border-lime-400/70',
    textClass: 'text-lime-300', bgClass: 'bg-lime-950/70',
    glow: 'rgba(120,255,90,0.55)', name: 'NUCLEUS RUN',
  },
  malteron: {
    primary: '#4dd0ff', secondary: '#1a70c9', accent: '#8fd4ff',
    bgTint: 'rgba(8,20,45,0.8)', borderClass: 'border-blue-400/70',
    textClass: 'text-blue-300', bgClass: 'bg-blue-950/80',
    glow: 'rgba(77,208,255,0.55)', name: 'MALTERON',
  },
  neon: {
    primary: '#00e5ff', secondary: '#ff2fa8', accent: '#7dfff0',
    bgTint: 'rgba(6,10,25,0.85)', borderClass: 'border-cyan-400/70',
    textClass: 'text-cyan-300', bgClass: 'bg-slate-950/85',
    glow: 'rgba(0,229,255,0.55)', name: 'NEON OVERLOAD',
  },
};
