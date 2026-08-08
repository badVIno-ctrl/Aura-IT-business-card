/* Entry scene and section choreography
   ---------------------------------------------------------------------------
   This module replaces two older ones. `reveal.js` faded everything on the page
   up by 22 pixels with a delay that cycled every fourth element, and `title.js`
   split the hero headline into words and opened them out from under a mask.
   The first was uniform to the point of being invisible; the second was the one
   good gesture on the page and it was spent on a single element.

   What happens instead:

   1. Two inline scripts in the document arm and start the scene: one paints a
      near-black plate before anything else renders, the second starts the clock
      the moment the mark exists. The drawing therefore belongs to the document
      and not to this file — a blocking webfont can no longer hold a black
      screen while the module waits for DOMContentLoaded.
   2. The stylesheet draws the mark, runs a light along it and releases the
      aura. The aura is what brings the page in: the headline, the lead, the
      actions and the hero canvas all key off it.
   3. Everything below the fold is then orchestrated per section, one character
      each, from the map in SCENES.

   So the timeline lives in CSS (base/enter.css) and this file owns only what
   CSS cannot express: where the mark goes when it leaves, when the headline may
   be measured — which depends on the webfonts — and when the overlay has
   finished and may leave the DOM. */
(function (Aura) {
	"use strict";

	var root = document.documentElement;

	/* Which section gets which character, in the order the eye meets them.
	   `to` is a selector resolved inside the section, `in` is the character,
	   `step` is the stagger between matches and `base` shifts the whole group
	   later so groups inside one section do not all start together.

	   The hero is marked `lead: true` — its elements are not observed, they are
	   released by the wave at a fixed point in the scene. */
	var SCENES = [
		{ at:"#hero", lead:true, groups:[
			{ to:"#h1",                 in:"head" },
			{ to:".hero__lead",         in:"text", base:210 },
			{ to:".hero__cta .btn",   in:"btn",  base:340, step:80 }
		]},
		{ at:"#comp", groups:[
			{ to:"h2",                  in:"head" },
			{ to:".comp__lead",         in:"text", base:170 },
			{ to:".clist li",           in:"text", base:280, step:55 },
			{ to:".term",               in:"sheen", base:120 }
		]},
		{ at:"#srv", groups:[
			{ to:".sec-head h2",        in:"head" },
			{ to:".sec-head p",         in:"text", base:200 },
			{ to:".card:not(.card--q)", in:"lift", step:85 },
			{ to:".card--q",            in:"sheen", base:190 }
		]},
		{ at:"#proc", groups:[
			{ to:".sec-head h2",        in:"head" },
			{ to:".sec-head p",         in:"text", base:190 },
			{ to:".pstep",              in:"step", base:90, step:70 }
		]},
		{ at:"#work", groups:[
			{ to:".sec-head h2",        in:"head" },
			{ to:".proj",               in:"lift", step:70 },
			{ to:".proj__vis",          in:"clip", base:190, step:70 },
			{ to:".note",               in:"text", base:140 }
		]},
		{ at:"#cta", groups:[
			{ to:"h2",                  in:"head" },
			{ to:".lead",               in:"text", base:180 },
			{ to:".form",               in:"lift", base:140 },
			{ to:".tg",                 in:"lift", base:300 },
			{ to:".contacts",           in:"text", base:400 },
			/* Last, and wiped open left to right: it is a path the light will
			   travel, so it arrives the way the light will. */
			{ to:".cta__sig",           in:"clip", base:480 }
		]}
	];

	/* How long each character takes to finish, measured from its own delay.
	   Used only to decide when the attribute may be dropped again — see cue().
	   A heading is the outlier because its lines are staggered internally. */
	var LIFE = { head:1700, text:1050, lift:1000, clip:1180, sheen:1620, step:900, btn:820 };

	/* Reads a duration token off <html>. Keeping the clock in the stylesheet and
	   pulling it from there means the phone profile is a block of CSS overrides
	   and never a second copy of the same numbers in JavaScript. */
	function beat(name, fallback){
		var raw = getComputedStyle(root).getPropertyValue(name).trim();
		var n = parseFloat(raw);
		if(!isFinite(n)) return fallback;
		return raw.indexOf("ms") > -1 ? n : n * 1000;
	}

	/* ---- where the mark goes when it leaves --------------------------------
	   The overlay mark and the hero canvas draw the same three waves, so the
	   scene ends by moving one onto the other: the plate's mark travels to the
	   exact place the canvas aura is about to appear and dissolves into it.

	   The geometry is read off the canvas box with the same formula the canvas
	   uses itself (size() in hero-aura.js), which is why this cannot drift out
	   of agreement with it at some viewport nobody tested. If the canvas is
	   missing or has not been laid out, the tokens keep their CSS defaults and
	   the mark simply grows in place. */
	function aim(){
		var canvas = document.getElementById("ring");
		var mark = document.querySelector(".enter__mark");
		if(!canvas || !mark) return;

		var cr = canvas.getBoundingClientRect();
		var mr = mark.getBoundingClientRect();
		if(!cr.width || !cr.height || !mr.width) return;

		var narrow = cr.width < 1080;
		var R  = narrow ? Math.min(cr.width * .27, 132)
		                : Math.min(cr.width * .235, cr.height * .34);
		var cx = cr.left + (narrow ? cr.width * .5 : cr.width * .735);
		var cy = cr.top  + (narrow ? Math.min(198, cr.height * .245) : cr.height * .5);

		/* The waves occupy the middle half of the glyph's box, so matching their
		   width — not the box's — is what makes the two read as one object. */
		var sc = (R * 1.92) / mr.width;
		sc = sc < .85 ? .85 : (sc > 1.5 ? 1.5 : sc);

		root.style.setProperty("--en-dx", Math.round(cx - (mr.left + mr.width / 2)) + "px");
		root.style.setProperty("--en-dy", Math.round(cy - (mr.top + mr.height / 2)) + "px");
		root.style.setProperty("--en-sc", sc.toFixed(3));
	}

	/* ---- heading splitter -------------------------------------------------
	   Wrap every word, ask the layout engine which visual line each one landed
	   on, then rebuild the heading as one block per line with a slider inside.
	   The block is the mask; the slider is what moves.

	   Three details matter. An element child is atomic: splitting inside .grad
	   would give every word its own background-clip box and the gradient would
	   restart at each one. <br> is left in place for the measuring pass, because
	   it is part of what decides where the lines fall, then dropped — the rebuilt
	   blocks carry the break themselves. And the whitespace between a text node
	   and an inline child has to survive the wrapping pass: drop it and the
	   headline is measured a couple of spaces narrower than it will be drawn,
	   which is enough to move a wrap point and leave a line holding one word. */
	function split(el){
		if(el.getAttribute("data-split")) return;

		/* Deliberately not \s: that class includes U+00A0, and a non-breaking
		   space is a word joiner. Left inside its token, it keeps doing its job. */
		var GAP = /^[ \t\n\r\f]+$/;
		var words = [], kids = Array.prototype.slice.call(el.childNodes), i;
		for(i = 0; i < kids.length; i++){
			var node = kids[i];
			if(node.nodeType === 3){
				var parts = node.nodeValue.split(/([ \t\n\r\f]+)/);
				var frag = document.createDocumentFragment();
				for(var p = 0; p < parts.length; p++){
					if(!parts[p]) continue;
					if(GAP.test(parts[p])){ frag.appendChild(document.createTextNode(" ")); continue; }
					var w = document.createElement("span");
					w.textContent = parts[p];
					frag.appendChild(w);
					words.push(w);
				}
				el.replaceChild(frag, node);
			} else if(node.nodeType === 1 && node.tagName !== "BR"){
				words.push(node);
			}
		}
		if(!words.length) return;

		/* Group by the top of each word's box. The tolerance absorbs the couple
		   of pixels a differently styled inline child can sit off by. */
		var lines = [], line = null, top = null;
		for(i = 0; i < words.length; i++){
			var y = words[i].getBoundingClientRect().top;
			if(line === null || Math.abs(y - top) > 3){ line = []; lines.push(line); top = y; }
			line.push(words[i]);
		}

		var out = document.createDocumentFragment();
		for(i = 0; i < lines.length; i++){
			var mask = document.createElement("span");
			mask.className = "ln";
			mask.style.setProperty("--i", i + "");
			var slide = document.createElement("span");
			slide.className = "ln__i";
			for(var j = 0; j < lines[i].length; j++){
				if(j) slide.appendChild(document.createTextNode(" "));
				slide.appendChild(lines[i][j]);
			}
			mask.appendChild(slide);
			out.appendChild(mask);
		}
		/* The words are already detached into the fragment above, so this only
		   clears what is left: whitespace nodes and the measured <br>. */
		el.textContent = "";
		el.appendChild(out);
		el.setAttribute("data-split", "1");
	}

	/* ---- one element's part in the composition --------------------------- */
	function cast(el, kind, delay){
		if(kind === "head") split(el);
		el.setAttribute("data-in", kind);
		if(delay) el.style.setProperty("--b", delay + "ms");
		/* Stashed on the node so cue() does not have to re-derive it. */
		el._enLife = delay + (LIFE[kind] || 1200);
	}

	/* Let it arrive, then get out of the way. The hidden state, the transition
	   and the sheen's pseudo-element all hang off [data-in]; dropping the
	   attribute once the element has landed hands its hover transitions and its
	   clipping back to the section stylesheet that owns them, and means a
	   heading that reflows later is a plain heading again. */
	function cue(el){
		if(el._enCued) return;
		el._enCued = 1;
		el.classList.add("in");
		setTimeout(function(){
			el.removeAttribute("data-in");
			el.classList.remove("in");
			el.style.removeProperty("--b");
		}, el._enLife);
	}

	function initEnter(){
		/* Reduced motion is handled by never arming the page: the plate is not
		   painted, no character is assigned, and the content is already at rest.
		   There is nothing here to shorten. The same branch covers a page whose
		   watchdog has already fired. */
		if(Aura.RM || !root.classList.contains("enter-armed")) return;

		var overlay = document.getElementById("enter");

		/* The stylesheet's clock started when the inline script added
		   `enter-run`, which is the frame the plate and the mark were parsed.
		   Reading that timestamp rather than starting a second one here is what
		   keeps the hand-off in step: this module may run anywhere from a few
		   milliseconds to a few seconds later, depending on how long the
		   webfont stylesheet held DOMContentLoaded, and every wait below is
		   measured from the scene, not from the module. */
		var clock = window.__auraEnterAt || Date.now();

		aim();

		/* ---- assign the parts ---- */
		var lead = [], rest = [];
		function build(){
			for(var s = 0; s < SCENES.length; s++){
				var section = document.querySelector(SCENES[s].at);
				if(!section) continue;
				var groups = SCENES[s].groups;
				for(var g = 0; g < groups.length; g++){
					var part = groups[g];
					var found = section.querySelectorAll(part.to);
					for(var i = 0; i < found.length; i++){
						cast(found[i], part.in, (part.base || 0) + i * (part.step || 0));
						(SCENES[s].lead ? lead : rest).push(found[i]);
					}
				}
			}
		}

		/* ---- what brings a section in -------------------------------------
		   Deliberately not an IntersectionObserver. Two of the characters here
		   hide their element by collapsing a clip-path — `inset(0 0 102% 0)` for
		   the copy, `inset(0 100% 0 0)` for a project preview — and the
		   intersection rectangle an observer reports is the target's box *after*
		   its own clip is applied. A clipped element therefore has an
		   intersection ratio of exactly zero however far down the page you
		   scroll, so it is never granted its entrance and never becomes
		   visible. Measured: every paragraph, every list item and all six
		   project previews stayed at opacity 0 for the life of the page.

		   getBoundingClientRect() reports the unclipped border box, and the page
		   already has one rAF-batched scroll bus for exactly this kind of work.
		   The list only ever shrinks, and once it is empty the subscriber costs
		   a length check per tick. */
		var waiting = [];
		function sweep(){
			if(!waiting.length) return;
			var edge = (window.innerHeight || 800) * .94, keep = [], i;
			for(i = 0; i < waiting.length; i++){
				var el = waiting[i];
				/* Deliberately only the top edge. Requiring the element to still
				   be on screen — bottom > 0 — meant that throwing the page to the
				   footer left everything it flew past in its hidden state, and
				   those elements only came back on the way up. Anything the page
				   has already travelled past is released along with what is
				   visible now: the entrance is missed either way, and the content
				   must never be. */
				if(el.getBoundingClientRect().top < edge) cue(el);
				else keep.push(el);
			}
			waiting = keep;
		}
		function watch(){
			waiting = rest;
			/* Subscribing runs the sweep once, which covers whatever is already
			   on screen — a short viewport, or a landing on an anchor. The resize
			   case is covered too: aura.js flushes the scroll bus at the end of
			   every debounced resize. */
			Aura.onScroll(sweep);
		}

		/* If the page was opened on an anchor, land on it once the document is
		   real: the webfonts and the split headings both settle during the scene,
		   and the browser's own jump happened before either. A project deep link
		   needs nothing — portfolio.js has already opened the modal behind the
		   plate, and the plate lifting is what reveals it. */
		function anchor(){
			var h = location.hash;
			if(!h || h.length < 2 || h.indexOf("#project/") === 0) return;
			var target = document.getElementById(h.slice(1));
			if(!target) return;
			try { target.scrollIntoView({ behavior:"instant", block:"start" }); }
			catch (e) { target.scrollIntoView(true); }
		}

		function finish(){
			root.classList.add("enter-done");
			if(overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
			anchor();
		}

		/* ---- the one thing the stylesheet cannot time ----------------------
		   Line boxes measured against a fallback font are line boxes for the
		   wrong font. document.fonts.ready is the honest signal, capped so a
		   stalled font file cannot hold the scene open: by then the plate is
		   still opaque and the mark is still drawing, so the wait is invisible. */
		var began = false;
		function begin(){
			if(began) return;
			began = true;
			build();

			/* ---- the honest profile ---------------------------------------
			   Aura.LOW is decided from navigator.hardwareConcurrency and
			   navigator.deviceMemory. On iOS neither exists: both fall back to
			   8, so every iPhone ever made reports itself as a workstation and
			   takes the rich path - including the ones this whole tier was
			   written for. The only trustworthy measure of how fast a device is
			   is how fast it is going, right now, with this scene on it.

			   Six deltas, counted from the third frame so that layout and first
			   paint are not held against the device, and the median of those - a
			   median and not a mean, because one long frame during boot is
			   normal and should not by itself condemn a machine.

			   Past 40ms - under 25fps with the scene already running - the page
			   is demoted for the rest of the session. The timing matters as much
			   as the test: main.js now holds the five canvas modules back until
			   the scene ends, and every one of them reads LOW as it initialises,
			   so a verdict reached here still arrives before they start. It is
			   a demotion only: a device is never promoted out of a tier it was
			   honestly placed in. */
			var fr = [], prev = 0, seen = 0;
			requestAnimationFrame(function probe(ts){
				seen++;
				if(seen > 2 && prev) fr.push(ts - prev);
				prev = ts;
				if(fr.length < 6 && seen < 12){ requestAnimationFrame(probe); return; }
				if(fr.length < 3) return;
				fr.sort(function(a, b){ return a - b; });
				if(fr[fr.length >> 1] <= 40) return;
				Aura.LOW = true;
				Aura.frameMs = 33;
				root.classList.add("is-low");
			});

			var content = beat("--en-content", 900);
			var end = beat("--en-end", 1520);
			var spent = Date.now() - clock;
			var wait = Math.max(0, content - spent);

			setTimeout(function(){
				for(var i = 0; i < lead.length; i++) cue(lead[i]);
				/* The observer is armed with the wave rather than at boot, so a
				   section that is already in view — a hash landing — animates as
				   the plate lifts instead of behind it. */
				watch();
			}, wait);

			/* The plate never leaves before the copy it is covering has started
			   to arrive, however late the fonts were. */
			setTimeout(finish, Math.max(end - spent, wait + 240));
		}

		if(document.fonts && document.fonts.ready && document.fonts.ready.then){
			document.fonts.ready.then(begin);
			setTimeout(begin, 900);
		} else {
			begin();
		}
	}

	Aura.register("enter", initEnter);
})(window.Aura);
