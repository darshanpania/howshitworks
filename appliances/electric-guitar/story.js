// Each step sets what the guitar plays (see guitar.js), the camera view and what is cut away.
// cut: true clears every cutaway shell (pickup covers, pickguard, body) and fades the parts out
// of focus; a list clears only those parts. fret, when set, moves the Fret slider.
export const GUITAR_STORY = [
  { t: 'Six steel strings, pulled tight', part: 'Strings · Tuners', explode: 0, focus: ['strings', 'tuners'], cut: false, mode: 'strum', view: 'whole', fret: 0,
    d: 'Six steel strings run 648 mm from the nut to the bridge. The tuners pull each one with 7 to 9 kg, about 47 kg in all. Pluck one and it swings back and forth (slowed down here): the low E 82 times a second, the high E 330. A tighter, shorter or lighter string swings faster and plays higher.' },
  { t: 'Frets make the string shorter', part: 'Neck · Frets', explode: 0, focus: ['neck'], cut: false, mode: 'fret', view: 'frets', fret: 12,
    d: 'Press a string down behind a fret and only the part from that fret to the bridge swings. Each fret makes it about 5.6% shorter, one semitone higher. At the 12th fret the string is half as long and swings twice as fast: 165 Hz, one octave up. That is why the frets get closer together up the neck.' },
  { t: 'A magnet under each string', part: 'Pickup · Alnico magnets', explode: 0, focus: ['neckPickup'], cut: ['neckPickup'], mode: 'pickup', view: 'pickup', fret: 0,
    d: 'A pickup has six magnet rods of Alnico, an alloy of aluminium, nickel and cobalt, one under each string. The steel string sits in their field and becomes a weak magnet too. As it swings toward the pole and away, the field through the pickup gets stronger and weaker. A nylon string would do nothing here.' },
  { t: 'A coil turns the swing into volts', part: 'Coil · 8,000 turns', explode: 0.3, focus: ['neckPickup'], cut: true, mode: 'coil', view: 'coil',
    d: 'About 8,000 turns of copper wire 0.06 mm thick, finer than a hair, wrap round the magnets. A changing field through a coil makes a voltage in it: Faraday\'s law. The faster the string moves over the poles, the higher the voltage. Each swing makes one cycle of AC, about 0.2 V at most, at the note\'s frequency.' },
  { t: 'Where the pickup sits sets the tone', part: '5-way switch · Three pickups', explode: 0, focus: ['switch', 'neckPickup', 'bridgePickup'], cut: false, mode: 'switch', view: 'pickups',
    d: 'A string swings most near its middle. Close to the bridge it hardly moves, but its fast high harmonics still show there. So the neck pickup sounds round and warm, and the bridge pickup thin and bright. The 5-way switch picks the neck, middle or bridge pickup, or two side by side.' },
  { t: 'Two coils cancel the hum', part: 'Middle pickup · Reverse wound', explode: 0, focus: ['middlePickup', 'neckPickup'], cut: ['middlePickup', 'neckPickup'], mode: 'hum', view: 'hum',
    d: 'A coil also picks up 50 Hz hum from mains wiring and lights. The middle pickup is wound the other way, and its magnets are flipped. Hum makes opposite voltages in the neck and middle coils, so with both on it cancels. The string\'s signal is flipped twice, so it adds.' },
  { t: 'Knobs trim the volume and tone', part: 'Pots · Tone capacitor', explode: 0.45, focus: ['controls'], cut: ['controls'], mode: 'tone', view: 'controls',
    d: 'Each knob turns a 250 kΩ pot. The volume pot is a voltage divider: it passes all, part or none of the signal. The tone pot sends the signal to ground through a 0.022 µF capacitor, which lets high frequencies through far more easily than low ones. Turn it down and the bright edge goes.' },
  { t: 'The jack sends it to the amp', part: 'Output jack · Cable', explode: 0, focus: ['jack', 'cable'], cut: false, mode: 'out', view: 'jack',
    d: 'The signal leaves through a 6.35 mm (¼ inch) jack: the tip carries it and the sleeve is ground. At a few hundred millivolts it is far too weak to move a speaker. The cable takes it to an amplifier, which makes it thousands of times stronger. The cable\'s capacitance, about 100 pF a metre, softens the highs.' },
];
