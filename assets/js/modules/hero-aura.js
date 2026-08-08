/* Hero canvas: the living Aura mark */
(function (Aura) {
	"use strict";

	var $ = Aura.$;
	/* ---------- hero: three 3D ribbons in a volumetric light core ----------
	   This used to carry a cloud of up to 1550 depth-sorted particles around the
	   mark. Two things were wrong with it. It cost most of the frame — a full
	   sort of the live set plus a drawImage per dot, every frame — and it was
	   read as dust *next to* the logo rather than as light belonging to it. The
	   cloud is gone. The budget it freed went into the mark itself: an afterimage
	   that trails the real motion vector, a directional key light along each
	   ribbon, and a bloom generous enough to be seen now that nothing competes
	   with it. */
	function initRing(){
	  var cv = $("#ring"); if(!cv || !cv.getContext) return;
	  var hero = $("#hero") || cv.parentNode;
	  /* No `desynchronized: true`. The low-latency canvas path lets Chrome for
	     Android promote this canvas to a hardware overlay composited on an opaque
	     black backing, which silently ignores alpha:true and paints a black
	     rectangle the exact size of the hero under the light theme. Low latency
	     only matters for surfaces that chase a finger; this is decorative. */
	  var ctx = cv.getContext("2d", { alpha: true });

	  /* ---- render profile -------------------------------------------------
	     Same scene everywhere; the phone just pays less for it. LITE drops the
	     canvas blur filter (shadowBlur is the single most expensive raster op on
	     mobile GPUs), caps the pixel count, and skips the afterimage — with the
	     dust gone the phone is already cheaper than it was, and an echo is the
	     one addition here that multiplies path work. */
	  var LITE = Aura.MOBILE, LOW = Aura.LOW;
	  var DPR_CAP  = LOW ? 1.25 : (LITE ? 1.5 : 2);
	  /* Desktop stays uncapped, exactly as before. The phone is paced by the
	     shared budget in core/aura.js rather than a hardcoded 30fps. */
	  var ECHO     = LITE ? 0 : 2;             /* ghost passes behind the mark */

	  /* ---- palette per theme ----------------------------------------------
	     The aura is painted straight onto the page, so it has to be re-mixed
	     when the theme flips. On white it must darken to stay visible; on navy
	     it must lighten — but only up to the point where it starts competing
	     with the headline that sits on top of it. That limit is why the dark
	     core is a soft periwinkle at 72% rather than pure white: on the light
	     page a white ribbon reads as a highlight, on the dark page it reads as
	     a hole punched through the text.

	     Colours are stored as raw "r,g,b" triplets so alpha stays at the call
	     site, exactly like the --sh token does in CSS.

	     `bloom` runs hotter than it used to in both themes. It was held down to
	     keep it from washing out the dust in front of it; there is no dust now,
	     and the halo was the thing carrying the aura's presence all along. */
	  var THEMES = {
	    light: {
	      blobs:[
	        [.50,.50,.40,[86,128,233], .46, 0  ],
	        [.50,.50,.24,[124,178,248],.74, 1.1],
	        [.50,.50,.13,[176,212,252],.68, 2.0],
	        [.41,.44,.30,[136,96,208], .28, 2.2],
	        [.60,.58,.28,[90,185,234], .30, 3.4],
	        [.56,.40,.21,[163,176,220],.18, 4.6]
	      ],
	      core:"255,255,255", coreA:1,
	      bloom:"104,146,244", bloomA:.72,
	      edge:"150,183,252", edgeA:.34,
	      echo:"126,160,244",
	      soft:"126,160,244", glow:"150,186,255", ripple:"120,160,250"
	    },
	    dark: {
	      /* The volumetric core stays deeper and dimmer than the light theme's:
	         a bright cloud behind white type is what made the phone screenshot
	         unreadable. */
	      blobs:[
	        [.50,.50,.40,[58,86,190],  .40, 0  ],
	        [.50,.50,.24,[86,124,226], .56, 1.1],
	        [.50,.50,.13,[140,178,250],.44, 2.0],
	        [.41,.44,.30,[104,66,186], .26, 2.2],
	        [.60,.58,.28,[42,132,190], .26, 3.4],
	        [.56,.40,.21,[92,108,170], .16, 4.6]
	      ],
	      core:"206,222,255", coreA:.72,
	      bloom:"90,132,236", bloomA:.58,
	      edge:"140,174,248", edgeA:.26,
	      echo:"150,186,255",
	      soft:"110,146,240", glow:"150,186,255", ripple:"120,160,250"
	    }
	  };
	  function themeName(){
	    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
	  }
	  var TH = THEMES[themeName()];

	  var dpr = 1, W = 0, H = 0, cx = 0, cy = 0, R = 0, F = 0;
	  var narrow = false;
	  var t = 0, last = 0, drawn = 0, raf = 0, visible = true, onScreen = true;

	  /* interaction: every value is a target + an eased follower, nothing snaps */
	  var ptx = 0, pty = 0, pxr = 0, pyr = 0, pInT = 0, pIn = 0;
	  var energyT = 0, energy = 0, fade = 1, lean = 0;
	  var rotY = 0, ripples = [], trail = [], intro = 0;
	  /* The portal's gestures. Each is a target written by the scene's clock on
	     every scroll and a follower the frame is actually drawn from:

	       cen   how far the mark has walked to the middle of the frame
	       sq    how far it has stopped turning and squared up to the camera
	       spl   how far the three waves have come apart into a stack
	       trav  how far the camera has flown forward through that stack
	       conv  how far what is left has gathered into a single line
	       land  the handover to the page

	     Split into six rather than driven off one number because they overlap:
	     the stack is already coming apart while the mark is still turning, and
	     the seam is already drawing itself while the last layer is still going
	     past. One number could not express that, and cutting them into a queue
	     is exactly what makes a scene read as four animations instead of a shot. */
	  var cenT = 0, cen = 0, sqT = 0, sq = 0, splT = 0, spl = 0;
	  var travT = 0, trav = 0, convT = 0, convV = 0, landT = 0, landV = 0;

	  /* "reduce motion" must calm the scene down, not freeze it dead */
	  var rmq = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : null;
	  var calm = !!(rmq && rmq.matches);
	  if(rmq){
	    var onRm = function(e){ calm = e.matches; };
	    if(rmq.addEventListener) rmq.addEventListener("change", onRm);
	    else if(rmq.addListener) rmq.addListener(onRm);
	  }

	  function clamp(v,a,b){ return v < a ? a : (v > b ? b : v); }

	  /* ---- one soft sprite, for the cursor light and its trail ---- */
	  var SPRS = 64, GLOW = null;
	  function sprite(size, stops){
	    var c = document.createElement("canvas"); c.width = c.height = size;
	    var g = c.getContext("2d");
	    var rg = g.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
	    for(var i=0;i<stops.length;i++) rg.addColorStop(stops[i][0], stops[i][1]);
	    g.fillStyle = rg; g.fillRect(0,0,size,size);
	    return c;
	  }
	  function makeGlow(){
	    GLOW = sprite(SPRS, [
	      [0,"rgba("+TH.glow+",.85)"],
	      [.45,"rgba("+TH.soft+",.24)"],
	      [1,"rgba("+TH.soft+",0)"]
	    ]);
	    /* There is deliberately no second, larger sprite here any more. A soft
	       radial blown up to fill the frame was what the scene used for its
	       "light behind the opening", and at that magnification a radial gradient
	       has no structure left in it at all — it is a wash, and a wash is the
	       one thing a screen full of it can never stop being. */
	  }

	  /* ---- volumetric core: six drifting blobs baked small, upscaled soft ----
	     Each blob is baked once into its own sprite at full opacity. Per frame we
	     only place it (drawImage + globalAlpha), which is pixel-identical to
	     rebuilding the radial gradient every time but costs a fraction of it. */
	  var NEB = null, NCTX = null, NS = 172, BSPR = [], BS = 128;
	  var BLOBS = TH.blobs;
	  function makeNeb(){
	    NEB = document.createElement("canvas"); NEB.width = NEB.height = NS;
	    NCTX = NEB.getContext("2d");
	    BLOBS = TH.blobs;
	    BSPR = BLOBS.map(function(b){
	      var c = b[3].join(",");
	      return sprite(BS, [
	        [0,   "rgba("+c+",1)"],
	        [.48, "rgba("+c+",.28)"],
	        [1,   "rgba("+c+",0)"]
	      ]);
	    });
	  }
	  function paintNeb(breath){
	    var g = NCTX; g.clearRect(0,0,NS,NS);
	    for(var i=0;i<BLOBS.length;i++){
	      var b = BLOBS[i], ph = b[5];
	      var ox = i ? Math.sin(t*.31 + ph)*.055 : 0;
	      var oy = i ? Math.cos(t*.26 + ph*1.3)*.048 : 0;
	      var x = (b[0]+ox)*NS, y = (b[1]+oy)*NS;
	      var r = b[2]*NS*(breath + (i ? Math.sin(t*.44 + ph)*.07 : 0));
	      var a = b[4]*(.84 + .16*Math.sin(t*.62 + ph)) * (1 + energy*.20);
	      g.globalAlpha = a > 1 ? 1 : a;
	      g.drawImage(BSPR[i], x-r, y-r, r*2, r*2);
	    }
	    g.globalAlpha = 1;
	  }

	  function size(){
	    W = cv.clientWidth; H = cv.clientHeight;
	    if(!W || !H) return;
	    cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr);
	    ctx.setTransform(dpr,0,0,dpr,0,0);
	    narrow = W < 1080;
	    R  = narrow ? Math.min(W*.27, 132) : Math.min(W*.235, H*.34);
	    cx = narrow ? W*.5 : W*.735;
	    cy = narrow ? Math.min(198, H*.245) : H*.50;
	    F  = R*3.6;

	  }

	  /* ---- the wave mark ---------------------------------------------------
	     One ribbon is projected into these four buffers and then consumed twice:
	     once for the halo and once for the tapered core. They are allocated here
	     and reused, so a frame does no allocation at all. 96 is well past the
	     sample count any viewport produces at step = s*.035. */
	  var MAXP = 96;
	  var xs = new Float64Array(MAXP), ys = new Float64Array(MAXP),
	      ss = new Float64Array(MAXP), us = new Float64Array(MAXP),
	      nx = new Float64Array(MAXP), ny = new Float64Array(MAXP),
	      hw = new Float64Array(MAXP);

	  /* Key light direction, in screen space, pointing from the surface toward
	     the light: up and to the left. It is fixed rather than following the
	     cursor on purpose — a key light that moves is a torch, and the mark
	     should read as a solid object lit by the room. */
	  var LX = -.6, LY = -.8;

	  /* Projects ribbon `k` at time `tt` and returns how many points landed.
	     `st` carries the camera state so an echo can be drawn from a past one. */
	  function ribbon(k, tt, st){
	    var s = R*.42*st.breath, half = s*.99, step = s*.035, m = 0;
	    /* `split` is how far the three waves have come apart, and they come apart
	       two ways at once, because one on its own is not a stack. This is the
	       vertical half: enough air between them that each can be looked at, and
	       labelled, on its own. The other half is `gap`, below — the one that
	       makes this an exploded view rather than a list. */
	    var base = k*s*.63*(1 + st.split*1.62) + Math.sin(tt*.95 + k*1.15)*s*.055;
	    /* Amplitude comes off the passed-in state, never off the live variable.
	       An echo is replayed from a recorded `st`, and a tap or a cursor entering
	       the hero moves `energy` sharply — reading it live meant the afterimage
	       silently re-shaped itself to the present wave height instead of holding
	       the one it actually had. Visible exactly when both happen at once:
	       energy changing while a scroll throw pulls the ghosts out from under the
	       mark, where the whole point is that they show where it used to be. */
	    var amp  = s*.27*(.88 + .22*Math.sin(tt*1.25 + k*.85)) * (1 + st.energy*.20);
	    /* No wave is ever cut, collapsed or turned edge-on. They are the mark,
	       and a mark that dissolves into glare on the way in has told the visitor
	       nothing about itself. All that happens to them is that they get further
	       apart, and then they go past. The only concession is a slight settling
	       as the stack squares up, because a layer about to be flown through
	       should read as a plane rather than as a tumbling ribbon.

	       `gap` is the depth half of the split, and the whole scene turns on its
	       sign: k = -1 lands nearest the camera and k = +1 furthest. That is the
	       order the tagline names the three layers in and the order the camera
	       meets them in — the surface you look at, the thing that makes it work,
	       and the ground both of them stand on. */
	    amp *= 1 - st.square*.10;
	    var zk = k*st.gap;
	    for(var x = -half; x <= half + 1e-4 && m < MAXP; x += step){
	      var u  = x/s;
	      var yv = base + Math.sin(u*2.5 + tt*1.55 + k*.9)*amp;
	      var zv = Math.cos(u*2.0 + tt*1.15 + k*1.1)*s*.55*(1 - st.square*.80);
	      var x1 = x*st.cosY + zv*st.sinY, z1 = zv*st.cosY - x*st.sinY;
	      var y1 = yv*st.cosX - z1*st.sinX, z2 = yv*st.sinX + z1*st.cosX;
	      var sc = F/(F + z2 + zk + st.camZ);
	      /* Both guards matter. Without the ceiling a point drifting toward the
	         camera plane is magnified without bound and stroked at a matching
	         width — measured worst case on a 390px viewport is 3.7x, a 31px
	         band, and it lands exactly when the camera dollies in. */
	      if(sc <= .06 || sc > 3) continue;
	      xs[m] = cx + x1*sc; ys[m] = cy + y1*sc; ss[m] = sc; us[m] = u; m++;
	    }
	    return m;
	  }

	  /* One smooth path through the projected points. Quadratic through the
	     midpoints: the samples become handles, so the crests stay round instead
	     of showing the facets a polyline would. */
	  function trace(m, oy){
	    ctx.beginPath();
	    ctx.moveTo(xs[0], ys[0] + oy);
	    for(var q=1;q<m-1;q++){
	      ctx.quadraticCurveTo(xs[q], ys[q] + oy,
	        (xs[q]+xs[q+1])*.5, (ys[q]+ys[q+1])*.5 + oy);
	    }
	    ctx.lineTo(xs[m-1], ys[m-1] + oy);
	  }

	  /* ---- motion echo -----------------------------------------------------
	     A real afterimage, not a blur: each ghost is the mark as it actually
	     stood a few frames ago, replayed from the recorded camera state and
	     pushed against the direction of the lean. It is invisible at rest by
	     construction — with the page still, a past state is the present state —
	     and it only separates when the mark is being thrown around. That is what
	     makes it read as motion rather than as decoration. */
	  var HIST = [], HMAX = 8;
	  function drawEcho(st, alpha, oy){
	    /* The afterimage is a memory of the mark as one object. Once the three
	       waves are travelling apart into a stack that memory is a lie: the echo
	       goes on drawing them where they no longer are, and the frame reads as a
	       pile of duplicates rather than as motion. So it is faded against the
	       split and is gone well before the flight. Nothing about the trail
	       itself changes — it is simply not what this shot is about any more. */
	    alpha *= 1 - Math.min(1, st.split * 2.2);
	    if(alpha <= .004) return;
	    ctx.save();
	    ctx.lineCap = "round"; ctx.lineJoin = "round";
	    ctx.strokeStyle = "rgba(" + TH.echo + "," + alpha.toFixed(3) + ")";
	    for(var k=-1;k<=1;k++){
	      var m = ribbon(k, st.t, st);
	      if(m < 3) continue;
	      var avg = 0, j;
	      for(j=0;j<m;j++) avg += ss[j];
	      ctx.lineWidth = Math.max(2, R*.42*st.breath*.128*(avg/m)*1.25);
	      trace(m, oy); ctx.stroke();
	    }
	    ctx.restore();
	  }

	  /* ---- the solid core -------------------------------------------------
	     One closed outline, filled once, with the shading carried by a gradient
	     laid along the ribbon's own axis.

	     This used to be 56 short strokes per ribbon, one per sample, each with
	     its own width and alpha. That is where the beading came from: round caps
	     on neighbouring segments overlap, and translucent paint laid over
	     translucent paint adds up, so every joint printed a brighter dot. A
	     chain of them reads as a stitched seam running down the middle of the
	     ribbon. The dust used to hide it and a dimmer bloom used to excuse it;
	     with the mark carrying the scene on its own it is the first thing you
	     see. A single fill covers every pixel exactly once, so there is nothing
	     to accumulate — and it replaces 168 stroke calls a frame with three
	     fills, which is cheaper on top of being correct. */
	  function coreFill(m, s, spec, vis){
	    var j, ax, ay, L2, tt, sc2, pos, taper, dx, dy, dl, key, d, hi, a;

	    /* Outward normal and half width per sample. Central differences, so the
	       normal follows the smoothed curve rather than one facet of it. */
	    for(j=0;j<m;j++){
	      var jp = j > 0 ? j-1 : 0, jn = j < m-1 ? j+1 : m-1;
	      dx = xs[jn] - xs[jp]; dy = ys[jn] - ys[jp];
	      dl = Math.sqrt(dx*dx + dy*dy) || 1;
	      nx[j] = -dy/dl; ny[j] = dx/dl;
	      pos = m > 1 ? j/(m-1) : 0;
	      taper = .72 + .28*Math.pow(Math.sin(Math.PI*pos), .45);
	      hw[j] = Math.max(2, s*.165*ss[j]*taper)*.5;
	    }

	    ax = xs[m-1] - xs[0]; ay = ys[m-1] - ys[0];
	    L2 = ax*ax + ay*ay;
	    /* The core alpha cap exists because on a narrow layout the mark sits
	       directly behind the headline and the lead, and a bright ribbon under
	       white type punches a hole through it. On a wide layout the mark lives
	       out at 73% of the width with nothing on top of it, so it can carry the
	       density the beading used to fake. */
	    var ca = narrow ? TH.coreA : Math.min(1, TH.coreA*1.2);
	    var grad = ctx.createLinearGradient(xs[0], ys[0], xs[m-1], ys[m-1]);
	    var prev = -1;
	    for(j=0;j<m;j+=4){
	      if(j > m-1) break;
	      /* Shading. A stroke behaves like a cylinder: brightest where it runs
	         across the light, dimmest where it runs along it, because at grazing
	         angles you are looking at the dark side of the tube. So the key term
	         is 1 - |tangent . light|, which lifts the up-slopes and drops the
	         down-slopes and reads as light arriving from the upper left. Without
	         it the ribbon is a flat sticker; with it, it has a top and a bottom.

	         Centred on 1, not on its own midpoint: a flat run of ribbon comes out
	         at exactly the brightness it had before there was any shading, and
	         the key only redistributes light from the falling slopes onto the
	         rising ones. Written any other way it reads as the mark being dimmed. */
	      dx = ny[j]; dy = -nx[j];                    /* tangent, from the normal */
	      key = .86 + .34*(1 - Math.abs(dx*LX + dy*LY));
	      d = us[j] - spec;
	      hi = Math.exp(-d*d*2.4);
	      sc2 = ss[j];
	      a = (.88 + .14*hi) * key * vis * clamp((sc2-.30)/.55, .40, 1);
	      if(a > 1) a = 1;
	      tt = L2 > 1e-6 ? ((xs[j]-xs[0])*ax + (ys[j]-ys[0])*ay)/L2 : 0;
	      tt = clamp(tt, 0, 1);
	      /* addColorStop wants offsets in order; a ribbon curling back on itself
	         in screen space can project two samples onto the same point. */
	      if(tt <= prev) tt = prev + 1e-4;
	      if(tt > 1) break;
	      prev = tt;
	      grad.addColorStop(tt, "rgba(" + TH.core + "," + (a*ca).toFixed(3) + ")");
	    }

	    ctx.beginPath();
	    ctx.moveTo(xs[0] + nx[0]*hw[0], ys[0] + ny[0]*hw[0]);
	    for(j=1;j<m;j++) ctx.lineTo(xs[j] + nx[j]*hw[j], ys[j] + ny[j]*hw[j]);
	    /* Round tips, drawn as part of the same outline so there is no second
	       fill to blend against the first. Both caps sweep anticlockwise, which
	       with a forward-facing normal is the direction that bulges away from
	       the ribbon rather than into it. */
	    ctx.arc(xs[m-1], ys[m-1], hw[m-1],
	            Math.atan2(ny[m-1], nx[m-1]), Math.atan2(-ny[m-1], -nx[m-1]), true);
	    for(j=m-1;j>=0;j--) ctx.lineTo(xs[j] - nx[j]*hw[j], ys[j] - ny[j]*hw[j]);
	    ctx.arc(xs[0], ys[0], hw[0],
	            Math.atan2(-ny[0], -nx[0]), Math.atan2(ny[0], nx[0]), true);
	    ctx.closePath();
	    ctx.fillStyle = grad;
	    ctx.fill();
	  }

	  /* One ribbon, drawn wherever the current transform says it goes. Split out
	     of drawWaves so a layer on its way past the camera can be run several
	     times over, from several camera positions, to blur itself. */
	  function oneRibbon(k, st, vis, s, spec){
	    var m = ribbon(k, t, st);
	    if(m < 3) return 0;

	    var avg = 0, j;
	    for(j=0;j<m;j++) avg += ss[j];
	    avg /= m;
	    var w0 = s*.128*avg;

	    if(LITE){
	      /* Mobile bloom: two widening translucent passes. Reads as the same
	         halo as the blurred version but stays inside the rasteriser
	         instead of triggering a per-frame gaussian on the whole path. */
	      ctx.strokeStyle = "rgba(" + TH.soft + "," + (.15*vis).toFixed(3) + ")";
	      ctx.lineWidth = Math.max(7, w0*2.95);
	      trace(m, 0); ctx.stroke();
	      ctx.strokeStyle = "rgba(" + TH.edge + "," + (.30*vis*(TH.edgeA/.30)).toFixed(3) + ")";
	      ctx.lineWidth = Math.max(4, w0*1.7);
	      trace(m, 0); ctx.stroke();
	    } else {
	      /* One pass, one real blur. Two earlier attempts at "more generous"
	         both failed for instructive reasons. Raising shadowBlur to s*.78
	         and running it twice cost more main thread than the entire particle
	         cloud it replaced — the blur is a gaussian over the path's bounding
	         box, so its price tracks the radius, and s*.78 at 1440px is a 100px
	         radius. Adding a wide un-blurred stroke instead was cheap but has
	         hard edges, and next to a real blur it reads as a second fat ribbon
	         behind the first rather than as light. So the generosity goes where
	         it costs nothing: into the bloom's alpha, lifted in both palettes,
	         with only a small step up in radius. */
	      ctx.shadowColor = "rgba(" + TH.bloom + "," + (TH.bloomA*vis).toFixed(3) + ")";
	      ctx.shadowBlur = Math.max(11, s*.55);
	      ctx.strokeStyle = "rgba(" + TH.edge + "," + (TH.edgeA*vis).toFixed(3) + ")";
	      ctx.lineWidth = Math.max(2.5, w0*1.12);
	      trace(m, 0); ctx.stroke();
	      ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
	    }

	    coreFill(m, s, spec, vis);
	    /* Handed back so the caller can reuse the projection still sitting in the
	       shared buffers — coreFill only writes the normals, never the points —
	       rather than projecting the same ribbon a second time for the flash and
	       a third time for the caption anchor. */
	    return m;
	  }

	  /* ---- the stack, and where the camera is in it ------------------------
	     Everything from here down exists to answer one question per frame, three
	     times over: where is this layer, how big has it got, and has it gone past
	     yet.

	     What used to be here instead was a fan of god rays and a magnified radial
	     sprite standing in for "light through an opening". Both are gone, and for
	     the same reason: they were trying to say that something was happening
	     without ever saying what, and a frame full of soft light says nothing at
	     all. The three layers, and their three names, are the entire content of
	     this scene — there is nothing for glare to add to that. */

	  var LAYK = [-1, 0, 1];              /* the three waves, near to far */
	  var ANCH = [null, null, null];      /* where their captions hang, per frame */
	  /* What is actually handed to the rail. Kept separate from ANCH because the
	     gate has to be applied without touching the anchors themselves: multiply
	     a layer's own alpha by the gate in place and a layer that stops being
	     drawn keeps getting multiplied every frame until it is silently zero. */
	  var OUTA = [null, null, null];

	  /* How layer `k` stands relative to the camera. `sc` is the scale its own
	     plane projects at — 1 while the stack is still out in front, rising as the
	     camera closes on it, unbounded at the plane itself. Every reading the
	     flight needs comes off that one number. */
	  function layerAt(k, st){
	    var d = F + k*st.gap + st.camZ;
	    if(d <= F*.05) return null;                     /* already behind us */
	    var sc = F/d;
	    /* Departure. A layer does not pop out of existence: from the moment it is
	       half again the size it was it starts giving up its opacity, and it is
	       gone before the projection would have to stretch it past the ceiling in
	       `ribbon`. Carrying it all the way to the camera plane instead puts a
	       stroke several hundred pixels wide across the frame for a frame or two,
	       which is precisely the white flash this scene exists to avoid. */
	    var go = clamp((sc - 1.5)/1.05, 0, 1);
	    return {
	      k: k, sc: sc, go: go,
	      a: 1 - go*go,
	      /* The catch of light on something sweeping past. Brief, one-sided, and
	         it belongs to the layer rather than to the scene: the frame never
	         brightens, one object in it does. */
	      flash: go > 0 ? Math.sin(go*3.14159) : 0
	    };
	  }

	  /* ---- the measure marks ----------------------------------------------
	     Scaffolding, in the drafting sense. A broken centre cross and four corner
	     ticks that arrive with the stack, give it something to be measured
	     against, and are gone before the flight starts. They are hairlines at
	     every viewport — one device pixel, taken off the ratio rather than
	     declared in CSS pixels — because the moment they gain any weight they
	     stop reading as measurement and start reading as decoration. The cross is
	     broken in the middle so it frames the mark instead of striking it out. */
	  function drawRig(a){
	    if(a <= .01) return;
	    var arm = R*1.34, pad = Math.min(48, W*.055), tick = 12, i;
	    ctx.save();
	    ctx.lineWidth = 1/dpr;
	    ctx.strokeStyle = "rgba(" + TH.edge + "," + (a*.46).toFixed(3) + ")";
	    ctx.beginPath();
	    ctx.moveTo(cx - arm, cy);       ctx.lineTo(cx - arm*.62, cy);
	    ctx.moveTo(cx + arm*.62, cy);   ctx.lineTo(cx + arm, cy);
	    ctx.moveTo(cx, cy - arm*.72);   ctx.lineTo(cx, cy - arm*.44);
	    ctx.moveTo(cx, cy + arm*.44);   ctx.lineTo(cx, cy + arm*.72);
	    ctx.stroke();
	    /* The corners sit on the frame rather than on the mark, so what is being
	       measured is the stack against the screen it is arriving in. */
	    ctx.strokeStyle = "rgba(" + TH.edge + "," + (a*.32).toFixed(3) + ")";
	    ctx.beginPath();
	    for(i=0;i<4;i++){
	      var sx = (i & 1) ? W - pad : pad, sy = (i & 2) ? H - pad : pad;
	      var dx = (i & 1) ? -1 : 1,       dy = (i & 2) ? -1 : 1;
	      ctx.moveTo(sx, sy); ctx.lineTo(sx + dx*tick, sy);
	      ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + dy*tick);
	    }
	    ctx.stroke();
	    ctx.restore();
	  }

	  /* ---- the seam --------------------------------------------------------
	     What the scene resolves into. Once the last layer is behind the camera
	     the frame is empty, and the obvious thing to put there is a white flash.
	     Instead: the three layers gather into a single line across the middle of
	     the screen, that line draws the mark's own wave along itself, and the
	     wave flattens as the page arrives underneath it.

	     It is the same shape, in the same brand gradient, as the wave seams that
	     separate every section further down the page — the one directly below
	     this stage included. So the scene does not end. It hands over. */
	  function drawSeam(conv, land, vis, oy, seam){
	    var a = conv*(1 - land*land*land*land)*vis;
	    if(a <= .006) return;
	    /* Drawn from the middle outwards rather than faded up in place: a rule
	       that appears is a rule, a rule that is drawn is something being made. */
	    var q = clamp(conv*1.35, 0, 1); q = q*q*(3 - 2*q);
	    var reach = (.16 + .84*q)*W*.5;
	    /* The wave rises as the layers gather and is taken back out as the page
	       lands, so the final frame of the scene is a flat line sitting exactly
	       where the section seam underneath it begins. */
	    var amp = R*.30*Math.sin(clamp(conv, 0, 1)*3.14159)*(1 - land);
	    /* And then it leaves, downwards, to exactly where the page's own wave
	       separator is about to arrive. This is the whole point of the ending: the
	       line the three layers turned into is not crossfaded out and replaced by
	       a different line somewhere else, it travels to the seam and becomes it.
	       The travel is linear and the fade is what carries the weighting: the
	       line keeps its brightness for most of the way down and only gives out
	       at the edge, so what you see is a line leaving rather than a line
	       dissolving on the spot.

	       The target is the bottom of the screen, not the bottom of the canvas:
	       this is drawn inside the walk-to-centre translation, and on a narrow
	       layout the mark sits high and that offset is over 200px. Aiming at H
	       without subtracting it sends the line off the bottom of a phone well
	       before the scroll has finished. */
	    /* The target is measured, not assumed. It used to be the bottom of the
	       screen, because that is where the seam used to be. The page is now
	       pulled up into the stage, so the seam travels UP the frame during
	       the hand-over instead of sitting still at the bottom, and a line
	       walking down to meet it would be walking away from it. portal.js
	       publishes where the seam actually is each frame; `seam * H` is that
	       same point in this canvas, less the walk-to-centre offset this is
	       drawn inside. The fallback is the old number, for the case where
	       the scene runs with no track underneath it. */
	    var seamY = (typeof seam === "number" ? seam * H : H) - oy;
	    var sy = cy + land*(seamY - cy);
	    var g = ctx.createLinearGradient(cx - reach, 0, cx + reach, 0);
	    g.addColorStop(0,   "rgba(" + TH.soft  + ",0)");
	    g.addColorStop(.18, "rgba(" + TH.bloom + "," + (a*.55).toFixed(3) + ")");
	    g.addColorStop(.5,  "rgba(" + TH.core  + "," + (a*.95).toFixed(3) + ")");
	    g.addColorStop(.82, "rgba(" + TH.bloom + "," + (a*.55).toFixed(3) + ")");
	    g.addColorStop(1,   "rgba(" + TH.soft  + ",0)");
	    ctx.save();
	    ctx.lineCap = "round"; ctx.lineJoin = "round";
	    ctx.strokeStyle = g;
	    ctx.lineWidth = Math.max(1.6, R*.034*(1 - land*.5));
	    ctx.shadowColor = "rgba(" + TH.bloom + "," + (a*.50).toFixed(3) + ")";
	    ctx.shadowBlur = Math.max(6, R*.13);
	    ctx.beginPath();
	    /* One and a half periods across the half-width, which is the logo's own
	       three-arc curve stretched the width of the frame rather than a generic
	       sine. Stepped rather than drawn as three quadratics because the
	       amplitude is changing every frame and a polyline at this density is
	       indistinguishable from a curve at any viewport this runs on. */
	    var stepX = Math.max(5, reach/30), first = true;
	    for(var x = -reach; x <= reach + .5; x += stepX){
	      var y = sy + Math.sin((x/reach)*4.7124)*amp;
	      if(first){ ctx.moveTo(cx + x, y); first = false; }
	      else ctx.lineTo(cx + x, y);
	    }
	    ctx.stroke();
	    ctx.restore();
	  }

	  /* Dust. Motes held in a shallow volume in front of the mark, each with its
	     own depth, drifting forward slowly at rest and streaming past the camera
	     during the pass. Depth is honest — size and brightness both come off the
	     same 1/z — which is what makes the pass read as travel through a space
	     rather than as a picture being scaled up. They recycle to the back of the
	     volume instead of being reallocated, so the array is built once. */
	  var MOTES = [], MOTEN = 0;
	  function makeMotes(){
	    MOTEN = LITE ? 24 : 60;
	    MOTES.length = 0;
	    for(var i=0;i<MOTEN;i++) MOTES.push({
	      x: Math.random()*2 - 1,
	      y: Math.random()*2 - 1,
	      z: Math.random()*.98 + .02,
	      s: .35 + Math.random()*.95,
	      p: Math.random()*6.2832
	    });
	  }
	  function drawMotes(vis, rush, dt){
	    if(!GLOW) return;
	    if(!MOTEN) makeMotes();
	    ctx.save();
	    ctx.globalCompositeOperation = "lighter";
	    for(var i=0;i<MOTEN;i++){
	      var d = MOTES[i];
	      d.z -= dt*(.045 + rush*1.30)*d.s;
	      if(d.z <= .02){
	        d.z += 1; d.x = Math.random()*2 - 1; d.y = Math.random()*2 - 1;
	      }
	      var sc = .34/(d.z + .20);
	      /* The drift is what keeps the dust alive while the camera is still.
	         During the flight it is taken out altogether: anything moving across
	         the corridor rather than along it undoes the one thing the particles
	         are there to say, which is which way you are travelling. */
	      var wob = 1 - Math.min(1, rush*2.2);
	      var px = cx + d.x*R*2.6*sc + Math.sin(t*.45 + d.p)*R*.045*wob;
	      var py = cy + d.y*R*1.9*sc + Math.cos(t*.38 + d.p)*R*.035*wob;
	      var rr = Math.max(1.1, R*.026*d.s*sc);
	      var a  = vis*(.12 + rush*.70)*Math.min(1, sc*.85)*(1 - d.z*.5);
	      if(a <= .004) continue;
	      ctx.globalAlpha = a > .8 ? .8 : a;
	      if(rush > .12){
	        /* Once the camera is moving, a mote is not a dot: it is the distance
	           it covered while the shutter was open. The streak is drawn back
	           down the line towards the centre, which is where it came from, and
	           the exaggeration is deliberate — one frame of real travel is two
	           pixels long and reads as nothing at all. */
	        var back = d.z + dt*(.045 + rush*1.30)*d.s*15;
	        var sc0 = .34/(back + .20);
	        ctx.strokeStyle = "rgba(" + TH.bloom + "," + (a*.85).toFixed(3) + ")";
	        ctx.lineWidth = Math.max(1, rr*.62);
	        ctx.lineCap = "round";
	        ctx.beginPath();
	        ctx.moveTo(cx + d.x*R*2.6*sc0, cy + d.y*R*1.9*sc0);
	        ctx.lineTo(px, py);
	        ctx.stroke();
	      } else {
	        ctx.drawImage(GLOW, px-rr, py-rr, rr*2, rr*2);
	      }
	    }
	    ctx.globalAlpha = 1;
	    ctx.restore();
	  }

	  /* The stack. Painted far to near, because painter's order is the only depth
	     this canvas has and the nearest layer has to be the one that occludes.
	     Each layer is asked where it stands and how present it still is, and that
	     answer drives everything: the ones still ahead are drawn plainly, the one
	     going past is blurred and catches the light, the ones behind are skipped.

	     `anchors` is filled in as a side effect — three screen positions for the
	     DOM captions, taken off the projected ribbons themselves so a label can
	     never drift away from the thing it names. */
	  function drawWaves(st, vis, anchors){
	    /* Cleared up front so a layer that is behind the camera this frame leaves
	       no anchor behind. Without this the rail keeps a caption pinned to the
	       last place its ribbon was seen. */
	    if(anchors){ anchors[0] = null; anchors[1] = null; anchors[2] = null; }
	    var s = R*.42*st.breath;
	    var spec = ((t*.26) % 2.6) - .8;   /* highlight sweeping along u */
	    ctx.save();
	    ctx.lineCap = "round"; ctx.lineJoin = "round";
	    for(var i = 2; i >= 0; i--){
	      var k = LAYK[i];
	      var L = layerAt(k, st);
	      if(!L || L.a <= .004) continue;
	      var v = vis*L.a;

	      /* Motion blur, and an honest one: the layer is drawn again from where
	         the camera was a moment ago, rather than being scaled up about the
	         middle of the screen. A scale-about-centre smear is a filter effect
	         and reads as one; re-projecting from an earlier camera is what the
	         shutter would actually have caught. Two extra passes, only on the one
	         layer that is moving past, and never on mobile.

	         `camZ` is borrowed and put back rather than copied into a new state
	         object, because this runs every frame of the flight and `st` is also
	         what gets recorded into the echo history a few lines later. */
	      if(L.go > .02 && !LITE && st.mblur > 0){
	        var keep = st.camZ;
	        for(var b = 2; b >= 1; b--){
	          st.camZ = keep - st.mblur*b;
	          oneRibbon(k, st, v*L.go*(b === 1 ? .34 : .15), s, spec);
	        }
	        st.camZ = keep;
	      }

	      var m = oneRibbon(k, st, v, s, spec);
	      if(m < 3) continue;

	      /* The catch of light, laid along the layer's own line rather than
	         anywhere near the middle of the frame. This is the only additive mark
	         left in the scene, and it is a stroke on a known shape — not a sprite,
	         not a radial gradient, nothing that can turn into a blob. */
	      if(L.flash > .01){
	        ctx.save();
	        ctx.globalCompositeOperation = "lighter";
	        ctx.strokeStyle = "rgba(" + TH.core + "," + (L.flash*L.a*vis*.55).toFixed(3) + ")";
	        ctx.lineWidth = Math.max(1, s*.030*Math.min(L.sc, 2.4));
	        trace(m, 0); ctx.stroke();
	        ctx.restore();
	      }

	      /* The caption hangs off the right-hand end of the ribbon, offset back
	         into stage coordinates because everything here is drawn inside the
	         translate that walks the mark into the middle of the frame. */
	      if(anchors) anchors[i] = { x: xs[m-1] + st.ox, y: ys[m-1] + st.oy, a: v };
	    }
	    ctx.restore();
	  }

	  function drawTrail(){
	    if(!trail.length || narrow) return;
	    ctx.save();
	    for(var i=0;i<trail.length;i++){
	      var q = trail[i], age = t - q.t;
	      if(age > .55) continue;
	      var k = 1 - age/.55;
	      var rr = R*(.10 + .30*(1-k));
	      ctx.globalAlpha = k*k*.30*pIn*fade;
	      ctx.drawImage(GLOW, q.x-rr, q.y-rr, rr*2, rr*2);
	    }
	    ctx.globalAlpha = 1;
	    ctx.restore();
	  }

	  function draw(dt){
	    /* eased followers: slow-out motion, no linear snapping */
	    pxr    += (ptx - pxr)       * (1 - Math.pow(.0015, dt));
	    pyr    += (pty - pyr)       * (1 - Math.pow(.0015, dt));
	    pIn    += (pInT - pIn)      * (1 - Math.pow(.020, dt));
	    energy += (energyT - energy)* (1 - Math.pow(.050, dt));
	    /* Tight on purpose, and tightest on the camera. This is a scrubbed scene,
	       not a played one: anything that lags behind the wheel reads as the page
	       being slow rather than as the scene having weight. The follower is kept
	       on the camera only so that a flung scroll does not step it in visible
	       jumps — at .00035 it is worth about a frame and a half. */
	    trav   += (travT - trav)    * (1 - Math.pow(.00035, dt));
	    sq     += (sqT - sq)        * (1 - Math.pow(.0006, dt));
	    spl    += (splT - spl)      * (1 - Math.pow(.0006, dt));
	    cen    += (cenT - cen)      * (1 - Math.pow(.0020, dt));
	    convV  += (convT - convV)   * (1 - Math.pow(.0006, dt));
	    landV  += (landT - landV)   * (1 - Math.pow(.0006, dt));
	    if(intro < 1) intro = clamp(intro + dt/1.25, 0, 1);
	    var introE = 1 - Math.pow(1 - intro, 3);

	    var par = calm ? .45 : 1;
	    /* Scroll inertia: the mark leans into the throw and settles back. The
	       canvas repaints every frame regardless, so this reads as page-wide
	       momentum while costing nothing extra. */
	    var svT = calm ? 0 : clamp((Aura.vel || 0)*.0042, -.26, .26);
	    lean += (svT - lean)*(1 - Math.pow(.035, dt));
	    rotY += dt*(.115 + .18*energy)*(calm ? .40 : 1) + lean*dt*1.5;

	    /* How far apart the three layers stand in depth. Sized against the focal
	       length rather than picked by eye: at R*1.15 the near layer projects at
	       about 1.5x and the far one at about 0.75x, which is a stack you can
	       plainly see the depth of while all three still fit the frame — and it
	       spaces the three crossings at roughly a third, a half and four fifths
	       of the way through the flight, so no two go past together. */
	    var gap = R*1.15*spl;
	    /* The flight. The camera has to finish past the furthest layer, which
	       sits at F + gap, with enough overrun that the last one is properly gone
	       rather than hanging at the edge of the guard. The small `spl` term is
	       the stack drifting toward the camera as it comes apart, so the
	       separation reads as something opening out rather than as three things
	       being placed. */
	    var camZ = -trav*(F + gap + R*.55) - spl*R*.35;

	    var st = {
	      t: t,
	      cosY: 0, sinY: 0, cosX: 0, sinX: 0,
	      energy: energy,
	      camZ: camZ,
	      gap: gap,
	      /* Recorded, not read live, for the same reason the amplitude is: an
	         echo is replayed from a past state and has to hold the shape it had
	         then, including how far the stack had come apart. */
	      split: spl,
	      square: sq,
	      /* How far back the camera was one shutter ago. Zero at rest, so nothing
	         is ever blurred while the page is still. */
	      mblur: R*.30*clamp(trav*4, 0, 1),
	      /* Where the stage's origin has been walked to, so the captions can be
	         placed in page pixels from points projected in canvas ones. */
	      ox: 0, oy: 0,
	      breath: 1 + Math.sin(t*.55)*.035 + energy*.055 + Math.abs(lean)*.10
	    };
	    /* A layer you are about to fly through is not seen at an angle. As the
	       stack comes apart the mark stops turning and squares up to the camera —
	       scaled to almost nothing rather than to exactly nothing, so the last of
	       the rotation is still alive in the frame while the layers separate. */
	    var sqr = 1 - sq*.94;
	    var tiltY = (rotY + (pxr/Math.max(W,1))*1.20*pIn*par) * sqr;
	    var tiltX = (.30 + (pyr/Math.max(H,1))*-.85*pIn*par - lean*.55) * sqr;
	    st.cosY = Math.cos(tiltY); st.sinY = Math.sin(tiltY);
	    st.cosX = Math.cos(tiltX); st.sinX = Math.sin(tiltX);

	    var vis = clamp(fade*introE, 0, 1);
	    var mx = cx + pxr, my = cy + pyr;

	    for(var q=ripples.length-1;q>=0;q--){
	      ripples[q].t += dt;
	      if(ripples[q].t > 1.6) ripples.splice(q,1);
	    }
	    while(trail.length && t - trail[0].t > .55) trail.shift();

	    ctx.clearRect(0,0,W,H);

	    /* ---- the mark walks into the middle of the frame -------------------
	       At rest it sits in the right third, because the left two thirds are
	       the headline's. Once the scene starts there is no headline any more,
	       and a door you are about to walk through has to be in front of you:
	       the whole scene is translated so that the mark's centre arrives at the
	       centre of the screen by the time it opens.

	       Done as one transform around everything rather than by moving cx and
	       cy. The projection, the volumetric core, the echoes, the clip line the
	       door is cut along and the light behind it are all expressed in terms
	       of that centre, and moving them together is one matrix instead of six
	       places that could disagree. */
	    var walked = cen > .001;
	    st.ox = (W*.5 - cx)*cen;
	    st.oy = (H*.5 - cy)*cen;
	    if(walked){
	      ctx.save();
	      ctx.translate(st.ox, st.oy);
	    }

	    /* volumetric core behind everything */
	    paintNeb(st.breath);
	    /* The nebula is air behind the mark, and nothing else. It used to be
	       inflated and stretched as the scene went on, which is exactly how it
	       ended up as the milky wash that filled the frame: a soft shape with no
	       edges, scaled well past the point where any of its structure survived.
	       It now holds its size and simply gets out of the way — dimmed as the
	       stack comes apart, all but gone by the time the flight starts, because
	       a corridor seen through fog is not a corridor. */
	    var box = R*2.62*st.breath;
	    var nebA = fade*introE*(.90 + energy*.12)*(1 - spl*.55)*(1 - clamp(trav*1.9, 0, 1)*.92);
	    ctx.globalAlpha = clamp(nebA, 0, 1);
	    ctx.drawImage(NEB, cx-box/2, cy-box/2, box, box);
	    ctx.globalAlpha = 1;

	    drawTrail();

	    /* Echoes go down before the mark so the mark always sits on top of its
	       own past. Strength follows |lean| — there is no afterimage without
	       motion — and the offset runs against the lean, which is where the
	       previous position actually was. */
	    if(ECHO && !calm){
	      var moved = clamp(Math.abs(lean)/.20, 0, 1);
	      for(var e=0;e<ECHO;e++){
	        var h = HIST[HIST.length - 1 - (e+1)*3];
	        if(!h) continue;
	        drawEcho(h, .13*moved*vis*(1 - e*.42), -lean*R*(.34 + e*.30));
	      }
	    }

	    var PP = Aura.PORTAL;
	    var rush = (PP && PP.on) ? (PP.spread || 0) : 0;

	    /* The measure marks go underneath the stack: they are the surface it is
	       being set out on, not an overlay sitting on top of it. */
	    drawRig((PP && PP.on ? PP.rig : 0)*introE*fade);

	    /* The stack itself, and the three anchors its captions hang from. */
	    ANCH[0] = ANCH[1] = ANCH[2] = null;
	    drawWaves(st, vis, ANCH);

	    /* And what it all resolves into, once the last layer is behind us. */
	    /* The exit is scrubbed, not damped. Everything else here chases its target
	       because it is reacting to you; this is the one move that is authored
	       against the scroll itself, so it takes the clock's value raw. Damped, it
	       arrives wherever the easing happens to have got to when you stop, which
	       is a different place every time — and it has to arrive on the same pixel
	       as the page's own seam, which is a CSS transform reading the same clock
	       undamped. Two halves of one hand-over cannot run on two timebases. */
	    drawSeam(convV, (PP && PP.on) ? PP.land : 0, clamp(introE, 0, 1), st.oy,
	             (PP && PP.on) ? PP.seam : null);

	    /* Dust last, so it is between the mark and the viewer. At rest it is
	       barely there; on the pass it streams. */
	    /* The dust does not fade with the mark. The mark is what you are leaving;
	       the dust is the room you are leaving it in, and a room does not become
	       transparent because you have started moving through it — during the
	       pass it is the only thing left in frame with any detail in it. */
	    /* The dust is taken back out as the page lands. Streaks still tearing
	       across the frame while the first section is arriving read as the scene
	       having been interrupted rather than finished. */
	    if(!calm){
	      var mrush = rush*(1 - landV);
	      var mvis  = Math.max(vis, rush*.95)*(1 - landV);
	      if(mvis > .008) drawMotes(mvis, mrush, dt);
	    }

	    /* click shockwave, rendered in the plane of the ring */
	    for(var q4=0;q4<ripples.length;q4++){
	      var rp2 = ripples[q4], k2 = rp2.t/1.6, ease = 1 - Math.pow(1-k2, 3);
	      ctx.strokeStyle = "rgba(" + TH.ripple + "," + ((1-k2)*(1-k2)*.34*fade).toFixed(3) + ")";
	      ctx.lineWidth = Math.max(1, 3.2*(1-k2));
	      ctx.beginPath();
	      ctx.ellipse(cx, cy, R*2.3*ease, R*2.3*ease*(.32 + .52*Math.abs(Math.cos(tiltX))), 0, 0, 6.2832);
	      ctx.stroke();
	    }

	    /* pointer light */
	    if(pIn > .01 && !narrow){
	      var hr = R*.58;
	      ctx.globalAlpha = .22*pIn*fade;
	      ctx.drawImage(GLOW, mx-hr, my-hr, hr*2, hr*2);
	      ctx.globalAlpha = 1;
	    }

	    if(ECHO){
	      HIST.push(st);
	      if(HIST.length > HMAX) HIST.shift();
	    }

	    if(walked) ctx.restore();

	    /* Hand the three anchors to the caption rail. Done every frame, including
	       the frames where a layer has gone and its anchor is null, because that
	       null is what takes its label off the screen. The gate is the portal's:
	       the canvas knows where a layer is, the clock knows whether its name is
	       supposed to be showing yet. */
	    if(Aura.placeCallouts){
	      var cg = (PP && PP.on) ? PP.cap : 0;
	      for(var ci = 0; ci < 3; ci++){
	        var an = ANCH[ci];
	        OUTA[ci] = an ? { x: an.x, y: an.y, a: an.a*cg } : null;
	      }
	      Aura.placeCallouts(OUTA);
	    }
	  }

	  function frame(now){
	    raf = requestAnimationFrame(frame);

	    /* The observer below watches the hero section, but the canvas is sticky
	       and stays on screen well after that section has scrolled out of it.
	       Halting on that signal alone freezes the last painted frame in place,
	       and the frame it freezes is the end of the scene — so the wave stops
	       half way down and simply sits there. While the scene still has
	       something to draw the loop stays alive wherever the section is, and
	       stops itself the moment it does not. */
	    if(!onScreen && !scening()){ halt(); return; }

	    /* "A 30fps aura is indistinguishable from 60 on a phone" was the old
	       note here, and it is true of the glow itself - a soft blob does not
	       betray its frame rate. It is not true of the mark riding on top of
	       it, and it is not true when this loop and the seams are the two
	       moving things on screen at once: two effects at 30fps that are not
	       in step read as one stuttering page. The budget is shared now, so
	       they step together and fall back together. */
	    Aura.beat(now);
	    if(LITE && now - drawn < Aura.frameMs - 1) return;

	    var dt = last ? Math.min((now - last)/1000, .05) : .016;
	    last = now; drawn = now;

	    t += dt*(calm ? .42 : 1);
	    draw(dt);
	  }

	  /* ---- events ---- */
	  Aura.onResize(function(){
	    dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
	    size();
	    HIST.length = 0;
	  });

	  if(!LITE){
	    hero.addEventListener("pointermove", function(e){
	      if(e.pointerType === "touch") return;
	      var r = cv.getBoundingClientRect();
	      var lx = e.clientX - r.left, ly = e.clientY - r.top;
	      ptx = lx - cx; pty = ly - cy;
	      pInT = 1; energyT = 1;
	      if(!calm){
	        trail.push({x:lx, y:ly, t:t});
	        if(trail.length > 26) trail.shift();
	      }
	    }, {passive:true});

	    hero.addEventListener("pointerleave", function(){
	      pInT = 0; energyT = 0; ptx = 0; pty = 0;
	    }, {passive:true});
	  }

	  /* A tap still answers — it is the one interaction a phone actually has. */
	  hero.addEventListener("pointerdown", function(){
	    if(calm) return;
	    ripples.push({t:0});
	    if(ripples.length > 4) ripples.shift();
	    energyT = 1.7;
	    setTimeout(function(){ energyT = pInT > .5 ? 1 : 0; }, 540);
	  }, {passive:true});

	  /* The loop is the cost, not the drawing. A frame that returns early still
	     costs a wake-up sixty times a second, so the loop itself is cancelled
	     while the hero is off screen or the tab is away, and re-armed on the way
	     back. `last` is cleared on the way in: the first frame after a pause must
	     not be handed the whole gap as its delta, or the scene lurches. */
	  /* True while the portal scene still has something left to put on screen. */
	  function scening(){
	    var P = Aura.PORTAL;
	    return !!(P && P.on && P.p > .002 && P.p < .999);
	  }
	  function pump(){
	    if(raf || !visible || (!onScreen && !scening())) return;
	    last = 0;
	    raf = requestAnimationFrame(frame);
	  }
	  function halt(){
	    if(!raf) return;
	    cancelAnimationFrame(raf);
	    raf = 0;
	    /* Nothing is left on the glass. A cancelled loop keeps whatever it painted
	       last, and a still frame of a moving scene reads unmistakably as broken. */
	    if(ctx) ctx.clearRect(0, 0, W, H);
	  }

	  document.addEventListener("visibilitychange", function(){
	    visible = !document.hidden;
	    /* The recorded states are stale the moment the tab comes back; replaying
	       them would flash a ghost of wherever the mark stood minutes ago. */
	    HIST.length = 0;
	    if(visible) pump(); else halt();
	  });

	  if(window.IntersectionObserver){
	    new IntersectionObserver(function(en){
	      onScreen = en[0].isIntersecting;
	      /* Same staleness argument as the hidden tab: the mark can be scrolled
	         away from for as long as you like. */
	      HIST.length = 0;
	      if(onScreen || scening()) pump(); else halt();
	      /* The margin re-arms the loop slightly before the section is back in
	         view rather than on the frame it arrives on. */
	    }, {threshold:0, rootMargin:"60% 0px 60% 0px"}).observe(hero);
	  }

	  /* ---- the scene's clock ----------------------------------------------
	     Two ways in.

	     When the portal is armed, portal.js owns the numbers: the camera, the
	     mark's presence and how far it has opened are all pure functions of one
	     scroll position, read straight off the object it publishes. The canvas
	     and the stylesheet therefore cannot disagree about which frame of the
	     scene this is — there is one clock and they both read it.

	     When it is not armed — the track simply not being in the markup — the
	     hero is just a hero: the mark holds its place and dims as the page
	     scrolls off it. */
	  var heroH = 1;
	  Aura.onResize(function(){ heroH = hero.offsetHeight || 1; });
	  heroH = hero.offsetHeight || 1;
	  Aura.onScroll(function(y){
	    var P = Aura.PORTAL;
	    if(P && P.on){
	      cenT  = P.centre;
	      sqT   = P.square;
	      splT  = P.split;
	      travT = P.travel;
	      convT = P.conv;
	      landT = P.land;
	      /* The mark does not fade out. It leaves by going past the camera, one
	         layer at a time, and that is the whole content of the scene — fading
	         it as well would be two exits happening at once and would take the
	         legibility out of the only moment that carries any meaning. The one
	         concession is the very end, so the seam is handed over cleanly. */
	      fade  = 1 - P.land;
	      return;
	    }
	    var k = clamp(y / heroH, 0, 1);
	    fade = 1 - k*.78;
	    cenT = sqT = splT = travT = convT = landT = 0;
	  });

	  /* The blob and glow colours are baked into offscreen sprites once, for
	     speed — which means a theme switch has to ask for them to be baked
	     again. Without this the canvas keeps painting the palette it booted
	     with, and the hero stays dark under a light page until the next reload.
	     Re-reading the attribute rather than trusting the event's detail keeps
	     this correct even if the theme is changed by some other path. */
	  window.addEventListener("aura:theme", function(){
	    var next = THEMES[themeName()];
	    if(next === TH) return;
	    TH = next;
	    makeGlow(); makeNeb();
	    pump();
	  });

	  dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
	  makeGlow(); makeNeb();
	  size();
	  pump();
	}
	Aura.register("hero-aura", initRing);
})(window.Aura);
