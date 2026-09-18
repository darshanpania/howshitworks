import * as THREE from "three";

(function(){
  // ---------- Story ----------
  const STORY = [
    {t:'Power comes in from the wall', part:'Regulator · Downrod', explode:0, focus:['rod'], cut:false,
     d:'The regulator on the wall sets the voltage that reaches the fan. Less voltage means a weaker magnetic field, so the fan turns slower. The wires run up inside the downrod.'},
    {t:'The capacitor makes a second phase', part:'Capacitor', explode:0.35, focus:['cap'], cut:true,
     d:'A single-phase supply cannot start a motor by itself. The capacitor (usually 2.5 µF) shifts the current in one coil by about 90°. Now the two coils act like a two-phase supply, which can start a spin.'},
    {t:'The stator makes a rotating field', part:'Stator · Copper windings', explode:0.55, focus:['stator'], cut:true,
     d:'The stator is fixed to the downrod and does not move. Its copper coils are wound around an iron core. The two out-of-phase currents make a magnetic field that rotates around the core at 50 Hz mains, about 3000 rpm for a 2-pole design.'},
    {t:'The rotor chases the field', part:'Rotor · Outer casing', explode:0.55, focus:['rotor'], cut:true,
     d:'In a ceiling fan, the rotor is on the outside. It is a ring of aluminium bars around the stator. The rotating field induces currents in the bars, and those currents make their own field. The rotor gets pulled around, always a little slower than the field. This is an induction motor.'},
    {t:'Bearings let the casing spin', part:'Ball bearings ×2', explode:0.8, focus:['bearTop','bearBot'], cut:true,
     d:'Two ball bearings sit between the fixed shaft and the spinning casing. They carry the weight of the blades and keep the casing centred. Worn bearings are the usual cause of a wobbling or noisy fan.'},
    {t:'The blades push air down', part:'Blades ×3', explode:0.2, focus:['blades'], cut:false,
     d:'The blades bolt to the spinning casing. Each blade is tilted by 10° to 12°. As it sweeps around, the tilt pushes air down, the same way a screw pushes into wood. Three blades is the common count in India because it moves the most air for the least noise.'},
    {t:'Air moves, you feel cooler', part:'Airflow', explode:0, focus:['blades'], cut:false, air:true,
     d:'The fan does not cool the air. It moves the air past your skin, so sweat evaporates faster. Air goes down in the middle of the room and comes back up along the walls. At full speed a 1200 mm fan moves about 200 cubic metres per minute.'}
  ];

  // ---------- Renderer ----------
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  const cam = {theta:0.6, phi:1.2, r:11, target:new THREE.Vector3(0,-0.2,0)};

  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(4,6,3); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffe0c0, 0.4); rim.position.set(-5,2,-4); scene.add(rim);

  const grid = new THREE.GridHelper(14, 14, 0x9aa5b1, 0x9aa5b1);
  grid.position.y = -3.2; grid.material.transparent = true; grid.material.opacity = 0.18; scene.add(grid);

  // ---------- Materials ----------
  const M = {
    steel: new THREE.MeshStandardMaterial({color:0xB8BEC6, metalness:0.7, roughness:0.35}),
    housing: new THREE.MeshStandardMaterial({color:0x8E97A2, metalness:0.6, roughness:0.4, transparent:true}),
    copper: new THREE.MeshStandardMaterial({color:0xC4703A, metalness:0.8, roughness:0.35}),
    iron: new THREE.MeshStandardMaterial({color:0x4A525B, metalness:0.5, roughness:0.7}),
    alu: new THREE.MeshStandardMaterial({color:0xD5DAE0, metalness:0.7, roughness:0.3}),
    blade: new THREE.MeshStandardMaterial({color:0x6B4E36, metalness:0.1, roughness:0.7}),
    cap: new THREE.MeshStandardMaterial({color:0x2B3138, metalness:0.2, roughness:0.6}),
    bearing: new THREE.MeshStandardMaterial({color:0xD4A64A, metalness:0.9, roughness:0.25}),
    wire: new THREE.MeshStandardMaterial({color:0xC43A3A, roughness:0.6})
  };
  Object.values(M).forEach(m => { m.userData.baseColor = m.color.getHex(); m.userData.baseOpacity = m.opacity; });

  // ---------- Parts ----------
  // Each part: {group, home:Vector3, explode:Vector3 (offset at full explode), spins:boolean}
  const parts = {};
  const root = new THREE.Group(); scene.add(root);
  const spinner = new THREE.Group(); root.add(spinner); // everything that rotates

  function add(name, mesh, home, explodeOffset, spins){
    const g = new THREE.Group(); g.add(mesh); g.position.copy(home);
    (spins ? spinner : root).add(g);
    parts[name] = {g, home:home.clone(), off:explodeOffset.clone(), meshes:[]};
    mesh.traverse(o => { if (o.isMesh) parts[name].meshes.push(o); });
    return g;
  }

  // Canopy + downrod (fixed)
  {
    const g = new THREE.Group();
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.5, 32, 1, true), M.steel);
    canopy.position.y = 3.0; canopy.rotation.x = Math.PI; g.add(canopy);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 2.2, 24), M.steel);
    rod.position.y = 1.8; g.add(rod);
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 8), M.wire);
    wire.position.set(0.05, 1.8, 0.02); g.add(wire);
    add('rod', g, new THREE.Vector3(0,0,0), new THREE.Vector3(0,1.2,0), false);
  }
  // Fixed shaft
  {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.9, 24), M.steel);
    add('shaft', shaft, new THREE.Vector3(0,0,0), new THREE.Vector3(0,0.6,0), false);
  }
  // Stator: iron core + copper coils (fixed)
  {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.7, 24), M.iron); g.add(core);
    const N = 12;
    for (let i=0;i<N;i++){
      const a = i/N*Math.PI*2;
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.075, 10, 20), M.copper);
      coil.position.set(Math.cos(a)*0.62, 0, Math.sin(a)*0.62);
      coil.lookAt(0,0,0); g.add(coil);
    }
    add('stator', g, new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0), false);
  }
  // Capacitor (fixed, tucked under stator)
  {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 20), M.cap);
    body.rotation.z = Math.PI/2; g.add(body);
    const lead = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), M.wire);
    lead.position.set(0.3, 0.25, 0); g.add(lead);
    add('cap', g, new THREE.Vector3(0.0, -0.62, 0.35), new THREE.Vector3(1.6,-1.4,1.2), false);
  }
  // Bearings (fixed inner race; drawn as brass rings)
  {
    const top = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.07, 12, 32), M.bearing); top.rotation.x = Math.PI/2;
    add('bearTop', top, new THREE.Vector3(0,0.52,0), new THREE.Vector3(0,1.0,0), false);
    const bot = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.07, 12, 32), M.bearing); bot.rotation.x = Math.PI/2;
    add('bearBot', bot, new THREE.Vector3(0,-0.52,0), new THREE.Vector3(0,-1.0,0), false);
  }
  // Rotor: aluminium bar ring + outer housing (spins)
  {
    const g = new THREE.Group();
    const N = 24;
    for (let i=0;i<N;i++){
      const a = i/N*Math.PI*2;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), M.alu);
      bar.position.set(Math.cos(a)*0.95, 0, Math.sin(a)*0.95); bar.rotation.y = -a; g.add(bar);
    }
    const ringT = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.05, 8, 48), M.alu); ringT.rotation.x = Math.PI/2; ringT.position.y = 0.35; g.add(ringT);
    const ringB = ringT.clone(); ringB.position.y = -0.35; g.add(ringB);
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.95, 48, 1, true), M.housing); g.add(shell);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.05, 0.12, 48), M.housing); cap.position.y = -0.53; g.add(cap);
    const lid = new THREE.Mesh(new THREE.RingGeometry(0.3, 1.15, 48), M.housing); lid.rotation.x = -Math.PI/2; lid.position.y = 0.475; g.add(lid);
    add('rotor', g, new THREE.Vector3(0,0,0), new THREE.Vector3(0,-2.2,0), true);
  }
  // Blades (spin)
  {
    const g = new THREE.Group();
    for (let i=0;i<3;i++){
      const a = i/3*Math.PI*2;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.16), M.steel); arm.position.x = 1.3;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.03, 0.42), M.blade); blade.position.x = 2.85;
      const pivot = new THREE.Group(); pivot.add(arm); pivot.add(blade);
      blade.rotation.x = THREE.MathUtils.degToRad(11); // pitch
      pivot.rotation.y = a; pivot.position.y = -0.05; g.add(pivot);
    }
    add('blades', g, new THREE.Vector3(0,0,0), new THREE.Vector3(0,-3.4,0), true);
  }

  // Airflow particles
  const AIR_N = 260;
  const airGeo = new THREE.BufferGeometry();
  const airPos = new Float32Array(AIR_N*3);
  const airSeed = [];
  for (let i=0;i<AIR_N;i++){
    const r = Math.random()*3.2, a = Math.random()*Math.PI*2;
    airSeed.push({r, a, y: -Math.random()*6 - 0.5, s: 0.6+Math.random()*0.8});
    airPos[i*3]=Math.cos(a)*r; airPos[i*3+1]=airSeed[i].y; airPos[i*3+2]=Math.sin(a)*r;
  }
  airGeo.setAttribute('position', new THREE.BufferAttribute(airPos, 3));
  const air = new THREE.Points(airGeo, new THREE.PointsMaterial({color:0x5E8DC4, size:0.06, transparent:true, opacity:0.0}));
  scene.add(air);

  // ---------- State ----------
  const state = {step:0, explode:0, targetExplode:0, playing:true, speed:3, angle:0, airOn:false, cut:false, focus:[]};
  const ui = {
    play: document.getElementById('play'), explode: document.getElementById('explode'),
    speed: document.getElementById('speed'), steps: document.getElementById('steps'),
    prev: document.getElementById('prev'), next: document.getElementById('next')
  };

  STORY.forEach((s,i) => {
    const b = document.createElement('button'); b.className='step'; b.id = 'step-'+i;
    b.innerHTML = `<span class="n">0${i+1}</span><span><div class="t">${s.t}</div><div class="d">${s.d}</div><div class="part">${s.part}</div></span>`;
    b.addEventListener('click', () => setStep(i));
    ui.steps.appendChild(b);
  });

  function setStep(i){
    state.step = (i + STORY.length) % STORY.length;
    const s = STORY[state.step];
    state.targetExplode = s.explode; ui.explode.value = Math.round(s.explode*100);
    state.airOn = !!s.air; state.cut = s.cut; state.focus = s.focus;
    document.querySelectorAll('.step').forEach((el,j) => el.classList.toggle('active', j===state.step));
    const active = document.getElementById('step-'+state.step);
    active.scrollIntoView({block:'nearest', behavior:'smooth'});
    applyFocus();
  }

  function applyFocus(){
    const focusOn = state.focus.length > 0;
    Object.entries(parts).forEach(([name,p]) => {
      const hot = state.focus.includes(name);
      p.meshes.forEach(m => {
        if (!m.userData.mat) { m.userData.mat = m.material.clone(); m.material = m.userData.mat; }
        const mat = m.material, base = mat.userData.baseColor ?? mat.color.getHex();
        mat.userData.baseColor = base;
        mat.transparent = true;
        let op = 1;
        if (name==='rotor' && state.cut && !hot) op = 0.22;
        if (focusOn && !hot) op = Math.min(op, 0.35);
        mat.opacity = op;
        mat.emissive = new THREE.Color(hot ? base : 0x000000);
        mat.emissiveIntensity = hot ? 0.25 : 0;
        mat.depthWrite = op > 0.9;
      });
    });
  }

  ui.play.addEventListener('click', () => { state.playing = !state.playing; ui.play.textContent = state.playing ? 'Pause' : 'Play'; });
  ui.explode.addEventListener('input', e => { state.targetExplode = e.target.value/100; });
  ui.speed.addEventListener('input', e => { state.speed = +e.target.value; });
  ui.prev.addEventListener('click', () => setStep(state.step-1));
  ui.next.addEventListener('click', () => setStep(state.step+1));

  // Orbit (pointer drag + wheel)
  let drag = null;
  canvas.addEventListener('pointerdown', e => { drag = {x:e.clientX, y:e.clientY}; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    cam.theta -= (e.clientX-drag.x)*0.006; cam.phi -= (e.clientY-drag.y)*0.006;
    cam.phi = Math.max(0.2, Math.min(Math.PI-0.2, cam.phi)); drag = {x:e.clientX, y:e.clientY};
  });
  canvas.addEventListener('pointerup', () => drag = null);
  canvas.addEventListener('pointercancel', () => drag = null);
  canvas.addEventListener('wheel', e => { e.preventDefault(); cam.r = Math.max(5, Math.min(16, cam.r + e.deltaY*0.01)); }, {passive:false});

  function resize(){
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w*renderer.getPixelRatio() || canvas.height !== h*renderer.getPixelRatio()){
      renderer.setSize(w, h, false); camera.aspect = w/h; camera.updateProjectionMatrix();
    }
  }

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = performance.now();
  function frame(now){
    const dt = Math.min(0.05, (now-last)/1000); last = now;
    resize();
    // explode lerp
    state.explode += (state.targetExplode - state.explode) * (reduce ? 1 : 0.08);
    Object.values(parts).forEach(p => p.g.position.copy(p.home).addScaledVector(p.off, state.explode));
    // spin
    if (state.playing) state.angle += dt * state.speed * 2.2;
    spinner.rotation.y = state.angle;
    // air
    const targetOp = (state.airOn && state.playing && state.speed>0) ? 0.85 : 0;
    air.material.opacity += (targetOp - air.material.opacity)*0.05;
    if (air.material.opacity > 0.02){
      const pos = air.geometry.attributes.position.array;
      for (let i=0;i<AIR_N;i++){
        const s = airSeed[i]; s.y -= dt * s.s * (0.6 + state.speed*0.5);
        if (s.y < -6.5) s.y = -0.5;
        pos[i*3+1] = s.y;
      }
      air.geometry.attributes.position.needsUpdate = true;
    }
    // camera
    camera.position.set(
      cam.target.x + cam.r*Math.sin(cam.phi)*Math.sin(cam.theta),
      cam.target.y + cam.r*Math.cos(cam.phi),
      cam.target.z + cam.r*Math.sin(cam.phi)*Math.cos(cam.theta));
    camera.lookAt(cam.target);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  setStep(0);
  requestAnimationFrame(frame);
})();
