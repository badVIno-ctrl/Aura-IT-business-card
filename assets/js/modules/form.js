/* Contact form: the light it writes, its states, and where the lead goes
   ---------------------------------------------------------------------------
   Two jobs. The first is the ordinary one: floating labels, validation, submit.
   The second is that this module owns --fill on #cta — the single number the
   seam along the form's edge and the wave in the column beside it are both lit
   from. See the head of sections/contact.css for what that light means and why
   its resting state is dark.

   WHAT COUNTS AS PROGRESS. Three of the four fields, a third each: a name we
   can use, a way to answer, and what needs doing. Company is deliberately not
   in the count — it is optional, and a light that never reaches its end unless
   an optional field is filled would be telling the visitor the form is
   incomplete when it is not. So the light arrives exactly when the enquiry is
   one we can act on, which is the only honest thing for it to mean.

   Each field's rule is the same one validation uses on submit, in one place: a
   field that lights its third is a field that will not be rejected. */
(function (Aura) {
	"use strict";

	/* Where leads are sent.
	   Set ENDPOINT to your own handler (it receives JSON via POST) and the form
	   submits over the network. Leave it empty and the form stays fully
	   functional without a backend: it hands the filled-in text over to the
	   visitor's mail client, addressed to CONTACT_MAIL. Nothing here is a stub —
	   both paths work as shipped. */
	var ENDPOINT = "";
	var CONTACT_MAIL = "hello@aura-it.ru";

	function initForm(){
	  var form = document.getElementById("form");
	  if(!form) return;

	  var section = document.getElementById("cta");
	  var status = document.getElementById("status");
	  var btn = document.getElementById("send");
	  var fields = {
	    name:    form.querySelector("#f1"),
	    company: form.querySelector("#f2"),
	    contact: form.querySelector("#f3"),
	    message: form.querySelector("#f4")
	  };

	  /* The rule per field, and the message shown when it is not met. Company is
	     absent from this map on purpose: nothing is asked of it, so there is
	     nothing for it to satisfy. `hard` marks the two that block a submit. */
	  var RULES = [
	    { el:fields.name,    min:2, hard:true,  say:"Укажите, как к вам обращаться." },
	    { el:fields.contact, min:5, hard:true,  say:"Оставьте телефон или e-mail для ответа." },
	    { el:fields.message, min:1, hard:false, say:"" }
	  ];

	  function met(rule){ return rule.el.value.trim().length >= rule.min; }

	  /* One pass over the fields writes everything that depends on their content:
	     the floating labels, the per-field satisfied state, and the section's
	     --fill. Called on every input event, which is cheap — three length
	     comparisons and at most one custom property write. */
	  var lastFill = -1, sent = false;
	  function sync(){
	    Array.prototype.forEach.call(form.querySelectorAll(".f input, .f textarea"), function(el){
	      el.parentNode.classList.toggle("has", !!el.value);
	    });

	    var done = 0;
	    for(var i = 0; i < RULES.length; i++){
	      var ok = met(RULES[i]);
	      if(ok) done++;
	      /* A rejected field keeps saying so until it is edited, so `bad` wins
	         over `ok` and the two are never on at once. */
	      var box = RULES[i].el.parentNode;
	      box.classList.toggle("ok", ok && !box.classList.contains("bad"));
	    }

	    var fill = done / RULES.length;
	    if(section && fill !== lastFill){
	      lastFill = fill;
	      section.style.setProperty("--fill", fill.toFixed(3));
	    }
	  }

	  Array.prototype.forEach.call(form.querySelectorAll(".f input, .f textarea"), function(el){
	    el.addEventListener("input", function(){
	      /* Any edit means the previous outcome is stale: the success state stops
	         holding the seam at full length and the light goes back to following
	         the fields. */
	      if(sent){
	        sent = false;
	        if(section) section.classList.remove("is-ok");
	        say("");
	      }
	      sync();
	    });
	    el.addEventListener("blur", sync);
	  });
	  sync();

	  function say(text, kind){
	    status.className = "status" + (kind ? " " + kind : "");
	    status.textContent = text;
	  }

	  /* Validation points at the field it is talking about, rather than only
	     printing a sentence at the bottom of the form. The field is marked
	     invalid for anything reading the page rather than looking at it, and the
	     mark is cleared by the same edit that clears the outline. */
	  function fail(rule){
	    var el = rule.el, box = el.parentNode;
	    say(rule.say, "err");
	    box.classList.add("bad");
	    box.classList.remove("ok");
	    el.setAttribute("aria-invalid", "true");
	    el.focus({ preventScroll: false });
	    var clear = function(){
	      box.classList.remove("bad");
	      el.removeAttribute("aria-invalid");
	      el.removeEventListener("input", clear);
	      sync();
	    };
	    el.addEventListener("input", clear);
	    return false;
	  }

	  function payload(){
	    return {
	      name:    fields.name.value.trim(),
	      company: fields.company.value.trim(),
	      contact: fields.contact.value.trim(),
	      message: fields.message.value.trim(),
	      page:    location.href,
	      sentAt:  new Date().toISOString()
	    };
	  }

	  function mailtoFallback(d){
	    var body =
	      "Имя: " + d.name + "\n" +
	      "Компания: " + (d.company || "—") + "\n" +
	      "Контакт: " + d.contact + "\n\n" +
	      "Задача:\n" + (d.message || "—");
	    location.href = "mailto:" + CONTACT_MAIL +
	      "?subject=" + encodeURIComponent("Заявка с сайта — " + (d.company || d.name)) +
	      "&body=" + encodeURIComponent(body);
	  }

	  /* The button owns the spinner; the form owns the fact that nothing may be
	     typed while the request is in flight.
	
	     The fields are disabled rather than only dimmed. Dimming plus
	     `pointer-events:none` stops a mouse and nothing else: Tab still reaches
	     the field and the caret still types into it, so the form on screen can
	     drift away from the payload already on its way to the server — and the
	     visitor is editing a request they can no longer change. `disabled` is
	     also the honest word for anything reading the page rather than looking
	     at it. */
	  function busy(on){
	    btn.disabled = on;
	    btn.setAttribute("aria-busy", on ? "true" : "false");
	    form.setAttribute("aria-busy", on ? "true" : "false");
	    Array.prototype.forEach.call(form.querySelectorAll(".f input, .f textarea"), function(el){
	      el.disabled = on;
	    });
	  }

	  function succeeded(){
	    say("Заявка принята. Ответим в течение дня — или напишите сразу в Telegram.", "ok");
	    form.reset();
	    Array.prototype.forEach.call(form.querySelectorAll(".f"), function(f){
	      f.classList.remove("has", "bad", "ok");
	    });
	    Array.prototype.forEach.call(form.querySelectorAll("[aria-invalid]"), function(el){
	      el.removeAttribute("aria-invalid");
	    });
	    /* The fields are empty again, so sync() would retract the light the
	       instant the enquiry was accepted. It is held out instead, in the
	       success colour, until the next keystroke says a new enquiry is being
	       written. */
	    sent = true;
	    lastFill = 1;
	    if(section){
	      section.classList.add("is-ok");
	      section.style.setProperty("--fill", "1");
	    }
	  }

	  form.addEventListener("submit", function(e){
	    e.preventDefault();
	    say("");

	    for(var i = 0; i < RULES.length; i++){
	      if(RULES[i].hard && !met(RULES[i])) return fail(RULES[i]);
	    }
	    var d = payload();

	    if(!ENDPOINT){
	      say("Открываем почту с готовым письмом…");
	      mailtoFallback(d);
	      return;
	    }

	    busy(true);
	    say("Отправляем…");

	    fetch(ENDPOINT, {
	      method: "POST",
	      headers: { "Content-Type": "application/json" },
	      body: JSON.stringify(d)
	    }).then(function(res){
	      if(!res.ok) throw new Error("HTTP " + res.status);
	      busy(false);
	      succeeded();
	    }).catch(function(){
	      busy(false);
	      say("Не удалось отправить. Напишите нам на почту или в Telegram — мы на связи.", "err");
	    });
	  });
	}
	Aura.register("form", initForm);
})(window.Aura);
