/* Projects, demo documents and preview modal
   ---------------------------------------------------------------------------
   Three things live here: the list of cases, the generated thumbnail for each
   one, and the demo document that opens inside the laptop when a case is
   clicked. The list is the only place that has to be edited to add a case.

   A note on the strings below. The demo documents used to be assembled with
   every closing tag broken in two — '<' + '/div>' — which was a defence from
   the days when all of this was one HTML file with the script inline. These
   modules are only ever loaded with src, so the tags are written plainly. */
(function (Aura) {
	"use strict";

	/* ---------- ПРОЕКТЫ ----------
	   Каждый кейс несёт один цвет и два формальных признака:

	   hue  — угол тона в oklch. Из него стилями собирается всё цветное на
	          карточке: подложка превью, чип, ссылка, обводка при наведении.
	   acc  — тот же цвет в hex. Им рисуются превью и демо-страница, потому что
	          и то и другое собирается в JS. Держите пару согласованной: hue и
	          acc — один цвет, записанный дважды.
	   size — место в bento-сетке: hero (4 колонки × 2 ряда), tall (2 × 2),
	          sm (2 × 1), wide (вся ширина). Порядок в этом массиве и есть
	          порядок раскладки.
	   kind — какая демо-страница открывается: "app" — интерфейс с боковым
	          меню, "site" — сайт.
	   demo: null → показывается локальная демо-страница. Подставьте адрес
	          реального сайта — он откроется внутри окна макбука. */
	var PROJECTS = [
	  {id:"mes",   t:"Панель сменного мастера",            d:"Загрузка линий, простои и выработка смены в реальном времени — на одном экране, без выгрузок в Excel.", tag:"MES · дашборд",        hue:258, acc:"#4A6FD8", size:"hero", kind:"app",  demo:null},
	  {id:"lk",    t:"Личный кабинет дилера",              d:"Заказы, взаиморасчёты и документы в одном окне",            tag:"B2B · портал",          hue:292, acc:"#7A4FC4", size:"sm",   kind:"app",  demo:null},
	  {id:"wms",   t:"Учёт на складе с ТСД",               d:"Приёмка и инвентаризация по штрихкодам",                    tag:"WMS · мобильное",       hue:220, acc:"#2E7FC4", size:"sm",   kind:"app",  demo:null},
	  {id:"design",t:"Айдентика и 3D-моушен для запуска",   d:"Знак, палитра, типографика и анимация — от первого эскиза до роликов для маркетплейсов и выставки.", tag:"Дизайн · 3D-моушен", hue:330, acc:"#B8399B", size:"tall", kind:"site", demo:null},
	  {id:"site",  t:"Сайт с каталогом и подбором",         d:"Технический каталог и подбор аналогов",                     tag:"Сайт · каталог",        hue:200, acc:"#1E7FA8", size:"sm",   kind:"site", demo:null},
	  {id:"odin",  t:"1С: обмен с цехом и себестоимость",   d:"Заказы, склад и отчётность без ручного переноса",           tag:"1С · автоматизация",    hue:80,  acc:"#A8801C", size:"sm",   kind:"app",  demo:null},
	  {id:"bi",    t:"Отчётность для руководства",          d:"Ежедневная сводка вместо ручных таблиц",                    tag:"BI · аналитика",        hue:160, acc:"#17876A", size:"sm",   kind:"app",  demo:null},
	  {id:"shop",  t:"Коммерческий сайт с оплатой",         d:"Каталог, корзина, оплата и выгрузка заказов в 1С",          tag:"Сайт · e-commerce",     hue:30,  acc:"#C2542A", size:"sm",   kind:"site", demo:null},
	  {id:"infra", t:"Переезд с аренды на своё железо",     d:"Кластер, резервные копии и мониторинг — перенесли без остановки работы компании и обучили дежурных.", tag:"Инфраструктура",   hue:240, acc:"#3D5DAF", size:"wide", kind:"app",  demo:null}
	];

	/* ---------- цвет одного кейса ----------
	   Превью рисуется в тоне своего кейса, поэтому все оттенки в нём выводятся
	   из одного acc, а не подбираются руками. Ступени к белому дают светлый
	   интерфейс, одна ступень к тёмно-синему — контрастную деталь. Так превью
	   читается как этюд в одном цвете, а не как картинка с цветной рамкой. */
	function blend(hex, to, t){
	  var a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16), o = 0, sh;
	  for(var i = 0; i < 3; i++){
	    sh = i * 8;
	    var ca = (a >> sh) & 255, cb = (b >> sh) & 255;
	    o |= Math.round(ca + (cb - ca) * t) << sh;
	  }
	  return "#" + (o | 0x1000000).toString(16).slice(1);
	}
	function tint(hex, t){ return blend(hex, "#FFFFFF", t); }
	function shade(hex, t){ return blend(hex, "#101A33", t); }

	function visual(p){
	  /* The drawing is authored for the slot the case occupies. A card that is
	     two rows tall is a portrait box, and the closing strip is a letterbox;
	     one 320×150 drawing fitted into all three would be a thin band floating
	     in a tall frame — which is exactly what the first pass of this looked
	     like. So the size decides the aspect, and each drawing below fills its
	     own. Previews are fitted rather than cropped (no `slice`), because a
	     crop takes the edges off a diagram and a stretch bends its circles. */
	  var W = 320, id = p.id;
	  var H = p.size === "hero" ? 206 : (p.size === "tall" ? 400 : (p.size === "wide" ? 140 : 150));
	  /* One ladder of the case's own hue. `acc` is the work itself, `sk` and
	     `lt` are the same colour with more light in it, and `dk` is the one dark
	     face a light interface needs to have somewhere. */
	  var acc = p.acc, sk = tint(acc,.36), lt = tint(acc,.62),
	      mt = tint(acc,.64), soft = tint(acc,.79), ln = tint(acc,.87),
	      fill = tint(acc,.91), bar0 = tint(acc,.93), pnl = tint(acc,.95),
	      pane = tint(acc,.975), dk = shade(acc,.58);
	  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img">';
	  s += '<rect width="' + W + '" height="' + H + '" fill="' + pane + '"/>';
	  function bar(x,y,w,h,c,o){ return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + Math.min(3,h/2) + '" fill="' + c + '"' + (o?' opacity="' + o + '"':'') + '/>'; }
	  function box(x,y,w,h,r,f,st){ return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + r + '" fill="' + f + '"' + (st?' stroke="' + st + '"':'') + '/>'; }

	  if(id === "mes"){
	    s += bar(0,0,W,22,bar0);
	    s += bar(12,8,54,6,mt); s += '<circle cx="304" cy="11" r="5" fill="' + acc + '" opacity=".5"/>';
	    var kx = [12,116,220];
	    for(var i=0;i<3;i++){
	      s += box(kx[i],32,88,36,7,pnl,ln);
	      s += bar(kx[i]+10,40,30,5,mt); s += bar(kx[i]+10,51,42,9,[acc,sk,lt][i],".85");
	    }
	    s += box(12,78,296,60,8,pnl,ln);
	    s += '<path d="M24 124 L60 116 L96 120 L132 104 L168 108 L204 92 L240 96 L276 82 L296 76" fill="none" stroke="' + acc + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';
	    s += '<path d="M24 124 L60 116 L96 120 L132 104 L168 108 L204 92 L240 96 L276 82 L296 76 L296 132 L24 132 Z" fill="' + acc + '" opacity=".08"/>';
	    s += '<circle cx="296" cy="76" r="3.6" fill="' + pane + '" stroke="' + acc + '" stroke-width="2.4"/>';
	    /* The orders table. It only exists in the flagship's taller box, and it is
	       the reason the flagship is worth being four columns wide: there is
	       something in it to actually read. */
	    s += box(12,146,296,52,8,pane,ln);
	    s += bar(22,155,38,5,mt); s += bar(120,155,34,5,soft); s += bar(200,155,30,5,soft); s += bar(266,155,32,5,soft);
	    s += '<line x1="12" y1="166" x2="308" y2="166" stroke="' + ln + '"/>';
	    for(var t2=0;t2<2;t2++){
	      var ty = 174 + t2*14;
	      s += bar(22,ty,44,5,dk,".78"); s += bar(120,ty,50,5,soft);
	      s += box(200,ty-3,42,11,5.5,tint(acc,.86)); s += '<circle cx="208" cy="' + (ty+2.5) + '" r="2.4" fill="' + [acc,sk][t2] + '"/>';
	      s += bar(266,ty,26,5,mt);
	    }
	  } else if(id === "lk"){
	    s += bar(0,0,W,22,bar0); s += bar(12,8,46,6,mt); s += bar(258,7,50,9,acc,".8");
	    for(var r=0;r<4;r++){
	      var y = 34 + r*28;
	      s += box(12,y,296,22,6,(r%2?pane:pnl),ln);
	      s += bar(22,y+8,44,6,mt); s += bar(96,y+8,62,6,soft); s += bar(180,y+8,38,6,soft);
	      s += box(244,y+6,48,11,5.5,tint(acc,.82));
	      s += '<circle cx="252" cy="' + (y+11.5) + '" r="2.6" fill="' + [acc,sk,lt,acc][r] + '"/>';
	    }
	  } else if(id === "wms"){
	    s += bar(0,0,W,22,bar0); s += bar(12,8,58,6,mt);
	    s += box(12,32,150,106,9,pnl,ln);
	    var bx = 26, seed = [3,2,5,2,3,6,2,4,3,5,2,3,4,2,6,3];
	    for(var k=0;k<seed.length;k++){ s += bar(bx, 52, seed[k], 44, dk, (k%3?".8":".95")); bx += seed[k] + 4; }
	    s += bar(40,104,94,6,mt);
	    s += box(172,32,136,106,9,pane,ln);
	    for(var cy=0;cy<3;cy++){ for(var cx=0;cx<3;cx++){
	      var on = (cy*3+cx)%4;
	      s += box(184+cx*40,44+cy*32,32,24,5,(on===0?acc:(on===2?sk:fill)));
	    }}
	  } else if(id === "bi"){
	    s += bar(0,0,W,22,bar0); s += bar(12,8,40,6,mt);
	    s += box(12,32,186,106,9,pnl,ln);
	    var hs = [34,52,44,66,58,74], px = 28;
	    for(var q=0;q<hs.length;q++){
	      s += bar(px, 120-hs[q], 18, hs[q], acc, ".85");
	      s += bar(px, 120-hs[q], 18, Math.round(hs[q]*.34), lt, ".9");
	      px += 28;
	    }
	    s += '<line x1="22" y1="122" x2="188" y2="122" stroke="' + ln + '"/>';
	    s += box(208,32,100,106,9,pane,ln);
	    s += '<circle cx="258" cy="78" r="27" fill="none" stroke="' + fill + '" stroke-width="11"/>';
	    s += '<circle cx="258" cy="78" r="27" fill="none" stroke="' + acc + '" stroke-width="11" stroke-dasharray="124 170" stroke-linecap="round" transform="rotate(-90 258 78)"/>';
	    s += bar(228,116,60,6,mt);
	  } else if(id === "site"){
	    s += bar(0,0,W,22,bar0); s += bar(12,8,44,6,mt); s += bar(232,7,76,9,soft);
	    for(var c2=0;c2<3;c2++){
	      var x2 = 12 + c2*100;
	      s += box(x2,32,92,106,9,pane,ln);
	      s += box(x2+10,42,72,46,6,pnl);
	      s += '<circle cx="' + (x2+46) + '" cy="65" r="15" fill="none" stroke="' + [acc,sk,lt][c2] + '" stroke-width="3" opacity=".85"/>';
	      s += box(x2+38,57,16,16,3,[acc,sk,lt][c2]);
	      s += bar(x2+10,96,58,6,mt); s += bar(x2+10,108,38,6,soft);
	      s += box(x2+10,120,40,10,5,tint(acc,.8));
	    }
	  } else if(id === "design"){
	    /* A brand board, read top to bottom the way the deliverable itself is:
	       the mark on its dark plate, the palette it was drawn from, the type it
	       is set in, and the motion strip with its keyframes. Portrait, because
	       this case holds the tall slot in the bento. */
	    s += bar(0,0,W,22,bar0); s += bar(12,8,50,6,mt); s += bar(272,8,36,6,soft);
	    s += box(12,32,296,150,10,dk);
	    s += '<circle cx="160" cy="94" r="42" fill="none" stroke="' + acc + '" stroke-width="4.4"/>';
	    s += '<g fill="none" stroke="' + sk + '" stroke-width="5.2" stroke-linecap="round">';
	    s += '<path d="M134 82 c8.7-9.4 17.3-9.4 26 0 8.7 9.4 17.3 9.4 26 0"/>';
	    s += '<path d="M134 106 c8.7-9.4 17.3-9.4 26 0 8.7 9.4 17.3 9.4 26 0"/></g>';
	    s += bar(112,152,66,9,tint(acc,.72),".9"); s += bar(184,152,24,9,acc,".85");
	    var sw = [acc,sk,lt,mt];
	    for(var w=0;w<4;w++){ s += box(12+w*76,194,68,40,7,sw[w]); }
	    s += box(12,246,296,62,9,pnl,ln);
	    s += '<text x="26" y="290" font-family="Georgia,serif" font-size="42" font-weight="700" fill="' + shade(acc,.3) + '">Aa</text>';
	    s += bar(104,262,120,7,mt); s += bar(104,278,168,6,soft); s += bar(104,292,138,6,soft);
	    s += box(12,320,296,26,6,pane,ln);
	    s += '<line x1="22" y1="333" x2="298" y2="333" stroke="' + ln + '"/>';
	    for(var d=0;d<6;d++){ s += '<rect x="' + (26+d*48) + '" y="329" width="9" height="9" rx="1.6" fill="' + acc + '" transform="rotate(45 ' + (30.5+d*48) + ' 333.5)"/>'; }
	    for(var f=0;f<3;f++){
	      s += box(12+f*100,358,92,32,5,fill);
	      s += '<circle cx="' + (58+f*100) + '" cy="374" r="' + (6+f*4) + '" fill="' + acc + '" opacity="' + (.35+f*.25) + '"/>';
	    }
	  } else if(id === "odin"){
	    /* A journal on the left, the document form on the right — the shape any
	       accountant recognises from three metres away. */
	    s += bar(0,0,W,22,bar0);
	    s += bar(12,8,42,6,mt); s += bar(62,8,28,6,soft); s += bar(98,8,32,6,soft);
	    s += box(258,6,50,10,5,acc,null); 
	    s += box(12,30,190,108,8,pnl,ln);
	    s += bar(20,38,40,5,mt); s += bar(78,38,46,5,soft); s += bar(150,38,44,5,soft);
	    s += '<line x1="12" y1="48" x2="202" y2="48" stroke="' + ln + '"/>';
	    for(var j=0;j<4;j++){
	      var jy = 56 + j*17;
	      s += bar(20,jy,42,5,dk,".8"); s += bar(78,jy,54,5,soft); s += bar(160,jy,34,5,mt);
	      s += '<circle cx="150" cy="' + (jy+2.5) + '" r="3" fill="' + [acc,sk,acc,lt][j] + '"/>';
	    }
	    s += box(12,124,190,14,0,acc,null);
	    s += '<rect x="12" y="124" width="190" height="14" fill="' + pane + '" opacity=".82"/>';
	    s += bar(20,128,52,6,acc,".9"); s += bar(150,128,44,6,acc,".55");
	    s += box(210,30,98,108,8,pane,ln);
	    s += bar(220,40,46,5,mt);
	    for(var g=0;g<3;g++){ s += box(220,52+g*20,78,14,4,fill); s += bar(226,56+g*20,34,6,soft); }
	    s += box(220,116,78,14,7,acc);
	  } else if(id === "shop"){
	    /* A storefront: the banner, three products with prices, and a cart that
	       is not empty. */
	    s += bar(0,0,W,24,pane);
	    s += '<line x1="0" y1="24" x2="' + W + '" y2="24" stroke="' + ln + '"/>';
	    s += bar(12,9,40,6,acc,".85");
	    for(var nv=0;nv<3;nv++){ s += bar(150+nv*34,10,26,5,soft); }
	    s += '<circle cx="300" cy="12" r="8" fill="' + acc + '" opacity=".18"/>';
	    s += '<circle cx="305" cy="7" r="3.4" fill="' + acc + '"/>';
	    s += box(12,34,296,44,8,fill);
	    s += bar(24,44,116,8,acc,".85"); s += bar(24,60,84,6,mt);
	    s += box(238,42,58,28,6,acc,null);
	    for(var t3=0;t3<3;t3++){
	      var tx = 12 + t3*100;
	      s += box(tx,86,92,52,8,pane,ln);
	      s += box(tx+8,92,30,24,4,[acc,sk,lt][t3]);
	      s += bar(tx+46,95,38,5,mt); s += bar(tx+46,105,26,6,acc,".8");
	      s += box(tx+8,122,76,10,5,tint(acc,.84));
	    }
	  } else {
	    s += bar(0,0,W,22,bar0); s += bar(12,8,52,6,mt);
	    for(var n=0;n<3;n++){
	      var y3 = 30 + n*34;
	      s += box(12,y3,296,28,7,pnl,ln);
	      for(var u=0;u<10;u++){ s += bar(24+u*10, y3+8, 5, 12, u<7?mt:fill); }
	      s += bar(140,y3+11,80,6,soft);
	      s += '<circle cx="290" cy="' + (y3+14) + '" r="4.5" fill="' + [acc,sk,lt][n] + '"/>';
	      s += '<circle cx="274" cy="' + (y3+14) + '" r="4.5" fill="' + fill + '"/>';
	    }
	  }
	  s += '</svg>';
	  return s;
	}

	/* ---------- демо-интерфейсы ----------
	   Данные для kind:"app". Акцент не хранится здесь: он берётся из кейса, так
	   что цвет карточки, цвет превью и цвет демо-страницы — один и тот же. */
	var DEMOS = {
	  mes:{app:"Aura MES", crumb:"Цех №2 · смена 2", nav:["Смена","Линии","Заказы","Простои","Отчёты"],
	    kpis:[["Загрузка линии","94","%","+6 п.п. к плану","up"],["Простой за смену","12","мин","-8 мин к вчера","up"],["Готовых единиц","1 842","шт","план 1 800","up"]],
	    chart:[46,52,49,58,55,64,61,72,68,79,84,94], chartLabel:"Загрузка линии по часам смены",
	    head:["Заказ","Участок","Статус","Срок"],
	    rows:[["№ 10482","Сборка","b|В работе","сегодня"],["№ 10483","Окраска","o|Ожидание","завтра"],["№ 10484","Литьё","g|Готов","сдан"],["№ 10485","Склад","b|Отгрузка","12:40"],["№ 10486","Сборка","n|В очереди","пт"]]},
	  lk:{app:"Кабинет дилера", crumb:"ООО «Волга-Трейд»", nav:["Заказы","Прайс","Взаиморасчёты","Документы","Заявки"],
	    kpis:[["Открытых заказов","37","","+4 за неделю","up"],["К оплате","1,24","млн ₽","срок до 14.08","flat"],["Отгрузок за неделю","12","","из 14 плановых","flat"]],
	    chart:[38,44,41,52,49,58,55,62,60,68,72,76], chartLabel:"Отгрузки по неделям",
	    head:["Заказ","Позиции","Сумма","Статус"],
	    rows:[["ЗК-2291","14 SKU","312 400 ₽","g|Отгружен"],["ЗК-2292","6 SKU","88 900 ₽","b|Комплектуется"],["ЗК-2293","22 SKU","476 100 ₽","o|Ждёт оплаты"],["ЗК-2294","3 SKU","41 250 ₽","n|Черновик"],["ЗК-2295","9 SKU","157 800 ₽","g|Отгружен"]]},
	  wms:{app:"Aura WMS", crumb:"Склад готовой продукции", nav:["Приёмка","Ячейки","Инвентаризация","Отгрузка","ТСД"],
	    kpis:[["Принято сегодня","428","поз.","18 паллет","up"],["Расхождений","3","","0,7% от объёма","down"],["Средняя приёмка","41","сек","было 2 мин 10 сек","up"]],
	    chart:[24,31,29,38,42,47,44,52,58,55,61,66], chartLabel:"Сканирований в час",
	    head:["Паллета","Номенклатура","Ячейка","Статус"],
	    rows:[["PL-00841","Фитинг 32 мм","A-04-12","g|Размещена"],["PL-00842","Труба PP-R 25","A-05-03","b|Сканируется"],["PL-00843","Кран шаровой 1\"","B-01-08","o|Расхождение"],["PL-00844","Муфта 20 мм","B-02-11","g|Размещена"],["PL-00845","Отвод 90° 40","—","n|В приёмке"]]},
	  bi:{app:"Сводка руководителя", crumb:"Июль 2026", nav:["Сводка","Продажи","Производство","Закупки","Рассылки"],
	    kpis:[["Выручка за месяц","48,6","млн ₽","+11% год к году","up"],["Выполнение плана","103","%","план 47,2 млн ₽","up"],["Себестоимость","61","%","-2 п.п. к июню","up"]],
	    chart:[52,55,58,54,62,66,63,71,74,72,80,86], chartLabel:"Выручка по дням, млн ₽",
	    head:["Направление","Факт","План","Отклонение"],
	    rows:[["Трубопроводы","18,4 млн","17,0 млн","g|+8%"],["Арматура","12,1 млн","12,5 млн","o|-3%"],["Комплектующие","9,7 млн","9,0 млн","g|+8%"],["Сервис","5,2 млн","5,2 млн","n|0%"],["Прочее","3,2 млн","3,5 млн","o|-9%"]]},
	  odin:{app:"1С: Производство", crumb:"Заказы на производство · август", nav:["Заказы","Номенклатура","Склад","Себестоимость","Обмен"],
	    kpis:[["Заказов в работе","64","","+9 за неделю","up"],["Ручного ввода","0","ч/день","было 3 часа","up"],["Обмен с цехом","15","мин","по расписанию","flat"]],
	    chart:[58,61,60,66,64,71,69,74,78,76,82,88], chartLabel:"Заказы, закрытые в срок, %",
	    head:["Документ","Контрагент","Сумма","Статус"],
	    rows:[["ЗП-00412","ООО «Волга-Трейд»","312 400 ₽","g|Проведён"],["ЗП-00413","АО «Сталькомплект»","1 104 800 ₽","b|В производстве"],["ЗП-00414","ООО «Гидромаш»","76 300 ₽","o|Ждёт оплаты"],["ЗП-00415","ИП Смирнов","18 900 ₽","g|Проведён"],["ЗП-00416","ООО «Теплосети»","249 000 ₽","n|Черновик"]]},
	  infra:{app:"Aura Infra", crumb:"Основная площадка", nav:["Обзор","Узлы","Сервисы","Бэкапы","Инциденты"],
	    kpis:[["Доступность","99,98","%","30 дней подряд","up"],["Узлов в кластере","14","","своё железо","flat"],["Инцидентов","0","","за месяц","up"]],
	    chart:[70,74,72,78,80,77,84,86,88,90,92,96], chartLabel:"Свободные ресурсы кластера, %",
	    head:["Сервис","Узел","Бэкап","Статус"],
	    rows:[["1С:УПП","node-03","02:10","g|Работает"],["MES","node-05","02:25","g|Работает"],["Файловый архив","node-08","03:00","b|Синхронизация"],["Почта","node-01","02:40","g|Работает"],["Тестовый контур","node-11","—","n|Остановлен"]]}
	};

	/* ---------- демо-сайты ----------
	   Данные для kind:"site". Дашборд с боковым меню — неправильная форма для
	   сайта и для дизайн-проекта: у сайта есть шапка, первый экран и сетка, а не
	   KPI и таблица. `panel` выбирает, что стоит на первом экране справа:
	   "shot" — подбор по параметрам, "cart" — карточка товара, "mark" — знак и
	   палитра. */
	var SITES = {
	  site:{brand:"Промкаталог", nav:["Каталог","Подбор аналога","Документация","Дилеры"], action:"Запросить цену",
	    h1:"Техкаталог, в котором находят с первого раза",
	    lead:"4 120 позиций с чертежами и 3D-моделями. Подбор аналога по параметрам — без звонка менеджеру и без переписки на три дня.",
	    cta:["Подобрать аналог","Скачать прайс"],
	    stats:[["4 120","позиций с чертежами"],["9 сек","подбор аналога"],["+38%","заявок за квартал"]],
	    panel:"shot", panelCap:"Подбор по параметрам",
	    gridTitle:"Разделы каталога", gridNote:"наличие обновляется из 1С каждые 15 минут",
	    tiles:[["Краны шаровые","Ду15 — Ду200","g|На складе"],["Задвижки","чугун, сталь","g|На складе"],["Клапаны обратные","Ду25 — Ду150","o|Под заказ"],["Компенсаторы","сильфонные","g|На складе"]]},
	  shop:{brand:"Инструмент-Про", nav:["Каталог","Бренды","Доставка","Оплата"], action:"Корзина · 3",
	    h1:"Заказ с сайта попадает в 1С сам",
	    lead:"Каталог, корзина, онлайн-оплата и доставка. Заказ уходит в учётную систему сразу, без выгрузок руками и без потерянных писем.",
	    cta:["Смотреть каталог","Условия доставки"],
	    stats:[["1 850","товаров в наличии"],["4 мин","от заказа до 1С"],["-60%","времени на обработку"]],
	    panel:"cart", panelCap:"Оформление заказа",
	    gridTitle:"Хиты продаж", gridNote:"цены и остатки — из 1С",
	    tiles:[["Перфоратор SDS-plus","900 Вт · кейс","p|12 400 ₽"],["Набор бит, 42 предмета","хром-ванадий","p|1 890 ₽"],["Аккумуляторный шуруповёрт","18 В · 2 АКБ","p|8 750 ₽"],["Лазерный уровень","3×360° · штатив","p|14 200 ₽"]]},
	  design:{brand:"Nordis", nav:["Знак","Палитра","Типографика","Моушен"], action:"Смотреть ролик",
	    h1:"Айдентика и 3D-моушен для запуска",
	    lead:"Знак, палитра, типографика и правила — и на той же геометрии собран 3D-моушен для маркетплейсов, выставочного экрана и соцсетей.",
	    cta:["Открыть гайдлайн","Скачать логотип"],
	    stats:[["1 знак","6 отрисованных версий"],["24 кадра","3D-моушена"],["11 стр.","правил использования"]],
	    panel:"mark", panelCap:"Знак и палитра",
	    gridTitle:"Что вошло в проект", gridNote:"исходники передаются заказчику",
	    tiles:[["Знак и логотип","вертикаль, горизонталь, favicon","g|Готово"],["Палитра и градиенты","основная и тёмная схемы","g|Готово"],["Типографика","заголовки, текст, цифры","g|Готово"],["3D-моушен","6 роликов, 5–15 секунд","g|Готово"]]}
	};

	function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

	function sparkline(vals, acc){
	  var w = 560, h = 120, max = Math.max.apply(null, vals), min = Math.min.apply(null, vals);
	  var span = Math.max(1, max - min), pts = [], i;
	  for(i=0;i<vals.length;i++){
	    var x = (w/(vals.length-1))*i;
	    var y = h - 14 - ((vals[i]-min)/span)*(h-34);
	    pts.push([x, y]);
	  }
	  var d = "", a = "";
	  for(i=0;i<pts.length;i++){ d += (i?" L":"M") + pts[i][0].toFixed(1) + " " + pts[i][1].toFixed(1); }
	  a = d + " L" + w + " " + h + " L0 " + h + " Z";
	  var s = '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" class="spark">';
	  s += '<defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + acc + '" stop-opacity=".22"/><stop offset="1" stop-color="' + acc + '" stop-opacity="0"/></linearGradient></defs>';
	  for(i=1;i<4;i++){ s += '<line x1="0" y1="' + (i*h/4).toFixed(0) + '" x2="' + w + '" y2="' + (i*h/4).toFixed(0) + '" stroke="#EAECF2" stroke-width="1"/>'; }
	  s += '<path d="' + a + '" fill="url(#sg)"/>';
	  s += '<path d="' + d + '" fill="none" stroke="' + acc + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>';
	  s += '<circle cx="' + pts[pts.length-1][0].toFixed(1) + '" cy="' + pts[pts.length-1][1].toFixed(1) + '" r="3.4" fill="#fff" stroke="' + acc + '" stroke-width="2.2"/>';
	  s += '</svg>';
	  return s;
	}

	/* The wrapper both builders share: the same font, the same reset, and a page
	   that is exactly the size of the laptop screen it is shown in. */
	function shell(css, body){
	  var s = '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">';
	  s += '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>';
	  s += '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">';
	  s += '<style>*{box-sizing:border-box}html,body{height:100%;overflow:hidden}';
	  s += "body{margin:0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;";
	  s += "-webkit-font-smoothing:antialiased;font-feature-settings:'tnum' 1}";
	  s += css + '</style></head><body>' + body + '</body></html>';
	  return s;
	}

	function demoApp(p){
	  var m = DEMOS[p.id] || DEMOS.mes, acc = p.acc, i;
	  var css = "";
	  css += ":root{--acc:" + acc + "}";
	  css += "body{background:#F6F7FA;color:#141A30;font-size:13px;line-height:1.5}";
	  css += ".app{display:grid;grid-template-columns:198px 1fr;min-height:100vh}";
	  css += ".side{background:#fff;border-right:1px solid #E9EBF2;padding:16px 12px;display:flex;flex-direction:column;gap:18px}";
	  css += ".brand{display:flex;align-items:center;gap:9px;padding:4px 6px}";
	  css += ".brand .dot{width:22px;height:22px;border-radius:7px;background:linear-gradient(135deg," + tint(acc,.34) + "," + acc + ");flex:none}";
	  css += ".brand b{font-size:13.5px;font-weight:600;letter-spacing:-.01em}";
	  css += ".nav{display:flex;flex-direction:column;gap:1px}";
	  css += ".nav span{display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:8px;color:#5C6688;font-size:12.5px;font-weight:500}";
	  css += ".nav span i{width:6px;height:6px;border-radius:2px;background:#D3D8E6;flex:none}";
	  css += ".nav span.on{background:" + tint(acc,.9) + ";color:#243055;font-weight:600}.nav span.on i{background:var(--acc)}";
	  css += ".side .foot{margin-top:auto;padding:9px;border-radius:10px;background:#F6F7FA;color:#6B7492;font-size:11px;line-height:1.35}";
	  css += ".main{display:flex;flex-direction:column;min-width:0}";
	  css += ".top{display:flex;align-items:center;gap:12px;padding:11px 18px;background:#fff;border-bottom:1px solid #E9EBF2}";
	  css += ".top h1{margin:0;font-size:14.5px;font-weight:600;letter-spacing:-.012em}";
	  css += ".top .crumb{color:#8A92AC;font-size:12px}";
	  css += ".seg{margin-left:auto;display:flex;gap:2px;padding:2px;background:#F1F3F8;border-radius:9px}";
	  css += ".seg span{padding:4px 10px;border-radius:7px;font-size:11.5px;color:#6B7492;font-weight:500}";
	  css += ".seg span.on{background:#fff;color:#141A30;box-shadow:0 1px 2px rgba(20,26,48,.09)}";
	  css += ".av{width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg," + tint(acc,.55) + "," + acc + ");color:#fff;display:grid;place-items:center;font-size:10.5px;font-weight:600;letter-spacing:.02em}";
	  css += ".body{padding:16px 18px 18px;display:flex;flex-direction:column;gap:11px;min-height:0}";
	  css += ".kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}";
	  css += ".k{background:#fff;border:1px solid #E9EBF2;border-radius:12px;padding:12px 14px}";
	  css += ".k .lb{font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:#8A92AC;font-weight:600}";
	  css += ".k .v{margin-top:6px;font-size:24px;font-weight:600;letter-spacing:-.03em;line-height:1}";
	  css += ".k .v u{text-decoration:none;font-size:13px;font-weight:500;color:#8A92AC;margin-left:4px;letter-spacing:0}";
	  css += ".k .d{margin-top:6px;font-size:11px;color:#6B7492;display:flex;align-items:center;gap:5px}";
	  css += ".k .d s{text-decoration:none;font-size:9px;color:#3E9A6B}.k .d s.dn{color:#D2694F}.k .d s.fl{color:#8A92AC}";
	  css += ".panel{background:#fff;border:1px solid #E9EBF2;border-radius:12px;overflow:hidden}";
	  css += ".ph{display:flex;align-items:center;gap:10px;padding:10px 15px;border-bottom:1px solid #EEF0F5}";
	  css += ".ph b{font-size:12.5px;font-weight:600;letter-spacing:-.008em}";
	  css += ".ph span{font-size:11px;color:#8A92AC;margin-left:auto}";
	  css += ".chart{padding:10px 6px 2px}.spark{display:block;width:100%;height:78px}";
	  css += "table{width:100%;border-collapse:collapse}";
	  css += "th{text-align:left;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#98A0B8;font-weight:600;padding:8px 15px;border-bottom:1px solid #EEF0F5}";
	  css += "td{padding:7.5px 15px;border-bottom:1px solid #F3F4F8;font-size:12.5px;color:#2B3352}";
	  css += "tr:last-child td{border-bottom:0}";
	  css += "td:first-child{font-weight:600;color:#141A30;font-variant-numeric:tabular-nums}";
	  css += ".pill{display:inline-flex;align-items:center;gap:5px;padding:2.5px 9px;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:-.005em}";
	  css += ".pill:before{content:'';width:5px;height:5px;border-radius:50%;background:currentColor}";
	  /* The status colours stay put: green is shipped and orange is waiting in
	     every case, and re-tinting them per project would make the same word mean
	     a different thing on two pages. Only the case's own accent moves. */
	  css += ".p-b{background:" + tint(acc,.9) + ";color:" + shade(acc,.22) + "}";
	  css += ".p-g{background:#E9F3EC;color:#3E8560}.p-o{background:#FBF0E4;color:#A86A2E}.p-n{background:#F1F2F6;color:#78819C}";
	  css += "@media (max-width:760px){.app{grid-template-columns:1fr}.side{display:none}.kpis{grid-template-columns:1fr}}";

	  /* The menu is a depiction, not navigation: nothing in a generated demo
	     leads anywhere, and links that lead nowhere are stops on the way through
	     the overlay for anyone using a keyboard. */
	  var nav = "";
	  for(i=0;i<m.nav.length;i++){ nav += '<span class="' + (i===0?"on":"") + '"><i></i>' + esc(m.nav[i]) + '</span>'; }

	  var kpis = "";
	  for(i=0;i<m.kpis.length;i++){
	    var k = m.kpis[i];
	    var mark = k[4]==="down" ? '<s class="dn">&#9660;</s>' : (k[4]==="flat" ? '<s class="fl">&#9679;</s>' : '<s>&#9650;</s>');
	    kpis += '<div class="k"><div class="lb">' + esc(k[0]) + '</div><div class="v">' + esc(k[1]) + (k[2]?'<u>' + esc(k[2]) + '</u>':'') + '</div><div class="d">' + mark + esc(k[3]) + '</div></div>';
	  }

	  var thead = "";
	  for(i=0;i<m.head.length;i++){ thead += '<th>' + esc(m.head[i]) + '</th>'; }
	  var tbody = "";
	  for(i=0;i<m.rows.length;i++){
	    var r = m.rows[i], tds = "";
	    for(var j=0;j<r.length;j++){
	      var c = String(r[j]);
	      if(c.length > 1 && c.charAt(1) === "|"){
	        tds += '<td><span class="pill p-' + c.charAt(0) + '">' + esc(c.slice(2)) + '</span></td>';
	      } else {
	        tds += '<td>' + esc(c) + '</td>';
	      }
	    }
	    tbody += '<tr>' + tds + '</tr>';
	  }

	  var b = "";
	  b += '<div class="app"><aside class="side">';
	  b += '<div class="brand"><span class="dot"></span><b>' + esc(m.app) + '</b></div>';
	  b += '<nav class="nav">' + nav + '</nav>';
	  b += '<div class="foot">Демо-интерфейс Aura IT.<br>Данные обезличены.</div>';
	  b += '</aside><div class="main">';
	  b += '<header class="top"><h1>' + esc(p.t) + '</h1><span class="crumb">' + esc(m.crumb) + '</span>';
	  b += '<div class="seg"><span class="on">День</span><span>Неделя</span><span>Месяц</span></div>';
	  b += '<div class="av">АК</div></header>';
	  b += '<div class="body"><div class="kpis">' + kpis + '</div>';
	  b += '<section class="panel"><div class="ph"><b>' + esc(m.chartLabel) + '</b><span>обновлено только что</span></div>';
	  b += '<div class="chart">' + sparkline(m.chart, acc) + '</div></section>';
	  b += '<section class="panel"><div class="ph"><b>' + esc(m.head[0]) + 'ы</b><span>' + m.rows.length + ' записей</span></div>';
	  b += '<table><thead><tr>' + thead + '</tr></thead><tbody>' + tbody + '</tbody></table></section>';
	  b += '</div></div></div>';
	  return shell(css, b);
	}

	/* What stands on the first screen of a site demo, to the right of the copy.
	   Three shapes, one per kind of work: a parameter search, a checkout, and a
	   brand board. */
	function sitePanel(kind, acc){
	  var s = "";
	  if(kind === "shot"){
	    s += '<div class="pr">';
	    s += '<div class="pr__f"><span>Диаметр</span><b>Ду100</b></div>';
	    s += '<div class="pr__f"><span>Давление</span><b>Ру16</b></div>';
	    s += '<div class="pr__f"><span>Присоединение</span><b>Фланцевое</b></div>';
	    s += '<div class="pr__go">Показать 34 позиции</div>';
	    s += '<div class="pr__r"><i></i><span>Кран шаровой 11с34п<em>на складе</em></span></div>';
	    s += '<div class="pr__r"><i></i><span>Кран шаровой КШ-1140<em>на складе</em></span></div>';
	    s += '</div>';
	  } else if(kind === "cart"){
	    s += '<div class="pr">';
	    s += '<div class="pr__card"><span class="pr__img"></span><span class="pr__nm">Перфоратор SDS-plus, 900 Вт<em>2 шт · в наличии</em></span><b>24 800 ₽</b></div>';
	    s += '<div class="pr__f"><span>Доставка · завтра</span><b>0 ₽</b></div>';
	    s += '<div class="pr__f"><span>Оплата картой онлайн</span><b>-3%</b></div>';
	    s += '<div class="pr__sum"><span>К оплате</span><b>24 056 ₽</b></div>';
	    s += '<div class="pr__go">Оплатить заказ</div>';
	    s += '<div class="pr__nt">Заказ уходит в 1С сразу после оплаты</div>';
	    s += '</div>';
	  } else {
	    s += '<div class="pr pr--mark">';
	    s += '<div class="pr__mk"><svg viewBox="0 0 64 64" aria-hidden="true">';
	    s += '<circle cx="32" cy="32" r="26" fill="none" stroke="' + tint(acc,.2) + '" stroke-width="3"/>';
	    s += '<g fill="none" stroke="' + tint(acc,.5) + '" stroke-width="4.2" stroke-linecap="round">';
	    s += '<path d="M17 25 c5-5.4 10-5.4 15 0 5 5.4 10 5.4 15 0"/><path d="M17 39 c5-5.4 10-5.4 15 0 5 5.4 10 5.4 15 0"/></g></svg>';
	    s += '<b>Nordis</b></div>';
	    s += '<div class="pr__sw"><i style="background:' + acc + '"></i><i style="background:' + tint(acc,.3) + '"></i><i style="background:' + tint(acc,.58) + '"></i><i style="background:' + shade(acc,.5) + '"></i></div>';
	    s += '<div class="pr__ty"><b>Aa</b><span>Onest · Golos Text<em>заголовки / текст / цифры</em></span></div>';
	    s += '</div>';
	  }
	  return s;
	}

	function demoSite(p){
	  var m = SITES[p.id] || SITES.site, acc = p.acc, i;
	  var css = "";
	  css += "body{background:" + tint(acc,.97) + ";color:#141A30;font-size:14px;line-height:1.55}";
	  css += ".pg{display:flex;flex-direction:column;height:100%}";
	  /* Header */
	  css += ".hd{display:flex;align-items:center;gap:26px;padding:0 40px;height:64px;background:#fff;border-bottom:1px solid " + tint(acc,.86) + "}";
	  css += ".hd .lg{display:flex;align-items:center;gap:10px;font-weight:700;font-size:17px;letter-spacing:-.02em}";
	  css += ".hd .lg i{width:26px;height:26px;border-radius:9px;background:linear-gradient(135deg," + tint(acc,.3) + "," + acc + ")}";
	  css += ".hd nav{display:flex;gap:22px;margin-left:14px}";
	  css += ".hd nav span{color:#4A5578;font-size:13.5px;font-weight:500}";
	  css += ".hd nav span:first-child{color:" + shade(acc,.2) + ";font-weight:600}";
	  css += ".hd .act{margin-left:auto;background:" + acc + ";color:#fff;font-size:13px;font-weight:600;padding:9px 18px;border-radius:10px}";
	  /* First screen */
	  css += ".hero{display:grid;grid-template-columns:1.02fr .98fr;gap:40px;align-items:center;padding:30px 40px 24px;flex:none}";
	  css += ".hero h1{margin:0;font-size:36px;line-height:1.1;letter-spacing:-.03em;font-weight:700;max-width:18ch}";
	  css += ".hero p{margin:16px 0 0;color:#4A5578;font-size:15px;max-width:44ch}";
	  css += ".cta{display:flex;gap:12px;margin-top:24px}";
	  css += ".cta span{font-size:13.5px;font-weight:600;padding:12px 20px;border-radius:11px}";
	  css += ".cta span:first-child{background:" + acc + ";color:#fff}";
	  css += ".cta span+span{background:#fff;color:" + shade(acc,.2) + ";border:1px solid " + tint(acc,.78) + "}";
	  css += ".st{display:flex;gap:30px;margin-top:24px;padding-top:18px;border-top:1px solid " + tint(acc,.86) + "}";
	  css += ".st div b{display:block;font-size:22px;font-weight:700;letter-spacing:-.03em;color:" + shade(acc,.16) + "}";
	  css += ".st div span{font-size:12px;color:#6B7492}";
	  /* The panel on the right */
	  css += ".pn{background:#fff;border:1px solid " + tint(acc,.84) + ";border-radius:18px;padding:18px;box-shadow:0 30px 60px -40px rgba(20,26,48,.5)}";
	  css += ".pn>.cap{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8A92AC;font-weight:600;margin-bottom:14px}";
	  css += ".pr{display:flex;flex-direction:column;gap:9px}";
	  css += ".pr__f{display:flex;align-items:center;justify-content:space-between;background:" + tint(acc,.95) + ";border-radius:10px;padding:10px 13px;font-size:13px;color:#6B7492}";
	  css += ".pr__f b{color:#141A30;font-weight:600}";
	  css += ".pr__go{margin-top:3px;background:" + acc + ";color:#fff;text-align:center;font-weight:600;font-size:13.5px;padding:11px;border-radius:11px}";
	  css += ".pr__r{display:flex;align-items:center;gap:10px;padding:9px 4px;border-top:1px solid " + tint(acc,.9) + ";font-size:13px}";
	  css += ".pr__r i{width:8px;height:8px;border-radius:50%;background:" + acc + ";flex:none}";
	  css += ".pr__r em{display:block;font-style:normal;font-size:11.5px;color:#8A92AC}";
	  css += ".pr__card{display:flex;align-items:center;gap:12px;font-size:13px}";
	  css += ".pr__img{width:52px;height:52px;border-radius:10px;flex:none;background:linear-gradient(140deg," + tint(acc,.55) + "," + acc + ")}";
	  css += ".pr__nm{flex:1;font-weight:600}.pr__nm em{display:block;font-style:normal;font-weight:400;font-size:11.5px;color:#8A92AC}";
	  css += ".pr__card b{font-size:15px;letter-spacing:-.02em}";
	  css += ".pr__sum{display:flex;align-items:baseline;justify-content:space-between;padding-top:11px;border-top:1px solid " + tint(acc,.88) + "}";
	  css += ".pr__sum span{font-size:12.5px;color:#6B7492}.pr__sum b{font-size:21px;letter-spacing:-.03em}";
	  css += ".pr__nt{font-size:11.5px;color:#8A92AC;text-align:center}";
	  css += ".pr--mark{gap:14px}";
	  css += ".pr__mk{display:flex;align-items:center;gap:14px;background:" + shade(acc,.62) + ";border-radius:14px;padding:18px}";
	  css += ".pr__mk svg{width:62px;height:62px;flex:none}";
	  css += ".pr__mk b{color:#fff;font-size:22px;letter-spacing:.01em;font-weight:600}";
	  css += ".pr__sw{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}";
	  css += ".pr__sw i{height:34px;border-radius:9px;display:block}";
	  css += ".pr__ty{display:flex;align-items:center;gap:14px;background:" + tint(acc,.95) + ";border-radius:12px;padding:12px 14px}";
	  css += ".pr__ty>b{font-size:30px;line-height:1;letter-spacing:-.03em;color:" + shade(acc,.2) + "}";
	  css += ".pr__ty span{font-size:12.5px;font-weight:600}.pr__ty em{display:block;font-style:normal;font-weight:400;font-size:11.5px;color:#8A92AC}";
	  /* The grid that closes the screen */
	  css += ".gd{padding:0 40px 26px}";
	  css += ".gd__h{display:flex;align-items:baseline;gap:12px;margin-bottom:14px}";
	  css += ".gd__h b{font-size:18px;letter-spacing:-.02em}";
	  css += ".gd__h span{font-size:12px;color:#8A92AC}";
	  css += ".tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}";
	  css += ".t{background:#fff;border:1px solid " + tint(acc,.87) + ";border-radius:14px;padding:12px}";
	  css += ".t i{display:block;height:48px;border-radius:10px;background:linear-gradient(140deg," + tint(acc,.84) + "," + tint(acc,.58) + ")}";
	  css += ".t b{display:block;margin-top:11px;font-size:13.5px;letter-spacing:-.01em}";
	  css += ".t span{display:block;margin-top:3px;font-size:11.5px;color:#8A92AC}";
	  css += ".t .ch{display:inline-block;margin-top:9px;font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px}";
	  css += ".ch-g{background:#E9F3EC;color:#3E8560}.ch-o{background:#FBF0E4;color:#A86A2E}";
	  css += ".ch-p{background:" + tint(acc,.9) + ";color:" + shade(acc,.22) + "}";
	  css += "@media (max-width:820px){.hero{grid-template-columns:1fr}.pn{display:none}.tiles{grid-template-columns:repeat(2,1fr)}}";

	  var nav = "";
	  for(i=0;i<m.nav.length;i++){ nav += '<span>' + esc(m.nav[i]) + '</span>'; }
	  var stats = "";
	  for(i=0;i<m.stats.length;i++){ stats += '<div><b>' + esc(m.stats[i][0]) + '</b><span>' + esc(m.stats[i][1]) + '</span></div>'; }
	  var tiles = "";
	  for(i=0;i<m.tiles.length;i++){
	    var t = m.tiles[i], chip = String(t[2]);
	    tiles += '<article class="t"><i></i><b>' + esc(t[0]) + '</b><span>' + esc(t[1]) + '</span>' +
	      '<span class="ch ch-' + chip.charAt(0) + '">' + esc(chip.slice(2)) + '</span></article>';
	  }

	  var b = '<div class="pg">';
	  b += '<header class="hd"><span class="lg"><i></i>' + esc(m.brand) + '</span><nav>' + nav + '</nav>';
	  b += '<span class="act">' + esc(m.action) + '</span></header>';
	  b += '<section class="hero"><div><h1>' + esc(m.h1) + '</h1><p>' + esc(m.lead) + '</p>';
	  b += '<div class="cta"><span>' + esc(m.cta[0]) + '</span><span>' + esc(m.cta[1]) + '</span></div>';
	  b += '<div class="st">' + stats + '</div></div>';
	  b += '<div class="pn"><div class="cap">' + esc(m.panelCap) + '</div>' + sitePanel(m.panel, acc) + '</div></section>';
	  b += '<section class="gd"><div class="gd__h"><b>' + esc(m.gridTitle) + '</b><span>' + esc(m.gridNote) + '</span></div>';
	  b += '<div class="tiles">' + tiles + '</div></section>';
	  b += '</div>';
	  return shell(css, b);
	}

	function demoPage(p){ return p.kind === "site" ? demoSite(p) : demoApp(p); }

	function initPortfolio(){
	  var grid = document.getElementById("wgrid");
	  if(!grid) return;
	  PROJECTS.forEach(function(p){
	    var b = document.createElement("button");
	    /* The size is a class and the hue is a custom property: the card knows
	       what it is and what colour it is, and the stylesheet does the rest. */
	    b.className = "proj proj--" + p.size;
	    b.type = "button";
	    b.style.setProperty("--h", p.hue);
	    b.innerHTML = '<div class="proj__vis">' + visual(p) + '</div>' +
	      '<div class="proj__txt"><span class="proj__tag">' + p.tag + '</span>' +
	      '<h3>' + p.t + '</h3><p>' + p.d + '</p>' +
	      '<span class="proj__go">Открыть в окне <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg></span></div>';
	    b.addEventListener("click", function(){ open(p) });
	    grid.appendChild(b);
	  });

	  var pv = document.getElementById("pv"), scr = document.getElementById("pvView"), url = document.getElementById("pvUrl"),
	      bar = document.getElementById("pvL"), tt = document.getElementById("pvT"), dd = document.getElementById("pvD");

	  function frameW(){
	    var v = parseFloat(getComputedStyle(scr).getPropertyValue("--fw"));
	    return (v && v > 0) ? v : 1180;
	  }
	  function fit(){
	    var f = scr.querySelector("iframe");
	    if(f) f.style.setProperty("--sc", (scr.clientWidth / frameW()));
	  }
	  Aura.onResize(fit);

	  /* ---- the overlay and the keyboard ---------------------------------
	     A modal that can be left behind by the Tab key is a modal in name only:
	     focus walks out of it into the page it is covering, where every stop is
	     invisible under the scrim and the visitor is typing into a page they
	     cannot see.

	     Everything focusable in here is inside .pv__box, and there is exactly one
	     of them once the frame is out of the tab order: the close button. That is
	     not a shortcut — the demo document is a depiction, nothing in it is
	     clickable, and its own links are rendered as spans for the same reason.
	     A trap that only ever has one stop still has to be written as a cycle,
	     because the frame is focusable when the case points at a real site.

	     The element that opened the overlay is remembered and given the focus
	     back on close, so closing returns the visitor to the card they came
	     from rather than to the top of the document. */
	  var opener = null;

	  /* ---- the page behind the scrim ------------------------------------
	     The keyboard trap below can only see keys that reach this document, and
	     a case that points at a real site puts a whole other document inside the
	     overlay: once focus is in that frame, Tab is handled by the frame, and
	     the stop after its last link is whatever comes next in *this* page —
	     a nav link or a form field under the scrim, invisible and focused.

	     No listener can fix that from the outside, so the fix is on the other
	     side: while the overlay is open, everything except the overlay is inert.
	     Inert content cannot be focused, cannot be clicked and cannot be reached
	     by Tab, so there is nothing behind the scrim for focus to land on
	     whatever happens inside the frame — and the trap catches the visitor on
	     the next Tab and brings them back to the close button.

	     Measured with a frame holding two links: without this, Tab ran
	     link → link → a button behind the scrim. With it: link → link → the
	     document itself → the close button.

	     Everything on `body` rather than a named list of three sections, so a
	     block added to the page later is sealed too. A browser too old for
	     `inert` keeps the trap, which is what it had before. */
	  function seal(on){
	    var kids = document.body.children;
	    for(var i = 0; i < kids.length; i++){
	      if(kids[i] === pv || kids[i].tagName === "SCRIPT") continue;
	      kids[i].inert = on;
	    }
	  }

	  function stops(){
	    return Aura.$$("button, [href], iframe, [tabindex]", pv).filter(function(el){
	      /* Laid out, and not deliberately skipped. The tabindex test cannot be
	         folded into the selector: an <iframe> matches `iframe` whether or not
	         it also carries tabindex="-1", and a frame that is not a stop must not
	         be counted as the last one — the cycle would hand the keyboard to an
	         element the browser refuses to focus, and Tab would fall through to
	         the page behind the scrim. */
	      return (el.offsetWidth || el.offsetHeight) && el.getAttribute("tabindex") !== "-1";
	    });
	  }

	  function trap(e){
	    if(e.key !== "Tab" || !pv.classList.contains("on")) return;
	    var list = stops();
	    if(!list.length) return;
	    var first = list[0], last = list[list.length - 1];
	    /* Focus outside the overlay altogether — the browser landed on the page
	       behind, or on the browser UI and back — is pulled in rather than
	       cycled. */
	    if(!pv.contains(document.activeElement)){ e.preventDefault(); first.focus(); return; }
	    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
	    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
	  }

	  function open(p){
	    opener = document.activeElement;
	    tt.textContent = p.t; dd.textContent = p.d + " · " + p.tag;
	    url.textContent = p.demo ? p.demo.replace(/^https?:\/\//, "") : ("aura-it.ru/cases/" + p.id);
	    var old = scr.querySelector("iframe"); if(old) old.remove();
	    var ph = scr.querySelector(".mb__ph"); if(ph) ph.remove();
	    bar.style.width = "12%";
	    var f = document.createElement("iframe");
	    f.style.setProperty("--sc", (scr.clientWidth / frameW()));
	    f.setAttribute("sandbox", "allow-scripts allow-same-origin");
	    f.setAttribute("loading", "lazy");
	    /* A generated demo is a picture of a product, so it is not a stop on the
	       way through the overlay. A real site is: it is somebody's page and the
	       visitor may want to read it with the keyboard. */
	    if(!p.demo) f.setAttribute("tabindex", "-1");
	    f.title = p.t;
	    var timer = null;
	    f.addEventListener("load", function(){ bar.style.width = "100%"; if(timer) clearTimeout(timer); setTimeout(function(){ bar.style.width = "0" }, 500); });
	    if(p.demo){
	      f.src = p.demo;
	      timer = setTimeout(function(){
	        if(!scr.querySelector(".mb__ph")){
	          var d = document.createElement("div");
	          d.className = "mb__ph";
	          d.innerHTML = "<div>Сайт запрещает встраивание в рамку.<br><a style='color:#84CEEB' target='_blank' rel='noopener' href='" + p.demo + "'>Открыть в новой вкладке</a></div>";
	          scr.appendChild(d);
	        }
	      }, 8000);
	    } else {
	      f.srcdoc = demoPage(p);
	    }
	    scr.appendChild(f);
	    pv.classList.add("on");
	    document.body.style.overflow = "hidden";
	    seal(true);
	    fit(); requestAnimationFrame(fit); setTimeout(fit, 120);
	    /* The close button, not the panel: a dialog whose own container takes the
	       focus reads out its whole contents before saying that anything can be
	       done, and here the one thing that can be done is leave. */
	    closeBtn.focus();
	    if(location.hash !== "#project/" + p.id) history.pushState(null, "", "#project/" + p.id);
	  }
	  function close(){
	    pv.classList.remove("on");
	    /* Before the focus is handed back: a card inside an inert section cannot
	       take it. */
	    seal(false);
	    document.body.style.overflow = "";
	    var f = scr.querySelector("iframe"); if(f) f.remove();
	    if(location.hash.indexOf("#project/") === 0) history.pushState(null, "", location.pathname);
	    /* Back to the card that opened it — unless that card is gone, in which
	       case the browser's own default is better than a guess. */
	    if(opener && document.contains(opener) && opener.focus) opener.focus();
	    opener = null;
	  }
	  var closeBtn = document.getElementById("pvX");
	  closeBtn.addEventListener("click", close);
	  pv.addEventListener("click", function(e){ if(e.target === pv) close() });
	  document.addEventListener("keydown", function(e){
	    if(e.key === "Escape" && pv.classList.contains("on")) close();
	    else trap(e);
	  });
	  function fromHash(){
	    var m = /^#project\/(.+)$/.exec(location.hash);
	    if(!m) return;
	    for(var i=0;i<PROJECTS.length;i++){ if(PROJECTS[i].id === m[1]){ open(PROJECTS[i]); return; } }
	  }
	  window.addEventListener("popstate", function(){ if(!location.hash) close(); else fromHash(); });
	  fromHash();
	}
	Aura.register("portfolio", initPortfolio);
})(window.Aura);
