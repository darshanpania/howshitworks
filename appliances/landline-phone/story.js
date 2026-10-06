// Each step sets the phone's mode (see line.js), the camera view and what is cut away.
// cut: true clears every cutaway shell and fades the parts out of focus; a list clears only
// those parts and leaves the rest of the phone solid.
export const PHONE_STORY = [
  { t: 'Two copper wires go to the exchange', part: 'Line cord · Copper pair', explode: 0, focus: ['line', 'jack'], cut: ['line'], mode: 'idle', view: 'line',
    d: 'A landline is a pair of copper wires, about 0.5 mm thick, from your wall to the telephone exchange, often 2 to 5 km away. The exchange keeps 48 V DC across the pair. With the handset down, the circuit in the phone is open, so no current flows.' },
  { t: 'AC rings the bell', part: 'Ringer · Gongs', explode: 0, focus: ['ringer'], cut: true, mode: 'ring', view: 'ringer',
    d: 'To call you, the exchange adds about 75 V AC at 25 Hz to the line: ring-ring, pause. A capacitor lets the AC through to the ringer coils but blocks the DC. Each half cycle flips their pull, so the clapper hits one gong, then the other, 50 times a second.' },
  { t: 'Lifting the handset closes the loop', part: 'Hookswitch · Plungers', explode: 0, focus: ['hook'], cut: true, mode: 'lift', view: 'hook',
    d: 'The handset holds two plungers down, and they hold the hookswitch open. Lift the handset and springs push the plungers up, so the switch closes. About 43 mA now flows round the loop, and the voltage at the phone falls to about 8.5 V. The exchange sees the current and sends a dial tone.' },
  { t: 'The dial counts with pulses', part: 'Rotary dial · Pulse contacts', explode: 0.3, focus: ['dial', 'dialMech'], cut: true, mode: 'dial', view: 'dial',
    d: 'Pull a hole round to the finger stop and let go. A spring turns the dial back, and a small governor keeps it at 10 pulses a second. On the way back, a cam opens the loop once for each pulse: 5 opens it 5 times, 0 opens it 10 times. The exchange counts the gaps in the current.' },
  { t: 'Your voice squeezes carbon', part: 'Transmitter · Carbon granules', explode: 0.4, focus: ['transmitter'], cut: true, mode: 'talk', view: 'mouth',
    d: 'Behind the mouthpiece, a thin aluminium diaphragm presses on a small cup of carbon granules. Your voice pushes the diaphragm in and out. Squeezed granules touch better, so their resistance falls from about 100 Ω toward 50 Ω; when the diaphragm moves back, it rises. The loop current follows your voice.' },
  { t: 'The current carries your voice', part: 'Copper pair', explode: 0, focus: ['line'], cut: ['line'], mode: 'talk', view: 'wide',
    d: 'The carbon makes no electricity. It only controls the current from the exchange battery, so a quiet voice still makes a strong signal. The current goes up and down by about 2 mA, in the same shape as the sound. The two wires twist round each other, so hum from mains cables is the same on both and cancels.' },
  { t: 'The induction coil sets your own volume', part: 'Induction coil · Network', explode: 0.35, focus: ['network'], cut: true, mode: 'talk', view: 'network',
    d: 'You talk and listen on the same two wires. A transformer called the induction coil, with a balance network, sends most of your voice down the line and only a little to your own earpiece. That little bit is sidetone. With too much, people talk too quietly; with none, the line sounds dead and they shout.' },
  { t: 'A magnet turns current back into sound', part: 'Receiver · Magnet · Diaphragm', explode: 0.4, focus: ['receiver'], cut: true, mode: 'listen', view: 'ear',
    d: 'The other caller\'s voice arrives as the same kind of changing current. In the earpiece it flows through two coils on a permanent magnet. More current adds to the magnet\'s pull on a thin iron diaphragm; less current lets it spring back. The diaphragm moves the air in the shape of their voice.' },
];
