/* Header behaviour
   ---------------------------------------------------------------------------
   Four jobs, one scroll handler:

   1. DENSITY. Past a threshold the bar gets `.stuck`, which fades in the wash
      and takes 14px out of its height. The threshold has hysteresis — on at
      24px, off at 12px — so a trackpad hovering around the boundary cannot make
      the header blink. The class is only written when it actually changes.

   2. READ POSITION. `--head-prog` is the fraction of the document scrolled, and
      the hairline scales itself by it in CSS. Writing one custom property is
      cheaper than touching geometry and keeps the animation on the compositor.

   3. WHERE YOU ARE. The active nav item is the section currently occupying the
      reading line — a horizontal line a third of the way down the viewport,
      just under the header. Comparing each section's top and bottom against one
      line is deterministic and, unlike an IntersectionObserver with thresholds,
      it never leaves two items lit at once or none lit between two sections.
      The hero deliberately maps to nothing: over the first screen no item is
      marked, because "you are at the top" is not a section.
      Bottom of the document is a special case: the last section can be shorter
      than the remaining viewport, so it can never reach the reading line. If we
      are at the end of the page, the last section wins by definition.

   4. THE PANEL. Open/close for the mobile navigation, including focus.

   Scroll work runs through Aura.onScroll, which is a single rAF-throttled
   listener shared by every module, so this file adds no listener of its own. */
(function(){
  var A=window.Aura;if(!A)return;

  A.register("header",function(){
    var head=A.$("#head");if(!head)return;

    var nav=A.$("#nav"),burger=A.$("#burger"),
        links=nav?A.$$('a[href^="#"]',nav):[],
        /* Only the links that point at a real section take part in the spy; the
           panel's call to action points at #cta as well and must not become a
           second lit item. */
        spy=[],stuck=false,active=null,prog=-1;

    links.forEach(function(a){
      if(a.classList.contains("nav__cta"))return;
      var el=document.getElementById(a.getAttribute("href").slice(1));
      if(el)spy.push({a:a,el:el});
    });

    /* ---- 1..3: one pass over the scroll position --------------------- */
    function frame(){
      var y=window.pageYOffset||document.documentElement.scrollTop||0;

      var next=stuck?y>12:y>24;
      if(next!==stuck){stuck=next;head.classList.toggle("stuck",stuck)}

      var doc=document.documentElement,
          span=(doc.scrollHeight-window.innerHeight)||1,
          p=Math.min(1,Math.max(0,y/span)),
          r=Math.round(p*1000)/1000;
      if(r!==prog){prog=r;head.style.setProperty("--head-prog",r)}

      if(!spy.length)return;
      var line=y+window.innerHeight*0.34,
          atEnd=y+window.innerHeight>=doc.scrollHeight-2,
          hit=null,i,s,top;

      for(i=0;i<spy.length;i++){
        s=spy[i];top=s.el.offsetTop;
        if(line>=top&&line<top+s.el.offsetHeight){hit=s.a;break}
      }
      if(atEnd)hit=spy[spy.length-1].a;

      if(hit!==active){
        if(active)active.removeAttribute("aria-current");
        if(hit)hit.setAttribute("aria-current","true");
        active=hit;
      }
    }

    A.onScroll(frame);
    A.onResize(frame);
    frame();

    /* ---- the capsule that follows the cursor -------------------------
       One element for the whole row rather than a background per link, so the
       light travels the distance between two labels instead of blinking from
       one to the next. It is created here and not in the document because it
       is purely a pointer affordance: without this script there is nothing to
       follow the pointer with, and an empty span in the markup would be a
       promise the page could not keep.

       Width and a translate only — both compositable, so the travel never
       touches layout while the page is being scrolled behind it. */
    if(nav && spy.length){
      var pill=document.createElement("span");
      pill.className="nav__pill";
      pill.setAttribute("aria-hidden","true");
      nav.appendChild(pill);

      /* Below the breakpoint the nav is a stacked panel, not a row, and there
         is nothing for a capsule to travel along. */
      var wide=window.matchMedia("(min-width:901px)");

      function park(a){
        if(!a||!wide.matches){nav.classList.remove("nav--pill");return}
        var nr=nav.getBoundingClientRect(),r=a.getBoundingClientRect();
        pill.style.width=r.width+"px";
        pill.style.transform="translateX("+(r.left-nr.left)+"px)";
        nav.classList.add("nav--pill");
      }

      spy.forEach(function(s){
        s.a.addEventListener("pointerenter",function(e){
          /* A tap fires pointerenter too, and a capsule left parked under the
             last thing a finger touched is a hover state that never lifts. */
          if(e.pointerType==="touch")return;
          park(s.a);
        });
        s.a.addEventListener("focus",function(){park(s.a)});
      });

      nav.addEventListener("pointerleave",function(){nav.classList.remove("nav--pill")});
      nav.addEventListener("focusout",function(e){
        if(!nav.contains(e.relatedTarget))nav.classList.remove("nav--pill");
      });
      /* The pill is positioned from measured boxes, so a resize that reflows
         the row would otherwise leave it parked at a stale offset. */
      A.onResize(function(){nav.classList.remove("nav--pill")});
    }

    /* ---- 4: the mobile panel ----------------------------------------- */
    if(!nav||!burger)return;

    var open=false;

    function setOpen(state,giveFocus){
      if(state===open)return;
      open=state;
      nav.classList.toggle("open",open);
      burger.classList.toggle("on",open);
      burger.setAttribute("aria-expanded",open?"true":"false");
      /* The panel is a layer over the page, so the page behind it must not
         scroll under the thumb. */
      document.documentElement.classList.toggle("nav-open",open);
      if(open){
        /* Focus the first item only when the panel was opened from the
           keyboard — moving focus after a tap would summon the on-screen
           keyboard's focus ring over a menu nobody is typing into. */
        if(giveFocus&&links[0])links[0].focus();
      }else if(giveFocus&&burger.offsetParent!==null){
        /* Only hand focus back to the burger while the burger is actually on
           screen. Past the breakpoint it is display:none, and focusing a
           hidden element quietly drops focus onto <body> — which would strand
           a keyboard user at the top of the document. */
        burger.focus();
      }
    }

    burger.addEventListener("click",function(e){
      /* `detail` is 0 for a keyboard-activated click and >0 for a pointer one:
         the cheapest honest way to tell the two apart. */
      setOpen(!open,e.detail===0);
    });

    /* Choosing a destination closes the panel. The class comes off immediately
       so the panel is already on its way out while the page scrolls. */
    links.forEach(function(a){
      a.addEventListener("click",function(){setOpen(false,false)});
    });

    /* Outside click. Bound on the document at the capture-free bubble phase and
       filtered by containment, so it survives anything the page adds later. */
    document.addEventListener("click",function(e){
      if(!open)return;
      if(nav.contains(e.target)||burger.contains(e.target))return;
      setOpen(false,false);
    });

    document.addEventListener("keydown",function(e){
      if(!open)return;
      if(e.key==="Escape"||e.key==="Esc"){e.preventDefault();setOpen(false,true)}
    });

    /* Crossing back to the desktop layout while the panel is open would leave
       an open-state class on a nav that is no longer a panel. */
    A.onResize(function(){
      if(open&&window.innerWidth>900)setOpen(false,false);
    });
  });
})();
