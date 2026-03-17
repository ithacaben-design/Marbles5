import { MarbleState } from './types';

export const VINTAGE_COLORS = {
  ochre: '#CC7722',
  sage: '#87A96B',
  rose: '#C08081',
  indigo: '#4B0082',
  slate: '#708090'
};

export const MARBLES_CONFIG: Partial<MarbleState>[] = [
  {
    id: 1,
    identity: 'The Observer',
    color: '#c084fc',
    voice: 'sleepy',
    resonance: 0.85,
    flavorText: {
      q1: '"What color am I?" said a sleepy voice.',
      q2: '"I like that color. One more thing after this." "What\'s my name?" said a sleepy voice.',
      q3: 'The little marble waited, heavy-eyed and patient. "I am [color] ______."'
    }
  },
  {
    id: 2,
    identity: 'The Catalyst',
    color: '#f43f5e',
    voice: 'golden',
    resonance: 0.72,
    flavorText: {
      q1: '"What color am I?" said a warm, golden, cheerful voice—like something rising.',
      q2: '"That color suits me. Almost done—just one more." "What\'s my name?" said a warm, golden voice.',
      q3: 'The little marble glowed, eager and warm. "I am [color] ______."'
    }
  },
  {
    id: 3,
    identity: 'The Anchor',
    color: '#4ade80',
    voice: 'lively',
    resonance: 0.90,
    flavorText: {
      q1: '"What color am I?" said a lively, feel-good voice—like something that loved to be used.',
      q2: '"Love it. Last question after this, I promise." "What\'s my name?" said a lively voice.',
      q3: 'The little marble bounced, restless and ready. "I am [color] ______."'
    }
  },
  {
    id: 4,
    identity: 'The Echo',
    color: '#1d4ed8',
    voice: 'hungry',
    resonance: 0.65,
    flavorText: {
      q1: '"What color am I?" said a voice that was both nourishing and thirsty.',
      q2: '"Good choice. One more thing and I\'m yours." "What\'s my name?" said a hungry voice.',
      q3: 'The little marble rumbled, hungry and hopeful. "I am [color] ______."'
    }
  },
  {
    id: 5,
    identity: 'The Prism',
    color: '#2dd4bf',
    voice: 'friendly',
    resonance: 0.88,
    flavorText: {
      q1: '"What color am I?" said a familiar, friendly, welcoming voice.',
      q2: '"Perfect. Just one more thing after this." "What\'s my name?" said a friendly voice.',
      q3: 'The little marble leaned in, familiar and warm. "I am [color] ______."'
    }
  }
];

export const BOX_MATERIALS = {
  tufted: {
    name: 'Tufted White Leather',
    class: 'bg-[#f8f8f8]',
    color: 0xf4f4f4,
    style: {
      backgroundImage: 'radial-gradient(circle at 50% 50%, #ffffff 0%, #e0e0e0 100%)',
      boxShadow: 'inset 0 0 100px rgba(0,0,0,0.1)'
    }
  },
  wood: {
    name: 'Dark Wood',
    class: 'bg-[#2c1b0e]',
    color: 0x3d2b1f,
    style: {
      backgroundImage: 'linear-gradient(45deg, #2c1b0e 25%, #3d2b1f 25%, #3d2b1f 50%, #2c1b0e 50%, #2c1b0e 75%, #3d2b1f 75%, #3d2b1f 100%)',
      backgroundSize: '100px 100px'
    }
  },
  leather: {
    name: 'Aged Leather',
    class: 'bg-[#4a2c1d]',
    color: 0x4a2c1d,
    style: {
      backgroundImage: 'radial-gradient(circle at 50% 50%, #5d3a2a 0%, #3a1f13 100%)'
    }
  },
  mirror: {
    name: 'Mirror',
    class: 'bg-[#e0e0e0]',
    color: 0xcccccc,
    style: {
      backgroundImage: 'linear-gradient(135deg, #ffffff 0%, #a0a0a0 100%)',
      opacity: 0.8
    }
  },
  glass: {
    name: 'Frosted Glass',
    class: 'bg-[#ffffff22]',
    color: 0xffffff,
    style: {
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255,255,255,0.3)'
    }
  },
  felt: {
    name: 'Pool Table Felt',
    class: 'bg-[#1a4d2e]',
    color: 0x1a4d2e,
    style: {
      backgroundImage: 'radial-gradient(circle at 50% 50%, #246b41 0%, #133a22 100%)'
    }
  },
  pinball: {
    name: 'Pinball Table',
    class: 'bg-[#1a1a1a]',
    color: 0x111111,
    style: {
      backgroundImage: 'linear-gradient(to bottom, #1a1a1a 0%, #333333 100%)',
      border: '4px solid #cd7f32'
    }
  }
};
