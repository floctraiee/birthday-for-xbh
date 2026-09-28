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
  const mobileOpening=innerWidth<600;
  // Keep the original launch anchors and the title timing. Extra, smaller
  // rockets are staggered inside the same three performance windows.
  const plan=reduced
    ?(mobileOpening?[200,540,880,1640,2090,2280,2440]:[200,540,880,1640,1770,1900,2160,2300,2440])
    :(mobileOpening?[400,825,1250,2300,3400,4550,5025,5500]:[400,690,980,1250,2300,2740,3400,4550,4820,5110,5500]);
  const openingOrder=reduced
    ?(mobileOpening?[0,7,1,2,3,4,5]:[0,6,1,2,8,3,4,9,5])
    :(mobileOpening?[0,7,1,2,3,4,8,5]:[0,6,7,1,2,8,3,4,9,10,5]);
  const openingTargets=[[.18,.27,.84],[.67,.17,1.35],[.81,.43,.76],[.36,.32,.92],[.54,.12,1.43],[.13,.48,.72],
    [.44,.48,.78],[.89,.23,.70],[.10,.16,.87],[.78,.34,.96],[.31,.18,.74]];
  const colors=[['#159dff','#5ed7ff'],['#14e2d1','#62fff0'],['#9165ff','#c09cff'],['#f05cae','#ff9bca'],['#ffd34d','#ffe99a'],['#ff8650','#ffbc73']];
  const rgba=(hex,a)=>{const v=parseInt(hex.slice(1),16);return `rgba(${v>>16},${(v>>8)&255},${v&255},${clamp(a,0,1)})`;};
  const track=(o,n=9)=>{const point=o.history.length>=n?o.history.shift():{};point.x=o.x;point.y=o.y;while(o.history.length>=n)o.history.shift();o.history.push(point);};
  const trail=(ctx,history,color,a,width)=>{for(let i=1;i<history.length;i++){ctx.strokeStyle=rgba(color,a*i/history.length);ctx.lineWidth=width*i/history.length;ctx.beginPath();ctx.moveTo(history[i-1].x,history[i-1].y);ctx.lineTo(history[i].x,history[i].y);ctx.stroke();}};
  class Rocket {
    constructor(i){const p=openingTargets[openingOrder[i]];this.tx=w*p[0];this.ty=h*p[1];this.x=clamp(this.tx+(Math.random()-.5)*w*.22,w*.1,w*.9);this.y=h+28;this.sx=this.x;this.sy=this.y;this.s=p[2];this.c=colors[i%colors.length];this.t=0;this.d=(reduced?.9:1.32)+Math.random()*(reduced?.2:.6);this.history=[];}
    update(dt){this.t=Math.min(1,this.t+dt/this.d);const e=1-Math.pow(1-this.t,2.45);this.x=this.sx+(this.tx-this.sx)*e;this.y=this.sy+(this.ty-this.sy)*e;track(this,12);if(this.t>=1)explode(this.x,this.y,this.s,this.c);}
    draw(){trail(fctx,this.history,this.c[1],.5,1.4);fctx.fillStyle='#fffdf2';fctx.shadowBlur=10;fctx.shadowColor=this.c[0];fctx.beginPath();fctx.arc(this.x,this.y,1.8,0,7);fctx.fill();fctx.shadowBlur=0;}
    get dead(){return this.t>=1;}
  }
  class Spark {
    constructor(x,y,a,s,c){this.x=x;this.y=y;this.vx=Math.cos(a)*s;this.vy=Math.sin(a)*s;this.c=c;this.life=0;this.hold=.65+Math.random()*.25;this.max=this.hold+2.6+Math.random()*1.1;this.history=[{x,y}];}
    update(dt){const fall=Math.max(0,this.life-this.hold), ramp=clamp(fall/.75,0,1);this.x+=this.vx*dt;this.y+=this.vy*dt;this.vx*=Math.exp(-.46*dt);this.vy=this.vy*Math.exp(-.46*dt)+(110+Math.random()*50)*ramp*dt;this.life+=dt;track(this,w<600?7:11);}
    draw(){const fall=Math.max(0,this.life-this.hold),a=fall?Math.pow(1-fall/(this.max-this.hold),1.15):1;trail(fctx,this.history,this.c,a*.85,1.45);fctx.fillStyle=rgba(this.c,a);fctx.beginPath();fctx.arc(this.x,this.y,.8*a,0,7);fctx.fill();}
    get dead(){return this.life>=this.max;}
  }
  function explosionCount(size){
    const mobile=w<600,large=size>1.15;
    const count=large?(mobile?120:180):size<.8?(mobile?68:100):(mobile?84:124);
    return reduced?Math.max(large?(mobile?90:140):(mobile?60:90),Math.round(count*.8)):count;
  }
  function explode(x,y,size,c){
    const count=explosionCount(size),angleStep=Math.PI*2/count;
    for(let i=0;i<count;i++){
      const angle=angleStep*i+(Math.random()-.5)*angleStep*.7;
      // Golden-ratio interleaving distributes each radial depth around all
      // quadrants, without making rings or repeating a handful of spokes.
      const band=(i*.61803398875)%1;
      const speed=(band<.60?94+Math.random()*104:band<.88?60+Math.random()*66:25+Math.random()*55)*size;
      sparks.push(new Spark(x,y,angle,speed,Math.random()<.78?c[0]:c[1]));
    }
  }
  function resize(){fctx.clearRect(0,0,fireworks.width,fireworks.height);cctx.clearRect(0,0,cake.width,cake.height);dpr=Math.min(devicePixelRatio||1,2);w=innerWidth;h=innerHeight;for(const x of [fireworks,cake]){x.width=Math.round(w*dpr);x.height=Math.round(h*dpr);x.style.width=w+'px';x.style.height=h+'px';}fctx.setTransform(dpr,0,0,dpr,0,0);cctx.setTransform(dpr,0,0,dpr,0,0);if(cakeBits.length)layoutCake();}
  function fireFrame(t){if(!started)started=t;const dt=Math.min(.034,Math.max(.001,(t-(last||t))/1000));last=t;fctx.clearRect(0,0,fireworks.width,fireworks.height);fctx.globalCompositeOperation='lighter';while(launchIndex<plan.length&&t-started>=plan[launchIndex])rockets.push(new Rocket(launchIndex++));
    for(let i=rockets.length-1;i>=0;i--){const rocket=rockets[i];rocket.update(dt);if(rocket.dead){rocket.history.length=0;rockets[i]=rockets[rockets.length-1];rockets.pop();}else rocket.draw();}
    for(let i=sparks.length-1;i>=0;i--){const spark=sparks[i];spark.update(dt);if(spark.dead){spark.history.length=0;sparks[i]=sparks[sparks.length-1];sparks.pop();}else spark.draw();}
    fctx.globalCompositeOperation='source-over';if(launchIndex<plan.length||rockets.length||sparks.length)fwRaf=requestAnimationFrame(fireFrame);else{fctx.clearRect(0,0,fireworks.width,fireworks.height);fwRaf=0;}}
  function beginFirstExit(){if(state!==Scene.FIRST_WAIT)return;state=Scene.FIRST_LEAVING;stage.classList.add('is-first-leaving');greeting.classList.remove('is-visible');hint.classList.remove('is-visible');cancelAnimationFrame(fwRaf);rockets=[];sparks=[];fctx.clearRect(0,0,fireworks.width,fireworks.height);setTimeout(startCake,reduced?260:650);}
  // All cake geometry is invisible sampling data. Only point sprites reach the canvas.
  const cakeSprites = new Map();
  const orbitSpecs=[
    {radius:.94,height:.55,tilt:-.38,speed:.09,phase:.55,color:'#F4B5D5'},
    {radius:.72,height:.84,tilt:-.30,speed:.075,phase:2.75,color:'#FFD784'}
  ];
  let cakeDrawOrder=[],dustPool=[],flameSparks=[],cakeLastTime=0,dustCredit=0;
  let cakeHighlights=[],cakeGlints=[],nextCakeGlint=0,decorationSeed=1;
  let cakeSparkleBits=[],cakeSparkles=[],cakeHighlightLayers=[],nextCakeSparkle=0,cakeSparkleSeed=1,cakeGlintLayer=0;
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
    glow.addColorStop(0,color); glow.addColorStop(shape==='pearl'?.22:.13,color);
    glow.addColorStop(.3,rgba(color,.65)); glow.addColorStop(.6,rgba(color,.12)); glow.addColorStop(1,rgba(color,0));
    g.fillStyle=glow;g.fillRect(0,0,24,24);
    if(shape==='fleck'){
      g.clearRect(0,0,24,24);g.fillStyle=glow;g.fillRect(0,0,24,24);
      g.fillStyle=rgba(color,.9);g.fillRect(9,7,4,10);
    }else if(shape==='star'){
      g.fillStyle=rgba(color,.85);g.beginPath();g.moveTo(12,1);g.lineTo(14,10);
      g.lineTo(23,12);g.lineTo(14,14);g.lineTo(12,23);g.lineTo(10,14);
      g.lineTo(1,12);g.lineTo(10,10);g.closePath();g.fill();
    }else if(shape==='diamond'){
      g.fillStyle=rgba(color,.8);g.beginPath();g.moveTo(12,7);g.lineTo(15,12);
      g.lineTo(12,17);g.lineTo(9,12);g.closePath();g.fill();
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
    // Append accents without changing any of the original model's target points or RNG sequence.
    makeCakeDecorations();
    // Rear points first; no wireframe, disks, strokes or visible geometry.
    cakeBits.sort((a,b)=>(a.z3*ct+a.y3*st)-(b.z3*ct+b.y3*st));
    cakeDrawOrder=cakeBits.slice();
    // Cache tiny particle textures once, rather than constructing gradients in the frame loop.
    for(const b of cakeBits){b.sprite=cakeSprite(b.color,b.material==='fleck'?'fleck':b.material==='crystal'?'diamond':b.kind==='pearl'?'pearl':'round');b.starSprite=b.starEligible?cakeSprite(b.color,'star'):null;}
    layoutCake();
  }
  function decorationRandom(){
    decorationSeed=(Math.imul(decorationSeed,1664525)+1013904223)>>>0;
    return decorationSeed/4294967296;
  }
  function makeCakeDecorations(){
    decorationSeed=(Math.floor(cakeBits[0].phase*1e9)^0x6b8f25a1)>>>0;
    cakeHighlights=[];cakeGlints=Array.from({length:reduced?2:w<600?4:w>=1600?8:6},()=>({bit:null}));nextCakeGlint=0;
    const rand=decorationRandom,mobile=w<600;
    const frostColors=[['#bdeaff','#fff1f7','#ffd0e5'],['#ffd0e5','#fff1f7','#ff9fc7'],['#ffe0a3','#fff1f7','#ffd0e5']];
    const sugars=['#ff8fbd','#ffd76a','#7fe7ff','#c7a2ff','#fff4dc'];
    function accent(x,y,z,kind,color,level,size,brightness,canGlint=false){
      const a=rand()*Math.PI*2,r=.26+rand()*.58;
      const bit={x3:x,y3:y,z3:z,kind,color,level,decoration:true,
        delay:.18+rand()*.18,duration:1.45+rand()*.35+(rand()<.12?.25:0),
        phase:rand()*Math.PI*2,period:2.2+rand()*1.8,breathStrength:.12+rand()*.10,
        material:kind==='crystal'?'crystal':kind==='sugar'&&rand()<.35?'fleck':'round',
        starEligible:canGlint,depth:z*ct+y*st,peak:0,bend:(rand()-.5)*32,
        size:size*(.82+rand()*.32),brightness:brightness*(.8+rand()*.2),drift:2,
        fromX:Math.cos(a)*r,fromY:Math.sin(a)*r,fromDepth:(rand()-.5)*1.8,glintStart:-Infinity,glintLife:.4};
      cakeBits.push(bit);if(canGlint)cakeHighlights.push(bit);return bit;
    }
    for(let level=0;level<cakeOccluders.length;level++){
      const tier=cakeOccluders[level],height=tier.top-tier.bottom;
      const colors=frostColors[level],wavePhase=rand()*Math.PI*2;
      // Only the visible front arc: scattered scallops, not a complete bright ring.
      const frostingCount=(mobile?[115,98,84]:[225,190,160])[level];
      for(let i=0;i<frostingCount;i++){
        const a=.14+rand()*(Math.PI-.28);
        const wave=.5+.5*Math.sin(a*7.3+wavePhase+.5*Math.sin(a*3.1));
        const droop=.009+.036*Math.pow(wave,2);
        const r=tier.radius-.003+rand()*.005;
        accent(Math.cos(a)*r,tier.top-droop+(rand()-.5)*.017,Math.sin(a)*r,
          'frosting',colors[Math.floor(rand()*colors.length)],level,.8,.93);
      }
      // Irregular pearl/crystal clusters occupy the walls, not equally spaced rows.
      const sites=mobile?9:12,centers=[];
      for(let site=0;site<sites;site++){
        let a,y,x,z,attempt=0;
        do{
          a=.18+rand()*(Math.PI-.36);y=tier.bottom+height*(.17+rand()*.60);
          x=Math.cos(a)*tier.radius;z=Math.sin(a)*tier.radius;attempt++;
        }while(attempt<30&&centers.some(p=>Math.hypot(x-p.x,(y-p.y)*1.8)<.075));
        centers.push({x,y});
        const color=colors[site%colors.length],cluster=2+Math.floor(rand()*3);
        for(let j=0;j<cluster;j++){
          const angle=a+(rand()-.5)*.025,yy=y+(rand()-.5)*.02;
          const b=accent(Math.cos(angle)*tier.radius,yy,Math.sin(angle)*tier.radius,
            j===0&&site%3===0?'crystal':'pearl',color,level,j===0?1.6:.8,j===0?1.15:.9,j===0);
          b.site=site;
        }
      }
      // Fine sugar flecks across both the visible wall and exposed top.
      const sugarCount=(mobile?[48,42,35]:[94,80,68])[level];
      for(let i=0;i<sugarCount;i++){
        const a=.07+rand()*(Math.PI-.14),onTop=rand()<.28;
        const inner=level<2?cakeOccluders[level+1].radius:.07;
        const r=onTop?Math.sqrt(inner*inner+rand()*(tier.radius*tier.radius-inner*inner)):tier.radius;
        const y=onTop?tier.top+.003:tier.bottom+rand()*height;
        const color=rand()<.48?colors[Math.floor(rand()*colors.length)]:sugars[Math.floor(rand()*sugars.length)];
        accent(Math.cos(a)*r,y,Math.sin(a)*r,'sugar',color,level,.55+rand()*.22,.92);
      }
      // One intermittent moving point per tier, limited to a short front-edge segment.
      const a=.32+rand()*(Math.PI-.9);
      const b=accent(Math.cos(a)*tier.radius,tier.top-.009,Math.sin(a)*tier.radius,
        'edgeLight',level===1?'#fff1f7':'#ffe0a3',level,1.25,1.1);
      Object.assign(b,{edgeAngle:a,edgeSpan:.22+rand()*.12,edgePeriod:6.8+rand()*3.2,edgeOffset:rand()*5});
    }
    // Broken, softly scattered highlights near (never over) the candle base.
    for(let i=0;i<(mobile?32:60);i++){
      const a=rand()*Math.PI*2,r=.072+Math.pow(rand(),1.8)*.26;
      accent(Math.cos(a)*r,cakeTop+.005,Math.sin(a)*r,'sugar',rand()<.6?'#fff1f7':'#ffe0a3',2,.6,.87);
    }
    for(let site=0;site<4;site++){
      const a=rand()*Math.PI*2,r=.14+rand()*.14;
      for(let j=0;j<3;j++)accent(Math.cos(a)*r+(rand()-.5)*.016,cakeTop+.006,
        Math.sin(a)*r+(rand()-.5)*.016,'crystal',j===0?'#ffe0a3':'#fff1f7',2,j===0?1.1:.65,.95,j===0);
    }
    // Extra near-base accents complement, rather than replace, the existing falling dust.
    for(let i=0;i<(mobile?16:30);i++){
      const spread=Math.pow(rand(),1.7),x=(rand()-.5)*(1.1+spread*.5),y=-.055-spread*.30;
      const b=accent(x,y,(rand()-.5)*.35,'floorAccent',sugars[[0,1,2][Math.floor(rand()*3)]],-1,.75+rand()*.35,.86);
      b.floatPeriod=3.8+rand()*3.5;b.floatOffset=rand()*b.floatPeriod;b.lift=.025+rand()*.05;
    }
    configureCakeSparkles();
  }
  function cakeSparkleRandom(){
    cakeSparkleSeed=(Math.imul(cakeSparkleSeed,1664525)+1013904223)>>>0;
    return cakeSparkleSeed/4294967296;
  }
  function configureCakeSparkles(){
    // Separate effect RNG: all existing targets, colors and gathering data stay untouched.
    cakeSparkleSeed=(decorationSeed^0x43b1a75d)>>>0;
    cakeSparkleBits=[];cakeHighlightLayers=[[],[],[],[]];cakeGlintLayer=0;nextCakeSparkle=0;
    cakeSparkles=Array.from({length:reduced?2:w<600?6:8},()=>({bit:null}));
    for(const b of cakeBits){
      if(!b.decoration||b.kind==='edgeLight')continue;
      b.period=.7+(b.period-2.2)/1.8*.8;
      b.breathStrength=.18+(b.breathStrength-.12)/.10*.17;
      const hash=Math.sin(b.phase*12.9898+b.fromX*78.233)*43758.5453,roll=hash-Math.floor(hash);
      b.sparkleEligible=roll<.25;b.sparkleStart=-Infinity;b.sparkleLife=.25;
      b.glowStrength=.25+roll*.20;b.sizeStrength=.06+roll*.06;
      if(b.sparkleEligible)cakeSparkleBits.push(b);
      // Favor frosting, pearls and crystals; keep a few tiny near-base stars.
      b.starEligible=b.starEligible||(b.kind==='frosting'&&roll<.2)
        ||(b.kind==='sugar'&&roll<.04)||(b.kind==='floorAccent'&&roll<.35);
      if(b.starEligible)cakeHighlightLayers[b.level<0?3:b.level].push(b);
    }
  }
  function pickCakeFlash(bits,seconds,startKey,lifeKey){
    for(let attempt=0;attempt<16;attempt++){
      const b=bits[Math.floor(cakeSparkleRandom()*bits.length)];
      if(b&&seconds-b[startKey]>b[lifeKey]+.12)return b;
    }
    return null;
  }
  function updateCakeAccents(t,elapsed){
    const seconds=t/1000;
    for(const slot of cakeGlints)if(slot.bit&&seconds-slot.bit.glintStart>=slot.bit.glintLife)slot.bit=null;
    for(const slot of cakeSparkles)if(slot.bit&&seconds-slot.bit.sparkleStart>=slot.bit.sparkleLife)slot.bit=null;
    if(elapsed>2.45&&seconds>=nextCakeGlint){
      let count=reduced?1:w<600?3+Math.floor(cakeSparkleRandom()*2):4+Math.floor(cakeSparkleRandom()*3);
      for(const slot of cakeGlints){
        if(slot.bit||count===0)continue;
        const level=cakeSparkleRandom()<.08?3:cakeGlintLayer++%3;
        const bit=pickCakeFlash(cakeHighlightLayers[level],seconds,'glintStart','glintLife');
        if(!bit||elapsed<bit.delay+bit.duration)continue;
        slot.bit=bit;bit.glintStart=seconds;bit.glintLife=.18+cakeSparkleRandom()*.22;count--;
      }
      nextCakeGlint=seconds+(reduced?2.3:.15+cakeSparkleRandom()*.25);
    }
    if(elapsed>2.45&&seconds>=nextCakeSparkle){
      let count=reduced?1:w<600?4+Math.floor(cakeSparkleRandom()*3):4+Math.floor(cakeSparkleRandom()*5);
      for(const slot of cakeSparkles){
        if(slot.bit||count===0)continue;
        const bit=pickCakeFlash(cakeSparkleBits,seconds,'sparkleStart','sparkleLife');
        if(!bit||elapsed<bit.delay+bit.duration)continue;
        slot.bit=bit;bit.sparkleStart=seconds;bit.sparkleLife=.15+cakeSparkleRandom()*.20;count--;
      }
      nextCakeSparkle=seconds+(reduced?2.7:.3+cakeSparkleRandom()*.5);
    }
    for(const b of cakeBits){
      if(b.kind!=='edgeLight')continue;
      const clock=Math.max(0,elapsed-2.45)+b.edgeOffset,cycle=Math.floor(clock/b.edgePeriod);
      if(b.edgeCycle!==cycle){b.edgeCycle=cycle;b.edgeAngle=.32+decorationRandom()*(Math.PI-.9);}
      const u=(clock%b.edgePeriod)/2.8;
      const a=b.edgeAngle+b.edgeSpan*clamp(u,0,1),tier=cakeOccluders[b.level];
      const x=Math.cos(a)*tier.radius,z=Math.sin(a)*tier.radius;
      b.tx=w*.5+x*cakeScale;b.ty=h*cakeOrigin+(-b.y3*ct+z*st)*cakeScale;
      b.depth=z*ct+b.y3*st;b.visibility=elapsed>2.45&&u<1&&!reduced
        ?Math.pow(Math.sin(Math.PI*u),1.5)*clamp((elapsed-2.45)/.45,0,1):0;
    }
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
    if(b.decoration){
      const depth=b.fromDepth*(1-ease),perspective=1+depth*.12;
      out.x=w*.5+(out.x-w*.5)*perspective;
      out.y=h*.5+(out.y-h*.5+depth*st*cakeScale)*perspective;
    }
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
    updateCakeAccents(t,elapsed);
    cakeDrawOrder.sort((a,b)=>a.depth-b.depth);
    let ambientStars=0,activeGlints=0;
    const activeTwinkle=!reduced&&elapsed>2.45,seconds=t/1000;
    for(const slot of cakeGlints)if(slot.bit)activeGlints++;
    for(const b of cakeDrawOrder){
      const progress=clamp((elapsed-b.delay)/b.duration,0,1);
      if(progress===0)continue;
      const ambient=b.kind==='ambient',orbit=b.kind==='orbit',flame=b.kind==='flame';
      const surface=!ambient&&!orbit&&!flame;
      const softPulse=Math.sin(seconds*Math.PI*2/b.period+b.phase);
      const pulse=ambient?Math.pow((1+softPulse)/2,b.material==='shimmer'?9:3):0;
      const bodyStrength=.05+b.phase*.007957747;
      const twinkle=ambient?(reduced?.72:.46+.54*pulse):activeTwinkle&&b.decoration
        ?1+softPulse*b.breathStrength:surface&&activeTwinkle?.94*(1+softPulse*bodyStrength):1;
      const lively=activeTwinkle&&b.decoration&&b.kind!=='edgeLight';
      const glowGain=lively?.82*(1+softPulse*b.glowStrength):1;
      const sway=flame&&!reduced?Math.sin(t/620)*2.1+Math.sin(t/1030+.8)*.6:Math.sin(t/1600+b.phase)*(ambient&&!reduced?b.drift:.45);
      const ease=1-Math.pow(1-progress,3);
      let x=b.tx,y=b.ty;
      if(progress<1&&!orbit&&!flame){flightPoint(b,progress,flightNow);x=flightNow.x;y=flightNow.y;}
      x+=sway*ease;y+=(breath+Math.cos(t/2000+b.phase)*(ambient&&!reduced?b.drift:.35))*ease;
      if(flame&&!reduced){
        x+=b.x3*cakeScale*(.09*Math.sin(t/530+.4));
        y-=(b.y3-candleTop)*ct*cakeScale*(.10*Math.sin(t/480+.7)+.025*Math.sin(t/880));
      }
      let accentFade=1;
      if(b.kind==='edgeLight')accentFade=b.visibility;
      if(b.kind==='floorAccent'&&progress===1&&!reduced){
        const u=((elapsed-2.45+b.floatOffset+b.floatPeriod)%b.floatPeriod)/b.floatPeriod;
        y-=u*b.lift*cakeScale;accentFade=Math.pow(Math.sin(Math.PI*u),1.5);
      }
      const glintAge=b.decoration?(seconds-b.glintStart)/b.glintLife:-1;
      const highlight=b.decoration&&glintAge>=0&&glintAge<1
        ?Math.min(1,glintAge/.16)*Math.pow(1-glintAge,.65):0;
      const sparkleAge=b.sparkleEligible?(seconds-b.sparkleStart)/b.sparkleLife:-1;
      const fastFlash=sparkleAge>=0&&sparkleAge<1?Math.pow(Math.sin(Math.PI*sparkleAge),4):0;
      const size=b.size*(w<600?3:3.6)*(flame?1.12:1)*(1+highlight*.045)*(lively?1+softPulse*b.sizeStrength:1);
      const flameGlow=flame?(reduced?1:.86+.13*Math.sin(t/510)+flameFlash*.38+(flameHot?.16:0)):1;
      const hoverGlow=b.decoration&&b.level===2&&flameHot?1.07:1;
      const alpha=clamp((orbit||flame?progress:Math.min(1,progress*5))*b.brightness*twinkle*glowGain*(orbit?b.visibility:1)*flameGlow*accentFade*hoverGlow*(1+highlight*.2),0,1);
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
      if(fastFlash>0){
        const coreSize=size*.72;
        cctx.globalAlpha=alpha*fastFlash*.65;
        cctx.drawImage(b.sprite,x-coreSize/2,y-coreSize/2,coreSize,coreSize);
      }
      const ambientStar=ambient&&!reduced&&b.starEligible&&pulse>.94&&ambientStars<cakeGlints.length-activeGlints;
      if(b.starSprite&&(highlight>0||ambientStar)){
        if(ambientStar)ambientStars++;
        cctx.globalAlpha=ambientStar?alpha*(pulse-.94)/.06*.55
          :Math.min(b.brightness,1)*highlight*.95*accentFade;
        const starSize=ambientStar?size*2:Math.min((w<600?7:8)+size*.8,w<600?10:13);
        cctx.drawImage(b.starSprite,x-starSize/2,y-starSize/2,starSize,starSize);
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
    cakeBits=[];cakeDrawOrder=[];dustPool=[];flameSparks=[];cakeHighlights=[];cakeGlints=[];cakeSparkleBits=[];cakeSparkles=[];cakeHighlightLayers=[];nextCakeGlint=0;nextCakeSparkle=0;cakeSprites.clear();dustCredit=0;cakeLastTime=0;
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
