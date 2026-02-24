// Music theory data: notes, chord types, and bossa nova progressions

export const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export const KEY_OPTIONS = ['C', 'Db', 'D', 'Eb', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

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

// Five progressions. Offsets are always pitch-class relative (0–11).
export const PROGRESSIONS: Record<string, ChordDef[]> = {
  'Classic': [
    { offset: 0,  type: 'maj7', label: 'maj7' },
    { offset: 9,  type: 'min7', label: 'VIm7' },
    { offset: 2,  type: 'min7', label: 'IIm7' },
    { offset: 7,  type: 'dom7', label: 'V7'   },
  ],
  'Samba': [
    { offset: 0,  type: 'maj9', label: 'maj9'   },
    { offset: 5,  type: 'maj7', label: 'IVmaj7' },
    { offset: 2,  type: 'min9', label: 'IIm9'   },
    { offset: 7,  type: 'dom9', label: 'V9'     },
  ],
  'Ipanema': [
    { offset: 0,  type: 'maj7', label: 'maj7'    },
    { offset: 10, type: 'dom7', label: 'bVII7'   },
    { offset: 10, type: 'min7', label: 'bVIIm7'  },
    { offset: 3,  type: 'dom7', label: 'bIII7'   },
  ],
  'Electronic': [
    { offset: 0,  type: 'sus4', label: 'sus4'     },
    { offset: 5,  type: 'maj7', label: 'IVmaj7'   },
    { offset: 7,  type: 'min7', label: 'Vm7'      },
    { offset: 10, type: 'maj7', label: 'bVIImaj7' },
  ],
  'Modal': [
    { offset: 0,  type: 'min7', label: 'Im7'      },
    { offset: 5,  type: 'dom7', label: 'IV7'      },
    { offset: 0,  type: 'min9', label: 'Im9'      },
    { offset: 10, type: 'maj7', label: 'bVIImaj7' },
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
