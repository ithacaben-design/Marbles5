export type BoxMaterial = 'tufted' | 'wood' | 'leather' | 'mirror' | 'glass' | 'felt';
export type GameMode = 'home' | 'orbit' | 'koi' | 'billiard' | 'pinball' | 'mood';
export type PinballSubMode = 'pool' | 'pinball';

export interface MarbleState {
  id: number;
  status: 'frosted' | 'colored' | 'named' | 'identified';
  color: string | null;
  name: string | null;
  identity: string | null;
  fillLevel: number; // 0 to 100
  exp: number;
  level: number;
  score: number;
  voice: string;
  flavorText: {
    q1: string;
    q2: string;
    q3: string;
  };
  resonance: number;
  pulseRate?: number; // Silent backend influence
  isBlinking?: boolean; // Silent backend influence
  isPermanentlyGlowing?: boolean;
  isGlowActive?: boolean; // Temporary glow
}
