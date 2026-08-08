/* The living background: a field of the brand's own waves behind the whole page,
   and one pool of light per section that follows the pointer.
   ---------------------------------------------------------------------------
   WHY A SINGLE FIXED CANVAS. The hero already has a canvas of its own and it is
   the loudest object on the page. Everything below it used to be still. Giving
   each section its own canvas would have meant six live contexts and six sets of
   the same maths; one fixed canvas behind the document costs one context and one
   loop no matter how long the page gets, and it makes the field continuous — the
   same water runs behind every section rather than restarting at each one.

   WHAT THE CURSOR DOES TO IT. Three things, all of them physical rather than
   decorative, so the field reads as a surface and not as an effect:
     - it lifts the water it passes over (a travelling swell, strongest at the
       pointer and gone within a couple of hundred pixels either side),
     - it drags the nearest lines toward itself,
     - it lights them: the segment of every line inside a soft circle around the
       pointer is redrawn brighter, so the pointer behaves like a lamp held over
       water rather than like a highlighted region.
   A click drops a ripple, which crosses the whole field and dies out.

   HOW IT STAYS CHEAP. Every line is sampled into a reused Float32Array — a frame
   allocates nothing. The lit pass replays those same samples instead of
   recomputing them, so the lamp costs a second stroke and not a second field.
   The loop is capped, it stops entirely when the tab is hidden, and the phone
   profile halves the line count and drops the lamp's blur.

   Nothing here is armed under a reduced-motion request: the module returns
   before it builds the canvas, and the stylesheet hides the element. */
(function (Aura) {
	"use strict";

	/* ---------------------------------------------------------------- field */
	function initField(){
	  if(Aura.RM) return;

	  var cv = document.createElement("canvas");
	  cv.id = "bgw";
	  cv.setAttribute("aria-hidden", "true");
	  document.body.insertBefore(cv, document.body.firstChild);
	  if(!cv.getContext) return;
	  var ctx = cv.getContext("2d", { alpha: true });

	  var LITE = Aura.MOBILE, LOW = Aura.LOW;
	  var DPR_CAP  = LOW ? 1.15 : (LITE ? 1.4 : 1.8);
	  /* Desktop keeps the 18ms it always had. The phone hands its pacing to
	     the shared budget in core/aura.js, which measures instead of guessing. */
	  var DESK_MS  = 18;
	  var LAMP     = !LITE;                 /* the pool of light at the pointer */
	  var COUNT    = LOW ? 3 : (LITE ? 4 : 7);
	  var STEP     = LITE ? 26 : 16;        /* px between samples along a line */

	  var W = 0, H = 0, dpr = 1, N = 0;
	  var t = 0, last = 0, raf = 0, live = true, faded = false;

	  /* pointer: a target and an eased follower, plus how present it is */
	  var ptx = -999, pty = -999, px = -999, py = -999, pInT = 0, pIn = 0;
	  var ripples = [];

	  /* One line is: its resting height as a fraction of the viewport, its
	     amplitude, its wavelength, its speed, its phase, its weight and its
	     opacity. Spread deliberately unevenly — evenly spaced lines read as a
	     grid, and a grid is not water. */
	  var SPREAD = [.12, .27, .38, .52, .66, .79, .91];
	  var lines = [];
	  function build(){
	    lines = [];
	    for(var i = 0; i < COUNT; i++){
	      var f = SPREAD[i % SPREAD.length];
	      lines.push({
	        y0: f,
	        amp: 26 + (i % 3) * 13,
	        wl:  210 + (i % 4) * 78,
	        sp:  .18 + (i % 5) * .045,
	        ph:  i * 1.27,
	        w:   i % 3 === 0 ? 1.7 : 1.15,
	        a:   i % 3 === 0 ? .30 : .19,
	        pts: null
	      });
	    }
	  }
	  build();

	  /* ---- palette -------------------------------------------------------
	     Read off the stylesheet rather than restated here, so the field cannot
	     drift out of the brand and follows a theme change for free. */
	  var COL = ["#63C6F2", "#7B9DFF", "#A98BF0"], ALPHA = 1;
	  function palette(){
	    var cs = getComputedStyle(document.documentElement);
	    var sky = cs.getPropertyValue("--c-sky").trim();
	    var blue = cs.getPropertyValue("--c-blue").trim();
	    var vio = cs.getPropertyValue("--c-violet").trim();
	    if(sky) COL = [sky, blue || sky, vio || sky];
	    /* A dark page can carry more light than a white one: the same alpha that
	       reads as a hairline on navy reads as dirt on paper. */
	    ALPHA = document.documentElement.getAttribute("data-theme") === "light" ? .72 : 1;
	  }
	  palette();
	  if(window.MutationObserver){
	    new MutationObserver(palette).observe(document.documentElement, {
	      attributes: true, attributeFilter: ["data-theme"]
	    });
	  }

	  function size(){
	    dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
	    W = window.innerWidth || document.documentElement.clientWidth;
	    H = window.innerHeight || document.documentElement.clientHeight;
	    if(!W || !H) return;
	    cv.width = Math.round(W * dpr);
	    cv.height = Math.round(H * dpr);
	    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	    N = Math.ceil(W / STEP) + 1;
	    for(var i = 0; i < lines.length; i++) lines[i].pts = new Float32Array(N * 2);
	  }

	  /* ---- the surface ---------------------------------------------------
	     Two sines of different wavelength and opposite drift, so no line ever
	     repeats visibly; then the three things the visitor does to it. */
	  /* How hard the portal is currently throwing the field apart. Written once
	     per frame in frame(), read once per line in sample(). */
	  var PSPREAD = 0;

	  function sample(L){
	    var base = L.y0 * H, pts = L.pts;
	    /* Going through the mark: the field is pushed outward from the middle of
	       the screen, so the page being entered arrives past a rush of its own
	       lines instead of standing still behind the light. It is the same water
	       the whole time — only the camera is moving through it. */
	    if(PSPREAD > .001) base = H * .5 + (base - H * .5) * (1 + PSPREAD * 2.2);
	    /* How hard the page was thrown, as a whip on the shorter wavelength. */
	    var whip = Math.min(20, Math.abs(Aura.vel) * .16);
	    var near = pIn > .01;
	    for(var i = 0; i < N; i++){
	      var x = i * STEP;
	      var y = base
	        + Math.sin(x / L.wl + t * L.sp + L.ph) * L.amp
	        + Math.sin(x / (L.wl * .43) - t * L.sp * 1.6 + L.ph * 2.1) * L.amp * .34
	        + Math.sin(x / (L.wl * .19) + t * L.sp * 2.4) * whip * .5;

	      if(near){
	        /* A swell centred on the pointer, two hundred-odd pixels wide. */
	        var d = (x - px) / 240, g = Math.exp(-d * d);
	        /* ...that only reaches the lines the pointer is actually near. */
	        var dv = (base - py) / (H * .55), gv = Math.exp(-dv * dv);
	        var reach = g * gv * pIn;
	        y -= reach * 34 * (.6 + .4 * Math.sin(t * 1.9 + L.ph));
	        y += reach * (py - base) * .26;
	      }

	      for(var r = 0; r < ripples.length; r++){
	        var rp = ripples[r];
	        var rd = Math.abs(x - rp.x) + Math.abs(base - rp.y) * .55;
	        var edge = (rd - rp.r) / 90;
	        y += Math.sin(edge * 2.4) * Math.exp(-edge * edge) * 30 * rp.life;
	      }

	      pts[i * 2] = x;
	      pts[i * 2 + 1] = y;
	    }
	  }

	  function trace(L){
	    var pts = L.pts;
	    ctx.beginPath();
	    ctx.moveTo(pts[0], pts[1]);
	    /* Midpoint quadratics: a smooth curve through every sample without
	       computing tangents, and one path command per sample. */
	    for(var i = 1; i < N - 1; i++){
	      var x0 = pts[i * 2], y0 = pts[i * 2 + 1];
	      var x1 = pts[i * 2 + 2], y1 = pts[i * 2 + 3];
	      ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
	    }
	    ctx.lineTo(pts[(N - 1) * 2], pts[(N - 1) * 2 + 1]);
	  }

	  function frame(now){
	    raf = requestAnimationFrame(frame);
	    if(!live) return;
	    Aura.beat(now);
	    if(now - last < (LITE ? Aura.frameMs : DESK_MS)) return;
	    var dt = last ? Math.min(.05, (now - last) / 1000) : .016;
	    last = now;
	    t += dt;

	    /* Nothing snaps: the pointer, its presence and every ripple are eased. */
	    if(px < -500){ px = ptx; py = pty; }
	    px += (ptx - px) * .12;
	    py += (pty - py) * .12;
	    pIn += (pInT - pIn) * .07;

	    for(var r = ripples.length - 1; r >= 0; r--){
	      var rp = ripples[r];
	      rp.r += dt * 620;
	      rp.life -= dt * .62;
	      if(rp.life <= 0) ripples.splice(r, 1);
	    }

	    /* One read of the portal's clock per frame. The scene publishes a plain
	       object and never calls in here, so this file has no idea whether a
	       portal exists — it only knows how to be travelled through. */
	    var P = Aura.PORTAL;
	    PSPREAD = (P && P.on) ? P.spread : 0;

	    ctx.clearRect(0, 0, W, H);
	    var grad = ctx.createLinearGradient(0, 0, W, H * .3);
	    grad.addColorStop(0, COL[0]);
	    grad.addColorStop(.54, COL[1]);
	    grad.addColorStop(1, COL[2]);
	    ctx.strokeStyle = grad;
	    ctx.lineCap = "round";
	    ctx.lineJoin = "round";

	    var i;
	    for(i = 0; i < lines.length; i++){
	      sample(lines[i]);
	      /* Thicker and brighter as they pass the camera, which is what makes
	         the spread above read as speed rather than as the field quietly
	         rearranging itself. */
	      ctx.globalAlpha = Math.min(1, lines[i].a * ALPHA * (1 + PSPREAD * 1.5));
	      ctx.lineWidth = lines[i].w * (1 + PSPREAD * 1.6);
	      trace(lines[i]);
	      ctx.stroke();
	    }

	    /* The lamp. Same samples, clipped to a soft disc at the pointer and
	       stroked heavier — the light belongs to the water, not to the cursor. */
	    if(LAMP && pIn > .02){
	      ctx.save();
	      ctx.beginPath();
	      ctx.arc(px, py, 260, 0, Math.PI * 2);
	      ctx.clip();
	      ctx.shadowColor = COL[1];
	      ctx.shadowBlur = 12;
	      for(i = 0; i < lines.length; i++){
	        ctx.globalAlpha = Math.min(.85, lines[i].a * 2.9) * pIn * ALPHA;
	        ctx.lineWidth = lines[i].w + .8;
	        trace(lines[i]);
	        ctx.stroke();
	      }
	      ctx.restore();

	      /* and a breath of air around it, so the lamp has a body */
	      var rg = ctx.createRadialGradient(px, py, 0, px, py, 240);
	      rg.addColorStop(0, COL[1]);
	      rg.addColorStop(1, "rgba(0,0,0,0)");
	      ctx.globalAlpha = .10 * pIn * ALPHA;
	      ctx.fillStyle = rg;
	      ctx.beginPath();
	      ctx.arc(px, py, 240, 0, Math.PI * 2);
	      ctx.fill();
	    }

	    /* The ring a click leaves behind. */
	    for(i = 0; i < ripples.length; i++){
	      var rr = ripples[i];
	      ctx.globalAlpha = .22 * rr.life * ALPHA;
	      ctx.lineWidth = 1.2;
	      ctx.beginPath();
	      ctx.arc(rr.x, rr.y, rr.r, 0, Math.PI * 2);
	      ctx.stroke();
	    }

	    ctx.globalAlpha = 1;
	    if(!faded){ faded = true; cv.classList.add("on"); }
	  }

	  /* ---- input ---------------------------------------------------------
	     Pointer coordinates are viewport coordinates and the canvas is fixed, so
	     no scroll offset is ever involved. A coarse pointer only ripples: a
	     finger has no hover, and a swell that appears under a tap and stays
	     there is a smudge. */
	  if(Aura.FINE){
	    window.addEventListener("pointermove", function(e){
	      if(e.pointerType === "touch") return;
	      ptx = e.clientX; pty = e.clientY; pInT = 1;
	    }, { passive: true });
	    window.addEventListener("pointerleave", function(){ pInT = 0; }, { passive: true });
	    document.addEventListener("mouseleave", function(){ pInT = 0; }, { passive: true });
	  }
	  window.addEventListener("pointerdown", function(e){
	    if(ripples.length > 3) ripples.shift();
	    ripples.push({ x: e.clientX, y: e.clientY, r: 0, life: 1 });
	  }, { passive: true });

	  /* A hidden tab must not be paying for a canvas nobody is looking at. */
	  document.addEventListener("visibilitychange", function(){
	    live = !document.hidden;
	    if(live) last = 0;
	  });

	  Aura.onResize(function(){
	    var wanted = Aura.LOW ? 3 : (Aura.MOBILE ? 4 : 7);
	    if(wanted !== COUNT){ COUNT = wanted; build(); }
	    size();
	  });
	  size();
	  raf = requestAnimationFrame(frame);
	}

	/* ------------------------------------------------------- pool of light */
	/* One per section and one for the footer. The pointer's position is written
	   to the section as a pair of percentages and the stylesheet does the rest,
	   which keeps this to two custom properties per frame and no layout reads
	   beyond the one rect the event already implies. */
	function initGlow(){
	  if(Aura.RM || !Aura.FINE) return;
	  var hosts = Aura.$$("main .sec, .foot");
	  if(!hosts.length) return;

	  hosts.forEach(function(host){
	    var layer = document.createElement("div");
	    layer.className = "sglow";
	    layer.setAttribute("aria-hidden", "true");
	    host.insertBefore(layer, host.firstChild);

	    var queued = false, mx = 50, my = 50;
	    function flush(){
	      queued = false;
	      layer.style.setProperty("--mx", mx.toFixed(2) + "%");
	      layer.style.setProperty("--my", my.toFixed(2) + "%");
	    }
	    host.addEventListener("pointermove", function(e){
	      if(e.pointerType === "touch") return;
	      var r = host.getBoundingClientRect();
	      if(!r.width || !r.height) return;
	      mx = ((e.clientX - r.left) / r.width) * 100;
	      my = ((e.clientY - r.top) / r.height) * 100;
	      host.classList.add("is-glow");
	      if(!queued){ queued = true; requestAnimationFrame(flush); }
	    }, { passive: true });
	    host.addEventListener("pointerleave", function(){
	      host.classList.remove("is-glow");
	    }, { passive: true });
	  });
	}

	Aura.register("backdrop", function(){
	  initField();
	  initGlow();
	});
})(window.Aura);
