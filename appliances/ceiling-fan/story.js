export const FAN_STORY = [
  {t:'Power comes in from the wall', part:'Regulator · Downrod', explode:0, focus:['rod'], cut:false,
   d:'The regulator on the wall sets the voltage that reaches the fan. Less voltage means a weaker magnetic field, so the fan turns slower. The wires run up inside the downrod.'},
  {t:'The capacitor makes a second phase', part:'Capacitor · Top cover', explode:0.35, focus:['cap'], cut:true,
   d:'A single-phase supply cannot start a motor by itself. The capacitor (usually 2.5 µF) shifts the current in one coil by about 90°. Now the two coils act like a two-phase supply, which can start a spin.'},
  {t:'The stator makes a rotating field', part:'Stator · Copper windings', explode:0.55, focus:['stator'], cut:true,
   d:'The stator is fixed to the downrod and does not move. Its copper coils are wound around an iron core as 16 poles. The two out-of-phase currents make a magnetic field that rotates around the core. On 50 Hz mains, a 16-pole field turns at 375 rpm.'},
  {t:'The rotor chases the field', part:'Rotor · Outer casing', explode:0.55, focus:['rotor'], cut:true,
   d:'In a ceiling fan, the rotor is on the outside. It is a ring of aluminium bars around the stator. The rotating field induces currents in the bars, and those currents make their own field. The rotor gets pulled around, always a little slower than the field: about 350 rpm at full speed. This is an induction motor.'},
  {t:'Bearings let the casing spin', part:'Ball bearings ×2', explode:0.8, focus:['bearTop','bearBot'], cut:true,
   d:'Two ball bearings sit between the fixed shaft and the spinning casing. They carry the weight of the blades and keep the casing centred. Worn bearings are the usual cause of a wobbling or noisy fan.'},
  {t:'The blades push air down', part:'Blades ×3', explode:0.2, focus:['blades'], cut:false,
   d:'The blades bolt to the spinning casing. Each blade is tilted by 10° to 12°. As it sweeps around, the tilt pushes air down, the same way a screw pushes into wood. Three blades is the common count in India because it moves the most air for the least noise.'},
  {t:'Air moves, you feel cooler', part:'Airflow', explode:0, focus:['blades'], cut:false, air:true,
   d:'The fan does not cool the air. It moves the air past your skin, so sweat evaporates faster. Air goes down in the middle of the room and comes back up along the walls. At full speed a 1200 mm fan moves about 200 cubic metres per minute.'}
];
