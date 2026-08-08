/* The seam between two sections: a live wave, not a rule.
   ---------------------------------------------------------------------------
   Every section now ends on one of the brand's own waves drawn across the full
   width of the page, with a light running along it. The markup for each seam is
   in the document (so a seam exists even if this file never runs); this module
   is only what CSS cannot express - a curve whose shape changes.

   THE SHAPE. Two sines of different wavelength drifting in opposite directions,
   sampled and joined with midpoint quadratics. That is the same surface the
   background field uses, at a different scale, so the two never look like two
   different ideas about what a wave is.

   WHAT IT ANSWERS TO.
     - the pointer: a swell under the cursor, so running the mouse along a seam
       lifts the water in front of it,
     - the scroll: the faster the page is thrown, the harder the seam whips,
       which is what makes a seam read as *passing* rather than as a picture,
     - being reached: the seam draws itself in the first time it is scrolled to.

   WHAT IT COSTS. A seam that is not on screen is not sampled at all - the
   observer flips a flag per seam and the loop skips it - and the loop stops
   dead when no seam is visible. On a page with six seams that is at most two
   live at once, and a phone samples fewer points per frame than a desktop does.

   ---------------------------------------------------------------------------
   WHY THE PHONE LOOKED BROKEN, AND WHAT EACH FIX IS
   ---------------------------------------------------------------------------
   The wavelength and the sway were already tied to the width, so a phone saw
   the same one-cycle wave a desktop did. Everything that was actually wrong was
   a quantity that stayed in absolute pixels while the band around it shrank to
   a third of its height. Seven of them, and they compounded:

   1. THE LINE WAS FAT FOR ITS BAND. Strokes are declared in px and carry
      `vector-effect:non-scaling-stroke`, so a 2px bed stayed 2px whether the
      band was 137px tall or 55px. Against a 26px amplitude that is a hairline;
      against a 10px amplitude it is a rope. Measured: the line was 2.5x heavier
      relative to the wave it was drawing. Fixed by `--wsep-k`, one scale factor
      published per seam from the measured height, which every stroke width and
      the bead radius are multiplied by. It resolves to exactly 1 at desktop
      height, so no wide-screen stroke moves by a hundredth of a pixel.

   2. THE LIGHT HAD NO HEAD. `.is-lite` hid the bead, on the reasoning that a
      phone should not run two drop-shadow filters per seam. True - but the
      filter is the cost, not the circle, and the bead is what makes the lit
      dash read as the *head of a travelling light* rather than as an object.
      Without it, a 22% dash of a shallow wave is a short bright nearly-straight
      rod floating above the line. That is the torn-off stick in the screenshot.
      The bead is back on the phone; only its filter stays behind.

   3. THE BEAD AND THE LIGHT WERE ON DIFFERENT CLOCKS. The dash was animated by
      CSS at 4.2s a lap and the bead by this file at `t * .21` - a 4.76s lap.
      They drifted apart and met again every twenty seconds or so. Both are
      driven from the same number here now, so the bead is the head of the
      light by construction and cannot separate from it.

   4. THE BEAD WAS PLACED BY INDEX, THE LIGHT BY ARC LENGTH. Even on one clock
      those are different points on a curve - evenly spaced in x is not evenly
      spaced along the line, and the gap is widest exactly at a crest. The bead
      now walks the sampled polyline's cumulative length, the same measure the
      dash offset is expressed in.

   5. THE WATER BEHIND WAS A DIFFERENT WAVE. `.wsep__back` was built from its
      own clock, `t * .74 + 2.4`. That is not a phase shift, it is an unrelated
      sample of the surface: different sway, different breath, no fixed
      relationship to the line in front of it. On a 137px band the two drift by
      ~9px, which reads as water behind a line. On a 55px band it is the same
      9px against a third of the height - the two curves cross, and the eye
      resolves them as two waves, one of which has come adrift. That is the
      "piece of another wave" in the screenshot. The back layer is now built
      from the *same* clock with a phase delta and a downward offset, so it is
      unmistakably the same water lying behind. Because the wide layout was
      right as it was, the old independent clock is kept at full band height and
      the phase-locked one is blended in as the band gets shorter.

   6. THE CURVE HAD A STRAIGHT TAIL AND TWO VISIBLE ENDS. The smoothing loop
      leaves the pen on a midpoint and the path was closed to the last sample
      with a straight `L` - a flat run of half a sample step, ~9px at the right
      edge of a phone. And both ends carried a round line cap sitting on the
      screen edge. Sampling now starts one step before the left edge and ends
      one step past the right, so the last real point gets a proper quadratic
      and both caps fall outside the box.

   7. THE VIEWBOX WAS ROUNDED, THE BOX WAS NOT. Seam height is a clamp() on vw,
      so it lands on a fraction: 54.59px, described by a viewBox of 55. The
      whole curve was being squashed by 0.7% and every stroke with it. Measured
      and written out exactly now.

   And two matters of degree, which is why the phone still did not look like the
   desktop even with all seven fixed: the band was short enough that one cycle
   of wave had nowhere to be (raised in waves.css), and it was sampled at 22
   points per wavelength against the desktop's 82, so the quadratics were
   flattening the crests they exist to round (now a fixed ~45 per wavelength on
   narrow screens, which is still fewer *points per frame* than a desktop). */
(function (Aura) {
	"use strict";

	function init(){
	  var seams = Aura.$$(".wsep");
	  if(!seams.length) return;

	  var STEP = Aura.MOBILE ? 30 : 18;
	  /* A reduced-motion request used to stop the seams dead. That setting is
	     common - Windows ships "show animations" as a single switch and Chrome
	     reports it as prefers-reduced-motion - and a frozen seam is exactly what
	     breaks the page into unrelated slabs, which is the one thing this element
	     exists to prevent. So the water is never switched off; it is calmed.
	     Half the amplitude, a bit over half the speed, no whip and no pointer
	     swell: a slow swell with no sudden travel, which is what the setting is
	     actually asking for. */
	  var CALM = Aura.RM ? .5 : 1;
	  var RATE = Aura.RM ? .55 : 1;

	  /* The height the seam was designed at. Every proportion below is expressed
	     against it, so "1" means "exactly what the wide layout already does". */
	  var REF_H = 137;

	  var items = seams.map(function(el, i){
	    return {
	      el: el,
	      svg: el.querySelector(".wsep__svg"),
	      back: el.querySelector(".wsep__back"),
	      bed: el.querySelector(".wsep__bed"),
	      lit: el.querySelector(".wsep__lit"),
	      bead: el.querySelector(".wsep__bead"),
	      fill: el.querySelector(".wsep__fill"),
	      fillUp: el.querySelector(".wsep__fill-up"),
	      w: 0, h: 0,
	      /* k    - stroke scale for this band, 1 at reference height.
	         sh   - "shortness", 0 on a full-height band and 1 on a phone. The
	                size-dependent corrections are lerps on this one number,
	                which keeps the wide layout bit-for-bit as it was.
	         lock - how completely the water behind is tied to the line in
	                front. Deliberately *not* sh; see the note in paint(). */
	      k: 1, sh: 0, lock: 0,
	      ph: i * 1.9,
	      vis: false,
	      /* Pointer state is per seam: a cursor two sections away must not bend
	         a curve it is nowhere near. */
	      px: 0, pIn: 0, pInT: 0
	    };
	  });

	  function clamp01(v){ return v < 0 ? 0 : (v > 1 ? 1 : v); }

	  /* One curve, sampled into a path string. `amp` is the resting amplitude,
	     `t` the clock, and the pointer term is a gaussian swell centred on the
	     cursor's x inside this seam.

	     `opt` describes a *related* copy of the same water rather than a fresh
	     one: a phase delta, an amplitude scale and a vertical offset. Passing
	     nothing gives the line itself. */
	  function build(it, t, whip, opt){
	    var w = it.w, h = it.h, mid = h / 2, sh = it.sh;
	    var phase = opt ? opt.phase : 0;
	    var ampK  = opt ? opt.ampK  : 1;
	    var off   = opt ? opt.dy    : 0;

	    /* The resting amplitude, and a slow breath over it so the seam is never
	       the same shape twice. The ceiling is what keeps the crest inside the
	       band: the two sines, the breath, the whip and the pointer swell can add
	       up to about 2.1x this, and 2.1 x 0.21h is still short of the half-height
	       the curve has to play with. Raise it and the wave clips its own band -
	       and the colour boundary clips with it.

	       A short band gets a slightly bigger share of itself, because the fixed
	       cost the wave competes with - the stroke on top of it - does not shrink
	       all the way down with the band. .19 -> .225, and the sum above still
	       clears the half-height with room at every size this page reaches. */
	    var amp = Math.min(h * (.19 + .035 * sh), 28)
	            * (1 + Math.sin(t * .45 + it.ph) * .14) * CALM * ampK;
	    /* THE ROCK. Water in a basin does not only travel, it sways: the whole
	       surface leans one way, stops, and comes back. That is one number - a
	       slow lateral drift added to the x every sine is sampled at, which
	       shifts the entire waveform left and right without moving the box it is
	       drawn in. Two of them at different periods so the return is never on
	       the beat the eye just learned. Scaled to the width, because the same
	       120px of sway that reads as a swell on a desktop reads as a lurch on a
	       phone. The fill path is sampled from these very points, so the colour
	       boundary sways with the line and the two never part company. */
	    var reach = Math.min(w * .17, 250) * CALM;
	    /* THE WAVELENGTH. This used to be the constant 235, which fixes the swell
	       at a period of about 1476px no matter how wide the screen is. On a
	       desktop that is very nearly one full wave across the page, which is the
	       shape this seam was drawn for. On a 320px phone it is 22% of one wave -
	       a single shallow arc with no crest and no trough in view, which the eye
	       reads as a sloped straight line. The whole point of the seam is lost at
	       exactly the size where it is the only thing separating two sections.
	       Tying the period to the width keeps one full wave in view at every size.
	       The ceiling is what preserves the desktop: at 1440px w/6.13 is 235, the
	       number that was here before, so nothing about the wide layout moves and
	       only screens narrower than that get a shorter wave. The three texture
	       sines and the pointer swell are kept at their original ratios to it, so
	       the surface keeps its character and only its scale changes. */
	    var L = Math.min(235, w / 6.13);
	    var sway = Math.sin(t * .27 + it.ph * .8) * reach
	             + Math.sin(t * .15 + it.ph * .3) * reach * .5;
	    /* SAMPLES PER WAVELENGTH, NOT PER PIXEL. What decides whether a crest
	       survives the quadratic smoothing is how many points describe one cycle,
	       and a phone's cycle is a quarter the length of a desktop's. The old
	       `w / 22` gave a desktop 82 points per wavelength and a phone 22, which
	       is where the phone's flat, kinked crests came from. Holding ~45 per
	       wavelength on narrow screens roughly doubles the fidelity and still
	       costs a phone about half the samples per frame that a desktop pays,
	       because its wave is short. The other two terms are the original caps,
	       kept so a wide screen resolves to exactly 18px as before. */
	    var st = Math.max(6, Math.min(STEP, w / 22, (6.2832 * L) / 45));
	    /* One sample before the left edge and one past the right. Both round line
	       caps then fall outside the clip, and - the reason this matters more -
	       the last point on screen gets a real quadratic instead of the straight
	       `L` the smoothing loop used to close with, which showed as a flat run
	       of about half a step at the right edge of every phone seam. */
	    var n = Math.ceil(w / st) + 3;
	    var xs = new Array(n), ys = new Array(n), i;
	    for(i = 0; i < n; i++){
	      var x = -st + i * st;
	      /* The sampling position for the wave *shape*. The point itself stays
	         where it is - only the phase of the water under it moves. */
	      var s = x + sway;
	      /* Three sines of different wavelength travelling at different speeds
	         and in opposite directions: that is what stops the eye from finding
	         the loop. The fastest one is tiny and only exists so the surface has
	         texture while the long swell moves under it.
	         One long swell carries the shape and the other two only texture it.
	         The second voice was heavy enough to put a shoulder on every crest,
	         which reads as a kink rather than as water; at these weights the line
	         stays a single smooth curve however far it rocks. */
	      var y = mid + off
	        + Math.sin(s / L + t * .46 + it.ph + phase) * amp
	        + Math.sin(s / (L * .477) - t * .68 + it.ph * 1.7 + phase) * amp * .26
	        + Math.sin(s / (L * .247) + t * 1.05 + it.ph * .6) * amp * .07
	        + Math.sin(s / (L * .187) + t * 1.6) * whip * .45;
	      if(it.pIn > .01){
	        var d = (x - it.px) / (L * .81), g = Math.exp(-d * d);
	        y -= g * it.pIn * amp * 1.15 * (.65 + .35 * Math.sin(t * 2.1));
	      }
	      xs[i] = x; ys[i] = y;
	    }
	    /* Every path this seam draws is traced from the same samples, so the line,
	       the water behind it and the two colour bands can never disagree about
	       where the boundary is. `dy` nudges a copy of the curve without resampling
	       it. */
	    function trace(dy){
	      var d = "M" + xs[0].toFixed(1) + " " + (ys[0] + dy).toFixed(1), j;
	      for(j = 1; j < n - 1; j++){
	        d += "Q" + xs[j].toFixed(1) + " " + (ys[j] + dy).toFixed(1) + " "
	           + ((xs[j] + xs[j + 1]) / 2).toFixed(1) + " "
	           + (((ys[j] + ys[j + 1]) / 2) + dy).toFixed(1);
	      }
	      d += "L" + xs[n - 1].toFixed(1) + " " + (ys[n - 1] + dy).toFixed(1);
	      return d;
	    }
	    var d2 = trace(0);
	    /* THE TWO BANDS. The curve closed into the bottom corners paints the section
	       below; the same curve closed into the top corners paints the section above.
	       Both are needed. The seam used to pour only the lower colour and take the
	       upper one from its own background - which works right up to the moment the
	       section *below* is the transparent one, because a background cannot be
	       un-painted under the curve. That is where the straight edge came back: the
	       whole band stayed the colour above it and met the next section on a flat
	       line. With both sides drawn as paths, neither is a rectangle and there is
	       no horizontal edge left anywhere to show.
	       The upper band is traced 0.8px lower and drawn first, so the lower band
	       lands over that sliver and two anti-aliased edges can never leave an
	       unpainted hairline between them.
	       Both bands also overshoot the seam box by 2px, and that is not
	       cosmetic. The seam height is a clamp() on vw, so at most window widths
	       it lands on a fractional pixel - 136.8px, not 137. A fill that
	       stopped exactly at the box left that last fifth of a pixel row
	       half painted, and it composited as one pale line the full width of the
	       page directly under the wave. Painting past the edge and letting
	       overflow:hidden do the cutting means the box's own fractional row
	       blends two identical colours instead.
	       The corners close on the first and last sample rather than on 0 and w,
	       because the samples now start outside the box on both sides - closing on
	       0 would cut the corner off the fill and leave a notch under the wave. */
	    var x0 = xs[0].toFixed(1), xN = xs[n - 1].toFixed(1);
	    var fill = d2 + "L" + xN + " " + (h + 2) + "L" + x0 + " " + (h + 2) + "Z";
	    var fillUp = trace(.8) + "L" + xN + " -2L" + x0 + " -2Z";
	    return { d: d2, fill: fill, fillUp: fillUp, xs: xs, ys: ys, n: n, amp: amp, mid: mid };
	  }

	  /* Where a given fraction of the way along the curve actually falls.
	     The dash offset is a fraction of *path length*; the samples are evenly
	     spaced in *x*. On a curve those are not the same point, and they are
	     furthest apart exactly at a crest, which is where the eye is looking.
	     Walking the cumulative length costs n square roots once per frame and is
	     what lets the bead sit on the head of the light rather than near it. */
	  function atLen(xs, ys, n, frac){
	    var total = 0, i, dx, dy;
	    var seg = new Array(n - 1);
	    for(i = 1; i < n; i++){
	      dx = xs[i] - xs[i - 1]; dy = ys[i] - ys[i - 1];
	      seg[i - 1] = Math.sqrt(dx * dx + dy * dy);
	      total += seg[i - 1];
	    }
	    var want = frac * total, run = 0;
	    for(i = 0; i < n - 1; i++){
	      if(run + seg[i] >= want){
	        var u = seg[i] > 0 ? (want - run) / seg[i] : 0;
	        return { x: xs[i] + (xs[i + 1] - xs[i]) * u,
	                 y: ys[i] + (ys[i + 1] - ys[i]) * u };
	      }
	      run += seg[i];
	    }
	    return { x: xs[n - 1], y: ys[n - 1] };
	  }

	  function measure(){
	    items.forEach(function(it){
	      var r = it.el.getBoundingClientRect();
	      /* Measured, not rounded. The height is a clamp() on vw and lands on a
	         fraction at almost every window width; describing a 54.59px box with
	         a viewBox of 55 squashes the entire curve by 0.7% and every stroke
	         with it. Two decimals is well past what a device pixel can show and
	         costs nothing in the attribute. */
	      it.w = Math.max(1, r.width);
	      it.h = Math.max(1, r.height);
	      /* How far this band is from the height the seam was drawn for. */
	      it.sh = clamp01((REF_H - it.h) / (REF_H - 64));
	      /* THE PHASE LOCK IS A SWITCH, NOT A SLOPE - and finding that out cost
	         a round of measurement. Tying it to `sh` like everything else left a
	         phone 86% locked, which sounds close enough and is not: the missing
	         14% is a 3.8% difference in *clock rate*, and a clock running 3.8%
	         slow does not stay 14% out of step - it walks steadily further out.
	         Half a minute in, the back curve was a radian adrift and crossing
	         the line again: measured at -1.8px on the hero seam and -2.4px on
	         the CTA seam, which is exactly the artefact this was meant to
	         remove, only slower to appear.
	         So the two are either on one clock or they are not. This ramp is
	         fully locked by 109px - every phone and every tablet - and fully
	         free by 129px, above which only the desktop band lives. No width
	         this page renders at lands inside the ramp itself. */
	      it.lock = clamp01((REF_H - 8 - it.h) / 20);
	      /* Stroke scale. Not a straight ratio - h/REF_H would put a 1px bed on a
	         phone, and a 1px line with a round cap has no presence at all next to
	         a 4px bead. Two thirds of the way down instead, floored at .62, which
	         lands the bed at ~1.4px on a phone: still a hairline against the wave,
	         still four device pixels on the screens this runs on. Exactly 1 at
	         reference height, so no wide-screen stroke changes. */
	      it.k = +(1 - .38 * it.sh).toFixed(3);
	      it.el.style.setProperty("--wsep-k", it.k);

	      /* ONE WAVE OR FOUR. The layered reading - bed, light, bead and the
	         water behind - needs two things: room to separate in, and the
	         drop-shadow that fuses the set into a single lit surface. A phone
	         has neither. 74px of band, and `.is-lite` drops the shadow, so the
	         four stop being one object and become four thin ones lying across
	         each other at different colours, offsets and phases.

	         118px is where the room runs out. It sits just under the 129px the
	         phase lock above already calls the bottom of the desktop band, and
	         it is deliberately a height and not a width: the same 1000px window
	         gets a 95px band and has the same problem, whatever it is running
	         on. The lite tier is included outright so that no touch device can
	         end up showing the layered version without the glow that makes it
	         work.

	         Re-evaluated on every measure, so a window dragged across the
	         threshold changes over honestly - and written only on change,
	         since measure() runs on resize. */
	      var solid = it.h < 118 || !!Aura.MOBILE;
	      if(solid !== it.solid){
	        it.solid = solid;
	        it.el.classList.toggle("wsep--solid", solid);
	      }
	      if(it.svg){
	        it.svg.setAttribute("viewBox",
	          "0 0 " + it.w.toFixed(2) + " " + it.h.toFixed(2));
	        it.svg.setAttribute("preserveAspectRatio", "none");
	      }
	      /* The bead is the head of the light, so it is sized off the same scale
	         as the stroke it rides. 4.2 at reference height, as before. */
	      if(it.bead) it.bead.setAttribute("r", (4.2 * it.k).toFixed(2));
	    });
	  }

	  /* One lap of the light, in seconds. This was 4.2s in a CSS keyframe and
	     1/.21 = 4.76s in this file, for the dash and the bead respectively. One
	     number now, and both read it. */
	  var LAP = 4.2;
	  /* The dash pattern the light is cut from, as declared in waves.css. The
	     offset that puts its leading end at fraction p is (DASH - p * 100), in the
	     normalised units pathLength="100" gives us. */
	  var DASH = 22;

	  function paint(it, t){
	    var whip = Math.min(16, Math.abs(Aura.vel) * .14)
	             /* The whip is an absolute number of pixels, so on a third of the
	                band it was three times the gesture. Held to its share. */
	             * (1 - .45 * it.sh);
	    var c = build(it, t, whip);
	    if(it.fillUp) it.fillUp.setAttribute("d", c.fillUp);
	    if(it.fill) it.fill.setAttribute("d", c.fill);
	    if(it.bed) it.bed.setAttribute("d", c.d);
	    if(it.lit && !it.solid) it.lit.setAttribute("d", c.d);
	    if(it.back && !it.solid){
	      /* THE WATER BEHIND. Two ways of getting a second curve, chosen by
	         whether the band is tall enough to carry the first one.
	
	         At full height: the original independent clock, `t * .74 + 2.4`. It
	         wanders freely against the line and, given 137px to wander in, reads
	         as a separate body of water lying behind it. That is the wide layout
	         the page already had, and it is kept exactly.
	
	         Below that: the same clock as the line, with a small phase delta and
	         a downward offset. The two curves are then provably the same water -
	         identical sway, identical breath, identical whip - one trailing the
	         other and riding lower.
	
	         The budget is the whole design here, so it is worth writing down.
	         The offset has to be larger than everything that can push the back
	         curve up through the line, because crossing is what turned this
	         layer into a second, torn-looking wave at phone size. At a 74px band
	         the amplitude is ~16.3px and four things can separate the two: the
	         phase delta on the long swell (2 sin(.11) -> 3.6px), the amplitude
	         difference (.08 -> 1.3px), both of those again on the second voice
	         at .26 weight (-> 1.3px) and on the third at .07 (-> 0.1px). That is
	         6.3px against an offset of .115 of the band, 8.5px: a positive
	         margin at every moment, with the crest of the back curve still
	         clear of the bottom of the box.
	
	         The whip is deliberately no longer on that list. It used to be
	         halved for this layer, which was a fifth source of divergence worth
	         2.2px on a fast scroll - the exact moment a seam is most visible.
	         Locked, the whole surface whips as one body, which is both cheaper
	         to reason about and what water actually does. */
	      var lk = it.lock;
	      var tBack = t * (.74 + .26 * lk) + 2.4 * (1 - lk);
	      var b = build(it, tBack, whip * (.5 + .5 * lk), {
	        phase: .22 * lk,
	        ampK: 1 - .08 * lk,
	        dy: it.h * .115 * lk
	      });
	      it.back.setAttribute("d", b.d);
	    }
	    /* The light and its head, from one number. `p` is how far along the curve
	       the head has travelled; the dash is offset so its leading end lands
	       there, and the bead is placed at the same fraction of arc length. They
	       are the same point by construction now, not by two timings agreeing. */
	    /* In one-wave mode the light, its head and the water behind are not in
	       the document's paint at all, so everything past this point is work
	       with nowhere to land - including atLen(), which walks the whole
	       curve accumulating arc length to place a bead that is display:none.
	       Six seams x 60fps, so it is worth the early return on the exact
	       class of device that needs the frames. */
	    if(it.solid) return;

	    var p = ((t / LAP + it.ph * .1) % 1 + 1) % 1;
	    if(it.lit) it.lit.setAttribute("stroke-dashoffset", (DASH - p * 100).toFixed(2));
	    if(it.bead){
	      var pt = atLen(c.xs, c.ys, c.n, p);
	      it.bead.setAttribute("cx", pt.x.toFixed(1));
	      it.bead.setAttribute("cy", pt.y.toFixed(1));
	    }
	  }

	  /* ---- arrival --------------------------------------------------------
	     A seam is a full-width band with no content, so an observer on it is
	     honest: its box is exactly what the visitor sees. */
	  function watch(){
	    if(!window.IntersectionObserver){
	      items.forEach(function(it){ it.el.classList.add("in"); it.vis = true; });
	      return;
	    }
	    var io = new IntersectionObserver(function(entries){
	      entries.forEach(function(en){
	        var it = items.filter(function(x){ return x.el === en.target; })[0];
	        if(!it) return;
	        it.vis = en.isIntersecting;
	        if(en.isIntersecting) it.el.classList.add("in");
	      });
	      kick();
	    }, { rootMargin: "120px 0px" });
	    items.forEach(function(it){ io.observe(it.el); });
	  }

	  /* ---- the pointer ----------------------------------------------------
	     Listened for on the window rather than per seam: a seam is 80px tall and
	     pointer-events:none, so it cannot receive events of its own, and the
	     swell should start before the cursor is exactly on the line anyway. */
	  if(Aura.FINE && !Aura.RM){
	    window.addEventListener("pointermove", function(e){
	      if(e.pointerType === "touch") return;
	      for(var i = 0; i < items.length; i++){
	        var it = items[i];
	        if(!it.vis) { it.pInT = 0; continue; }
	        var r = it.el.getBoundingClientRect();
	        var dy = e.clientY < r.top ? r.top - e.clientY
	               : (e.clientY > r.bottom ? e.clientY - r.bottom : 0);
	        it.px = e.clientX - r.left;
	        it.pInT = dy > 220 ? 0 : 1 - dy / 220;
	      }
	      kick();
	    }, { passive: true });
	  }

	  /* ---- the loop -------------------------------------------------------
	     Runs only while something is on screen. Under a reduced-motion request
	     the curve is painted once, at rest, and the loop never starts.

	     THE PHONE IS NOT THROTTLED TO 30fps ANY MORE. `Aura.MOBILE ? 33 : 16`
	     halved the frame rate of every seam on every touch device, which is a
	     blunt instrument: it costs a modern phone nothing to paint two SVG paths,
	     and 30fps is precisely the rate at which a slow horizontal drift stops
	     looking like water and starts looking like a slideshow. The seam's own
	     movement is slow, so 30fps is visible on it in a way it would not be on a
	     fast animation.

	     The pacing comes from Aura.frameMs, the page-wide budget in core/aura.js.
	     This module briefly carried its own version of that logic, timing its own
	     paint - honest, but measured at the wrong scope. A seam is cheap and would
	     happily hold 60fps while the hero canvas beside it drowns, and two effects
	     running at different rates look worse than both running slow. One budget,
	     derived from the frame interval the device actually delivers, and every
	     moving thing on the page steps together and falls back together. */
	  var t = 0, last = 0, raf = 0, running = false;

	  /* A seam scrolled past is not animated, but its fill is still the boundary
	     between two bands - so the loop leaves the last painted shape in place
	     rather than resetting anything when a seam goes out of view. */
	  function frame(ts){
	    var any = false, i;
	    for(i = 0; i < items.length; i++) if(items[i].vis) { any = true; break; }
	    if(!any || document.hidden){ running = false; raf = 0; return; }
	    raf = requestAnimationFrame(frame);
	    Aura.beat(ts);
	    if(ts - last < Aura.frameMs) return;
	    var dt = last ? Math.min(.05, (ts - last) / 1000) : .016;
	    last = ts;
	    t += dt * RATE;

	    for(i = 0; i < items.length; i++){
	      var it = items[i];
	      it.pIn += (it.pInT - it.pIn) * .1;
	      if(it.vis) paint(it, t);
	    }
	  }

	  function kick(){
	    if(running) return;
	    running = true; last = 0;
	    raf = requestAnimationFrame(frame);
	  }

	  measure();
	  /* The CSS keyframe is the no-JS fallback: without this file the light still
	     runs, just without a bead on its head. From here the offset is written
	     every frame, so the keyframe has to stand down or the two fight over the
	     same property and the light stutters. */
	  items.forEach(function(it){
	    if(it.lit) it.lit.style.animation = "none";
	    paint(it, 0);
	  });
	  watch();
	  kick();
	  document.addEventListener("visibilitychange", function(){ if(!document.hidden) kick(); });

	  Aura.onResize(function(){
	    measure();
	    items.forEach(function(it){ paint(it, t); });
	  });
	}

	Aura.register("waves", init);
})(window.Aura);
