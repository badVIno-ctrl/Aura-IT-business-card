/* Process wave — the light that runs the brand's curve */
(function (Aura) {
	"use strict";

	/* Where the four stages sit along the curve. Four identical humps put every
	   extreme at an eighth boundary, so these are exact rather than measured —
	   see the comment above .proc in index.html for why. The same four numbers
	   are true of the horizontal wave and of the vertical one. */
	var AT = [0.125, 0.375, 0.625, 0.875];

	function initProcess(){
	  var wrap = document.getElementById("procw");
	  if(!wrap) return;
	  var steps = Aura.$$(".pstep", wrap);
	  if(!steps.length) return;

	  /* A reduced-motion visitor gets the finished diagram the stylesheet
	     already describes — the wave lit end to end, every stage at full ink.
	     There is nothing to subscribe to and nothing to shorten. */
	  if(Aura.RM) return;

	  /* Only from here on does the section start dim and wait for the light.
	     Adding the class before the first value is written is what keeps a
	     scripted page from flashing its finished state for one frame. */
	  wrap.classList.add("proc--live");

	  /* Geometry is measured once per layout change; a scroll tick is then two
	     subtractions, one style write and at most one class flip. */
	  var from = 0, span = 1;
	  function measure(){
	    var vh = window.innerHeight || 800, y = window.pageYOffset;
	    var r = wrap.getBoundingClientRect();
	    /* The light sets off as the block clears the bottom of the viewport and
	       is home before the block leaves the top, so the whole gesture happens
	       while the section is being read rather than after it. Both ends are
	       tied to the viewport, which is what keeps the pacing the same on a
	       laptop and on a phone. */
	    from = r.top + y - vh * 0.88;
	    span = Math.max(1, (r.bottom + y - vh * 0.45) - from);
	  }

	  var lastP = -1, lit = -1;
	  function upd(y){
	    var p = (y - from) / span;
	    p = p < 0 ? 0 : (p > 1 ? 1 : p);
	    if(Math.abs(p - lastP) > 0.0015){
	      lastP = p;
	      /* One custom property on one element. The lit stroke, its halo and the
	         head of the light all derive their dash offset from it in CSS, so
	         three strokes cost one write. */
	      wrap.style.setProperty("--p", p.toFixed(4));
	    }
	    /* Stages light in order, so their whole state is one number: how many
	       fractions the light has passed. Plain comparisons, no hysteresis —
	       scrolling back up must undo exactly what scrolling down did. */
	    var n = 0;
	    while(n < AT.length && p >= AT[n]) n++;
	    if(n !== lit){
	      for(var i = 0; i < steps.length; i++) steps[i].classList.toggle("on", i < n);
	      lit = n;
	    }
	  }

	  measure();
	  Aura.onScroll(upd);
	  Aura.onResize(function(){ measure(); lastP = -1; upd(window.pageYOffset); });
	}
	Aura.register("process", initProcess);
})(window.Aura);
