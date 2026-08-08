/* The thread: the site as one line
   ---------------------------------------------------------------------------
   A fixed rail in the left gutter whose full height stands for the whole
   document. Three things are drawn on it and all three are the same curve:

     bed    the document, at rest
     lit    the part of it that is behind the visitor
     bead   where the visitor is, and the notches for the sections

   HOW IT IS DRAWN. The curve is rebuilt in real pixels every frame rather than
   scaled from a fixed viewBox, because a viewBox stretched to the window's
   height would stretch the wave with it — the line would be a gentle ripple on
   a laptop and a corrugation on a tall monitor. Sampling every 14px and joining
   the samples with midpoint quadratics is the same trick the seams and the
   background field use: one path command per sample, no tangents, and a curve
   that never kinks.

   The lit part is not a dash offset. It is a second path built out of the same
   samples up to the visitor's position, which costs nothing extra and avoids
   asking the engine for `getTotalLength()` on a path that changes every frame.

   WHAT IT COSTS. 30fps, one subscriber on the shared scroll pass, and roughly
   sixty samples — and the loop does not start at all at the widths where the
   rail is not drawn, or while the tab is in the background.

   CALM. Under a reduced-motion request, or on a machine that has already told
   us it is struggling, the wave stops travelling. The line still tracks the
   scroll, because that is information and not motion — it moves exactly as much
   as the page the visitor is dragging. */
(function (Aura) {
	"use strict";

	var NS = "http://www.w3.org/2000/svg";
	/* The sections the notches stand for, in document order. */
	var IDS = ["comp", "srv", "proc", "work", "cta"];
	/* The notches are also the way back. Each one is a real link with a real
	   name — the same name the header's nav uses, so the two never disagree
	   about what a section is called. */
	var NAMES = {
		comp: "Компетенции",
		srv:  "Услуги",
		proc: "Процесс",
		work: "Проекты",
		cta:  "Контакты"
	};

	function clamp(v, a, b){ return v < a ? a : (v > b ? b : v); }

	function init(){
		var wrap = Aura.$("#thread");
		if(!wrap) return;

		var svg   = Aura.$(".thread__svg", wrap),
		    bed   = Aura.$(".thread__bed", wrap),
		    lit   = Aura.$(".thread__lit", wrap),
		    bead  = Aura.$(".thread__bead", wrap),
		    group = Aura.$(".thread__marks", wrap);
		if(!svg || !bed || !lit || !bead || !group) return;

		var CALM = !!(Aura.RM || Aura.LOW);
		var W = 0, H = 0, N = 0, STEP = 14;
		var t = 0, last = 0, raf = 0;
		var prog = 0, progT = 0, marks = [], atEnd = false;

		/* Is there a rail on screen at this width at all? The stylesheet, not this
		   file, decides — asking the element for its width is the only way to read
		   that decision without keeping a second copy of the breakpoint here. */
		function drawn(){ return wrap.offsetWidth > 0 && wrap.offsetHeight > 0; }

		/* ---- geometry -------------------------------------------------------
		   The rail's own box, and where each section falls along it. A section's
		   position is taken against the reading line a third of the way down the
		   viewport — the same line the header's nav spy uses — so a notch lights
		   at the moment its section becomes the thing being read, and the two
		   indicators can never disagree with each other. */
		function build(){
			if(!drawn()) return;
			var r = wrap.getBoundingClientRect();
			W = Math.max(16, Math.round(r.width));
			H = Math.max(120, Math.round(r.height));
			N = Math.ceil(H / STEP) + 1;
			svg.setAttribute("viewBox", "0 0 " + W + " " + H);

			var doc = document.documentElement;
			var span = Math.max(1, doc.scrollHeight - window.innerHeight);
			var y0 = window.pageYOffset || doc.scrollTop || 0;

			group.textContent = "";
			marks = [];
			for(var i = 0; i < IDS.length; i++){
				var el = document.getElementById(IDS[i]);
				if(!el) continue;
				var top = el.getBoundingClientRect().top + y0 - window.innerHeight * .34;

				/* An anchor, not a circle with a click handler: it is a link to a
				   place in the document, so it should be one — focusable, openable
				   in a new tab, and readable to a screen reader as "Services"
				   rather than as an unlabelled dot. The visible mark stays 2.4px
				   because it is an instrument reading; the invisible circle over it
				   is 13px because a 2.4px click target is a joke. */
				var a = document.createElementNS(NS, "a");
				a.setAttribute("class", "thread__jump");
				a.setAttribute("href", "#" + IDS[i]);
				a.setAttribute("aria-label", NAMES[IDS[i]] || IDS[i]);

				var ttl = document.createElementNS(NS, "title");
				ttl.textContent = NAMES[IDS[i]] || IDS[i];

				var hit = document.createElementNS(NS, "circle");
				hit.setAttribute("class", "thread__hit");
				hit.setAttribute("r", "13");

				var c = document.createElementNS(NS, "circle");
				c.setAttribute("class", "thread__mark");
				c.setAttribute("r", "2.4");

				/* The name is drawn to the left of the rail, outside the rail's own
				   box — the svg is overflow:visible for exactly this — and only
				   while the notch is hovered or focused. */
				var lab = document.createElementNS(NS, "text");
				lab.setAttribute("class", "thread__label");
				lab.setAttribute("text-anchor", "end");
				lab.textContent = NAMES[IDS[i]] || IDS[i];

				a.appendChild(ttl); a.appendChild(hit); a.appendChild(c); a.appendChild(lab);
				group.appendChild(a);
				marks.push({ el: c, hit: hit, lab: lab, f: clamp(top / span, 0, 1), on: false });
			}
		}

		/* The curve. One long wavelength so the line reads as a drift rather than
		   a zigzag, and an amplitude capped against the gutter's own width so it
		   can never lean out over the text. */
		/* The line is the mark's wave, not a wire with a wobble on it. The first
		   term is the wave itself — short enough that a screen's worth of rail
		   holds four or five crests, so it reads as the logo's rhythm rather than
		   as drift — and the second is a long swell under it that keeps the
		   crests from repeating identically down the page. Amplitude is capped
		   against the channel's own width so it can never touch the content. */
		function xAt(y){
			var amp = Math.min(13, W * .30);
			return W * .5 + Math.sin(y / 74 + t * .5) * amp
			             + Math.sin(y / 196 - t * .28) * amp * .5;
		}

		function paint(){
			var headY = prog * H;
			var dBed = "", dLit = "";
			var px = xAt(0), py = 0, i, y, x, mx, my;

			dBed = "M" + px.toFixed(2) + " 0";
			dLit = dBed;
			var litOpen = headY > 2;

			for(i = 1; i < N; i++){
				y = i * STEP;
				if(y > H) y = H;
				x = xAt(y);
				/* Midpoint quadratic: the control point is the sample, the end point
				   is halfway to the next one. */
				mx = (px + x) / 2; my = (py + y) / 2;
				var cmd = "Q" + px.toFixed(2) + " " + py.toFixed(1) +
				          " " + mx.toFixed(2) + " " + my.toFixed(1);
				dBed += cmd;
				if(litOpen && my <= headY) dLit += cmd;
				px = x; py = y;
				if(y >= H) break;
			}
			dBed += "L" + px.toFixed(2) + " " + py.toFixed(1);
			if(litOpen) dLit += "L" + xAt(headY).toFixed(2) + " " + headY.toFixed(1);

			bed.setAttribute("d", dBed);
			lit.setAttribute("d", litOpen ? dLit : "");

			bead.setAttribute("cx", xAt(headY).toFixed(2));
			bead.setAttribute("cy", headY.toFixed(1));
			/* The bead grows a little as the page is consumed — barely readable as
			   size, quite readable as weight. */
			bead.setAttribute("r", (3.4 + prog * 1.1).toFixed(2));

			for(i = 0; i < marks.length; i++){
				var m = marks[i], my2 = m.f * H, mx2 = xAt(my2);
				m.el.setAttribute("cx", mx2.toFixed(2));
				m.el.setAttribute("cy", my2.toFixed(1));
				m.hit.setAttribute("cx", mx2.toFixed(2));
				m.hit.setAttribute("cy", my2.toFixed(1));
				m.lab.setAttribute("x", (mx2 - 16).toFixed(2));
				m.lab.setAttribute("y", (my2 + 3.4).toFixed(1));
				var on = progT >= m.f - .002;
				if(on !== m.on){ m.on = on; m.el.classList.toggle("on", on); }
			}

			var end = progT > .985;
			if(end !== atEnd){
				atEnd = end;
				document.documentElement.classList.toggle("thread-end", end);
			}
		}

		function frame(now){
			raf = requestAnimationFrame(frame);
			if(document.hidden) return;
			if(!drawn()) return;
			Aura.beat(now);
			/* Desktop keeps the 30fps this has always run at - it is one short
			   path and it was never the bottleneck. The phone follows the shared
			   budget so it moves in step with the seams beside it. */
			if(now - last < (Aura.MOBILE ? Aura.frameMs : 33)) return;
			var dt = last ? Math.min(.05, (now - last) / 1000) : .016;
			last = now;
			if(!CALM) t += dt;
			/* The bead is eased toward the scroll rather than pinned to it: a
			   trackpad delivers position in steps, and a light that steps looks
			   like it is being redrawn. A tenth of a second of lag is invisible as
			   delay and visible as smoothness. */
			prog += (progT - prog) * (CALM ? 1 : .2);
			paint();
		}

		Aura.onScroll(function(y){
			var doc = document.documentElement;
			var span = Math.max(1, doc.scrollHeight - window.innerHeight);
			progT = clamp(y / span, 0, 1);
		});

		/* Delegated, because the notches are rebuilt whenever the document
		   changes height. The default jump is replaced with a smooth one and an
		   offset for the header, so a section never arrives underneath the bar —
		   except under reduced motion, where an instant jump is the point. */
		group.addEventListener("click", function(ev){
			var node = ev.target, a = null;
			while(node && node !== group){
				if(node.tagName && node.tagName.toLowerCase() === "a"){ a = node; break; }
				node = node.parentNode;
			}
			if(!a) return;
			var href = a.getAttribute("href") || "";
			if(href.charAt(0) !== "#") return;
			var target = document.getElementById(href.slice(1));
			if(!target) return;
			ev.preventDefault();
			var y = target.getBoundingClientRect().top +
			        (window.pageYOffset || document.documentElement.scrollTop || 0) - 92;
			window.scrollTo({ top: y < 0 ? 0 : y, behavior: CALM ? "auto" : "smooth" });
		});

		Aura.onResize(function(){ build(); });
		/* The portfolio grid and the footer settle after the first paint, and the
		   notches are positions in a document whose height changes when they do. */
		window.addEventListener("load", function(){ build(); }, { once: true });

		build();
		raf = requestAnimationFrame(frame);
	}

	Aura.register("thread", init);
})(window.Aura);
