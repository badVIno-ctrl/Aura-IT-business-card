/* The code panel
   ---------------------------------------------------------------------------
   A depiction of an editor with somebody working in it. Four files, each a real
   algorithm rather than a CRUD sketch, opened part-written: the first screen is
   already there and the caret continues from the middle of the file, which is
   why the line numbers start at 128 or 342 and not at 1.

   THREE THINGS THAT USED TO BE DONE THE HARD WAY

   1. Highlighting was hand-written token arrays — every line of every snippet
      spelled out as [["key","export "],["fn","syncOrders"],…]. Twelve lines
      were bearable; seventy are not, and every edit risked a token boundary
      landing inside a word. There is a small lexer here instead, so the
      snippets below are plain source text and adding a fifth file is a matter
      of pasting one.
   2. Every keystroke rebuilt the whole panel's markup. Finished lines are now
      cached as a string and only the line under the caret is re-rendered.
   3. Nothing followed the caret, so a long file typed itself off the bottom
      edge. The panel scrolls now — on the compositor, one transform, no
      per-frame work.

   The typing is a chain of timeouts rather than a frame loop: it is a series of
   deadlines, and a deadline does not need sixty wake-ups a second to notice it
   has passed. It stops entirely while the section is off screen, and a visitor
   who asked for less motion gets the finished file with no caret at all. */
(function (Aura) {
	"use strict";

	/* ---- languages -------------------------------------------------------
	   Only what the lexer cannot infer: the comment marker, the reserved words
	   and the primitive type names. Anything else is decided by shape — a name
	   followed by "(" is a call, CamelCase is a type, ALL_CAPS is a constant. */
	var LANGS = {
		ts: {
			com: "//",
			kw: "export function const let var return if else for of in while break continue class private public constructor new type interface get set void this null undefined true false readonly async await yield throw try catch typeof instanceof delete",
			ty: "number string boolean any unknown never object symbol bigint"
		},
		py: {
			com: "#",
			kw: "from import class def return if elif else for in while not and or is None True False self continue break pass lambda as with yield async await raise try except finally global nonlocal del assert",
			ty: "float int str bool list dict tuple set bytes"
		},
		go: {
			com: "//",
			kw: "package import func var const type struct interface return if else for range switch case default break continue go defer chan select map nil true false",
			ty: "float64 float32 int int8 int16 int32 int64 uint uint8 uint64 byte rune string bool complex64 complex128 error"
		},
		rs: {
			com: "//",
			kw: "use pub fn let mut struct impl for in if else match while loop return self crate mod as where type const static enum trait dyn ref move true false unsafe",
			ty: "u8 u16 u32 u64 usize i8 i16 i32 i64 isize f32 f64 bool str char"
		}
	};

	/* Built once: a lookup per language beats a regexp alternation of eighty
	   words evaluated per identifier. */
	(function prepare(){
		for(var k in LANGS){
			if(!Object.prototype.hasOwnProperty.call(LANGS, k)) continue;
			var L = LANGS[k], set = {}, list = L.kw.split(" "), i;
			for(i = 0; i < list.length; i++) set[list[i]] = "key";
			list = L.ty.split(" ");
			for(i = 0; i < list.length; i++) set[list[i]] = "ty";
			L.words = set;
		}
	})();

	var OP = "+-*/%<>=!&|^~?:";
	var PUN = "()[]{},;.@#$\\";

	function isDigit(c){ return c >= "0" && c <= "9"; }
	function isWordStart(c){ return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_"; }
	function isWord(c){ return isWordStart(c) || isDigit(c); }

	/* One line in, a list of [class, text] pairs out. Line-by-line is safe here
	   because none of the snippets uses a block comment or a multi-line string —
	   a deliberate constraint, since honouring those would mean carrying lexer
	   state across a boundary the caret is allowed to stop in the middle of. */
	function lex(line, L){
		var out = [], n = line.length, i = 0, prev = "", j, c;

		function push(cls, text){ out.push([cls, text]); if(text.trim()) prev = text; }

		while(i < n){
			c = line.charAt(i);

			/* runs of whitespace: carried as punctuation, which has no colour of
			   its own for a space anyway, and keeps the token list flat */
			if(c === " " || c === "\t"){
				j = i;
				while(j < n && (line.charAt(j) === " " || line.charAt(j) === "\t")) j++;
				out.push(["pun", line.slice(i, j)]);
				i = j;
				continue;
			}

			if(line.substr(i, L.com.length) === L.com){
				push("com", line.slice(i));
				break;
			}

			if(c === '"' || c === "'" || c === "`"){
				j = i + 1;
				while(j < n){
					if(line.charAt(j) === "\\"){ j += 2; continue; }
					if(line.charAt(j) === c){ j++; break; }
					j++;
				}
				push("str", line.slice(i, j));
				i = j;
				continue;
			}

			if(isDigit(c) || (c === "." && isDigit(line.charAt(i + 1)))){
				j = i;
				while(j < n && /[0-9a-fA-FxX._]/.test(line.charAt(j))) j++;
				/* an exponent's sign belongs to the number, not to the arithmetic
				   around it: 1e-3 is one token and "1e", "-", "3" is three */
				if(/[eE]$/.test(line.slice(i, j)) && /[+-]/.test(line.charAt(j))){
					j++;
					while(j < n && isDigit(line.charAt(j))) j++;
				}
				/* a trailing dot is member access on a literal, not part of it */
				while(j > i + 1 && line.charAt(j - 1) === ".") j--;
				push("num", line.slice(i, j));
				i = j;
				continue;
			}

			if(isWordStart(c)){
				j = i;
				while(j < n && isWord(line.charAt(j))) j++;
				var word = line.slice(i, j);
				var after = line.charAt(j);
				var cls = L.words[word];
				if(!cls){
					if(after === "(") cls = "fn";                          /* a call         */
					else if(prev === "@") cls = "fn";                      /* a decorator    */
					else if(prev === ".") cls = "var";                     /* a member       */
					else if(/^[A-Z][A-Za-z0-9_]*$/.test(word) && /[a-z]/.test(word)) cls = "ty";
					else cls = "var";
				}
				push(cls, word);
				i = j;
				continue;
			}

			if(OP.indexOf(c) > -1){
				j = i;
				while(j < n && OP.indexOf(line.charAt(j)) > -1) j++;
				push("op", line.slice(i, j));
				i = j;
				continue;
			}

			push(PUN.indexOf(c) > -1 ? "pun" : "var", c);
			i++;
		}
		return out;
	}

	/* ---- the files -------------------------------------------------------
	   `from` is where the caret picks up: everything above it is already on the
	   screen in the first frame. `at` is the real line number of the first line
	   shown, so the gutter reads like the middle of a file. */
	var FILES = [
		{
			name: "route/astar.ts", lang: "ts", at: 128, from: 16,
			src: [
				"// Маршрут по карте проходимости: A* с приоритетной очередью.",
				"// Стоимость шага — вес клетки плюс штраф за поворот, поэтому",
				"// путь выходит коротким и без «лестниц» на ровных местах.",
				"",
				"import { Frontier } from \"./frontier\";",
				"",
				"export type Cell = { x: number; y: number };",
				"",
				"// dx, dy и длина шага: диагональ дороже прямой в корень из двух.",
				"const STEPS: ReadonlyArray<[number, number, number]> = [",
				"  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],",
				"  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2],",
				"  [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],",
				"];",
				"",
				"const TURN_PENALTY = 0.35;",
				"",
				"export function route(w: number, h: number, cost: Float32Array,",
				"                      from: Cell, to: Cell): Cell[] {",
				"  const n = w * h;",
				"  const g = new Float64Array(n).fill(Infinity);",
				"  const prev = new Int32Array(n).fill(-1);",
				"  const open = new Frontier(n);",
				"  const start = from.y * w + from.x;",
				"  const goal = to.y * w + to.x;",
				"",
				"  // Октильная оценка — та же метрика, что и у шагов выше.",
				"  // Возьми евклидову, и оценка перестанет быть допустимой:",
				"  // A* начнёт срезать углы и вернёт не самый дешёвый путь.",
				"  const rest = (i: number): number => {",
				"    const dx = Math.abs((i % w) - to.x);",
				"    const dy = Math.abs((i - i % w) / w - to.y);",
				"    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);",
				"  };",
				"",
				"  g[start] = 0;",
				"  open.add(rest(start), start);",
				"",
				"  while (open.size > 0) {",
				"    const cur = open.take();",
				"    if (cur === goal) break;",
				"    const cx = cur % w, cy = (cur - cx) / w;",
				"",
				"    for (const [dx, dy, step] of STEPS) {",
				"      const nx = cx + dx, ny = cy + dy;",
				"      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;",
				"",
				"      const next = ny * w + nx;",
				"      const weight = cost[next];",
				"      if (weight <= 0) continue;          // непроходимая клетка",
				"",
				"      // Штраф за поворот. Без него маршрут идёт ступеньками",
				"      // там, где ровная линия стоит ровно столько же.",
				"      const back = prev[cur];",
				"      const straight = back < 0 || (cx - back % w === dx &&",
				"        cy - (back - back % w) / w === dy);",
				"      const total = g[cur] + step * weight +",
				"        (straight ? 0 : TURN_PENALTY);",
				"      if (total >= g[next]) continue;",
				"",
				"      g[next] = total;",
				"      prev[next] = cur;",
				"      open.add(total + rest(next), next);",
				"    }",
				"  }",
				"",
				"  if (prev[goal] < 0 && goal !== start) return [];",
				"",
				"  const path: Cell[] = [];",
				"  for (let i = goal; i !== -1; i = prev[i]) {",
				"    path.push({ x: i % w, y: (i - i % w) / w });",
				"  }",
				"  return path.reverse();",
				"}"
			]
		},
		{
			name: "sensors/kalman.py", lang: "py", at: 214, from: 15,
			src: [
				"# Сглаживание показаний датчика: фильтр Калмана с моделью",
				"# постоянной скорости. Состояние x = [значение, скорость];",
				"# измеряем только значение, скорость берётся из истории.",
				"",
				"from dataclasses import dataclass, field",
				"",
				"",
				"@dataclass",
				"class Kalman:",
				"    process_var: float = 1e-3   # доверие к модели",
				"    sensor_var: float = 4e-2    # доверие к датчику",
				"    x: list = field(default_factory=lambda: [0.0, 0.0])",
				"    P: list = field(default_factory=lambda: [[1.0, 0.0],",
				"                                             [0.0, 1.0]])",
				"",
				"    def predict(self, dt: float) -> None:",
				"        # x <- F x, где F = [[1, dt], [0, 1]]",
				"        self.x[0] += self.x[1] * dt",
				"        p00, p01 = self.P[0]",
				"        p10, p11 = self.P[1]",
				"        # P <- F P F^T + Q. Q взята как непрерывный белый шум по",
				"        # ускорению — отсюда третья степень dt в левом углу.",
				"        q = self.process_var",
				"        self.P[0][0] = (p00 + dt * (p01 + p10) + dt * dt * p11",
				"                        + q * dt ** 3 / 3.0)",
				"        self.P[0][1] = p01 + dt * p11 + q * dt * dt / 2.0",
				"        self.P[1][0] = p10 + dt * p11 + q * dt * dt / 2.0",
				"        self.P[1][1] = p11 + q * dt",
				"",
				"    def update(self, z: float) -> float:",
				"        # H = [1, 0], поэтому вся коррекция сводится к скалярам:",
				"        # невязка, её дисперсия и два коэффициента усиления.",
				"        y = z - self.x[0]",
				"        s = self.P[0][0] + self.sensor_var",
				"        k0 = self.P[0][0] / s",
				"        k1 = self.P[1][0] / s",
				"        self.x[0] += k0 * y",
				"        self.x[1] += k1 * y",
				"        p00, p01 = self.P[0]",
				"        self.P[0][0] = p00 - k0 * p00",
				"        self.P[0][1] = p01 - k0 * p01",
				"        self.P[1][0] -= k1 * p00",
				"        self.P[1][1] -= k1 * p01",
				"        return self.x[0]",
				"",
				"    def gate(self, z: float, sigmas: float = 3.0) -> bool:",
				"        # Отбраковка выброса до коррекции. Один сорванный отсчёт",
				"        # иначе разгонит оценку скорости, и фильтр будет минуту",
				"        # догонять реальность вместо того, чтобы её показывать.",
				"        s = self.P[0][0] + self.sensor_var",
				"        return (z - self.x[0]) ** 2 <= sigmas * sigmas * s",
				"",
				"",
				"def smooth(samples: list, dt: float = 0.5) -> tuple:",
				"    f = Kalman()",
				"    f.x[0] = samples[0]",
				"    out, dropped = [], 0",
				"    for z in samples:",
				"        f.predict(dt)",
				"        if not f.gate(z):",
				"            dropped += 1",
				"            out.append(f.x[0])   # держим прогноз: датчик врёт",
				"            continue",
				"        out.append(f.update(z))",
				"    return out, dropped",
				"",
				"",
				"def drift(samples: list, dt: float = 0.5) -> float:",
				"    # Скорость на выходе фильтра — это и есть тренд показаний:",
				"    # медленный уход датчика виден задолго до аварийного порога.",
				"    f = Kalman(process_var=4e-4)",
				"    f.x[0] = samples[0]",
				"    for z in samples:",
				"        f.predict(dt)",
				"        f.update(z)",
				"    return f.x[1] * 3600.0 / dt"
			]
		},
		{
			name: "spectrum/fft.go", lang: "go", at: 96, from: 14,
			src: [
				"// Спектр вибрации: окно Ханна, БПФ и поиск пиков по параболе.",
				"package spectrum",
				"",
				"import \"math\"",
				"",
				"// Peak — составляющая спектра: частота в герцах и амплитуда.",
				"type Peak struct {",
				"\tHz  float64",
				"\tAmp float64",
				"}",
				"",
				"// window сглаживает края кадра: без окна разрыв на стыке",
				"// размазывается по спектру и топит настоящие пики.",
				"func window(frame []float64) []complex128 {",
				"\tn := len(frame)",
				"\tout := make([]complex128, n)",
				"\tfor i, v := range frame {",
				"\t\tk := 2 * math.Pi * float64(i) / float64(n-1)",
				"\t\tout[i] = complex(v*(0.5-0.5*math.Cos(k)), 0)",
				"\t}",
				"\treturn out",
				"}",
				"",
				"// transform — итеративный Кули — Тьюки на месте. Длина обязана",
				"// быть степенью двух: кадр набирается по 1024 отсчёта.",
				"func transform(a []complex128) {",
				"\tn := len(a)",
				"\t// Перестановка по обращённым битам индекса.",
				"\tfor i, j := 1, 0; i < n; i++ {",
				"\t\tbit := n >> 1",
				"\t\tfor ; j&bit != 0; bit >>= 1 {",
				"\t\t\tj ^= bit",
				"\t\t}",
				"\t\tj |= bit",
				"\t\tif i < j {",
				"\t\t\ta[i], a[j] = a[j], a[i]",
				"\t\t}",
				"\t}",
				"\tfor size := 2; size <= n; size <<= 1 {",
				"\t\tang := -2 * math.Pi / float64(size)",
				"\t\tstep := complex(math.Cos(ang), math.Sin(ang))",
				"\t\tfor i := 0; i < n; i += size {",
				"\t\t\tw := complex(1, 0)",
				"\t\t\tfor j := 0; j < size/2; j++ {",
				"\t\t\t\tu := a[i+j]",
				"\t\t\t\tv := a[i+j+size/2] * w",
				"\t\t\t\ta[i+j] = u + v",
				"\t\t\t\ta[i+j+size/2] = u - v",
				"\t\t\t\tw *= step",
				"\t\t\t}",
				"\t\t}",
				"\t}",
				"}",
				"",
				"// Peaks возвращает локальные максимумы выше порога floor.",
				"func Peaks(frame []float64, rate, floor float64) []Peak {",
				"\tspec := window(frame)",
				"\ttransform(spec)",
				"\thalf := len(spec) / 2",
				"\tmag := make([]float64, half)",
				"\tfor i := 0; i < half; i++ {",
				"\t\tre, im := real(spec[i]), imag(spec[i])",
				"\t\tmag[i] = 2 * math.Hypot(re, im) / float64(len(frame))",
				"\t}",
				"\tfound := make([]Peak, 0, 8)",
				"\tbin := rate / float64(len(frame))",
				"\tfor i := 1; i < half-1; i++ {",
				"\t\tlo, hi := mag[i-1], mag[i+1]",
				"\t\tif mag[i] < floor || mag[i] < lo || mag[i] <= hi {",
				"\t\t\tcontinue",
				"\t\t}",
				"\t\t// Вершина параболы через три отсчёта: сдвиг в долях",
				"\t\t// бина. Без него частота округляется до сетки, и",
				"\t\t// третья гармоника перестаёт быть кратной основной.",
				"\t\td := 0.5 * (lo - hi) / (lo - 2*mag[i] + hi)",
				"\t\thz := (float64(i) + d) * bin",
				"\t\tfound = append(found, Peak{Hz: hz, Amp: mag[i]})",
				"\t}",
				"\treturn found",
				"}"
			]
		},
		{
			name: "sched/edf.rs", lang: "rs", at: 342, from: 17,
			src: [
				"// Планировщик заданий по ближайшему сроку (EDF): при загрузке",
				"// выше единицы сроки будут срываться при любом порядке.",
				"use std::cmp::Ordering;",
				"use std::collections::BinaryHeap;",
				"",
				"#[derive(Debug, Clone, PartialEq, Eq)]",
				"pub struct Job {",
				"    pub id: u32,",
				"    pub ready_at: u64,   // мс от начала смены",
				"    pub due_at: u64,",
				"    pub cost: u64,       // сколько мс работы требует задание",
				"}",
				"",
				"// BinaryHeap в стандартной библиотеке — max-heap, поэтому",
				"// порядок переворачивается: «больше» значит «раньше по сроку».",
				"impl Ord for Job {",
				"    fn cmp(&self, other: &Self) -> Ordering {",
				"        other.due_at.cmp(&self.due_at)",
				"            .then_with(|| other.cost.cmp(&self.cost))",
				"            .then_with(|| self.id.cmp(&other.id))",
				"    }",
				"}",
				"",
				"impl PartialOrd for Job {",
				"    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {",
				"        Some(self.cmp(other))",
				"    }",
				"}",
				"",
				"#[derive(Debug, Default)]",
				"pub struct Plan {",
				"    pub order: Vec<u32>,",
				"    pub late: Vec<u32>,",
				"    pub idle: u64,",
				"}",
				"",
				"// Прогон одной машины. На каждом шаге берём задание с ближайшим",
				"// сроком из готовых; если готовых нет — перескакиваем время",
				"// вперёд до следующего поступления и записываем простой.",
				"pub fn schedule(mut jobs: Vec<Job>, start: u64) -> Plan {",
				"    jobs.sort_by_key(|j| j.ready_at);",
				"",
				"    let mut ready: BinaryHeap<Job> = BinaryHeap::new();",
				"    let mut plan = Plan::default();",
				"    let mut now = start;",
				"    let mut next = 0usize;",
				"",
				"    while next < jobs.len() || !ready.is_empty() {",
				"        while next < jobs.len() && jobs[next].ready_at <= now {",
				"            ready.push(jobs[next].clone());",
				"            next += 1;",
				"        }",
				"        let job = match ready.pop() {",
				"            Some(j) => j,",
				"            None => {",
				"                let jump = jobs[next].ready_at - now;",
				"                plan.idle += jump;",
				"                now += jump;",
				"                continue;",
				"            }",
				"        };",
				"        now += job.cost;",
				"        if now > job.due_at {",
				"            plan.late.push(job.id);",
				"        }",
				"        plan.order.push(job.id);",
				"    }",
				"    plan",
				"}",
				"",
				"// Тест допустимости для периодических заданий: при загрузке",
				"// выше единицы срыв сроков гарантирован любым планировщиком.",
				"pub fn feasible(periods: &[u64], costs: &[u64]) -> bool {",
				"    let load: f64 = periods",
				"        .iter()",
				"        .zip(costs)",
				"        .map(|(p, c)| *c as f64 / *p as f64)",
				"        .sum();",
				"    load <= 1.0",
				"}"
			]
		}
	];
	function esc(s){
		return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	}

	/* Tokenised once per file, on first use, and kept. */
	function tokens(file){
		if(file.toks) return file.toks;
		var L = LANGS[file.lang], out = [], i;
		for(i = 0; i < file.src.length; i++) out.push(lex(file.src[i], L));
		file.toks = out;
		return out;
	}

	function html(toks){
		var s = "", i;
		for(i = 0; i < toks.length; i++){
			s += '<span class="tk-' + toks[i][0] + '">' + esc(toks[i][1]) + "</span>";
		}
		return s;
	}

	/* The first `count` characters of a line, keeping every token whole and
	   cutting only the one the caret is inside. */
	function partial(toks, count){
		var s = "", used = 0, i, text;
		for(i = 0; i < toks.length; i++){
			text = toks[i][1];
			if(used + text.length <= count){
				s += '<span class="tk-' + toks[i][0] + '">' + esc(text) + "</span>";
				used += text.length;
				continue;
			}
			s += '<span class="tk-' + toks[i][0] + '">' + esc(text.slice(0, count - used)) + "</span>";
			break;
		}
		return s;
	}

	function initTerminal(){
		var code = document.getElementById("code");
		if(!code) return;

		var gut = document.getElementById("gut");
		var tabs = document.getElementById("tabs");
		var body = document.getElementById("tbody");
		var scroll = document.getElementById("tscroll");
		var copy = document.getElementById("copy");
		var note = document.getElementById("copyNote");
		var term = document.getElementById("term");

		var fi = 0;          /* file index                          */
		var li = 0;          /* line the caret is on                */
		var ci = 0;          /* characters typed on that line       */
		var done = "";       /* markup of every finished line       */
		var live = true;     /* section is on screen                */
		var timer = 0;
		var lh = 21, rows = 12, sy = -1;

		/* ---- geometry ----
		   Read from the stylesheet rather than duplicated here, so the mobile
		   type scale needs no second copy of these numbers in JavaScript. */
		function measure(){
			var cs = getComputedStyle(code);
			lh = parseFloat(cs.lineHeight) || 21;
			var pad = parseFloat(cs.paddingTop) || 0;
			rows = Math.max(4, Math.floor((body.clientHeight - pad * 2) / lh));
		}

		/* Keeps the caret three lines off the bottom edge. Only ever written
		   when the value changes — assigning the same offset again restarts the
		   transition and the panel judders. */
		function follow(){
			var y = Math.max(0, (li - (rows - 3)) * lh);
			if(y === sy) return;
			sy = y;
			scroll.style.setProperty("--sy", y.toFixed(1));
		}

		function gutter(count){
			var file = FILES[fi], s = "", i;
			for(i = 0; i < count; i++) s += (file.at + i) + (i < count - 1 ? "\n" : "");
			gut.textContent = s;
		}

		function paint(){
			var toks = tokens(FILES[fi]);
			if(li >= toks.length){ code.innerHTML = done; return; }
			code.innerHTML = done + partial(toks[li], ci) + '<span class="caret"></span>';
		}

		function schedule(ms, fn){
			clearTimeout(timer);
			timer = setTimeout(fn || tick, ms);
		}

		function tick(){
			/* Off screen: stop typing, but keep one cheap heartbeat so scrolling
			   back to the section resumes where it stopped. */
			if(!live){ schedule(240); return; }

			var toks = tokens(FILES[fi]);
			var line = toks[li] || [];
			var len = 0, i;
			for(i = 0; i < line.length; i++) len += line[i][1].length;

			if(ci < len){
				/* A whole line in roughly the same time regardless of its length,
				   so a dense line does not stall the panel. */
				ci = Math.min(len, ci + Math.max(1, Math.round(len / 24)));
				paint();
				schedule(16 + Math.random() * 26);
				return;
			}

			done += html(line) + "\n";
			li++;
			ci = 0;
			gutter(li + 1);
			follow();

			if(li >= toks.length){
				paint();
				schedule(3600, function(){ openFile((fi + 1) % FILES.length); });
				return;
			}
			paint();
			/* A blank line is a pause in the writing, not a keystroke. */
			schedule(line.length ? 84 : 150);
		}

		/* Opens a file part-written: everything above `from` is already there. */
		function openFile(i, instant){
			fi = i;
			var file = FILES[fi], toks = tokens(file), k;
			var head = instant ? toks.length : Math.min(file.from, toks.length);

			done = "";
			for(k = 0; k < head; k++) done += html(toks[k]) + "\n";
			li = head;
			ci = 0;
			sy = -1;

			Array.prototype.forEach.call(tabs.children, function(c, n){
				c.classList.toggle("on", n === fi);
				c.setAttribute("aria-selected", n === fi ? "true" : "false");
			});

			gutter(Math.min(li + 1, toks.length));
			/* A file opened whole is opened at the top. Letting follow() run here
			   would park the window on the closing brace, which is the one part
			   of a file nobody wants to be shown first. */
			if(instant){ sy = 0; scroll.style.setProperty("--sy", "0"); }
			else follow();
			paint();
			if(!instant) schedule(320);
		}

		FILES.forEach(function(file, i){
			var b = document.createElement("button");
			b.className = "tab" + (i === 0 ? " on" : "");
			b.type = "button";
			/* The tab shows the file name and carries the path in its tooltip,
			   the way an editor does: four full paths do not fit the strip at
			   the width this panel gets on a desktop layout, and a tab clipped
			   mid-word reads as a bug rather than as a scrollable strip. */
			b.textContent = file.name.replace(/^.*\//, "");
			b.title = file.name;
			b.setAttribute("role", "tab");
			b.setAttribute("aria-selected", i === 0 ? "true" : "false");
			b.addEventListener("click", function(){ openFile(i, Aura.RM); });
			tabs.appendChild(b);
		});
		tabs.setAttribute("role", "tablist");

		/* ---- the copy control ----------------------------------------------
		   This did not work on a phone, and the reason was the fallback rather
		   than the modern path.

		   `navigator.clipboard` is not there to be relied on. It is absent in
		   any non-secure context, and it is absent or permanently rejecting in
		   several of the in-app browsers a link from a chat opens in - which,
		   for a site whose main call to action is a Telegram handle, is where a
		   large share of phone visitors actually arrive. So the fallback is not
		   a legacy nicety here; on a phone it is frequently the only path.

		   And the fallback could not work as written. A textarea parked at
		   `left:-9999px` is off screen, and mobile WebKit will not put a
		   selection into a field it considers off screen - `select()` succeeds,
		   the selection is empty, and `execCommand` copies nothing while
		   reporting that it did. Three more details matter on the same path:
		   `readonly` alone does not make a field selectable on iOS without
		   `contentEditable`, `select()` is ignored there in favour of
		   `setSelectionRange`, and a font under 16px makes the page zoom to the
		   field before the copy happens.

		   What is here now: the field is a 1px box inside the viewport, it is
		   both readonly and contenteditable, it is selected by range and by
		   index, and the caller's own selection and focus are put back
		   afterwards so nothing the visitor had highlighted is lost.

		   ORDER. The modern call goes first, because it is the one that does not
		   touch the document. If it rejects we do not give up: the legacy path
		   is tried immediately, inside the same task, so the transient user
		   activation from the tap is still valid.

		   AND IF BOTH FAIL there is still an answer rather than an apology. The
		   snippet is handed to the visitor in a sheet with the text already
		   selected, which is exactly what a long-press needs. */

		/* The one-frame field the legacy path selects from. */
		function legacyCopy(text){
			if(!document.queryCommandSupported && !document.execCommand) return false;
			var ta = document.createElement("textarea");
			ta.value = text;
			ta.setAttribute("readonly", "");
			ta.setAttribute("aria-hidden", "true");
			ta.setAttribute("tabindex", "-1");
			/* contentEditable is what makes it selectable under iOS; the rest is
			   a field that is genuinely on screen and genuinely invisible. */
			ta.contentEditable = "true";
			ta.style.cssText =
				"position:fixed;top:0;left:0;width:1px;height:1px;" +
				"margin:0;padding:0;border:0;outline:0;resize:none;" +
				"background:transparent;color:transparent;caret-color:transparent;" +
				"font-size:16px;line-height:1;z-index:-1;" +
				"-webkit-user-select:text;user-select:text;-webkit-text-size-adjust:100%";
			document.body.appendChild(ta);

			var sel = window.getSelection ? window.getSelection() : null;
			var saved = (sel && sel.rangeCount) ? sel.getRangeAt(0) : null;
			var prev = document.activeElement;
			var ok = false;
			try {
				if(sel){
					var range = document.createRange();
					range.selectNodeContents(ta);
					sel.removeAllRanges();
					sel.addRange(range);
				}
				/* focus before the range on iOS, index after it everywhere. */
				try { ta.focus({ preventScroll: true }); } catch(e){ ta.focus(); }
				ta.setSelectionRange(0, text.length);
				ok = document.execCommand("copy");
			} catch(e){ ok = false; }

			if(sel){
				sel.removeAllRanges();
				if(saved) sel.addRange(saved);
			}
			document.body.removeChild(ta);
			if(prev && prev.focus){
				try { prev.focus({ preventScroll: true }); } catch(e){}
			}
			return ok;
		}

		/* ---- the sheet, for when the clipboard is not ours to write to ------
		   Not a message saying the copy failed - the visitor still wants the
		   code. The snippet arrives in a real field, already selected, so the
		   long-press menu opens on it with one press. It lives inside .term so
		   it inherits the panel's own dark surface in either theme. */
		var sheet = null;
		function closeSheet(){
			if(!sheet) return;
			sheet.el.classList.remove("on");
			document.removeEventListener("keydown", sheet.key);
			var el = sheet.el, back = sheet.back;
			sheet = null;
			setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 220);
			if(back && back.focus){ try { back.focus({ preventScroll: true }); } catch(e){} }
		}
		function openSheet(text){
			if(!term) return;
			closeSheet();
			var el = document.createElement("div");
			el.className = "term__sheet";
			el.setAttribute("role", "dialog");
			el.setAttribute("aria-modal", "true");
			el.setAttribute("aria-label", "Скопировать код вручную");

			var hint = document.createElement("p");
			hint.className = "term__sheet-hint";
			hint.textContent = "Браузер не даёт записать в буфер. Текст уже выделен — долгое нажатие и «Копировать».";

			var field = document.createElement("textarea");
			field.className = "term__sheet-src";
			field.value = text;
			field.setAttribute("readonly", "");
			field.setAttribute("spellcheck", "false");
			field.setAttribute("autocapitalize", "off");
			field.setAttribute("autocorrect", "off");

			var shut = document.createElement("button");
			shut.type = "button";
			shut.className = "term__sheet-x";
			shut.setAttribute("aria-label", "Закрыть");
			shut.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
				'<path d="M6 6l12 12M18 6L6 18"/></svg>';
			shut.addEventListener("click", closeSheet);

			el.appendChild(shut);
			el.appendChild(hint);
			el.appendChild(field);
			term.appendChild(el);

			var key = function(e){
				if(e.key === "Escape" || e.key === "Esc"){ e.preventDefault(); closeSheet(); }
			};
			document.addEventListener("keydown", key);
			sheet = { el: el, key: key, back: copy };

			/* One frame, so the entrance transition has a state to leave from. */
			requestAnimationFrame(function(){
				el.classList.add("on");
				try {
					field.focus({ preventScroll: true });
					field.setSelectionRange(0, text.length);
				} catch(e){}
			});
		}

		if(copy){
			/* A note that has to be readable for a moment longer than the icon
			   takes to flip back, and one timer so a second tap restarts it
			   rather than stacking on the first. */
			var noteTimer = 0;
			var said = function(ok){
				clearTimeout(noteTimer);
				copy.classList.toggle("done", !!ok);
				note.textContent = ok
					? "Скопировано"
					: "Нужно скопировать вручную";
				note.classList.add("on");
				noteTimer = setTimeout(function(){
					copy.classList.remove("done");
					note.classList.remove("on");
				}, ok ? 1800 : 2600);
			};

			copy.addEventListener("click", function(){
				var text = FILES[fi].src.join("\n");

				var fallback = function(){
					if(legacyCopy(text)){ said(true); return; }
					said(false);
					openSheet(text);
				};

				if(navigator.clipboard && navigator.clipboard.writeText){
					try {
						navigator.clipboard.writeText(text).then(
							function(){ said(true); },
							fallback
						);
						return;
					} catch(e){ /* a synchronous throw is the same failure */ }
				}
				fallback();
			});
		}

		measure();
		Aura.onResize(function(){ measure(); sy = -1; follow(); });

		/* Reduced motion: the file is simply open, at the top, with no caret and
		   no rotation between tabs. Everything else on this panel still works. */
		if(Aura.RM){
			openFile(0, true);
			return;
		}

		if(term && "IntersectionObserver" in window){
			new IntersectionObserver(function(en){ live = en[0].isIntersecting; },
				{ threshold: .12 }).observe(term);
		}
		/* A hidden tab should not be typing into a panel nobody can see. */
		document.addEventListener("visibilitychange", function(){
			if(document.hidden) clearTimeout(timer);
			else schedule(240);
		});

		openFile(0);
	}

	Aura.register("terminal", initTerminal);
})(window.Aura);
