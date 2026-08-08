/* Card spotlight follow */
(function (Aura) {
	"use strict";

	var $$ = Aura.$$;
	/* ---------- card spotlight ---------- */
	function initCards(){
	  $$(".card").forEach(function(c){
	    c.addEventListener("mousemove", function(e){
	      var r = c.getBoundingClientRect();
	      c.style.setProperty("--mx", (e.clientX - r.left) + "px");
	      c.style.setProperty("--my", (e.clientY - r.top) + "px");
	    });
	  });
	}
	Aura.register("cards", initCards);
})(window.Aura);
