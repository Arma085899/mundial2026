# MEXICO 2026 - Tracker de resultados (GitHub Pages)

## Arquitectura

```
wc2026/
├── index.html              # Resultados del dia / dashboard (resultado_en_vivo)
├── grupos.html             # Tabla de grupos (tabla_grupo)
├── partido.html            # Detalle de partido (detalle_de_partido) ?id=537852
├── calendario.html          # Calendario completo
├── bracket.html             # Eliminatorias
├── assets/
│   ├── js/
│   │   ├── data.js          # fetch + helpers compartidos
│   │   └── render.js         # funciones de render por vista
│   ├── css/
│   │   └── theme.css         # tokens del DESIGN.md
│   └── img/                  # logos de canales TV (vix, tudn, azteca)
├── data/
│   ├── matches.json          # TODOS los partidos (grupos + resultados del dia)
│   ├── standings.json        # Tablas de grupos
│   ├── bracket.json           # Eliminatorias R32 -> Final
│   └── config.json            # Equipos por grupo, canales TV, sedes (manual)
└── scripts/                   # NO se publica en Pages, vive en el servidor
    └── update-data.js         # corre con cron, llama a football-data.org
```

## Fuentes de datos (multi-fuente, no exclusivo)

No estamos casados con football-data.org. El script puede combinar varias
fuentes y usar la que tenga el dato mas completo para cada campo. Candidatas
a explorar EN EL SERVIDOR (este entorno no tiene acceso a estos dominios,
hay que probarlos alla):

1. **football-data.org** (ya tenemos API key)
   - `GET https://api.football-data.org/v4/competitions/WC/matches`
   - `GET https://api.football-data.org/v4/competitions/WC/standings`
   - Header: `X-Auth-Token: <KEY>`
   - Free tier: 10 req/min. Incluye el Mundial.
   - Limitacion conocida: el bracket R32 (formato 48 equipos) puede venir
     con huecos al inicio.

2. **worldcup26.ir** (rezarahiminia/worldcup2026, sin auth para lectura)
   - `GET https://worldcup26.ir/get/games`
   - `GET https://worldcup26.ir/get/groups`
   - `GET https://worldcup26.ir/get/teams`
   - `GET https://worldcup26.ir/get/stadiums`
   - Docs: https://worldcup26.ir/api-docs (Swagger)
   - Construido especificamente para el formato de 48 equipos / 104
     partidos / 16 estadios. Buen candidato para llenar huecos de
     estadios y bracket que falten en football-data.org.

3. **Otros candidatos a evaluar si los anteriores no alcanzan**
   - tonkabits/api-worldcup2026 (free/PRO, incluye webhooks de eventos)
   - Backends open-source tipo NestJS con dataset pre-cargado que incluye
     campo `broadcasts` (revisar si trae canales de TV utiles, aunque
     probablemente no cubra Mexico especificamente)

### Estrategia de merge

- Para cada partido, usar `football-data.org` como base (tiene live status
  confiable).
- Si `home_team`/`away_team` viene `null` (placeholder) en football-data.org
  pero `worldcup26.ir` ya tiene el equipo real para ese cruce, usar el de
  worldcup26.ir.
- Si football-data.org no tiene info de estadio/sede para un partido,
  completar con worldcup26.ir.
- `broadcast_mx` sigue siendo manual (ninguna API cubre TV Mexico) via
  `scripts/broadcast-overrides.json`.
- Documentar en `_meta.source` de cada JSON generado que fuentes se usaron
  ese ciclo (ej. `"source": "football-data.org+worldcup26.ir"`), util para
  debug.

### Tarea para Claude Code (servidor)

Antes de escribir el script final, probar en vivo:
- `curl https://worldcup26.ir/get/games | head -c 1000` -> ver shape real
- `curl https://worldcup26.ir/get/groups | head -c 1000`
- `curl -H "X-Auth-Token: <KEY>" https://api.football-data.org/v4/competitions/WC/matches?matchday=1 | head -c 1000`

Y decidir el mapeo final campo-a-campo segun lo que realmente devuelvan
(las respuestas de ejemplo en blogs pueden estar desactualizadas).

## Flujo de actualizacion (en el servidor, via Claude Code)

1. Cron cada 1-2 min durante partidos en vivo (cada 30-60 min fuera de eso).
2. `update-data.js`:
   - GET `https://api.football-data.org/v4/competitions/WC/matches`
     header `X-Auth-Token: <KEY>` (la key vive SOLO en el servidor, en `.env`)
   - GET `https://api.football-data.org/v4/competitions/WC/standings`
   - Transforma respuesta al formato de `matches.json` / `standings.json`
   - Para `bracket.json`: filtra por `stage` (ROUND_OF_32, ROUND_OF_16, etc.)
     Si el equipo aun no esta definido, dejar `team: null` y usar `placeholder`
     (ej "1A" = 1er lugar grupo A), igual que hace football-data.org.
   - **broadcast_mx**: NO viene de la API. Mantener un mapeo manual
     `match_id -> ["VIX","TUDN","AZTECA7"]` en un archivo separado
     (ej `scripts/broadcast-overrides.json`) y mergear al generar matches.json.
   - Escribe los JSON en `data/` y hace commit + push al repo.

## Reglas de status (campo `status`)

Valores que usa football-data.org y que el frontend debe mapear:
- `SCHEDULED` / `TIMED` -> "Por jugar" (mostrar hora)
- `IN_PLAY` / `PAUSED` -> "EN VIVO" (badge rojo/verde pulsante, mostrar `minute`)
- `FINISHED` -> "FT" (mostrar marcador final)
- `POSTPONED` / `SUSPENDED` / `CANCELLED` -> "Pospuesto/Cancelado"

## Notas de la API (free tier)

- Limite: 10 llamadas/minuto. El cron del servidor debe respetarlo
  (2 llamadas por ciclo = OK incluso cada 6 segundos, pero usar 1-2 min
  para no abusar).
- World Cup SI esta incluido en el free tier de football-data.org.
- Round of 32 (nuevo formato 48 equipos) puede venir con placeholders
  hasta que se jueguen los partidos de grupo que los definen.

## Identidad visual

Tokens en `DESIGN.md` ya provisto. Resumen rapido de uso:
- Fondo: `surface` / `surface-dim` (#0f131f)
- Acento "Mexico/Live": `secondary` verde (#43fc76) con glow
- Acento urgencia/Live badge: `tertiary-container` rojo (#d00033)
- Texto principal: `on-surface` (#dfe2f3)
- Tipografia: Anybody (titulos/scores), Hanken Grotesk (UI/datos)
