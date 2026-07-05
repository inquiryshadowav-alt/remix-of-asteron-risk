import { TaskChallenge, TaskStation, TaskType, TOTAL_TASKS, MAP_WIDTH, MAP_HEIGHT, TeamIndex } from './types';

const TASK_LABELS: Record<TaskType, string> = {
  frequency: '📻 Frequency',
  morse: '📟 Morse Code',
  satellite: '📡 Satellite',
  backup: '📁 Backup',
  solar: '🧼 Solar Panel',
  power: '🔋 Power',
  magnetic: '🧩 Magnetic',
  password: '🔑 Password',
  ice: '🧊 Ice Shatter',
  dna: '🧬 DNA Slider',
  door: '🚪 Door',
};

export function createTaskStations(count: number = TOTAL_TASKS, team: TeamIndex = 0, idOffset: number = 0): TaskStation[] {
  // Curated, wall-safe positions (verified inside rooms or open Mars ground).
  const positions = [
    // Research room
    { x: 680, y: 150 }, { x: 850, y: 200 }, { x: 950, y: 120 },
    // Ecosystem room
    { x: 150, y: 550 }, { x: 280, y: 680 }, { x: 150, y: 730 },
    // Recover room
    { x: 1320, y: 550 }, { x: 1450, y: 680 },
    // Open Mars ground (no walls in these zones)
    { x: 800, y: 900 }, { x: 500, y: 1050 },
    { x: 250, y: 200 }, { x: 250, y: 1000 },
    { x: 1150, y: 200 }, { x: 1150, y: 1000 },
    { x: 1000, y: 500 }, { x: 600, y: 400 },
    { x: 1400, y: 950 }, { x: 900, y: 1050 },
    { x: 450, y: 200 }, { x: 900, y: 720 },
    { x: 1730, y: 470 }, { x: 1870, y: 870 },
    { x: 700, y: 1050 }, { x: 1600, y: 1050 },
    { x: 350, y: 850 }, { x: 1200, y: 850 },
    { x: 1000, y: 780 }, { x: 550, y: 780 },
    { x: 1500, y: 200 }, { x: 400, y: 400 },
  ];

  const types: TaskType[] = [
    'frequency', 'morse', 'satellite', 'backup', 'solar',
    'power', 'magnetic', 'password', 'ice', 'dna',
  ];

  const n = Math.max(0, Math.min(30, count));
  const stations: TaskStation[] = [];
  for (let i = 0; i < n; i++) {
    const pos = positions[i % positions.length];
    const type = types[i % types.length];
    stations.push({
      id: idOffset + i,
      x: pos.x + (team === 1 ? 35 : team === 2 ? -35 : 0),
      y: pos.y,
      label: TASK_LABELS[type],
      taskType: type,
      completed: false,
      team,
    });
  }
  return stations;
}

export function generateTaskChallenge(station: TaskStation): TaskChallenge {
  switch (station.taskType) {
    case 'frequency': {
      const targetAngle = Math.floor(Math.random() * 300) + 30;
      return { type: 'frequency', stationId: station.id, prompt: 'Tune the frequency', answer: '', targetAngle };
    }
    case 'morse': {
      const patterns: ('short' | 'long')[][] = [
        ['short', 'short', 'long'],
        ['long', 'short', 'short'],
        ['short', 'long', 'short'],
        ['long', 'long', 'short'],
        ['short', 'long', 'long'],
      ];
      const morsePattern = patterns[Math.floor(Math.random() * patterns.length)];
      return { type: 'morse', stationId: station.id, prompt: 'Repeat the pattern', answer: '', morsePattern };
    }
    case 'satellite': {
      const targetRotation = Math.floor(Math.random() * 300) + 30;
      return { type: 'satellite', stationId: station.id, prompt: 'Align the dish', answer: '', targetRotation };
    }
    case 'backup': {
      return { type: 'backup', stationId: station.id, prompt: 'Backing up data...', answer: '', duration: 5000 };
    }
    case 'solar': {
      return { type: 'solar', stationId: station.id, prompt: 'Swipe to clean!', answer: '' };
    }
    case 'power': {
      return { type: 'power', stationId: station.id, prompt: 'Flick batteries up!', answer: '' };
    }
    case 'magnetic': {
      return { type: 'magnetic', stationId: station.id, prompt: 'Snap the pieces!', answer: '' };
    }
    case 'password': {
      const digits = String(Math.floor(1000 + Math.random() * 9000));
      return { type: 'password', stationId: station.id, prompt: 'Remember the code', answer: digits, passwordDigits: digits };
    }
    case 'ice': {
      const tapsRequired = 15 + Math.floor(Math.random() * 10);
      return { type: 'ice', stationId: station.id, prompt: 'Tap to shatter!', answer: '', tapsRequired };
    }
    case 'dna': {
      const dnaOffset = Math.floor(Math.random() * 5) + 2;
      return { type: 'dna', stationId: station.id, prompt: 'Align the strands', answer: '', dnaOffset };
    }
  }
}
