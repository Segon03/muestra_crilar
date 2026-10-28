// Fondo animado de la pantalla de inicio: insectos de estilo animé que vuelan por la pantalla.
// Son SVG en línea (sin imágenes) y se mueven con la API de animaciones web; se detienen al abrir la cámara.

const TRAZO = '#1d1233';

const mariposa = (c1, c2, c3) => `
<svg viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <linearGradient id="g{id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
  </defs>
  ${['izq', 'der'].map((l) => `
  <g class="ala ${l}"><g ${l === 'der' ? 'transform="matrix(-1 0 0 1 100 0)"' : ''}>
    <path d="M49 47C40 18 10 4 6 28c-2 15 18 24 43 24z" fill="url(#g{id})" stroke="${TRAZO}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M49 53C28 52 8 64 18 82c9 13 27-6 31-28z" fill="url(#g{id})" stroke="${TRAZO}" stroke-width="2.4" stroke-linejoin="round"/>
    <circle cx="24" cy="28" r="6" fill="${c3}" opacity=".9"/><circle cx="26" cy="72" r="4" fill="${c3}" opacity=".9"/>
    <path d="M14 22c4-8 14-12 22-8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".6"/>
  </g></g>`).join('')}
  <path d="M49 33C44 22 40 18 36 16M51 33c5-11 9-15 13-17" fill="none" stroke="${TRAZO}" stroke-width="1.8" stroke-linecap="round"/>
  <ellipse cx="50" cy="52" rx="3.6" ry="18" fill="#2b1a4a" stroke="${TRAZO}" stroke-width="1.6"/>
  <circle cx="50" cy="33" r="4.4" fill="#2b1a4a" stroke="${TRAZO}" stroke-width="1.6"/>
  <circle cx="48.6" cy="32" r="1.3" fill="#fff"/>
</svg>`;

const libelula = (c1, c2) => `
<svg viewBox="0 0 100 100" aria-hidden="true">
  ${[['izq', ''], ['der', 'transform="matrix(-1 0 0 1 100 0)"']].map(([l, t]) => `
  <g class="ala ${l}" style="transform-origin:50px 34px"><g ${t}>
    <path d="M47 32C34 16 8 14 4 22c-2 7 24 14 43 12z" fill="${c2}" fill-opacity=".55" stroke="${TRAZO}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M47 38C32 36 10 44 12 52c3 6 26 0 35-11z" fill="${c2}" fill-opacity=".45" stroke="${TRAZO}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M12 22l28 8M16 49l26-9" stroke="#fff" stroke-width="1.2" opacity=".7"/>
  </g></g>`).join('')}
  <path d="M50 30c-3 0-4 4-4 8l1 46c0 4 2 8 3 8s3-4 3-8l1-46c0-4-1-8-4-8z" fill="${c1}" stroke="${TRAZO}" stroke-width="2"/>
  <path d="M47 50h6M47.4 58h5.2M47.8 66h4.4M48.2 74h3.6" stroke="${TRAZO}" stroke-width="1.5" opacity=".7"/>
  <circle cx="50" cy="26" r="6" fill="${c1}" stroke="${TRAZO}" stroke-width="2"/>
  <circle cx="47.5" cy="24.5" r="2.2" fill="#fff"/><circle cx="52.5" cy="24.5" r="2.2" fill="#fff"/>
</svg>`;

const escarabajo = (c1, c2) => `
<svg viewBox="0 0 100 100" aria-hidden="true">
  ${[['izq', ''], ['der', 'transform="matrix(-1 0 0 1 100 0)"']].map(([l, t]) => `
  <g class="ala ${l}" style="transform-origin:50px 44px"><g ${t}>
    <path d="M48 46C36 30 14 28 8 40c-3 8 14 16 40 14z" fill="#e8f6ff" fill-opacity=".6" stroke="${TRAZO}" stroke-width="1.8"/>
  </g></g>`).join('')}
  <path d="M38 64l-12 6M38 54l-14-2M62 64l12 6M62 54l14-2M40 44l-10-8M60 44l10-8" stroke="${TRAZO}" stroke-width="2.4" stroke-linecap="round"/>
  <ellipse cx="50" cy="60" rx="17" ry="25" fill="${c1}" stroke="${TRAZO}" stroke-width="2.4"/>
  <path d="M50 36v48" stroke="${TRAZO}" stroke-width="1.8"/>
  <path d="M38 48c2-8 8-11 11-11M62 48c-2-8-8-11-11-11" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".55"/>
  <ellipse cx="42" cy="66" rx="4" ry="9" fill="${c2}" opacity=".55"/>
  <path d="M42 30c0-6 3-9 8-9s8 3 8 9c0 3-3 5-8 5s-8-2-8-5z" fill="#2a1d3d" stroke="${TRAZO}" stroke-width="2"/>
  <path d="M44 22l-6-9M56 22l6-9" stroke="${TRAZO}" stroke-width="2" stroke-linecap="round"/>
</svg>`;

const abeja = () => `
<svg viewBox="0 0 100 100" aria-hidden="true">
  ${[['izq', ''], ['der', 'transform="matrix(-1 0 0 1 100 0)"']].map(([l, t]) => `
  <g class="ala rapida ${l}" style="transform-origin:50px 46px"><g ${t}>
    <ellipse cx="30" cy="38" rx="20" ry="11" transform="rotate(-25 30 38)" fill="#fff" fill-opacity=".7" stroke="${TRAZO}" stroke-width="1.8"/>
  </g></g>`).join('')}
  <ellipse cx="50" cy="62" rx="15" ry="26" fill="#ffd23f" stroke="${TRAZO}" stroke-width="2.4"/>
  <path d="M36 58c9 4 19 4 28 0M35 70c10 5 20 5 30 0M38 82c8 4 16 4 24 0" fill="none" stroke="${TRAZO}" stroke-width="5" stroke-linecap="round"/>
  <path d="M50 87l0 8" stroke="${TRAZO}" stroke-width="3" stroke-linecap="round"/>
  <circle cx="50" cy="36" r="10" fill="#ffd23f" stroke="${TRAZO}" stroke-width="2.4"/>
  <circle cx="46" cy="34" r="2.6" fill="${TRAZO}"/><circle cx="54" cy="34" r="2.6" fill="${TRAZO}"/>
  <circle cx="45.3" cy="33.2" r=".9" fill="#fff"/><circle cx="53.3" cy="33.2" r=".9" fill="#fff"/>
  <path d="M45 27l-5-9M55 27l5-9" stroke="${TRAZO}" stroke-width="2" stroke-linecap="round"/>
</svg>`;

const ESPECIES = [
  { svg: () => mariposa('#ff9ccf', '#8e6bff', '#fff3a8'), tam: 84 },
  { svg: () => mariposa('#7be0ff', '#2f5bff', '#e8fbff'), tam: 92 },
  { svg: () => mariposa('#ffe07a', '#ff7b54', '#fff'), tam: 76 },
  { svg: () => libelula('#2ee6c8', '#8ff4ff'), tam: 104 },
  { svg: () => libelula('#ff7ab6', '#ffd1ec'), tam: 90 },
  { svg: () => escarabajo('#27d17f', '#d9ffb8'), tam: 62 },
  { svg: () => escarabajo('#6a7bff', '#c9d1ff'), tam: 56 },
  { svg: abeja, tam: 48 },
];

const aleatorio = (a, b) => a + Math.random() * (b - a);
let contador = 0;
let animaciones = [];

function insecto(contenedor, esp, ancho, alto, quieto) {
  const nodo = document.createElement('div');
  nodo.className = 'insecto';
  nodo.innerHTML = esp.svg().replaceAll('{id}', 'i' + ++contador);
  nodo.style.width = nodo.style.height = Math.round(esp.tam * aleatorio(0.8, 1.15)) + 'px';
  contenedor.append(nodo);
  const medio = esp.tam / 2;
  // recorrido con varios puntos; el insecto mira hacia donde avanza
  const n = 7;
  const puntos = Array.from({ length: n }, () => [aleatorio(-0.1, 1.1) * ancho - medio, aleatorio(-0.1, 1.1) * alto - medio]);
  puntos.push(puntos[0]);
  const marcos = puntos.map(([x, y], i) => {
    const [sx, sy] = puntos[Math.min(i + 1, n)];
    const ang = (Math.atan2(sy - y, sx - x) * 180) / Math.PI + 90;
    return { transform: `translate(${x}px,${y}px) rotate(${ang}deg)`, offset: i / n };
  });
  if (quieto) { nodo.style.transform = marcos[0].transform; return; }
  const a = nodo.animate(marcos, { duration: aleatorio(26000, 52000), iterations: Infinity, delay: -aleatorio(0, 40000), easing: 'ease-in-out' });
  animaciones.push(a);
  // aleteo con velocidad propia
  const v = aleatorio(0.8, 1.3);
  nodo.style.setProperty('--aleteo', `${(0.34 / v).toFixed(2)}s`);
}

function luciernagas(contenedor, ancho, alto, cantidad, quieto) {
  for (let i = 0; i < cantidad; i++) {
    const p = document.createElement('i');
    p.className = 'luciernaga';
    p.style.left = aleatorio(2, 98) + '%';
    p.style.top = aleatorio(2, 98) + '%';
    p.style.setProperty('--d', aleatorio(2.5, 6).toFixed(1) + 's');
    p.style.setProperty('--r', aleatorio(0, 6).toFixed(1) + 's');
    if (quieto) p.style.animation = 'none';
    contenedor.append(p);
  }
}

export function iniciarFondo(contenedor) {
  if (!contenedor || !contenedor.animate) return;
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ancho = contenedor.clientWidth || innerWidth, alto = contenedor.clientHeight || innerHeight;
  const cantidad = ancho < 600 ? 9 : 14;
  luciernagas(contenedor, ancho, alto, ancho < 600 ? 14 : 24, quieto);
  for (let i = 0; i < cantidad; i++) insecto(contenedor, ESPECIES[i % ESPECIES.length], ancho, alto, quieto);
}

export function detenerFondo(contenedor) {
  animaciones.forEach((a) => a.cancel());
  animaciones = [];
  contenedor?.replaceChildren();
}
