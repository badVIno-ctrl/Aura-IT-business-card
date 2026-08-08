/* The small waves — the signature under the footer wordmark, and the curve the
   contact form lights up.
   ---------------------------------------------------------------------------
   The seams between sections are living water (see waves.js). These two were
   not: they were fixed cubics in the markup, so the page ended on a drawing of
   a wave sitting under five moving ones. Same brand stroke, same idea, one of
   them frozen — which is the single detail that gives a hand-built page away.

   THE SHAPE IS THE AUTHORED ONE. This is the part that has to be got exactly
   right, because these two curves are drawn at a size where the eye reads the
   shape and not the movement. Each figure below states the wavelength and the
   depth of the cubic it replaces, measured off the `d` in the markup:

     footer   M0 5 c8.4-4.6 16.9-4.6 25 0 ... → crest every 50 units, and a
              cubic with a control arm of 4.6 peaks at 3/4 of it, so depth 3.45
     contact  M0 60 c101.25-54 202.5-54 300 0 ... → crest every 300 units,
              depth 40.5

   Get the wavelength wrong and the figure is not the same drawing any more: at
   half the wavelength the contact wave grows from two calm crests into four
   narrow ones, which is a graph, not a signature. The harmonics are kept faint
   here for the same reason — at this scale a second voice of any real weight
   puts a shoulder on every crest and the line stops reading as water.

   THE MOVEMENT. Identical in kind to a seam: the curve travels, and a slow
   lateral drift is added to the position each sine is sampled at, so the whole
   surface leans one way, holds, and comes back. Rocking, not scrolling.

   WHAT IT TOUCHES. Only the `d` of paths already in the document, in their own
   viewBox units. Strokes, gradients, dash patterns and `<use>` references stay
   as authored — the contact wave's four strokes are `<use href="#cwP">`, so
   rewriting that one path moves bed, halo, light and head together, and
   `pathLength="100"` keeps the form's fill fraction meaning the same thing.

   WHAT IT COSTS. Two paths, ~80 samples each, only while on screen, at 30fps
   on a phone. The loop stops dead when neither figure is visible. */
(function (Aura) {
	"use strict";

	function init(){
		if(!Aura) return;

		/* A reduced-motion request calms these rather than freezing them, for the
		   same reason as the seams: a still wave under five moving ones is a bug,
		   and this one is the last thing on the page. */
		var CALM = Aura.RM ? .5 : 1;
		var RATE = Aura.RM ? .55 : 1;
		/* Fewer samples on a phone. The curves are 300px and ~560px wide there, so
		   a coarser step is still far below one sample per rendered pixel. */
		var COARSE = Aura.MOBILE ? 1.8 : 1;

		var figures = [
			{
				/* The signature under the footer wordmark. Shallow on purpose: it is
				   a rule made of water, and a rule that heaves is a chart. */
				sel: ".foot__wave path",
				w: 100, mid: 5, amp: 3, step: 1.25,
				len1: 50, len2: 25, h2: .07,
				speed: .5, sway: 9, guard: 3.8
			},
			{
				/* The curve the enquiry lights up: two long crests, the last full
				   gesture before the footer. */
				sel: "#cwP",
				w: 600, mid: 60, amp: 40, step: 7.5,
				len1: 300, len2: 150, h2: .09,
				speed: .42, sway: 58, guard: 52
			}
		];

		var items = [];
		figures.forEach(function(f, i){
			var el = Aura.$(f.sel);
			if(!el) return;
			/* A <path> inside <defs> has no box of its own, so the visibility test
			   runs on the <svg> that draws it. */
			var host = el.closest ? el.closest("svg") : null;
			var box = (host && host.parentNode) || host || el;
			items.push({ el: el, f: f, box: box, ph: i * 2.3, vis: !window.IntersectionObserver });
		});
		if(!items.length) return;

		var TAU = 6.2831853;

		function shape(it, t){
			var f = it.f, ph = it.ph;
			var amp = f.amp * (1 + Math.sin(t * .4 + ph) * .12) * CALM;
			var drift = (Math.sin(t * .26 + ph * .8) + Math.sin(t * .142 + ph * .35) * .5)
			          * f.sway * CALM;
			var step = f.step * COARSE;
			var n = Math.ceil(f.w / step) + 1;
			var xs = new Array(n), ys = new Array(n), i;
			for(i = 0; i < n; i++){
				var x = Math.min(i * step, f.w);
				var s = x + drift;
				var y = f.mid
					+ Math.sin(s / f.len1 * TAU + t * f.speed * 1.5 + ph) * amp
					+ Math.sin(s / f.len2 * TAU - t * f.speed * 2.1 + ph * 1.6) * amp * f.h2;
				/* The stroke has width and the box does not grow, so the curve is
				   held inside the room it was given rather than clipping itself. */
				if(y < f.mid - f.guard) y = f.mid - f.guard;
				if(y > f.mid + f.guard) y = f.mid + f.guard;
				xs[i] = x; ys[i] = y;
			}
			/* Midpoint quadratics — the joining the seams use, so every wave on the
			   page is the same kind of smooth. */
			var d = "M" + xs[0].toFixed(2) + " " + ys[0].toFixed(2);
			for(i = 1; i < n - 1; i++){
				d += "Q" + xs[i].toFixed(2) + " " + ys[i].toFixed(2) + " "
				   + ((xs[i] + xs[i + 1]) / 2).toFixed(2) + " "
				   + ((ys[i] + ys[i + 1]) / 2).toFixed(2);
			}
			d += "L" + xs[n - 1].toFixed(2) + " " + ys[n - 1].toFixed(2);
			return d;
		}

		function paint(it, t){ it.el.setAttribute("d", shape(it, t)); }

		if(window.IntersectionObserver){
			var io = new IntersectionObserver(function(entries){
				entries.forEach(function(en){
					for(var i = 0; i < items.length; i++){
						if(items[i].box === en.target) items[i].vis = en.isIntersecting;
					}
				});
				kick();
			}, { rootMargin: "160px 0px" });
			items.forEach(function(it){ io.observe(it.box); });
		}

		var t = 0, last = 0, running = false;
		/* Desktop keeps its 16ms; the phone follows the shared budget. */
		var DESK_MS = 16;

		function frame(now){
			var any = false, i;
			for(i = 0; i < items.length; i++) if(items[i].vis){ any = true; break; }
			if(!any || document.hidden){ running = false; return; }
			requestAnimationFrame(frame);
			Aura.beat(now);
			if(now - last < (Aura.MOBILE ? Aura.frameMs : DESK_MS)) return;
			var dt = last ? Math.min(.05, (now - last) / 1000) : .016;
			last = now;
			t += dt * RATE;
			for(i = 0; i < items.length; i++) if(items[i].vis) paint(items[i], t);
		}

		function kick(){
			if(running) return;
			running = true; last = 0;
			requestAnimationFrame(frame);
		}

		/* Painted once up front so the figures are this module's curve from the
		   first frame rather than jumping off the authored one when the loop
		   starts. */
		items.forEach(function(it){ paint(it, 0); });
		kick();
		document.addEventListener("visibilitychange", function(){ if(!document.hidden) kick(); });
	}

	Aura.register("ripples", init);
})(window.Aura);
