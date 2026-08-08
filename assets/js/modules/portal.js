/* The portal: one number, four acts.
   ---------------------------------------------------------------------------
   This module owns the scene's clock and nothing else. It reads how far the
   track has been scrolled, turns that into the handful of values the scene is
   made of, and publishes them in three places:

     - `Aura.PORTAL`, read by the canvas modules that answer in their own
       geometry (hero-aura.js flies the stack, backdrop.js throws the field),
     - custom properties on <html>, read by components/portal.css for anything
       that is a transform or an opacity,
     - `Aura.placeCallouts`, which the canvas calls back once per painted frame
       with the three screen positions its layers ended up at.

   Nothing is animated here. Every value is a pure function of the scroll
   position, which is what makes the scene scrubbable: throw the page back and
   it comes apart again in reverse, at exactly the shape it had on the way down.
   The only easing in the whole file is the browser's own smooth scroll on the
   skip control.

   WHAT THE SCENE IS.
   The site's promise is one line: «Делаем весь IT — от дизайна до серверов».
   The mark above it happens to be three waves. So the scene does not decorate
   the promise, it performs it: the three waves come apart into the three layers
   they stand for, name themselves, and the camera flies forward through them in
   the order the sentence reads — the surface you look at, the thing that makes
   it work, the ground both of them stand on. What is left at the far end
   gathers into the wave seam the page itself is built out of.

   That is the whole idea, and it is why there is no glare and no aperture any
   more. Those were saying "something impressive is happening" without ever
   saying what. This says what.

   THE ACTS, and why they overlap.
     square   0.00 - 0.36   the words leave, the mark centres and squares up
     split    0.18 - 0.48   the stack comes apart, the layers name themselves
     travel   0.44 - 0.88   forward through design → code → infrastructure
     seam     0.72 - 1.00   the remains converge into the page's own seam
   Each act starts before the last has finished. Cut them at hard boundaries
   and the scene reads as four things in a queue; overlapped, the stack is
   already separating while the mark is still turning, and the seam is already
   forming while the last layer is still going past — which is what a single
   continuous shot looks like.

   COST. One subscriber on the shared scroll pass, a few multiplications, and
   at most seven custom properties written per frame — and only when their
   rounded value has actually changed, because writing a property that has not
   changed still invalidates style for the whole subtree. */
(function (Aura) {
	"use strict";

	function clamp(v, a, b){ return v < a ? a : (v > b ? b : v); }
	/* Progress inside a sub-range of the scene, clamped at both ends. */
	function seg(p, a, b){ return clamp((p - a) / (b - a), 0, 1); }
	/* Smoothstep. An act that starts and stops abruptly reads as a cut; this is
	   the cheapest curve that leaves and arrives at zero velocity. */
	function smooth(x){ return x * x * (3 - 2 * x); }

	/* The three layers, near to far, which is also the order the tagline names
	   them in and the order the camera meets them. The copy is the site's own,
	   lifted from the competencies section rather than written for the intro —
	   an intro that promises three things the page then calls something else is
	   an intro that has to be forgiven. */
	var LAYERS = [
		{ n: "01", t: "Дизайн",         s: "интерфейсы, брендинг, 3D-моушен" },
		{ n: "02", t: "Разработка",     s: "сервисы, порталы, 1С и учёт" },
		{ n: "03", t: "Инфраструктура", s: "серверы, сети, мониторинг" }
	];

	function init(){
		var track = Aura.$("#portal");
		if(!track) return;

		var root = document.documentElement;
		var rail = Aura.$("#portalRail");
		var skip = Aura.$("#portalSkip");

		/* The published state. Created even when the scene is off, so the modules
		   that read it never have to test for its existence — only for `.on`. */
		var S = {
			on: false,     /* is the scene armed at all                       */
			seam: 1,       /* the page's own seam, in fractions of a screen   */
			p: 0,          /* scene progress                                  */
			centre: 0,     /* how far the mark has walked into frame centre   */
			square: 0,     /* how far it has stopped turning and faced us     */
			split: 0,      /* how far the three layers have come apart        */
			travel: 0,     /* how far the camera has flown through them       */
			conv: 0,       /* how far the remains have gathered into the seam */
			land: 0,       /* the handover to the page                        */
			rig: 0,        /* the measure marks                               */
			cap: 0,        /* whether the layer names are showing             */
			spread: 0      /* how hard the background field is thrown apart   */
		};
		Aura.PORTAL = S;

		/* This used to switch the scene off completely, and that was wrong twice
		   over. It left anyone whose system has animation turned down — which is a
		   default on plenty of Windows machines, not a rare accessibility choice —
		   looking at a page that never does the one thing it was built to do. And
		   it treated a scrubbed scene as if it were a played one: nothing in here
		   moves by itself, every frame is a position the visitor scrolled to and
		   can scroll straight back out of.

		   So the setting no longer removes the scene, it calms it: a shorter
		   track, a gentler camera, and no light band at the end. The three layers
		   and their three names — the part that carries the meaning — are exactly
		   the same, because that is content, not motion. */
		var CALM = !!Aura.RM;
		if(CALM) root.classList.add("portal-calm");

		S.on = true;
		root.classList.add("portal-on");

		/* How much scroll the pinned stage actually has to play with. Measured
		   rather than assumed: the track's height is a clamp on viewport units and
		   the stage is one screen of it, so the travel is everything left over. */
		var span = 1;
		function measure(){
			span = Math.max(1, track.offsetHeight - window.innerHeight);
		}
		measure();
		Aura.onResize(measure);

		/* ---- the caption rail ----------------------------------------------
		   Three labels that hang off the three layers. They are real DOM — real
		   text, in the page's own typeface, selectable and readable by a screen
		   reader — rather than text painted into the canvas, which would be a
		   picture of words. The canvas only says where they go.

		   Built here rather than written into the markup so that a page with the
		   scene switched off does not carry three captions for an animation that
		   is never going to run. */
		var cells = [];
		if(rail){
			for(var li = 0; li < LAYERS.length; li++){
				var L = LAYERS[li];
				var el = document.createElement("figure");
				el.className = "pcall";
				var rule = document.createElement("i");
				rule.className = "pcall__rule";
				var no = document.createElement("b");
				no.className = "pcall__no";
				no.textContent = L.n;
				var tt = document.createElement("span");
				tt.className = "pcall__t";
				tt.textContent = L.t;
				var ss = document.createElement("span");
				ss.className = "pcall__s";
				ss.textContent = L.s;
				el.appendChild(rule);
				el.appendChild(no);
				el.appendChild(tt);
				el.appendChild(ss);
				rail.appendChild(el);
				cells.push({ el: el, x: -1, y: -1, a: -1, flip: null, stack: null });
			}
		}

		/* Called by the canvas once per painted frame with three anchors, or
		   nulls for layers that have gone past. Writes styles straight onto the
		   elements — not into custom properties on a shared parent — because
		   three independent positions inherited from one parent is three style
		   recalculations that all have to agree, and they do not need to.

		   Every write is guarded against its own previous value. During the long
		   still stretches of a scrubbed scene this loop touches nothing at all. */
		Aura.placeCallouts = function(list){
			if(!cells.length) return;
			var vw = window.innerWidth, vh = window.innerHeight;
			for(var i = 0; i < cells.length; i++){
				var c = cells[i], a = list && list[i];
				var vis = a ? clamp(a.a, 0, 1) : 0;
				if(vis <= .012){
					if(c.a !== 0){
						c.a = 0;
						c.el.style.opacity = "0";
						c.el.style.visibility = "hidden";
					}
					continue;
				}
				/* Narrow screens do not get a label hanging off the end of a wave.
				   The mark is drawn near the middle of a 390px frame and there is no
				   room on either side of it, so the captions give up the anchor
				   entirely and take a fixed rhythm below the stack. Three labels
				   tracking three ribbons that sit forty pixels apart on a phone is
				   three labels written on top of each other. */
				var stack = vw <= 720;
				if(stack !== c.stack){
					c.stack = stack;
					c.el.classList.toggle("pcall--stack", stack);
				}
				/* A label that would run off the right edge is hung on the other
				   side of its anchor instead of being squeezed or clipped. The
				   threshold is generous because the flip itself is visible, and a
				   caption that flips back and forth as the layer drifts across the
				   line is worse than one that sits slightly close to the edge. */
				var flip = !stack && a.x > vw - 260;
				var x = Math.round(stack ? 20 : a.x);
				var y = Math.round(stack ? vh * .56 + i * 84 : a.y);
				if(x !== c.x || y !== c.y){
					c.x = x; c.y = y;
					c.el.style.transform = "translate3d(" + x + "px," + y + "px,0)";
				}
				if(flip !== c.flip){
					c.flip = flip;
					c.el.classList.toggle("pcall--flip", flip);
				}
				var ra = Math.round(vis * 100) / 100;
				if(ra !== c.a){
					if(c.a <= 0) c.el.style.visibility = "visible";
					c.a = ra;
					c.el.style.opacity = String(ra);
				}
			}
		};

		/* Written values, kept so an unchanged frame writes nothing at all. */
		var wp = -1, ww = -1, wr = -1, wl = -1, wb = -1, wc = -1, wk = -1, wm = -1;
		var live = false, pass = false, late = false, done = false, hand = false;

		function setVar(name, value, prev){
			var r = Math.round(value * 1000) / 1000;
			if(r === prev) return prev;
			root.style.setProperty(name, String(r));
			return r;
		}

		Aura.onScroll(function(){
			var box = track.getBoundingClientRect();
			var p = clamp(-box.top / span, 0, 1);

			/* Where the page's own seam is right now, as a fraction of a screen
			   below the top of the frame. The page is pulled up by exactly one
			   stage, so the seam rides at the track's bottom edge; publishing the
			   measured position rather than assuming one keeps the scene's light
			   aimed at the real thing on any viewport, and it is free - the rect
			   was already being read for the progress. */
			var vh = window.innerHeight || 1;
			S.seam = clamp((box.bottom - vh) / vh, 0, 1);
			S.p = p;

			/* The words go first, and quickly. They are the only thing on screen
			   competing with the mark for attention, and the scene cannot begin
			   until they have stopped. */
			var words = smooth(seg(p, 0, .17));

			S.centre = smooth(seg(p, .03, .32));
			S.square = smooth(seg(p, .08, .36));
			S.split  = smooth(seg(p, .18, .48));

			/* The flight is deliberately the least eased thing in the file. A
			   camera moving forward at a constant rate is what makes the three
			   crossings land as three separate events; smoothstep it and they
			   bunch in the middle and the last one arrives in a rush. The little
			   that is here only takes the corners off the start and the stop. */
			var tl = seg(p, .44, .88);
			S.travel = tl * .68 + smooth(tl) * .32;

			/* The seam begins forming while the last layer is still going past.
			   Held apart, the flight ends on an empty frame and the line then
			   arrives out of nowhere; overlapped, the thing the layers are about
			   to become is already there to receive them. */
			S.conv = smooth(seg(p, .66, .90));
			S.land = smooth(seg(p, .86, 1));

			/* The measure marks arrive with the stack and are gone before the
			   flight. Scaffolding that is still up while the camera is moving
			   stops being scaffolding and becomes scenery. */
			S.rig = Math.min(smooth(seg(p, .10, .24)), 1 - smooth(seg(p, .40, .52)));
			/* The names come up once the layers are far enough apart to belong to
			   one each, and are taken down before the seam, so the last thing on
			   the screen is a single line and not a line with labels on it. */
			S.cap = Math.min(smooth(seg(p, .24, .38)), 1 - smooth(seg(p, .78, .88)));
			/* Taken back out as the page lands. The background field being thrown
			   apart is the flight; leaving it thrown apart once the first section is
			   arriving leaves streaks tearing across the page behind real content. */
			S.spread = (CALM ? S.travel * .34 : S.travel) * (1 - S.land);

			wp = setVar("--pp", p, wp);
			ww = setVar("--pwords", words, ww);
			wr = setVar("--prig", S.rig, wr);
			wl = setVar("--pland", S.land, wl);
			wm = setVar("--pseam", S.seam, wm);
			/* A band of light across the seam as it forms, gone as the page lands.
			   Not a flash: it is the height of the line and stops where the line
			   stops, so it reads as the seam being lit rather than as the screen
			   being blown out. Off entirely when motion is reduced. */
			wb = setVar("--pbeam", CALM ? 0 : S.conv * (1 - S.land), wb);
			wc = setVar("--pcue", 1 - seg(p, 0, .06), wc);
			/* Gone by the time the flight is properly under way: past that point
			   there is very little left to skip, and a control sitting over the
			   layers as they sweep past is a control in the way of the shot. */
			wk = setVar("--pskip", (1 - seg(p, .50, .64)) * .92, wk);

			/* Class flips, each written only on the edge it changes at. */
			var nLive = p > .008;
			if(nLive !== live){ live = nLive; root.classList.toggle("portal-live", live); }

			var nPass = p > .30 && p < .995;
			if(nPass !== pass){ pass = nPass; root.classList.toggle("portal-pass", pass); }

			var nLate = p > .90;
			if(nLate !== late){ late = nLate; root.classList.toggle("portal-late", late); }

			/* The hand-over, set just before the landing act rather than with it.
			   The page is put into the paint one flip early so that when `land`
			   starts raising its opacity there is already something there to
			   raise; making an element visible and animating it in the same frame
			   reads as a step rather than a fade. .858 against a landing that
			   starts at .86 is about two frames of scroll at a normal pace. */
			var nHand = p > .858;
			if(nHand !== hand){ hand = nHand; root.classList.toggle("portal-hand", hand); }

			/* One way only. `portal-done` is what releases the thread down the side
			   of the page, and a thread that appeared and vanished every time the
			   visitor scrolled back up to look at the mark again would be a light
			   switch, not a line. */
			if(!done && p > .97){
				done = true;
				root.classList.add("portal-done");
			}
		});

		/* ---- the way out --------------------------------------------------
		   Jumps to the far end of the track. `scroll-behavior:smooth` is already
		   declared on <html>, so this is a travel and not a cut — and because the
		   scene is scroll-linked, the whole thing plays at speed on the way there
		   rather than being skipped over black. */
		if(skip){
			skip.addEventListener("click", function(){
				var top = track.getBoundingClientRect().top + (window.pageYOffset || 0);
				window.scrollTo({ top: Math.round(top + span + 2), behavior: "smooth" });
			});
		}

		/* A page restored mid-scene — a reload, or a back button — has to arrive
		   with the scene already in the right frame rather than at act one. The
		   shared scroll pass runs its subscribers once on subscribe, which covers
		   the normal case; this covers the browser restoring a position after that. */
		window.addEventListener("load", function(){
			measure();
			Aura._flush();
		}, { once: true });
	}

	Aura.register("portal", init);
})(window.Aura);
