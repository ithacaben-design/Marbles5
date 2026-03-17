import { useState, useCallback, useEffect } from 'react';
import { MarbleState, GameMode } from '../types';
import { MARBLES_CONFIG } from '../constants';

export function useMarbleState() {
  const [marbles, setMarbles] = useState<MarbleState[]>(
    MARBLES_CONFIG.map((config) => ({
      id: config.id!,
      status: 'frosted',
      color: config.color || null,
      name: null,
      identity: null,
      fillLevel: 0,
      exp: 0,
      score: 0,
      level: 1,
      voice: config.voice!,
      flavorText: config.flavorText!,
      resonance: (config as any).resonance
    }))
  );

  const [selectedMarbleId, setSelectedMarbleId] = useState<number | null>(null);
  const [gameMode, setGameMode] = useState<GameMode>('home');

  // Orbit and Pinball mode fill logic
  useEffect(() => {
    if (gameMode !== 'orbit' && gameMode !== 'pinball' && gameMode !== 'koi') return;

    const interval = setInterval(() => {
      setMarbles((prev) => 
        prev.map(m => {
          let fillIncrement = 0.2;
          if (gameMode === 'pinball') {
            // 1% fill per 60 seconds = 1/60 per second
            fillIncrement = 1 / 60;
          }
          
          const newFill = Math.min(90, m.fillLevel + fillIncrement);
          
          // Level up logic based on EXP
          // Every 1000 EXP = 1 level
          const newLevel = Math.floor(m.exp / 1000) + 1;
          
          return {
            ...m,
            fillLevel: newFill,
            level: newLevel
          };
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [gameMode]);

  const updateMarble = useCallback((id: number, updates: Partial<MarbleState>) => {
    setMarbles((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );
  }, []);

  const unlockColor = useCallback((id: number, color: string) => {
    updateMarble(id, {
      status: 'colored',
      color,
      fillLevel: 22.5
    });
  }, [updateMarble]);

  const unlockName = useCallback((id: number, name: string) => {
    updateMarble(id, {
      status: 'named',
      name,
      fillLevel: 45
    });
  }, [updateMarble]);

  const unlockIdentity = useCallback((id: number, identity: string) => {
    updateMarble(id, {
      status: 'identified',
      identity,
      fillLevel: 90
    });
  }, [updateMarble]);

  const resetMarbles = useCallback(() => {
    setMarbles(
      MARBLES_CONFIG.map((config) => ({
        id: config.id!,
        status: 'frosted',
        color: config.color || null,
        name: null,
        identity: null,
        fillLevel: 0,
        exp: 0,
        score: 0,
        level: 1,
        voice: config.voice!,
        flavorText: config.flavorText!,
        resonance: (config as any).resonance
      }))
    );
    setGameMode('home');
  }, []);

  const allColored = marbles.every((m) => m.status !== 'frosted');
  const allIdentified = marbles.every((m) => m.status === 'identified');

  // Unlocked modes logic: home, orbit, koi, billiard, pinball, mood
  const unlockedModes: GameMode[] = ['home'];
  if (allColored) {
    unlockedModes.push('orbit', 'koi');
  }
  if (allIdentified) {
    unlockedModes.push('billiard', 'pinball', 'mood');
  }

  return {
    marbles,
    selectedMarbleId,
    setSelectedMarbleId,
    unlockColor,
    unlockName,
    unlockIdentity,
    updateMarble,
    resetMarbles,
    allIdentified,
    allColored,
    gameMode,
    setGameMode,
    unlockedModes
  };
}
