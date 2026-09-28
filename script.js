(() => {
  'use strict';
  const Scene = Object.freeze({ FIREWORKS:'fireworks', TITLE:'title', FIRST_WAIT:'first-wait', FIRST_LEAVING:'first-leaving', CAKE_BUILD:'cake-build', CAKE_WAIT:'cake-wait', MODAL:'modal', WISHED:'wished', SECOND_WAIT:'second-wait', SECOND_LEAVING:'second-leaving', LETTER_INTRO:'letterIntro', WAITING_TO_OPEN:'waitingToOpen', OPENING:'opening', READING:'reading', CLOSING:'closing', WAITING_TO_CONTINUE:'waitingToContinue', LETTER_FINISHED:'letterFinished' });
  const stage = document.querySelector('.stage'), fireworks = document.querySelector('#fireworks'), fctx = fireworks.getContext('2d',{alpha:true});
  const cake = document.querySelector('#cake-particles'), cctx = cake.getContext('2d',{alpha:true});
  const greeting=document.querySelector('#greeting'), hint=document.querySelector('#continue-hint'), cakeScene=document.querySelector('#cake-scene');
  const flameButton=document.querySelector('#flame-button'), overlay=document.querySelector('#wish-overlay'), input=document.querySelector('#wish-input');
  const closeButton=document.querySelector('#wish-close'), submitButton=document.querySelector('#wish-submit'), exitButton=document.querySelector('#wish-exit');
  const form=document.querySelector('#wish-form'), confirmation=document.querySelector('#wish-confirmation'), error=document.querySelector('#wish-error'), toast=document.querySelector('#wish-toast');
  const letterScene=document.querySelector('#letter-scene'), letterEnvelope=document.querySelector('#letter-envelope');
  const letterOverlay=document.querySelector('#letter-overlay'), letterReader=document.querySelector('#letter-reader');
  const letterPhoto=document.querySelector('#letter-photo'), letterPeek=document.querySelector('#letter-peek'), letterLoadError=document.querySelector('#letter-load-error');
  const letterOpenButtons=document.querySelectorAll('.letter-open-button');
  const cakeEvents=new AbortController(),letterEvents=new AbortController();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches, clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
  let state=Scene.FIREWORKS, w=0,h=0,dpr=1,fwRaf=0,cakeRaf=0,last=0,started=0,launchIndex=0,hasWished=false,toastTimer=0,cakeStarted=0,flameHot=false;
  let nextFlameFlash=0,flameFlashUntil=0,wishOpening=false;
  let rockets=[], sparks=[], cakeBits=[];
  const plan=reduced?[200,880,1640,2440]:[400,1250,2300,3400,4550,5500];
  const colors=[['#159dff','#5ed7ff'],['#14e2d1','#62fff0'],['#9165ff','#c09cff'],['#f05cae','#ff9bca'],['#ffd34d','#ffe99a'],['#ff8650','#ffbc73']];
  const rgba=(hex,a)=>{const v=parseInt(hex.slice(1),16);return `rgba(${v>>16},${(v>>8)&255},${v&255},${clamp(a,0,1)})`;};
  const track=(o,n=9)=>{o.history.push({x:o.x,y:o.y});if(o.history.length>n)o.history.shift();};
  const trail=(ctx,history,color,a,width)=>{for(let i=1;i<history.length;i++){ctx.strokeStyle=rgba(color,a*i/history.length);ctx.lineWidth=width*i/history.length;ctx.beginPath();ctx.moveTo(history[i-1].x,history[i-1].y);ctx.lineTo(history[i].x,history[i].y);ctx.stroke();}};
  class Rocket {
    constructor(i){const p=[[.18,.27,.84],[.67,.17,1.35],[.81,.43,.76],[.36,.32,.92],[.54,.12,1.43],[.13,.48,.72]][i];this.tx=w*p[0];this.ty=h*p[1];this.x=clamp(this.tx+(Math.random()-.5)*w*.22,w*.1,w*.9);this.y=h+28;this.sx=this.x;this.sy=this.y;this.s=p[2];this.c=colors[i];this.t=0;this.d=(reduced?.9:1.32)+Math.random()*(reduced?.2:.6);this.history=[];}
    update(dt){this.t=Math.min(1,this.t+dt/this.d);const e=1-Math.pow(1-this.t,2.45);this.x=this.sx+(this.tx-this.sx)*e;this.y=this.sy+(this.ty-this.sy)*e;track(this,12);if(this.t>=1)explode(this.x,this.y,this.s,this.c);}
    draw(){trail(fctx,this.history,this.c[1],.5,1.4);fctx.fillStyle='#fffdf2';fctx.shadowBlur=10;fctx.shadowColor=this.c[0];fctx.beginPath();fctx.arc(this.x,this.y,1.8,0,7);fctx.fill();fctx.shadowBlur=0;}
    get dead(){return this.t>=1;}
  }
  class Spark {
    constructor(x,y,a,s,c){this.x=x;this.y=y;this.vx=Math.cos(a)*s;this.vy=Math.sin(a)*s;this.c=c;this.life=0;this.hold=.65+Math.random()*.25;this.max=this.hold+2.6+Math.random()*1.1;this.history=[{x,y}];}
    update(dt){const fall=Math.max(0,this.life-this.hold), ramp=clamp(fall/.75,0,1);this.x+=this.vx*dt;this.y+=this.vy*dt;this.vx*=Math.exp(-.46*dt);this.vy=this.vy*Math.exp(-.46*dt)+(110+Math.random()*50)*ramp*dt;this.life+=dt;track(this,11);}
    draw(){const fall=Math.max(0,this.life-this.hold),a=fall?Math.pow(1-fall/(this.max-this.hold),1.15):1;trail(fctx,this.history,this.c,a*.85,1.45);fctx.fillStyle=rgba(this.c,a);fctx.beginPath();fctx.arc(this.x,this.y,.8*a,0,7);fctx.fill();}
    get dead(){return this.life>=this.max;}
  }
  function explode(x,y,size,c){for(let i=0,n=Math.round((reduced?25:48)*size);i<n;i++)sparks.push(new Spark(x,y,Math.PI*2*i/n+(Math.random()-.5)*.12,(94+Math.random()*104)*size,Math.random()<.78?c[0]:c[1]));}
  function resize(){fctx.clearRect(0,0,fireworks.width,fireworks.height);cctx.clearRect(0,0,cake.width,cake.height);dpr=Math.min(devicePixelRatio||1,2);w=innerWidth;h=innerHeight;for(const x of [fireworks,cake]){x.width=Math.round(w*dpr);x.height=Math.round(h*dpr);x.style.width=w+'px';x.style.height=h+'px';}fctx.setTransform(dpr,0,0,dpr,0,0);cctx.setTransform(dpr,0,0,dpr,0,0);if(cakeBits.length)layoutCake();}
  function fireFrame(t){if(!started)started=t;const dt=Math.min(.034,Math.max(.001,(t-(last||t))/1000));last=t;fctx.clearRect(0,0,fireworks.width,fireworks.height);fctx.globalCompositeOperation='lighter';while(launchIndex<plan.length&&t-started>=plan[launchIndex])rockets.push(new Rocket(launchIndex++));rockets.forEach(x=>{x.update(dt);x.draw();});rockets=rockets.filter(x=>!x.dead);sparks.forEach(x=>{x.update(dt);x.draw();});sparks=sparks.filter(x=>!x.dead);fctx.globalCompositeOperation='source-over';if(launchIndex<plan.length||rockets.length||sparks.length)fwRaf=requestAnimationFrame(fireFrame);else fctx.clearRect(0,0,fireworks.width,fireworks.height);}
  function beginFirstExit(){if(state!==Scene.FIRST_WAIT)return;state=Scene.FIRST_LEAVING;stage.classList.add('is-first-leaving');greeting.classList.remove('is-visible');hint.classList.remove('is-visible');cancelAnimationFrame(fwRaf);rockets=[];sparks=[];fctx.clearRect(0,0,fireworks.width,fireworks.height);setTimeout(startCake,reduced?260:650);}
  // All cake geometry is invisible sampling data. Only point sprites reach the canvas.
  const cakeSprites = new Map();
  const orbitSpecs=[
    {radius:.94,height:.55,tilt:-.38,speed:.09,phase:.55,color:'#F4B5D5'},
    {radius:.72,height:.84,tilt:-.30,speed:.075,phase:2.75,color:'#FFD784'}
  ];
  let cakeDrawOrder=[],dustPool=[],flameSparks=[],cakeLastTime=0,dustCredit=0;
  let cakeScale = 1, cakeDpr = 1;
  const tilt = .28, ct = Math.cos(tilt), st = Math.sin(tilt);
  const cakeOrigin=.69, cakeTop=1.16, candleTop=1.445, flameCenter=1.57;
  function projectCake(x,y,z) {
    return {x:w*.5+x*cakeScale, y:h*cakeOrigin+(-y*ct+z*st)*cakeScale};
  }
  function cakeSprite(color,shape='round') {
    const key=color+shape;
    if(cakeSprites.has(key)) return cakeSprites.get(key);
    const sprite=document.createElement('canvas'); sprite.width=sprite.height=24;
    const g=sprite.getContext('2d'), glow=g.createRadialGradient(12,12,0,12,12,12);
    glow.addColorStop(0,color); glow.addColorStop(.13,color);
    glow.addColorStop(.3,rgba(color,.65)); glow.addColorStop(.6,rgba(color,.12)); glow.addColorStop(1,rgba(color,0));
    g.fillStyle=glow;g.fillRect(0,0,24,24);
    if(shape==='fleck'){
      g.clearRect(0,0,24,24);g.fillStyle=glow;g.fillRect(0,0,24,24);
      g.fillStyle=rgba(color,.9);g.fillRect(9,7,4,10);
    }else if(shape==='star'){
      g.fillStyle=rgba(color,.85);g.beginPath();g.moveTo(12,1);g.lineTo(14,10);
      g.lineTo(23,12);g.lineTo(14,14);g.lineTo(12,23);g.lineTo(10,14);
      g.lineTo(1,12);g.lineTo(10,10);g.closePath();g.fill();
    }
    cakeSprites.set(key,sprite);return sprite;
  }
  function makeCake() {
    cakeBits=[];cakeLastTime=0;dustCredit=0;flameFlashUntil=0;wishOpening=false;
    dustPool=Array.from({length:reduced?12:w<600?36:64},()=>({active:false}));
    flameSparks=Array.from({length:reduced?10:w<600?24:36},()=>({active:false}));
    const density=w<600?.48:1;
    function point(x,y,z,kind,color,_legacyDelay,brightness=1) {
      const a=Math.random()*Math.PI*2, radius=.22+Math.random()*.62;
      // Every cake region shares one arrival window, independent of its height.
      const late=Math.random()<.08?.2+Math.random()*.2:0;
      const material=Math.random();
      cakeBits.push({x3:x,y3:y,z3:z,kind,color,
        delay:kind==='flame'?2.5:kind==='ambient'?.5:Math.random()*.08,
        duration:kind==='flame'?.28:1.2+Math.random()*.45+late, phase:Math.random()*Math.PI*2,
        material:material<.72?'round':material<.93?'fleck':'shimmer',starEligible:Math.random()<(w<600?.035:.065),
        depth:z*ct+y*st,peak:.22+Math.random()*.55,
        bend:(Math.random()-.5)*38,
        size:(.65+Math.random()*.65)*(1+z*.1),brightness:brightness*(.65+Math.random()*.35),
        period:1.2+Math.random()*2.3,drift:2+Math.random()*4,
        fromX:Math.cos(a)*radius,fromY:Math.sin(a)*radius});
    }
    function tier(radius,bottom,height,nextRadius,level) {
      const top=bottom+height;
      const sideCount=Math.round([1450,1250,1000][level]*density);
      // Dense walls, exposed tops, and internal volume share exactly touching tier heights.
      for(let i=0;i<sideCount;i++){
        const a=Math.random()*(i>sideCount*.7?Math.PI:Math.PI*2),y=bottom+Math.random()*height;
        const front=Math.sin(a),accent=Math.random(),heightMix=(y-bottom)/height;
        const color=front>.25&&accent<.025?'#FFD784':level===0
          ?(accent<.075?'#F4B5D5':accent<.52-.24*heightMix?'#5688FF':accent<.8?'#54D7F2':'#A9E9FF')
          :level===1?(accent<.12?'#F4B5D5':accent<.48?'#887CFF':accent<.7?'#54D7F2':'#C6B5FF')
          :(accent<.12?'#F4B5D5':accent<.57?'#887CFF':'#C6B5FF');
        point(Math.cos(a)*radius,y,Math.sin(a)*radius,'side',color,
          0,.55+.45*(front+1)/2);
      }
      for(let i=0;i<Math.round([850,650,500][level]*density);i++){
        const a=Math.random()*Math.PI*2,r=radius*Math.sqrt(Math.random());
        if(r<nextRadius){i--;continue;}
        const color=level===0?'#A9E9FF':level===1?'#C6B5FF':Math.random()<.36?'#A9E9FF':'#C6B5FF';
        point(Math.cos(a)*r,top,Math.sin(a)*r,'top',color,0,.9);
      }
      for(let i=0;i<Math.round([1000,750,550][level]*density);i++){
        const a=Math.random()*Math.PI*2,r=radius*Math.sqrt(Math.random());
        point(Math.cos(a)*r,bottom+Math.random()*height,Math.sin(a)*r,'inside',level===0?'#5688FF':'#887CFF',0,.48);
      }
    }
    tier(.80,0,.39,.62,0);
    tier(.62,.39,.38,.47,1);
    tier(.47,.77,.39,0,2);
    // Sparse frosting glints across the top, with no continuous band on the walls.
    for(let i=0;i<Math.round(430*density);i++){
      const a=Math.random()*Math.PI*2,r=.47*Math.sqrt(Math.random());
      point(Math.cos(a)*r,cakeTop+.002,Math.sin(a)*r,'cream',i%5===0?'#F4B5D5':i%3===0?'#C6B5FF':'#F4FCFF',0,.8);
    }
    // The candle begins inside the third tier's top surface.
    for(let i=0;i<Math.round(230*density);i++){
      const a=Math.random()*Math.PI*2,y=cakeTop-.015+Math.random()*.30,r=.035*Math.sqrt(Math.random());
      point(Math.cos(a)*r,y,Math.sin(a)*r,'candle',['#A8E6FF','#F3B6D5','#C5B5FF'][Math.floor((a+y*85)/(Math.PI*2)*3)%3],0,1);
    }
    // A closed teardrop volume touches the candle at its tip.
    for(let i=0;i<Math.round(200*density);i++){
      const u=Math.random(),a=Math.random()*Math.PI*2,r=.081*Math.pow(Math.sin(Math.PI*u),.75)*(1-u*.6)*Math.sqrt(Math.random());
      const color=r<.028?'#FFF5D7':r<.052?'#FFD784':Math.random()<.16?'#F4B5D5':'#FFB89E';
      point(Math.cos(a)*r,candleTop+u*.254,Math.sin(a)*r,'flame',color,0,1.2);
    }
    // An asymmetric, loose stardust cloud below and beside the cake.
    for(let i=0;i<(w<600?78:156);i++){
      const lower=Math.random()<.72,side=Math.random()<.55?-1:1;
      const spread=Math.pow(Math.random(),1.7);
      const y=lower?-.035-spread*.43:.08+Math.random()*.86;
      const x=lower?(Math.random()-.5)*(1.3+spread*.8)
        :side*(w<600?.86+Math.random()*.18:.94+Math.random()*.4);
      const accent=Math.random(),color=accent<.48?'#A8E6FF':accent<.8?'#C5B5FF':accent<.96?'#F3B6D5':'#FFD98A';
      point(x,y,(Math.random()-.5)*.35,'ambient',color,.5,1.18);
      cakeBits[cakeBits.length-1].size*=1.22;
      cakeBits[cakeBits.length-1].starEligible=Math.random()<.18;
    }
    // Open diagonal star-dust paths around the cake, separate from its surface.
    for(let band=0;band<orbitSpecs.length;band++)for(let i=0;i<(w<600?300:620);i++){
      point(0,0,0,'orbit',orbitSpecs[band].color,0,1.05);
      Object.assign(cakeBits[cakeBits.length-1],{band,u:Math.random(),ribbonOffset:(Math.random()-.5)*.022,delay:2.05,duration:.45});
    }
    // Rear points first; no wireframe, disks, strokes or visible geometry.
    cakeBits.sort((a,b)=>(a.z3*ct+a.y3*st)-(b.z3*ct+b.y3*st));
    cakeDrawOrder=cakeBits.slice();
    // Cache tiny particle textures once, rather than constructing gradients in the frame loop.
    for(const b of cakeBits){b.sprite=cakeSprite(b.color,b.material==='fleck'?'fleck':'round');b.starSprite=b.starEligible?cakeSprite(b.color,'star'):null;}
    layoutCake();
  }
  function layoutCake(){
    cakeScale=Math.min(w*.405,h*.25);
    cakeDpr=Math.min(devicePixelRatio||1,w<600?1.25:2);
    cake.width=Math.round(w*cakeDpr);cake.height=Math.round(h*cakeDpr);
    cctx.setTransform(cakeDpr,0,0,cakeDpr,0,0);
    cakeBits.forEach(b=>{const p=projectCake(b.x3,b.y3,b.z3);b.tx=b.kind==='ambient'?clamp(p.x,14,w-14):p.x;b.ty=p.y;});
    const p=projectCake(0,flameCenter,0);
    flameButton.style.left=p.x+'px';flameButton.style.top=p.y+'px';
  }
  function startCake(){state=Scene.CAKE_BUILD;stage.classList.remove('is-first-leaving');cake.hidden=false;cakeScene.hidden=false;makeCake();cakeStarted=performance.now();nextFlameFlash=cakeStarted+1250+Math.random()*600;cakeScene.classList.add('is-visible');cakeRaf=requestAnimationFrame(cakeFrame);}
  // Reused projection scratch space keeps the animation allocation-free per particle.
  const flightNow={x:0,y:0},flightOld={x:0,y:0};
  function flightPoint(b,progress,out){
    const ease=1-Math.pow(1-progress,3),arc=Math.sin(progress*Math.PI)*(1-progress)*b.bend;
    out.x=w*(.5+b.fromX)*(1-ease)+b.tx*ease+arc;
    out.y=h*(.5+b.fromY)*(1-ease)+b.ty*ease-arc*.6;
  }
  function updateOrbit(b,seconds){
    const spec=orbitSpecs[b.band],rotation=reduced?0:seconds*spec.speed;
    const a=spec.phase+rotation+(b.u-.5)*Math.PI*1.4;
    const radius=spec.radius+.025*Math.sin(a*2+seconds*.12);
    const x=Math.cos(a)*radius,z=Math.sin(a)*radius;
    const y=spec.height+spec.tilt*Math.cos(a)+.035*Math.sin(a*2+spec.phase)+b.ribbonOffset;
    b.tx=w*.5+x*cakeScale;b.ty=h*cakeOrigin+(-y*ct+z*st)*cakeScale;
    b.depth=z*ct+y*st;
    b.visibility=(.35+.65*(Math.sin(a)+1)/2)*Math.pow(Math.sin(Math.PI*b.u),.55);
    // Ray/cylinder visibility: rear ribbons disappear behind the point-cloud volume.
    // The cylinders are mathematical tests only; no solid mask is rendered.
    for(const tier of cakeOccluders){
      if(Math.abs(x)>=tier.radius)continue;
      const frontZ=Math.sqrt(tier.radius*tier.radius-x*x);
      const surfaceY=y+(frontZ-z)*st/ct;
      if(z<frontZ-.02&&surfaceY>tier.bottom&&surfaceY<tier.top)b.visibility*=.08;
    }
  }
  const cakeOccluders=[
    {radius:.80,bottom:0,top:.39},
    {radius:.62,bottom:.39,top:.77},
    {radius:.47,bottom:.77,top:cakeTop}
  ];
  const dustColors=['#A9E9FF','#C6B5FF','#F4B5D5','#FFD784'];
  function drawDust(dt,elapsed){
    if(elapsed<2.45)return;
    dustCredit+=dt*(reduced?1:w<600?8:15);
    for(const p of dustPool){
      if(!p.active&&dustCredit>=1){
        dustCredit-=1;
        const a=Math.random()*Math.PI,r=.4+Math.random()*.4;
        p.active=true;p.age=0;p.life=1.7+Math.random()*1.3;
        p.x=Math.cos(a)*r;p.z=Math.sin(a)*r;p.fall=.24+Math.random()*.18;
        p.drift=(Math.random()-.5)*.07;p.phase=Math.random()*6.28;
        p.size=2.6+Math.random()*1.8;
        p.sprite=cakeSprite(dustColors[Math.random()<.07?3:Math.floor(Math.random()*3)],Math.random()<.2?'fleck':'round');
      }
      if(!p.active)continue;
      p.age+=dt;const u=p.age/p.life;
      if(u>=1){p.active=false;continue;}
      const x=w*.5+(p.x+p.drift*u)*cakeScale+Math.sin(u*3+p.phase)*2;
      const y=h*cakeOrigin+(p.z*st+p.fall*(.3*u+.7*u*u))*cakeScale;
      const size=p.size*(1-.6*u);
      cctx.globalAlpha=Math.min(1,u*9)*Math.pow(1-u,1.4)*.9;
      cctx.drawImage(p.sprite,x-size/2,y-size/2,size,size);
    }
    dustCredit=Math.min(dustCredit,1);
  }
  const sparkColors=['#FFF2C9','#FFD784','#FFB89E','#F4B5D5'];
  function emitFlameSparks(click=false,hover=false){
    const origin=projectCake(0,flameCenter,0);
    const count=click?12:hover?4:2+Math.floor(Math.random()*4);
    for(let i=0;i<count;i++){
      const p=flameSparks.find(bit=>!bit.active);
      if(!p)break;
      const angle=click?Math.PI*2*i/count:0;
      p.active=true;p.age=0;p.life=click?.24+Math.random()*.1:.65+Math.random()*.45;
      p.x=origin.x+(Math.random()-.5)*9;p.y=origin.y-3-Math.random()*7;
      p.vx=click?Math.cos(angle)*(38+Math.random()*18):(Math.random()-.5)*16;
      p.vy=click?Math.sin(angle)*(38+Math.random()*18):-16-Math.random()*12;
      p.size=click?2.1+Math.random()*1.1:1.9+Math.random()*1.6;
      p.sprite=cakeSprite(sparkColors[Math.floor(Math.random()*sparkColors.length)]);
      p.starSprite=!reduced&&Math.random()<.12?cakeSprite('#FFE5AC','star'):null;
    }
  }
  function drawFlameSparks(dt){
    for(const p of flameSparks){
      if(!p.active)continue;
      p.age+=dt;const u=p.age/p.life;
      if(u>=1){p.active=false;continue;}
      p.x+=p.vx*dt;p.y+=p.vy*dt;
      const size=p.size*(1-.58*u);
      cctx.globalAlpha=Math.min(1,u*10)*Math.pow(1-u,1.25);
      cctx.drawImage(p.sprite,p.x-size/2,p.y-size/2,size,size);
      if(p.starSprite&&u<.42){
        cctx.globalAlpha*=.55*(1-u/.42);
        cctx.drawImage(p.starSprite,p.x-size,p.y-size,size*2,size*2);
      }
    }
  }
  function cakeFrame(t){
    const elapsed=(t-cakeStarted)/1000*(reduced?2:1);
    const dt=Math.min(.04,(t-(cakeLastTime||t))/1000);cakeLastTime=t;
    cctx.clearRect(0,0,cake.width,cake.height);cctx.globalCompositeOperation='lighter';
    const breath=reduced?0:Math.sin(t/1800)*.65;
    if(elapsed>2.8&&t>=nextFlameFlash){
      flameFlashUntil=t+190;nextFlameFlash=t+1200+Math.random()*1000;
      if(!reduced)emitFlameSparks();
    }
    const flameFlash=clamp((flameFlashUntil-t)/260,0,1);
    for(const b of cakeBits)if(b.kind==='orbit')updateOrbit(b,elapsed);
    cakeDrawOrder.sort((a,b)=>a.depth-b.depth);
    for(const b of cakeDrawOrder){
      const progress=clamp((elapsed-b.delay)/b.duration,0,1);
      if(progress===0)continue;
      const ambient=b.kind==='ambient',orbit=b.kind==='orbit',flame=b.kind==='flame';
      const surface=!ambient&&!orbit&&!flame&&b.kind!=='inside';
      const pulse=Math.pow((1+Math.sin(t/1000*Math.PI*2/b.period+b.phase))/2,b.material==='shimmer'?9:3);
      const activeTwinkle=!reduced&&elapsed>2.45;
      const twinkle=ambient?(reduced?.72:.46+.54*pulse):surface&&activeTwinkle?.83+pulse*b.peak:1;
      const sway=flame&&!reduced?Math.sin(t/620)*2.1+Math.sin(t/1030+.8)*.6:Math.sin(t/1600+b.phase)*(ambient&&!reduced?b.drift:.45);
      const ease=1-Math.pow(1-progress,3);
      let x=b.tx,y=b.ty;
      if(progress<1&&!orbit&&!flame){flightPoint(b,progress,flightNow);x=flightNow.x;y=flightNow.y;}
      x+=sway*ease;y+=(breath+Math.cos(t/2000+b.phase)*(ambient&&!reduced?b.drift:.35))*ease;
      if(flame&&!reduced){
        x+=b.x3*cakeScale*(.09*Math.sin(t/530+.4));
        y-=(b.y3-candleTop)*ct*cakeScale*(.10*Math.sin(t/480+.7)+.025*Math.sin(t/880));
      }
      const highlight=surface&&activeTwinkle&&b.material==='shimmer'?pulse:0;
      const size=b.size*(w<600?3:3.6)*(flame?1.12:1)*(1+highlight*.24);
      const flameGlow=flame?(reduced?1:.86+.13*Math.sin(t/510)+flameFlash*.38+(flameHot?.16:0)):1;
      const alpha=clamp((orbit||flame?progress:Math.min(1,progress*5))*b.brightness*twinkle*(orbit?b.visibility:1)*flameGlow,0,1);
      // Short analytic history: redraw fresh each frame; no persistent canvas pixels.
      if(progress<1&&!ambient&&!orbit&&!flame&&!reduced){
        for(let j=3;j>0;j--){
          flightPoint(b,Math.max(0,progress-j*.004*(1-progress)),flightOld);
          cctx.globalAlpha=alpha*(4-j)*.08*(1-progress);
          cctx.drawImage(b.sprite,flightOld.x-size/2,flightOld.y-size/2,size,size);
        }
      }
      cctx.globalAlpha=alpha;
      cctx.drawImage(b.sprite,x-size/2,y-size/2,size,size);
      const ambientStar=ambient&&!reduced&&b.starEligible&&pulse>.94;
      if(b.starSprite&&(highlight>.88||ambientStar)){
        cctx.globalAlpha=alpha*(ambientStar?(pulse-.94)/.06*.55:(highlight-.88)/.12*.6);
        cctx.drawImage(b.starSprite,x-size,y-size,size*2,size*2);
      }
    }
    drawDust(dt,elapsed);
    drawFlameSparks(dt);
    cctx.globalAlpha=1;cctx.globalCompositeOperation='source-over';
    const flame=projectCake(0,flameCenter,0);
    flameButton.style.left=(flame.x+(reduced?0:Math.sin(t/620)*2.1+Math.sin(t/1030+.8)*.6))+'px';
    flameButton.style.top=(flame.y+breath)+'px';
    if(elapsed>=2.8&&state===Scene.CAKE_BUILD)state=Scene.CAKE_WAIT;
    if([Scene.CAKE_BUILD,Scene.CAKE_WAIT,Scene.MODAL,Scene.WISHED,Scene.SECOND_WAIT].includes(state))cakeRaf=requestAnimationFrame(cakeFrame);
  }
  function openWish(){if(hasWished){showToast();return;}if(state!==Scene.CAKE_WAIT&&state!==Scene.WISHED)return;state=Scene.MODAL;overlay.hidden=false;requestAnimationFrame(()=>overlay.classList.add('is-visible'));setTimeout(()=>input.focus(),250);}
  function closeWish(){if(state!==Scene.MODAL)return;overlay.classList.remove('is-visible');setTimeout(()=>{overlay.hidden=true;state=Scene.CAKE_WAIT;},350);}
  function submitWish(){if(state!==Scene.MODAL)return;if(!input.value.trim()){error.textContent='还没有告诉我愿望呢';input.focus();return;}hasWished=true;input.value='';error.textContent='';form.hidden=true;confirmation.hidden=false;state=Scene.WISHED;}
  function exitWish(){if(state!==Scene.WISHED)return;overlay.classList.remove('is-visible');setTimeout(()=>{overlay.hidden=true;state=Scene.SECOND_WAIT;hint.textContent='点击空白处以继续';hint.classList.add('is-visible');hint.setAttribute('aria-hidden','false');},350);}
  function showToast(){clearTimeout(toastTimer);toast.hidden=false;requestAnimationFrame(()=>toast.classList.add('is-visible'));toastTimer=setTimeout(()=>{toast.classList.remove('is-visible');setTimeout(()=>toast.hidden=true,300);},2000);}
  function endSecond(){
    if(state!==Scene.SECOND_WAIT)return;
    state=Scene.SECOND_LEAVING;stage.classList.add('is-second-leaving');hint.classList.remove('is-visible');
    cancelAnimationFrame(cakeRaf);cakeEvents.abort();clearTimeout(toastTimer);
    cakeBits=[];cakeDrawOrder=[];dustPool=[];flameSparks=[];cakeSprites.clear();dustCredit=0;cakeLastTime=0;
    setTimeout(()=>{cctx.clearRect(0,0,cake.width,cake.height);cake.hidden=true;cakeScene.hidden=true;beginLetter();},reduced?350:1050);
  }
  const letterTimers=new Set();
  function letterLater(fn,delay){const id=setTimeout(()=>{letterTimers.delete(id);fn();},delay);letterTimers.add(id);}
  function beginLetter(){
    if(state!==Scene.SECOND_LEAVING)return;
    state=Scene.LETTER_INTRO;stage.classList.add('is-letter-mode');letterScene.hidden=false;
    requestAnimationFrame(()=>letterScene.classList.add('is-visible'));
    letterLater(()=>{if(state===Scene.LETTER_INTRO)state=Scene.WAITING_TO_OPEN;},reduced?180:650);
  }
  function openLetter(){
    if(state!==Scene.WAITING_TO_OPEN)return;
    state=Scene.OPENING;letterScene.classList.add('has-been-opened','is-opening');
    letterOpenButtons.forEach(button=>button.disabled=true);
    letterLater(()=>letterScene.classList.add('is-flap-open'),reduced?70:350);
    letterLater(()=>letterScene.classList.add('is-letter-rising'),reduced?140:740);
    letterLater(()=>{
      if(state!==Scene.OPENING)return;
      letterScene.classList.add('is-reading');letterOverlay.hidden=false;
      document.body.classList.add('letter-reading-lock');
      requestAnimationFrame(()=>letterOverlay.classList.add('is-visible'));
    },reduced?260:1320);
    letterLater(()=>{if(state===Scene.OPENING){state=Scene.READING;letterReader.focus({preventScroll:true});}},reduced?500:2030);
  }
  function closeLetter(){
    if(state!==Scene.READING)return;
    state=Scene.CLOSING;letterOverlay.classList.remove('is-visible');
    letterLater(()=>{
      if(state!==Scene.CLOSING)return;
      letterOverlay.hidden=true;letterScene.classList.remove('is-reading');
    },reduced?160:520);
    letterLater(()=>letterScene.classList.remove('is-letter-rising'),reduced?190:660);
    letterLater(()=>letterScene.classList.remove('is-flap-open'),reduced?220:1110);
    letterLater(()=>{
      if(state!==Scene.CLOSING)return;
      letterScene.classList.remove('is-opening');
      document.body.classList.remove('letter-reading-lock');
      hint.textContent='点击空白处以继续';hint.classList.add('is-visible');hint.setAttribute('aria-hidden','false');
      state=Scene.WAITING_TO_CONTINUE;stage.focus({preventScroll:true});
    },reduced?300:1540);
  }
  function finishLetter(){
    if(state!==Scene.WAITING_TO_CONTINUE)return;
    state=Scene.LETTER_FINISHED;hint.classList.remove('is-visible');letterScene.classList.add('is-leaving');
    letterTimers.forEach(clearTimeout);letterTimers.clear();
    letterLater(()=>{
      letterScene.hidden=true;letterEvents.abort();
      document.dispatchEvent(new Event('birthday:final-start'));
    },reduced?250:850);
  }
  function stageClick(e){
    if(e.target.closest('button, textarea, .wish-dialog, .wish-toast, .letter-envelope, .letter-reader'))return;
    if(state===Scene.FIRST_WAIT)beginFirstExit();
    else if(state===Scene.SECOND_WAIT)endSecond();
    else if(state===Scene.WAITING_TO_CONTINUE)finishLetter();
  }
  function handleFlameClick(){
    if(hasWished){openWish();return;}
    if(state!==Scene.CAKE_WAIT||wishOpening)return;
    wishOpening=true;flameHot=true;flameFlashUntil=performance.now()+300;
    emitFlameSparks(true);
    setTimeout(()=>{flameHot=false;wishOpening=false;if(state===Scene.CAKE_WAIT&&!hasWished)openWish();},240);
  }
  flameButton.addEventListener('click',e=>{e.stopPropagation();handleFlameClick();},{signal:cakeEvents.signal});
  flameButton.addEventListener('pointerenter',()=>{flameHot=true;if(state===Scene.CAKE_WAIT)emitFlameSparks(false,true);},{signal:cakeEvents.signal});
  flameButton.addEventListener('pointerleave',()=>flameHot=false,{signal:cakeEvents.signal});
  closeButton.addEventListener('click',closeWish,{signal:cakeEvents.signal});submitButton.addEventListener('click',submitWish,{signal:cakeEvents.signal});exitButton.addEventListener('click',exitWish,{signal:cakeEvents.signal});overlay.addEventListener('click',e=>{if(e.target===overlay)closeWish();},{signal:cakeEvents.signal});
  letterOpenButtons.forEach(button=>button.addEventListener('click',e=>{e.stopPropagation();openLetter();},{signal:letterEvents.signal}));
  letterEnvelope.addEventListener('click',e=>e.stopPropagation(),{signal:letterEvents.signal});
  letterReader.addEventListener('click',e=>e.stopPropagation(),{signal:letterEvents.signal});
  letterOverlay.addEventListener('click',e=>{if(e.target===letterOverlay)closeLetter();},{signal:letterEvents.signal});
  letterPhoto.addEventListener('error',()=>{letterPhoto.hidden=true;letterPeek.hidden=true;letterLoadError.hidden=false;},{signal:letterEvents.signal});
  if(letterPhoto.complete&&!letterPhoto.naturalWidth){letterPhoto.hidden=true;letterPeek.hidden=true;letterLoadError.hidden=false;}
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state===Scene.READING){e.preventDefault();closeLetter();}},{signal:letterEvents.signal});
  stage.addEventListener('click',stageClick);stage.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&[Scene.FIRST_WAIT,Scene.SECOND_WAIT,Scene.WAITING_TO_CONTINUE].includes(state)){e.preventDefault();if(state===Scene.FIRST_WAIT)beginFirstExit();else if(state===Scene.SECOND_WAIT)endSecond();else finishLetter();}});
  function reveal(){if(state!==Scene.FIREWORKS)return;state=Scene.TITLE;greeting.setAttribute('aria-hidden','false');greeting.classList.add('is-visible');setTimeout(()=>{if(state===Scene.TITLE){state=Scene.FIRST_WAIT;hint.classList.add('is-visible');hint.setAttribute('aria-hidden','false');}},reduced?650:1400);}
  resize();addEventListener('resize',resize,{passive:true});stage.tabIndex=0;fwRaf=requestAnimationFrame(fireFrame);setTimeout(reveal,reduced?3550:7400);
})();
