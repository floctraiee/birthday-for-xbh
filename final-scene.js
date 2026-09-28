(() => {
  'use strict';

  const stage = document.querySelector('#birthday-stage');
  const front = document.querySelector('#final-particles');
  const rear = document.querySelector('#final-fireworks');
  const heartCanvas = document.querySelector('#heart-particles');
  const frontCtx = front.getContext('2d', {alpha:true});
  const rearCtx = rear.getContext('2d', {alpha:true});
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const heartColors = ['#ff3f8f','#ff529e','#ff68ac','#ff7fba','#f64088','#ff9ac8'];
  const textColors = ['#ffd7e8','#ffb6d5','#ff91bd','#fff1f7','#ffd98a'];
  const fireworkColors = ['#ff4f9a','#ff84c1','#ffd54a','#ff8a3d','#62dfff','#57f0c1','#9b7cff','#ffffff'];
  const phases = [
    ['heartGathering', reduced?1.15:2.7],
    ['heartHolding', reduced?1.45:3.0],
    ['heartDissolving', reduced?1.7:3.1],
    ['heartPause', reduced?.28:.55],
    ['firstTextForming', reduced?1.0:1.9],
    ['firstTextHolding', reduced?1.2:2.1],
    ['firstTextDissolving', reduced?.9:1.75],
    ['textPause', reduced?.28:.5],
    ['birthdayTextForming', reduced?1.1:1.9],
    ['birthdayTextHolding', reduced?.5:.8],
    ['finalFireworks', Infinity]
  ];
  const sprites = new Map();
  let w=0,h=0,dpr=1,raf=0,startTime=0,lastTime=0,active=false,phaseIndex=-1;
  let heartBits=[],heartGlints=[],textBits=[],rockets=[],sparks=[],launches=[];
  let heldHeartYaw=0;
  let heartGL=null,heartProgram=null,heartBuffer=null,heartFirstActive=0;
  const heartPointer={valid:false,clientX:0,clientY:0,x:0,y:0,id:null};
  let heartPointerBound=false,heartPointerPower=0;
  let textValue='',textSize=0,finalFireworksStart=0;
  const rocketCountPerRound=7,fireworkCap=()=>w<600?1200:2300;

  function rgba(hex,alpha){
    const v=parseInt(hex.slice(1),16);
    return `rgba(${v>>16},${(v>>8)&255},${v&255},${clamp(alpha,0,1)})`;
  }
  function sprite(color){
    if(sprites.has(color))return sprites.get(color);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=24;
    const ctx=canvas.getContext('2d');
    const gradient=ctx.createRadialGradient(12,12,0,12,12,12);
    gradient.addColorStop(0,rgba(color,1));gradient.addColorStop(.32,rgba(color,.96));
    gradient.addColorStop(.62,rgba(color,.3));gradient.addColorStop(1,rgba(color,0));
    ctx.fillStyle=gradient;ctx.fillRect(0,0,24,24);sprites.set(color,canvas);return canvas;
  }
  function dot(ctx,color,x,y,size,alpha){
    if(alpha<=.008)return;
    ctx.globalAlpha=clamp(alpha,0,1);
    ctx.drawImage(sprite(color),x-size*.5,y-size*.5,size,size);
  }
  function clear(canvas,ctx){ctx.clearRect(0,0,canvas.width,canvas.height);}
  function resize(){
    const nextW=stage.clientWidth||innerWidth,nextH=stage.clientHeight||innerHeight;
    const nextDpr=Math.min(devicePixelRatio||1,nextW<600?1.35:2);
    if(w===nextW&&h===nextH&&dpr===nextDpr)return;
    const oldW=w||nextW,oldH=h||nextH;
    clear(front,frontCtx);clear(rear,rearCtx);
    w=nextW;h=nextH;dpr=nextDpr;
    for(const [canvas,ctx] of [[front,frontCtx],[rear,rearCtx]]){
      canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
      canvas.style.width=w+'px';canvas.style.height=h+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    heartCanvas.width=Math.round(w*dpr);heartCanvas.height=Math.round(h*dpr);
    heartCanvas.style.width=w+'px';heartCanvas.style.height=h+'px';
    if(heartGL)heartGL.viewport(0,0,heartCanvas.width,heartCanvas.height);
    if(heartPointer.valid)positionHeartPointer();
    if(!active)return;
    const sx=w/oldW,sy=h/oldH;
    for(const r of rockets){r.x*=sx;r.y*=sy;r.sx*=sx;r.sy*=sy;r.tx*=sx;r.ty*=sy;r.scale*=Math.min(sx,sy);r.scale=clamp(r.scale,.5,1.6);r.scaleTrail(sx,sy);}
    for(const p of sparks){p.x*=sx;p.y*=sy;p.vx*=sx;p.vy*=sy;p.scaleTrail(sx,sy);}
    textSize=fitTextSize(textValue);
    if(!raf&&phaseIndex===phases.length-1){
      makeText('生日快乐');frontCtx.globalCompositeOperation='lighter';
      drawText('finalFireworks',0,performance.now()/1000);
      frontCtx.globalAlpha=1;frontCtx.globalCompositeOperation='source-over';
    }
  }
  // The parametric curve defines only the outer boundary. Interior positions
  // are independently sampled from its enclosed area, never scaled copies.
  function getHeartPoint(t){
    const x=16*Math.pow(Math.sin(t),3);
    const y=13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t);
    const normalizedX=x/16;
    return {x:Math.sign(normalizedX)*Math.pow(Math.abs(normalizedX),.78),y:(-y-2.5384)/14.4616};
  }
  function buildHeartPolygon(){
    const points=Array.from({length:256},(_,i)=>getHeartPoint(i*Math.PI*2/256));
    const segments=points.map((start,i)=>{
      const end=points[(i+1)%points.length];
      const dx=end.x-start.x,dy=end.y-start.y;
      return {x:start.x,y:start.y,dx,dy,inverseLength:1/(dx*dx+dy*dy||1)};
    });
    return {points,segments};
  }
  function pointInPolygon(x,y,points){
    let inside=false;
    for(let i=0,j=points.length-1;i<points.length;j=i++){
      const a=points[i],b=points[j];
      if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
    }
    return inside;
  }
  function distanceToHeartBoundary(x,y,segments){
    let nearest=Infinity;
    for(const segment of segments){
      const vx=x-segment.x,vy=y-segment.y;
      const along=clamp((vx*segment.dx+vy*segment.dy)*segment.inverseLength,0,1);
      const dx=vx-along*segment.dx,dy=vy-along*segment.dy;
      nearest=Math.min(nearest,dx*dx+dy*dy);
    }
    return Math.sqrt(nearest);
  }
  function buildHeartDistanceField(polygon){
    const divisions=136,minX=-1.34,minY=-1.32,spanX=2.68,spanY=2.64;
    const values=new Float32Array((divisions+1)*(divisions+1));
    for(let row=0;row<=divisions;row++)for(let column=0;column<=divisions;column++){
      const x=minX+column*spanX/divisions,y=minY+row*spanY/divisions;
      const distance=distanceToHeartBoundary(x,y,polygon.segments);
      values[row*(divisions+1)+column]=pointInPolygon(x,y,polygon.points)?distance:-distance;
    }
    return {divisions,minX,minY,spanX,spanY,values};
  }
  function sampleHeartDistance(x,y,field){
    const gx=clamp((x-field.minX)/field.spanX*field.divisions,0,field.divisions-.0001);
    const gy=clamp((y-field.minY)/field.spanY*field.divisions,0,field.divisions-.0001);
    const column=Math.floor(gx),row=Math.floor(gy),dx=gx-column,dy=gy-row;
    const a=row*(field.divisions+1)+column,b=a+field.divisions+1;
    const upper=field.values[a]*(1-dx)+field.values[a+1]*dx;
    const lower=field.values[b]*(1-dx)+field.values[b+1]*dx;
    return upper*(1-dy)+lower*dy;
  }
  function initHeartGL(){
    if(heartProgram)return true;
    const gl=heartCanvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false});
    if(!gl||typeof gl.createShader!=='function')return false;
    const vertexSource=`
      attribute vec3 aPosition;
      attribute vec3 aLaunch;
      attribute vec3 aColor;
      attribute vec4 aStyle;
      attribute vec4 aMotion;
      attribute vec4 aTiming;
      uniform vec2 uResolution;
      uniform float uScale;
      uniform float uDpr;
      uniform float uMode;
      uniform float uLocal;
      uniform float uTime;
      uniform float uYaw;
      uniform float uFallScale;
      uniform float uFreezeTime;
      uniform vec2 uPointer;
      uniform float uPointerPower;
      uniform float uPointerRadius;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vBrightness;
      void main(){
        float cosine=cos(uYaw),sine=sin(uYaw);
        float rotatedX=aPosition.x*cosine+aPosition.z*sine;
        float rotatedZ=aPosition.z*cosine-aPosition.x*sine;
        float cameraDistance=4.4*uScale;
        float perspective=cameraDistance/(cameraDistance-rotatedZ*uScale);
        vec2 target=uResolution*.5+vec2(rotatedX,aPosition.y)*uScale*perspective;
        vec2 point=target;
        float alpha=aStyle.x,size=aStyle.y;
        float brightness=1.0;
        if(uMode<.5){
          float progress=clamp((uLocal-aMotion.w)/aTiming.x,0.0,1.0);
          float ease=1.0-pow(1.0-progress,3.0);
          float arc=sin(3.14159265*progress)*(1.0-progress)*aMotion.z;
          point=mix(uResolution*(vec2(.5,.5)+aLaunch.xy),target,ease);
          point+=vec2(arc*uResolution.x,-arc*uResolution.y*.32);
          float depth=mix(aLaunch.z,rotatedZ,ease);
          alpha*=min(1.0,progress*3.5)*clamp(.85+depth*.08,.64,1.12);
          size*=clamp((4.4/(4.4-depth))/perspective,.58,1.48)*(.78+.22*progress);
        }else if(uMode<1.5){
          float twinkle=sin(uTime*aStyle.w+aStyle.z);
          alpha*=1.0+twinkle*aMotion.x;
          size*=1.0+twinkle*aMotion.y;
          brightness+=twinkle*aMotion.x*.55;
          float proximity=1.0-smoothstep(uPointerRadius*.18,uPointerRadius,distance(point,uPointer));
          float individual=.52+.48*(.5+.5*twinkle);
          float response=proximity*uPointerPower*individual;
          alpha*=1.0+response*.11;
          size*=1.0+response*.045;
          brightness+=response*.17;
        }else{
          float progress=clamp((uLocal-aTiming.y)/1.12,0.0,1.0);
          float frozen=sin(uFreezeTime*aStyle.w+aStyle.z);
          alpha*=1.0+frozen*aMotion.x;
          size*=1.0+frozen*aMotion.y;
          brightness+=frozen*aMotion.x*.55;
          point.x+=aTiming.w*progress+sin(progress*2.8+aStyle.z)*2.5*progress;
          point.y+=aTiming.z*uFallScale*(.18*progress+.82*progress*progress);
          alpha*=pow(1.0-progress,1.4);
          size*=1.0-.76*progress;
        }
        vColor=aColor;
        vAlpha=clamp(alpha,0.0,1.0);
        vBrightness=brightness;
        gl_PointSize=max(0.0,size*uDpr);
        gl_Position=vec4(point.x/uResolution.x*2.0-1.0,1.0-point.y/uResolution.y*2.0,0.0,1.0);
      }`;
    const fragmentSource=`
      precision mediump float;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vBrightness;
      void main(){
        float radius=length(gl_PointCoord-vec2(.5))*2.0;
        if(radius>1.0||vAlpha<.008)discard;
        float light=(1.0-smoothstep(.05,1.0,radius))*(.72+.28*(1.0-radius));
        float opacity=vAlpha*light;
        gl_FragColor=vec4(min(vColor*opacity*vBrightness,vec3(1.0)),opacity);
      }`;
    function compile(type,source){
      const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){gl.deleteShader(shader);return null;}
      return shader;
    }
    const vert=compile(gl.VERTEX_SHADER,vertexSource),frag=compile(gl.FRAGMENT_SHADER,fragmentSource);
    if(!vert||!frag)return false;
    const program=gl.createProgram();gl.attachShader(program,vert);gl.attachShader(program,frag);
    gl.linkProgram(program);gl.deleteShader(vert);gl.deleteShader(frag);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)){gl.deleteProgram(program);return false;}
    heartGL=gl;
    heartProgram={program,
      attributes:['aPosition','aLaunch','aColor','aStyle','aMotion','aTiming'].map(name=>gl.getAttribLocation(program,name)),
      uniforms:Object.fromEntries(['uResolution','uScale','uDpr','uMode','uLocal','uTime','uYaw','uFallScale','uFreezeTime','uPointer','uPointerPower','uPointerRadius']
        .map(name=>[name,gl.getUniformLocation(program,name)]))};
    gl.viewport(0,0,heartCanvas.width,heartCanvas.height);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);
    gl.clearColor(0,0,0,0);
    return true;
  }
  function uploadHeart(){
    heartBits.sort((a,b)=>a.fallDelay-b.fallDelay);
    heartFirstActive=0;
    if(!initHeartGL())return;
    const data=new Float32Array(heartBits.length*21);
    for(let i=0;i<heartBits.length;i++){
      const p=heartBits[i],offset=i*21,color=parseInt(p.color.slice(1),16);
      data.set([p.x3,p.y3,p.z3,p.fx,p.fy,p.fz,
        (color>>16)/255,((color>>8)&255)/255,(color&255)/255,
        p.base,p.size,p.phase,p.breathSpeed,
        p.breathStrength,p.sizeStrength,p.bend,p.delay,
        p.duration,p.fallDelay,p.fall,p.drift],offset);
    }
    if(heartBuffer)heartGL.deleteBuffer(heartBuffer);
    heartBuffer=heartGL.createBuffer();heartGL.bindBuffer(heartGL.ARRAY_BUFFER,heartBuffer);
    heartGL.bufferData(heartGL.ARRAY_BUFFER,data,heartGL.STATIC_DRAW);
    const sizes=[3,3,3,4,4,4];let offset=0;
    heartProgram.attributes.forEach((attribute,i)=>{
      heartGL.enableVertexAttribArray(attribute);
      heartGL.vertexAttribPointer(attribute,sizes[i],heartGL.FLOAT,false,84,offset*4);
      offset+=sizes[i];
    });
    heartCanvas.hidden=false;
  }
  function positionHeartPointer(){
    const rect=heartCanvas.getBoundingClientRect();
    heartPointer.x=heartPointer.clientX-rect.left;
    heartPointer.y=heartPointer.clientY-rect.top;
  }
  function moveHeartPointer(event){
    if(phaseIndex!==1)return;
    if(heartPointer.id!==null&&event.pointerId!==heartPointer.id)return;
    heartPointer.valid=true;
    heartPointer.clientX=event.clientX;heartPointer.clientY=event.clientY;
    positionHeartPointer();
  }
  function downHeartPointer(event){
    if(phaseIndex!==1)return;
    if(event.pointerType!=='mouse')heartPointer.id=event.pointerId;
    moveHeartPointer(event);
  }
  function releaseHeartPointer(event){
    if(heartPointer.id!==null&&event.pointerId!==heartPointer.id)return;
    if(event.type==='pointerup'&&event.pointerType==='mouse')return;
    heartPointer.valid=false;heartPointer.id=null;
  }
  function cancelHeartPointer(){heartPointer.valid=false;heartPointer.id=null;}
  function bindHeartPointer(){
    if(heartPointerBound)return;
    heartPointerBound=true;
    stage.addEventListener('pointermove',moveHeartPointer,{passive:true});
    stage.addEventListener('pointerdown',downHeartPointer,{passive:true});
    stage.addEventListener('pointerup',releaseHeartPointer,{passive:true});
    stage.addEventListener('pointerleave',releaseHeartPointer,{passive:true});
    stage.addEventListener('pointercancel',releaseHeartPointer,{passive:true});
    addEventListener('blur',cancelHeartPointer);
  }
  function unbindHeartPointer(){
    if(!heartPointerBound)return;
    heartPointerBound=false;heartPointer.valid=false;heartPointer.id=null;
    stage.removeEventListener('pointermove',moveHeartPointer);
    stage.removeEventListener('pointerdown',downHeartPointer);
    stage.removeEventListener('pointerup',releaseHeartPointer);
    stage.removeEventListener('pointerleave',releaseHeartPointer);
    stage.removeEventListener('pointercancel',releaseHeartPointer);
    removeEventListener('blur',cancelHeartPointer);
  }
  function updateHeartPointerPower(dt){
    const target=heartPointer.valid?1:0;
    const response=target?.11:.16;
    heartPointerPower+=(target-heartPointerPower)*(1-Math.exp(-dt/response));
    if(!target&&heartPointerPower<.025)heartPointerPower=0;
  }
  function drawHeartGL(name,local,time,uniformScale,yaw){
    const gl=heartGL,uniforms=heartProgram.uniforms;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(heartProgram.program);
    gl.bindBuffer(gl.ARRAY_BUFFER,heartBuffer);
    gl.uniform2f(uniforms.uResolution,w,h);
    gl.uniform1f(uniforms.uScale,uniformScale);
    gl.uniform1f(uniforms.uDpr,dpr);
    gl.uniform1f(uniforms.uMode,name==='heartGathering'?0:name==='heartHolding'?1:2);
    gl.uniform1f(uniforms.uLocal,local);gl.uniform1f(uniforms.uTime,time);
    gl.uniform1f(uniforms.uYaw,yaw);
    gl.uniform1f(uniforms.uFallScale,Math.min(1,h/844)*(reduced?.55:1));
    gl.uniform1f(uniforms.uFreezeTime,phases[0][1]+phases[1][1]);
    gl.uniform2f(uniforms.uPointer,heartPointer.x,heartPointer.y);
    gl.uniform1f(uniforms.uPointerPower,name==='heartHolding'?heartPointerPower:0);
    gl.uniform1f(uniforms.uPointerRadius,Math.min(w,h)<600?85:110);
    if(name==='heartDissolving')
      while(heartFirstActive<heartBits.length&&heartBits[heartFirstActive].fallDelay+1.12<=local)heartFirstActive++;
    gl.drawArrays(gl.POINTS,heartFirstActive,heartBits.length-heartFirstActive);
  }
  function makeHeart(){
    heldHeartYaw=0;
    const compact=Math.min(w,h)<600;
    const count=reduced?(compact?2400:4500):(compact?10000:22000);
    const polygon=buildHeartPolygon();
    const field=buildHeartDistanceField(polygon);
    heartBits=[];
    for(let i=0;i<count;i++){
      const free=i>=count*.92;
      let x,y,distance;
      do{
        x=(Math.random()-.5)*2.68;
        y=(Math.random()-.5)*2.64;
        const signedDistance=sampleHeartDistance(x,y,field);
        if((signedDistance>0)===free)continue;
        distance=Math.abs(signedDistance);
        const probability=free?.34*Math.exp(-distance/.14):.18+.72*Math.exp(-distance/.34);
        if(Math.random()>=probability||pointInPolygon(x,y,polygon.points)===free)continue;
        break;
      }while(true);
      const depthRange=.13+.17*clamp(distance/.7,0,1);
      const z=(Math.random()-.5)*2*depthRange;
      const near=clamp((z+.30)/.60,0,1);
      const edgeGlow=Math.exp(-distance/.44);
      const base=(.23+.43*edgeGlow)*(.80+near*.27)*(.80+Math.random()*.37)*(free?.39:1);
      const color=heartColors[Math.floor(Math.random()*heartColors.length)];
      let fx,fy;
      const side=Math.floor(Math.random()*4);
      if(side===0){fx=-.56-Math.random()*.38;fy=(Math.random()-.5)*1.65;}
      else if(side===1){fx=.56+Math.random()*.38;fy=(Math.random()-.5)*1.65;}
      else if(side===2){fx=(Math.random()-.5)*1.75;fy=-.58-Math.random()*.4;}
      else{fx=(Math.random()-.5)*1.75;fy=.58+Math.random()*.4;}
      heartBits.push({x3:x,y3:y,z3:z,layer:free?'free':'interior',edgeDistance:distance,
        color,base,
        size:(compact?3.35:3.65)*(.59+Math.random()*.76)*(.8+near*.28)*(free?.75:1),
        fx,fy,fz:(Math.random()-.5)*3.7,
        bend:(Math.random()-.5)*.21,delay:Math.random()*(reduced?.24:.66),
        duration:reduced?.7+Math.random()*.17:1.68+Math.random()*.33,
        fallDelay:(1-clamp((y+1)*.5,0,1))*(reduced?.66:1.83)+Math.random()*(reduced?.08:.15),
        fall:30+Math.random()*90,drift:(Math.random()-.5)*28,
        phase:Math.random()*Math.PI*2,
        breathSpeed:Math.PI*2/(2+Math.random()*2),
        breathStrength:.10+Math.random()*.12,
        sizeStrength:.03+Math.random()*.02});
    }
    heartGlints=Array.from({length:reduced?24:compact?75:180},()=>{
      const p=heartBits[Math.floor(Math.random()*heartBits.length)];
      return {x:p.x3+(Math.random()-.5)*.44,
        y:p.y3+(Math.random()-.5)*.44,
        phase:Math.random()*Math.PI*2,period:2+Math.random()*2,
        size:1.1+Math.random()*1.2,color:heartColors[Math.floor(Math.random()*heartColors.length)]};
    });
    uploadHeart();
  }
  function heartScale(){return Math.min(w*.45,h*.335);}
  function drawHeart(name,local,time,dt){
    const uniformScale=heartScale();
    const yaw=name==='heartHolding'&&!reduced?
      (heldHeartYaw=Math.sin(local*.5)*.046):name==='heartDissolving'?heldHeartYaw:0;
    const cosine=Math.cos(yaw),sine=Math.sin(yaw);
    if(name==='heartHolding')updateHeartPointerPower(dt);
    if(heartBuffer)drawHeartGL(name,local,time,uniformScale,yaw);
    else for(let i=heartBits.length-1;i>=0;i--){
      const p=heartBits[i],rotatedX=p.x3*cosine+p.z3*sine;
      const rotatedZ=p.z3*cosine-p.x3*sine;
      const cameraDistance=4.4*uniformScale;
      const perspective=cameraDistance/(cameraDistance-rotatedZ*uniformScale);
      const targetX=w*.5+rotatedX*uniformScale*perspective;
      const targetY=h*.5+p.y3*uniformScale*perspective;
      let x=targetX,y=targetY,alpha=p.base,size=p.size;
      if(name==='heartGathering'){
        const u=clamp((local-p.delay)/p.duration,0,1);
        if(u<=0)continue;
        const ease=1-Math.pow(1-u,3),arc=Math.sin(Math.PI*u)*(1-u)*p.bend;
        x=(w*.5+p.fx*w)*(1-ease)+targetX*ease+arc*w;
        y=(h*.5+p.fy*h)*(1-ease)+targetY*ease-arc*h*.32;
        const depth=p.fz*(1-ease)+rotatedZ*ease;
        alpha*=Math.min(1,u*3.5)*clamp(.85+depth*.08,.64,1.12);
        size*=clamp((4.4/(4.4-depth))/perspective,.58,1.48)*(.78+.22*u);
      }else if(name==='heartHolding'){
        const twinkle=Math.sin(time*p.breathSpeed+p.phase);
        alpha*=1+twinkle*p.breathStrength;
        size*=1+twinkle*p.sizeStrength;
        p.lastAlpha=alpha;p.lastSize=size;
        if(heartPointerPower){
          const radius=Math.min(w,h)<600?85:110;
          const distance=Math.hypot(x-heartPointer.x,y-heartPointer.y);
          const falloff=1-clamp((distance-radius*.18)/(radius*.82),0,1);
          const smooth=falloff*falloff*(3-2*falloff);
          const response=smooth*heartPointerPower*(.52+.48*(.5+.5*twinkle));
          alpha*=1+response*.18;
          size*=1+response*.045;
        }
      }else{
        const u=clamp((local-p.fallDelay)/1.12,0,1);
        if(u>=1){heartBits[i]=heartBits[heartBits.length-1];heartBits.pop();continue;}
        alpha=p.lastAlpha??p.base;
        size=p.lastSize??p.size;
        if(u>0){
          const distance=p.fall*Math.min(1,h/844)*(reduced?.55:1);
          x+=p.drift*u+Math.sin(u*2.8+p.phase)*2.5*u;
          y+=distance*(.18*u+.82*u*u);
          alpha*=Math.pow(1-u,1.4);size*=1-.76*u;
        }
      }
      dot(frontCtx,p.color,x,y,size,alpha);
    }
    if(name==='heartHolding')for(const p of heartGlints){
      const pulse=Math.pow((1+Math.sin(time*Math.PI*2/p.period+p.phase))*.5,5);
      dot(frontCtx,p.color,w*.5+p.x*uniformScale,h*.5+p.y*uniformScale,p.size,.06+pulse*.35);
    }
  }
  function setFallDelays(){
    heartGlints=[];
  }
  function fitTextSize(value){
    if(!value)return 0;
    const base=Math.min(h*(value.length>4?.118:.17),w*.86/(value.length*1.08));
    return Math.max(22,base);
  }
  function makeText(value){
    textValue=value;textSize=fitTextSize(value);textBits=[];
    const off=document.createElement('canvas'),ctx=off.getContext('2d',{willReadFrequently:true});
    let fontSize=textSize;
    const fontFor=size=>`500 ${size}px "STKaiti", "KaiTi", "Microsoft YaHei", sans-serif`;
    ctx.font=fontFor(fontSize);
    while(ctx.measureText(value).width>w*.86&&fontSize>22){fontSize*=.96;ctx.font=fontFor(fontSize);}
    textSize=fontSize;
    const maskScale=2;
    off.width=Math.ceil((ctx.measureText(value).width+fontSize*.35)*maskScale);
    off.height=Math.ceil(fontSize*1.7*maskScale);
    ctx.font=fontFor(fontSize*maskScale);ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle='#ffffff';ctx.fillText(value,off.width*.5,off.height*.5);
    const pixels=ctx.getImageData(0,0,off.width,off.height).data;
    let inkArea=0;
    for(let index=3;index<pixels.length;index+=4)inkArea+=pixels[index]/255;
    inkArea/=maskScale*maskScale;
    const mobile=w<600;
    const targetCount=clamp(Math.round(inkArea/(mobile?2.8:3.2)),mobile?900:1600,mobile?3800:6200);
    let attempts=0;
    while(textBits.length<targetCount&&attempts++<targetCount*22){
      const x=Math.random()*off.width,y=Math.random()*off.height;
      const ix=Math.floor(x),iy=Math.floor(y),opacity=pixels[(iy*off.width+ix)*4+3]/255;
      if(opacity<.24||Math.random()>opacity)continue;
      const a=Math.random()*Math.PI*2,r=reduced?.2+Math.random()*.34:.5+Math.random()*.48;
      const palette=Math.random();
      const color=textColors[palette<.05?4:palette<.17?3:Math.floor(Math.random()*3)];
      const jitterX=(Math.random()-.5)*1.3*maskScale,jitterY=(Math.random()-.5)*1.3*maskScale;
      const highlight=Math.random()<.055;
      textBits.push({gx:(x+jitterX-off.width*.5)/(fontSize*maskScale),
        gy:(y+jitterY-off.height*.5)/(fontSize*maskScale),
        fx:Math.cos(a)*r,fy:Math.sin(a)*r,bend:(Math.random()-.5)*.11,
        delay:Math.random()*.27+(Math.random()<.055?.16:0),duration:1.12+Math.random()*.3,
        alpha:.78+Math.random()*.22,color,
        size:highlight?3.15+Math.random()*.75:(mobile?2.95:3.05)*(.74+Math.random()*.42),
        phase:Math.random()*Math.PI*2,twinkleSpeed:Math.PI*2/(2.5+Math.random()*1.6),
        twinkleStrength:.08+Math.random()*.07,sizeStrength:.015+Math.random()*.025,
        scatterX:(Math.random()-.5)*80,scatterY:(Math.random()-.5)*52});
    }
  }
  function drawText(name,local,time){
    const sizeScale=textSize,forming=name.endsWith('Forming');
    const dissolving=name==='firstTextDissolving';
    for(let i=textBits.length-1;i>=0;i--){
      const p=textBits[i],tx=w*.5+p.gx*sizeScale,ty=h*.5+p.gy*sizeScale;
      let x=tx,y=ty,alpha=p.alpha,size=p.size;
      if(forming){
        const u=clamp((local-p.delay)/p.duration,0,1);
        if(u<=0)continue;
        const ease=1-Math.pow(1-u,3),arc=Math.sin(Math.PI*u)*(1-u)*p.bend;
        x=w*.5+p.fx*w*(1-ease)+(tx-w*.5)*ease+arc*w;
        y=h*.5+p.fy*h*(1-ease)+(ty-h*.5)*ease-arc*h*.35;
        alpha*=Math.min(1,u*4);size*=.74+.26*u;
      }else if(dissolving){
        const u=clamp(local/(reduced?.9:1.75),0,1);
        if(u>=1){textBits[i]=textBits[textBits.length-1];textBits.pop();continue;}
        alpha=p.lastAlpha??alpha;size=p.lastSize??size;
        x+=p.scatterX*(u*u);y+=p.scatterY*(u*u);
        alpha*=Math.pow(1-u,1.3);size*=1-.67*u;
      }else{
        const twinkle=Math.sin(time*p.twinkleSpeed+p.phase);
        alpha*=1+twinkle*p.twinkleStrength;
        size*=1+twinkle*p.sizeStrength;
        p.lastAlpha=alpha;p.lastSize=size;
      }
      dot(frontCtx,p.color,x,y,size,alpha);
    }
  }
  function memory(obj,length){
    obj.hx=new Float32Array(length);obj.hy=new Float32Array(length);obj.hpos=0;obj.hcount=0;
  }
  function remember(obj){obj.hx[obj.hpos]=obj.x;obj.hy[obj.hpos]=obj.y;obj.hpos=(obj.hpos+1)%obj.hx.length;obj.hcount=Math.min(obj.hcount+1,obj.hx.length);}
  function scaleHistory(obj,sx,sy){for(let i=0;i<obj.hcount;i++){obj.hx[i]*=sx;obj.hy[i]*=sy;}}
  function drawHistory(obj,color,alpha,size){
    for(let i=0;i<obj.hcount;i++){
      const idx=(obj.hpos-obj.hcount+i+obj.hx.length)%obj.hx.length;
      const shade=(i+1)/obj.hcount;
      dot(rearCtx,color,obj.hx[idx],obj.hy[idx],size*(.55+.4*shade),alpha*.22*shade);
    }
  }
  class FinalRocket{
    constructor(spec){
      this.tx=w*(.105+(spec.slot+.5)/rocketCountPerRound*.79+(Math.random()-.5)*.045);
      this.ty=h*(.12+Math.random()*.47);
      this.sx=clamp(this.tx+(Math.random()-.5)*w*.14,w*.07,w*.93);
      this.sy=h+20;this.x=this.sx;this.y=this.sy;
      this.age=0;this.duration=(reduced?.7:.86)+Math.random()*(reduced?.13:.24);
      this.scale=spec.scale;this.color=spec.color;this.second=spec.second;
      memory(this,9);
    }
    scaleTrail(sx,sy){scaleHistory(this,sx,sy);}
    update(dt){
      this.age+=dt;const u=clamp(this.age/this.duration,0,1),ease=1-Math.pow(1-u,2.3);
      this.x=this.sx+(this.tx-this.sx)*ease;
      this.y=this.sy+(this.ty-this.sy)*ease;
      remember(this);return u>=1;
    }
    draw(){
      if(this.hcount>1){
        rearCtx.beginPath();
        for(let i=0;i<this.hcount;i++){
          const idx=(this.hpos-this.hcount+i+this.hx.length)%this.hx.length;
          if(i===0)rearCtx.moveTo(this.hx[idx],this.hy[idx]);
          else rearCtx.lineTo(this.hx[idx],this.hy[idx]);
        }
        rearCtx.globalAlpha=.58;rearCtx.strokeStyle=this.color;
        rearCtx.lineWidth=1.35;rearCtx.lineCap='round';rearCtx.stroke();
      }
      drawHistory(this,this.color,.8,4.1);
      dot(rearCtx,'#ffffff',this.x,this.y,4.4,.96);
    }
  }
  class FinalSpark{
    constructor(x,y,angle,speed,color,scale){
      this.x=x;this.y=y;this.vx=Math.cos(angle)*speed;this.vy=Math.sin(angle)*speed;
      this.color=color;this.scale=scale;this.age=0;
      this.hold=.32+Math.random()*.24;
      this.life=this.hold+2.25+Math.random()*.75;
      this.gravity=88+Math.random()*42;
      this.size=(w<600?3.65:4.55)*(.66+Math.random()*.65)*(.72+scale*.25);
      memory(this,7);remember(this);
    }
    scaleTrail(sx,sy){scaleHistory(this,sx,sy);}
    update(dt){
      this.age+=dt;
      const falling=Math.max(0,this.age-this.hold),ramp=clamp(falling/.62,0,1);
      const drag=Math.exp(-.56*dt);
      this.vx*=drag;this.vy=this.vy*drag+this.gravity*ramp*dt;
      this.x+=this.vx*dt;this.y+=this.vy*dt;remember(this);
      return this.age>=this.life;
    }
    draw(){
      const falling=Math.max(0,this.age-this.hold);
      const alpha=falling?Math.pow(clamp(1-falling/(this.life-this.hold),0,1),1.28):1;
      const size=this.size*(1-.67*falling/(this.life-this.hold));
      drawHistory(this,this.color,alpha,size);
      dot(rearCtx,this.color,this.x,this.y,size,alpha);
    }
  }
  function burst(rocket){
    const mobile=w<600,base=mobile?(rocket.scale>1?66:44):(rocket.scale>1?111:72);
    const count=Math.min(Math.round(base*(reduced?.67:1)),fireworkCap()-sparks.length);
    const radius=rocket.scale*w*.104;
    for(let i=0;i<count;i++){
      const angle=i*Math.PI*2/count+(Math.random()-.5)*.13;
      const speed=radius*(.75+Math.random()*1.1);
      const color=Math.random()<.78?rocket.color:rocket.second;
      sparks.push(new FinalSpark(rocket.x,rocket.y,angle,speed,color,rocket.scale));
    }
  }
  function makeLaunches(){
    launches=[];rockets=[];sparks=[];
    for(let round=0;round<3;round++){
      const slots=[0,1,2,3,4,5,6];
      for(let i=slots.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[slots[i],slots[j]]=[slots[j],slots[i]];}
      for(let i=0;i<rocketCountPerRound;i++){
        const color=fireworkColors[(round*7+i)%fireworkColors.length];
        const second=fireworkColors[(round*7+i+1)%fireworkColors.length];
        launches.push({at:round*(reduced?.34:.45)+Math.random()*.065,
          slot:slots[i],scale:i%3===0?1.3:i%3===1?.75:1,color,second});
      }
    }
    launches.sort((a,b)=>a.at-b.at);
  }
  function drawFireworks(local,dt){
    while(launches.length&&launches[0].at<=local)rockets.push(new FinalRocket(launches.shift()));
    for(let i=rockets.length-1;i>=0;i--){
      const rocket=rockets[i];if(rocket.update(dt)){
        burst(rocket);rockets[i]=rockets[rockets.length-1];rockets.pop();
      }else rocket.draw();
    }
    for(let i=sparks.length-1;i>=0;i--){
      const spark=sparks[i];if(spark.update(dt)){
        sparks[i]=sparks[sparks.length-1];sparks.pop();
      }else spark.draw();
    }
  }
  function currentPhase(seconds){
    let sum=0;
    for(let i=0;i<phases.length;i++){
      if(seconds<sum+phases[i][1])return {index:i,name:phases[i][0],local:seconds-sum};
      sum+=phases[i][1];
    }
    return {index:phases.length-1,name:'finalFireworks',local:seconds-sum};
  }
  function enter(name){
    if(name==='heartGathering'){makeHeart();bindHeartPointer();}
    if(name==='heartDissolving'){
      heartPointer.valid=false;heartPointer.id=null;
      heartPointerPower=0;
      setFallDelays();
    }
    if(name==='heartPause'){
      unbindHeartPointer();
      heartBits=[];heartGlints=[];heartFirstActive=0;clear(front,frontCtx);
      heartPointerPower=0;
      if(heartGL){heartGL.clear(heartGL.COLOR_BUFFER_BIT);if(heartBuffer)heartGL.deleteBuffer(heartBuffer);heartBuffer=null;}
      heartCanvas.hidden=true;
    }
    if(name==='firstTextForming')makeText('祝你天天开心');
    if(name==='textPause'){textBits=[];textValue='';clear(front,frontCtx);}
    if(name==='birthdayTextForming')makeText('生日快乐');
    if(name==='finalFireworks'){makeLaunches();finalFireworksStart=performance.now();}
  }
  function frame(now){
    if(!startTime)startTime=now;
    const seconds=(now-startTime)/1000,dt=Math.min(.038,Math.max(.001,(now-(lastTime||now))/1000));
    lastTime=now;
    const scene=currentPhase(seconds);
    while(phaseIndex<scene.index){phaseIndex++;enter(phases[phaseIndex][0]);stage.dataset.finalPhase=phases[phaseIndex][0];}
    clear(front,frontCtx);clear(rear,rearCtx);
    frontCtx.globalCompositeOperation='lighter';rearCtx.globalCompositeOperation='lighter';
    if(scene.name.startsWith('heart')&&scene.name!=='heartPause')drawHeart(scene.name,scene.local,seconds,dt);
    if(scene.name.includes('Text')||scene.name==='finalFireworks'){
      if(scene.name!=='textPause')drawText(scene.name,scene.local,seconds);
    }
    if(scene.name==='finalFireworks')drawFireworks(scene.local,dt);
    frontCtx.globalAlpha=1;frontCtx.globalCompositeOperation='source-over';
    rearCtx.globalAlpha=1;rearCtx.globalCompositeOperation='source-over';
    if(scene.name==='finalFireworks'&&!launches.length&&!rockets.length&&!sparks.length&&scene.local>5){
      clear(rear,rearCtx);raf=0;return;
    }
    raf=requestAnimationFrame(frame);
  }
  function start(){
    if(active)return;
    active=true;resize();stage.classList.add('is-final-mode');
    front.hidden=false;rear.hidden=false;
    Promise.resolve(document.fonts?.ready).catch(()=>{}).then(()=>{
      if(!active)return;
      startTime=0;lastTime=0;phaseIndex=-1;raf=requestAnimationFrame(frame);
    });
  }
  document.addEventListener('birthday:final-start',start,{once:true});
  addEventListener('resize',()=>{if(active)resize();},{passive:true});
  document.addEventListener('fullscreenchange',()=>{if(active)resize();});
  if(typeof ResizeObserver==='function')new ResizeObserver(()=>{if(active)resize();}).observe(stage);
})();
