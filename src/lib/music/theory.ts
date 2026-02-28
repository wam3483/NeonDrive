// Music theory data: notes, chord types, and bossa nova progressions

export const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export const KEY_OPTIONS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function noteNameToMidi(name: string, octave: number): number {
  const idx = NOTE_NAMES.indexOf(name);
  return 12 * (octave + 1) + (idx === -1 ? 0 : idx);
}

// Semitone intervals from chord root
export const CHORD_TYPES: Record<string, number[]> = {
  maj7:   [0, 4, 7, 11],
  min7:   [0, 3, 7, 10],
  dom7:   [0, 4, 7, 10],
  maj9:   [0, 4, 7, 11, 14],
  min9:   [0, 3, 7, 10, 14],
  dom9:   [0, 4, 7, 10, 14],
  min7b5: [0, 3, 6, 10],
  sus4:   [0, 5, 7, 10],
};

export interface ChordDef {
  offset: number;  // semitones above the key root (pitch-class)
  type:   string;
  label:  string;
}

// Five synthwave progressions. Minor-key oriented (keyRoot = minor tonic).
// Offsets: i=0, III=3, IV=5, VI=8, VII=10, bII=1  |  major: I=0, IV=5, V=7, VI=9
export const PROGRESSIONS: Record<string, ChordDef[]> = {
  'Outrun': [
    { offset: 0,  type: 'min7', label: 'Im7'     },
    { offset: 8,  type: 'maj7', label: 'VImaj7'  },
    { offset: 3,  type: 'maj7', label: 'IIImaj7' },
    { offset: 10, type: 'maj7', label: 'VIImaj7' },
  ],
  'Dark Drive': [
    { offset: 0,  type: 'min9', label: 'Im9'     },
    { offset: 5,  type: 'min7', label: 'IVm7'    },
    { offset: 10, type: 'maj7', label: 'VIImaj7' },
    { offset: 3,  type: 'maj7', label: 'IIImaj7' },
  ],
  'Neon Sunset': [
    { offset: 0,  type: 'min7', label: 'Im7'     },
    { offset: 8,  type: 'maj7', label: 'VImaj7'  },
    { offset: 10, type: 'maj7', label: 'VIImaj7' },
    { offset: 0,  type: 'min9', label: 'Im9'     },
  ],
  'Miami Vice': [
    { offset: 0,  type: 'maj7', label: 'Imaj7'   },
    { offset: 7,  type: 'maj7', label: 'Vmaj7'   },
    { offset: 9,  type: 'min7', label: 'VIm7'    },
    { offset: 5,  type: 'maj7', label: 'IVmaj7'  },
  ],
  '(Anxiety) Blade Runner': [
    { offset: 0,  type: 'min7', label: 'Im7'     },
    { offset: 1,  type: 'dom7', label: 'bII7'    },
    { offset: 10, type: 'maj7', label: 'VIImaj7' },
    { offset: 8,  type: 'maj7', label: 'VImaj7'  },
  ],
  'French House': [
    { offset: 0,  type: 'min7', label: 'Im7'    },
    { offset: 5,  type: 'min7', label: 'IVm7'   },
    { offset: 8,  type: 'maj7', label: 'VImaj7' },
    { offset: 7,  type: 'dom7', label: 'V7'     },
  ],
  'Around the World': [
    { offset: 0,  type: 'min7', label: 'Im7'     },
    { offset: 10, type: 'dom7', label: 'bVII7'   },
    { offset: 8,  type: 'maj7', label: 'bVImaj7' },
    { offset: 7,  type: 'dom7', label: 'V7'      },
  ],
};

/**
 * Returns MIDI note numbers for a chord voicing.
 * keyPc   — key pitch class (0=C … 11=B)
 * chord   — chord definition
 * octave  — octave for the chord root (4 = middle octave)
 */
export function getChordMidis(keyPc: number, chord: ChordDef, octave = 4): number[] {
  const intervals = CHORD_TYPES[chord.type] ?? [0, 4, 7];
  const rootPc    = (keyPc + chord.offset) % 12;
  const rootMidi  = 12 * (octave + 1) + rootPc;
  return intervals.map(i => rootMidi + i);
}

/** Root MIDI number only (for bass lines) */
export function getChordRootMidi(keyPc: number, chord: ChordDef, octave = 2): number {
  const rootPc = (keyPc + chord.offset) % 12;
  return 12 * (octave + 1) + rootPc;
}
