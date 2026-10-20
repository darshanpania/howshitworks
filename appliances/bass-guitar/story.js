// Each step sets the bass's mode (see bass.js), the camera view and what is cut away.
// cut: true clears every cutaway shell and fades the parts out of focus; a list clears only
// those parts and leaves the rest of the bass solid. fret sets the Fret slider; null in fret
// mode lets the story walk up the neck by itself.
export const BASS_STORY = [
  { t: 'Four thick strings, an octave down', part: 'Strings · Tuners', explode: 0, focus: ['strings', 'tuners'], cut: false, mode: 'tune', view: 'wide', fret: 0,
    d: 'A bass has four strings tuned E, A, D and G: 41, 55, 73 and 98 Hz, one octave below the four lowest guitar strings. Each is a steel core wrapped in nickel wire, up to 2.7 mm thick, and 864 mm long from the nut to the bridge. The model shows them moving 40 times slower than they really do.' },
  { t: 'The neck holds back 81 kg', part: 'Neck · Truss rod', explode: 0, focus: ['neck', 'trussRod'], cut: ['neck'], mode: 'truss', view: 'neck', fret: 0,
    d: 'The tuners pull each string to about 200 N. Together that is 795 N, like an 81 kg person hanging from the headstock, and it bows the maple neck forward. A steel truss rod inside the neck pushes back. Turning its nut straightens the neck until about 0.3 mm of bow is left, just enough for the strings to swing clear of the frets.' },
  { t: 'Frets shorten the string', part: 'Frets · Fingerboard', explode: 0, focus: ['frets'], cut: false, mode: 'fret', view: 'frets', fret: null,
    d: 'Press a string behind a fret and only the part from the fret to the bridge can move. Each fret makes that part 5.6% shorter, so the note goes up one semitone. At the 12th fret the string is half as long, 432 mm, and the note is one octave higher. That is why the frets get closer together toward the body.' },
  { t: 'A pluck becomes a standing wave', part: 'String · Harmonics', explode: 0, focus: ['strings'], cut: false, mode: 'pluck', view: 'pluck', fret: 0,
    d: 'Your finger pulls the string into a V and lets go. The bend runs to the bridge and back 41 times a second on the open E. Its shape is a mix of the note and its harmonics at 2, 3, 4 and more times the frequency. A pluck near the bridge keeps more harmonics, so it sounds brighter. The solid body hardly moves, so the string rings for seconds.' },
  { t: 'The string moves a magnetic field', part: 'Pickup · Magnets · Coil', explode: 0, focus: ['pickup'], cut: ['covers'], mode: 'pluck', view: 'pickup', fret: 0,
    d: 'Under each string sit two magnet pole pieces, wrapped in thousands of turns of copper wire 0.06 mm thick. The steel string becomes a weak magnet too. As it swings toward the poles and away, the magnetic field through the coil changes, and that makes a voltage: about 0.2 V, going up and down with the string.' },
  { t: 'Two half coils cancel the hum', part: 'Split coil · Humbucking', explode: 0.45, focus: ['pickup'], cut: ['covers'], mode: 'hum', view: 'split', fret: 0,
    d: 'Mains wiring fills a room with a weak 50 Hz field, and a coil picks it up as hum. This pickup is split: one half under E and A, one under D and G. The second half is wound the other way, and its magnets are flipped. For the strings the two changes cancel, so their signal adds. The hum sees only the reversed winding, so it cancels.' },
  { t: 'Two knobs shape the signal', part: 'Volume pot · Tone capacitor', explode: 0.6, focus: ['controls', 'pots'], cut: false, mode: 'tone', view: 'controls', fret: 0,
    d: 'The volume knob turns a 250 kΩ potentiometer, which sends part of the signal on and the rest to ground. The tone knob connects a 0.047 µF capacitor from the signal to ground. A capacitor passes high frequencies more easily, so turning the tone down drains the treble above about 400 Hz and leaves a round, dark note.' },
  { t: 'The jack sends it to the amplifier', part: 'Output jack · Cable', explode: 0, focus: ['jack'], cut: false, mode: 'pluck', view: 'jack', fret: 0,
    d: 'The signal leaves through a 6.35 mm jack into a shielded cable, whose braid keeps out hum. It is only about 0.2 V with almost no current, much too weak to move a speaker. The amplifier\'s input takes it at about 1 MΩ, so it hardly loads the pickup, and makes it strong enough to drive the speaker cone.' },
];
