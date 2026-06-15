#!/usr/bin/env node
/**
 * MEXICO 2026 — Actualizador de datos
 * --------------------------------------------------------
 * Llama a football-data.org (competencia WC) y genera/actualiza:
 *   data/matches.json
 *   data/standings.json
 *
 * Requiere variable de entorno: FOOTBALL_DATA_TOKEN
 *
 * RATE LIMIT: football-data.org free tier = 10 req/min.
 * Este script hace:
 *   1 req -> /competitions/WC/matches      (todos los partidos)
 *   1 req -> /competitions/WC/standings    (tablas de grupo)
 *   N req -> /matches/{id}                 (goleadores/eventos),
 *            SOLO para partidos IN_PLAY, PAUSED o FINISHED en las
 *            ultimas 48h, limitado a MAX_DETAIL_FETCHES por corrida,
 *            con pausa entre llamadas para no exceder el limite.
 *
 * broadcast_mx:
 *   - Regla base: "VIX" para TODOS los partidos (ViX tiene los 104).
 *   - Overrides manuales en scripts/broadcast-overrides.json agregan
 *     canales de TV abierta (TUDN, AZTECA7) para partidos especificos
 *     (match_id -> array de codigos). Los overrides se SUMAN a la base,
 *     no la reemplazan, salvo que el override use formato objeto con
 *     "vix": false explicitamente (ver formato abajo).
 *
 * Uso local:
 *   FOOTBALL_DATA_TOKEN=xxxx node scripts/update-data.js
 */

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
const API_BASE = "https://api.football-data.org/v4";
const VENUES_SOURCE_URL = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";
const DATA_DIR = path.join(__dirname, "..", "data");
const OVERRIDES_PATH = path.join(__dirname, "broadcast-overrides.json");
const VENUE_OVERRIDES_PATH = path.join(__dirname, "venue-overrides.json");

// Cuantos partidos "en vivo o recientes" detallar por corrida (goleadores/eventos)
const MAX_DETAIL_FETCHES = 6;
// Pausa entre llamadas de detalle (ms) para no exceder 10 req/min
const DETAIL_FETCH_DELAY_MS = 6500;

if (!TOKEN) {
    console.error("ERROR: falta variable de entorno FOOTBALL_DATA_TOKEN");
    process.exit(1);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJSON(url) {
    const res = await fetch(url, {
        headers: { "X-Auth-Token": TOKEN }
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} en ${url}: ${body.slice(0, 300)}`);
    }
    return res.json();
}

function loadOverrides() {
    try {
        const raw = fs.readFileSync(OVERRIDES_PATH, "utf-8");
        const parsed = JSON.parse(raw);
        delete parsed._comment;
        return parsed;
    } catch {
        return {};
    }
}

/**
 * Calcula los canales de TV MX para un partido.
 * Regla base: VIX siempre incluido (los 104 partidos).
 * Overrides (scripts/broadcast-overrides.json) pueden:
 *  - array simple: ["TUDN","AZTECA7"]  -> se suma a VIX -> ["VIX","TUDN","AZTECA7"]
 *  - objeto: { "channels": ["TUDN"], "vix": false } -> excluye VIX si vix=false
 */
function resolveBroadcast(matchId, overrides) {
    const override = overrides[String(matchId)];
    const base = ["VIX"];

    if (!override) return base;

    if (Array.isArray(override)) {
        const merged = [...base, ...override];
        return [...new Set(merged)];
    }

    if (typeof override === "object") {
        let result = override.vix === false ? [] : [...base];
        if (Array.isArray(override.channels)) {
            result = [...result, ...override.channels];
        }
        return [...new Set(result)];
    }

    return base;
}

// Mapeo "ground" (openfootball) -> { venue: nombre del estadio, city: ciudad para mostrar }
// Basado en las 16 sedes oficiales del Mundial 2026.
const GROUND_TO_VENUE = {
    "Mexico City": { venue: "Estadio Azteca", city: "Ciudad de México" },
    "Guadalajara (Zapopan)": { venue: "Estadio Akron", city: "Zapopan, Jalisco" },
    "Monterrey (Guadalupe)": { venue: "Estadio BBVA", city: "Guadalupe, Nuevo León" },
    "Toronto": { venue: "BMO Field", city: "Toronto" },
    "Vancouver": { venue: "BC Place", city: "Vancouver" },
    "Atlanta": { venue: "Mercedes-Benz Stadium", city: "Atlanta" },
    "Boston (Foxborough)": { venue: "Gillette Stadium", city: "Foxborough, Massachusetts" },
    "Dallas (Arlington)": { venue: "AT&T Stadium", city: "Arlington, Texas" },
    "Houston": { venue: "NRG Stadium", city: "Houston" },
    "Kansas City": { venue: "Arrowhead Stadium", city: "Kansas City" },
    "Los Angeles (Inglewood)": { venue: "SoFi Stadium", city: "Inglewood, California" },
    "Miami (Miami Gardens)": { venue: "Hard Rock Stadium", city: "Miami Gardens, Florida" },
    "New York/New Jersey (East Rutherford)": { venue: "MetLife Stadium", city: "East Rutherford, New Jersey" },
    "Philadelphia": { venue: "Lincoln Financial Field", city: "Philadelphia" },
    "San Francisco Bay Area (Santa Clara)": { venue: "Levi's Stadium", city: "Santa Clara, California" },
    "Seattle": { venue: "Lumen Field", city: "Seattle" }
};

// Convierte fecha+hora local de openfootball ("2026-06-11", "20:00 UTC-6") a ISO UTC ("2026-06-12T02:00:00Z")
function toUtcISO(dateStr, timeStr) {
    const m = String(timeStr).match(/(\d+):(\d+)\s*UTC([+-]\d+)/);
    if (!m) return null;
    const [, hh, mm, offset] = m;
    const local = new Date(`${dateStr}T${hh.padStart(2, "0")}:${mm}:00Z`);
    local.setUTCHours(local.getUTCHours() - parseInt(offset, 10));
    return local.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Descarga openfootball/worldcup.json y construye un lookup
 * "utc_date exacto (ISO)" -> { venue, city }.
 * Esto funciona para los 104 partidos (fase de grupos y eliminacion),
 * ya que cada partido tiene un horario unico y openfootball mantiene
 * los nombres de equipo/placeholders actualizados conforme avanza el torneo.
 */
async function fetchVenueLookup() {
    try {
        const res = await fetch(VENUES_SOURCE_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const byUtcDate = new Map();
        for (const m of data.matches || []) {
            const iso = toUtcISO(m.date, m.time);
            if (!iso) continue;
            const groundInfo = GROUND_TO_VENUE[m.ground] || { venue: m.ground, city: null };
            byUtcDate.set(iso, groundInfo);
        }
        return byUtcDate;
    } catch (err) {
        console.warn("No se pudo obtener venues de openfootball/worldcup.json:", err.message);
        return null;
    }
}

function loadVenueOverrides() {
    try {
        const raw = fs.readFileSync(VENUE_OVERRIDES_PATH, "utf-8");
        const parsed = JSON.parse(raw);
        delete parsed._comment;
        return parsed;
    } catch {
        return {};
    }
}

/**
 * Intenta llenar venue/city para un partido usando (en orden):
 *  1. Override manual por match_id (scripts/venue-overrides.json)
 *  2. Lookup exacto por utc_date en openfootball/worldcup.json
 */
function resolveVenue(match, venueLookup, venueOverrides) {
    if (match.venue) return; // ya viene de football-data.org

    const override = venueOverrides[String(match.id)];
    if (override) {
        match.venue = override.venue || null;
        match.city = override.city || null;
        return;
    }

    if (!venueLookup) return;

    const info = venueLookup.get(match.utc_date);
    if (info) {
        match.venue = info.venue;
        match.city = info.city;
    }
}


function mapTeam(t) {
    if (!t || !t.id) return { id: null, name: "Por definir", short_name: t?.tla || "?", tla: t?.tla || "?", crest: null };
    return {
        id: t.id,
        name: t.name,
        short_name: t.shortName || t.tla,
        tla: t.tla,
        crest: t.crest || null
    };
}

// Extrae ciudad del nombre de venue si viene como "Estadio X, Ciudad" o similar.
// football-data.org normalmente solo da el nombre del estadio en `venue`.
function splitVenue(venueRaw) {
    if (!venueRaw) return { venue: null, city: null };
    const parts = venueRaw.split(",").map(s => s.trim());
    if (parts.length >= 2) {
        return { venue: parts[0], city: parts.slice(1).join(", ") };
    }
    return { venue: venueRaw, city: null };
}

function mapMatch(m, overrides) {
    const score = m.score || {};
    const fullTime = score.fullTime || {};
    const halfTime = score.halfTime || {};
    const { venue, city } = splitVenue(m.venue);

    return {
        id: m.id,
        matchday: m.matchday ?? null,
        stage: m.stage || "GROUP_STAGE",
        group: m.group || null,
        status: m.status,
        utc_date: m.utcDate,
        local_date: null,
        minute: m.minute ?? null,
        venue,
        city,
        home_team: mapTeam(m.homeTeam),
        away_team: mapTeam(m.awayTeam),
        score: {
            home: fullTime.home ?? null,
            away: fullTime.away ?? null,
            halftime_home: halfTime.home ?? null,
            halftime_away: halfTime.away ?? null
        },
        scorers: [], // se rellena con detalle si aplica (ver enrichWithDetails)
        broadcast_mx: resolveBroadcast(m.id, overrides),
        is_inaugural: false
    };
}

function mapStandings(standingsResponse) {
    const groups = [];
    for (const comp of standingsResponse.standings || []) {
        if (comp.type !== "TOTAL") continue; // ignorar HOME/AWAY breakdowns
        const groupName = comp.group || comp.stage || "Group";

        // football-data.org puede no enviar `position` confiable en jornada 0.
        // Ordenamos manualmente por: puntos desc, diferencia de gol desc, goles a favor desc.
        const sorted = [...comp.table].sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
            return b.goalsFor - a.goalsFor;
        });

        groups.push({
            group: groupName,
            matchday: null,
            standings: sorted.map((row, idx) => ({
                position: idx + 1,
                team: mapTeam(row.team),
                played: row.playedGames,
                won: row.won,
                draw: row.draw,
                lost: row.lost,
                goals_for: row.goalsFor,
                goals_against: row.goalsAgainst,
                goal_difference: row.goalDifference,
                points: row.points,
                qualified: idx < 2 // top 2 directos; los mejores terceros se resuelven aparte
            }))
        });
    }
    return groups;
}

/**
 * Enriquece partidos relevantes (en vivo, pausados, o recien finalizados)
 * con goleadores via /matches/{id}. Limitado por MAX_DETAIL_FETCHES.
 */
async function enrichWithDetails(matches) {
    const now = Date.now();
    const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;

    const candidates = matches.filter(m => {
        if (m.status === "IN_PLAY" || m.status === "PAUSED") return true;
        if (m.status === "FINISHED") {
            const matchTime = new Date(m.utc_date).getTime();
            return (now - matchTime) < FORTY_EIGHT_HOURS;
        }
        return false;
    }).slice(0, MAX_DETAIL_FETCHES);

    if (candidates.length === 0) {
        console.log("Sin partidos en vivo/recientes para detallar.");
        return;
    }

    console.log(`Obteniendo detalle (goleadores) de ${candidates.length} partido(s)...`);

    for (let i = 0; i < candidates.length; i++) {
        const match = candidates[i];
        try {
            const detail = await fetchJSON(`${API_BASE}/matches/${match.id}`);
            match.scorers = extractScorers(detail);
            console.log(`  - Partido ${match.id}: ${match.scorers.length} gol(es) registrados`);
        } catch (err) {
            console.warn(`  - Partido ${match.id}: no se pudo obtener detalle (${err.message})`);
        }

        if (i < candidates.length - 1) {
            await sleep(DETAIL_FETCH_DELAY_MS);
        }
    }
}

function extractScorers(detail) {
    const goals = detail.goals || [];
    const homeId = detail.homeTeam?.id;

    return goals
        .filter(g => g.type === "REGULAR" || g.type === "PENALTY" || g.type === "OWN" || !g.type)
        .map(g => ({
            team: g.team?.id === homeId ? "home" : "away",
            player: g.scorer?.name || "Desconocido",
            minute: g.minute ?? null
        }));
}

// Etiquetas legibles para cada stage de eliminacion directa
const STAGE_LABELS = {
    LAST_32: "Ronda de 32",
    LAST_16: "Octavos de Final",
    QUARTER_FINALS: "Cuartos de Final",
    SEMI_FINALS: "Semifinales",
    THIRD_PLACE: "Tercer Lugar",
    FINAL: "Final"
};

/**
 * Genera la estructura de bracket.json a partir de los partidos de
 * matches.json cuyo stage no es GROUP_STAGE.
 */
function buildBracket(matches) {
    const order = ["LAST_32", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE", "FINAL"];
    const stages = order.map(stage => {
        const stageMatches = matches
            .filter(m => m.stage === stage)
            .sort((a, b) => new Date(a.utc_date) - new Date(b.utc_date))
            .map(m => ({
                id: m.id,
                slot: `${stage}-${m.id}`,
                utc_date: m.utc_date,
                venue: m.venue,
                city: m.city,
                status: m.status,
                home: {
                    placeholder: m.home_team.id ? null : "Por definir",
                    team: m.home_team.id ? m.home_team : null
                },
                away: {
                    placeholder: m.away_team.id ? null : "Por definir",
                    team: m.away_team.id ? m.away_team : null
                },
                score: { home: m.score.home, away: m.score.away },
                broadcast_mx: m.broadcast_mx
            }));

        return { stage, label: STAGE_LABELS[stage] || stage, matches: stageMatches };
    });

    return stages;
}

/**
 * Calcula un mapa TLA -> "active" | "eliminated" basado en:
 *  - standings.json: si played === 3, posiciones 3-4 quedan eliminadas
 *    (salvo override manual "advances_as_third" para mejores terceros).
 *  - matches.json (knockout, FINISHED): el equipo perdedor queda eliminado.
 *    En empates con definicion por penales, football-data.org normalmente
 *    refleja el marcador final (incluyendo penales) en score.home/away,
 *    por lo que un score igual en partido FINISHED de knockout no deberia
 *    ocurrir; si ocurre, no se marca a ninguno como eliminado (ambiguo).
 */
function computeTeamStatus(standingsGroups, matches, quinielaOverrides) {
    const status = new Map(); // tla -> "active" | "eliminated"

    for (const group of standingsGroups) {
        for (const row of group.standings) {
            const tla = row.team?.tla;
            if (!tla) continue;

            if (row.played === 3) {
                const advancesAsThird = quinielaOverrides?.advances_as_third?.includes(tla);
                if (row.position <= 2 || advancesAsThird) {
                    status.set(tla, "active");
                } else {
                    status.set(tla, "eliminated");
                }
            } else {
                status.set(tla, "active");
            }
        }
    }

    // Knockout: marcar perdedores como eliminados
    for (const m of matches) {
        if (m.stage === "GROUP_STAGE") continue;
        if (m.status !== "FINISHED") continue;
        const { home, away } = m.score;
        if (home == null || away == null || home === away) continue; // empate sin definir -> ambiguo, no tocar

        const loserTla = home > away ? m.away_team?.tla : m.home_team?.tla;
        const winnerTla = home > away ? m.home_team?.tla : m.away_team?.tla;
        if (loserTla && loserTla !== "?") status.set(loserTla, "eliminated");
        if (winnerTla && winnerTla !== "?") status.set(winnerTla, "active");
    }

    return status;
}

/**
 * Actualiza data/quiniela.json: para cada equipo de cada participante,
 * si su TLA aparece en teamStatus, actualiza el campo "status".
 * No modifica nombres, frases ni la estructura general del archivo.
 */
function updateQuinielaStatuses(teamStatus) {
    const quinielaPath = path.join(DATA_DIR, "quiniela.json");
    let quiniela;
    try {
        quiniela = JSON.parse(fs.readFileSync(quinielaPath, "utf-8"));
    } catch (err) {
        console.warn("No se pudo leer quiniela.json, se omite actualizacion de estatus:", err.message);
        return;
    }

    let changed = 0;
    for (const participant of quiniela.participants || []) {
        for (const team of participant.teams || []) {
            const newStatus = teamStatus.get(team.tla);
            if (newStatus && newStatus !== team.status) {
                team.status = newStatus;
                changed++;
            }
        }
    }

    if (changed > 0) {
        quiniela._meta = quiniela._meta || {};
        quiniela._meta.updated_at = new Date().toISOString();
        const autoNote = "El campo 'status' se actualiza automaticamente segun standings/resultados; ver scripts/quiniela-overrides.json para casos especiales (terceros lugares).";
        if (!quiniela._meta.note || !quiniela._meta.note.includes("se actualiza automaticamente")) {
            quiniela._meta.note = autoNote;
        }
        fs.writeFileSync(quinielaPath, JSON.stringify(quiniela, null, 2));
        console.log(`quiniela.json actualizado: ${changed} equipo(s) cambiaron de estatus`);
    } else {
        console.log("quiniela.json: sin cambios de estatus");
    }
}

function loadQuinielaOverrides() {
    try {
        const raw = fs.readFileSync(path.join(__dirname, "quiniela-overrides.json"), "utf-8");
        const parsed = JSON.parse(raw);
        delete parsed._comment;
        return parsed;
    } catch {
        return {};
    }
}


async function main() {
    const overrides = loadOverrides();
    const venueOverrides = loadVenueOverrides();
    const quinielaOverrides = loadQuinielaOverrides();
    const now = new Date().toISOString();
    const sources = ["football-data.org"];

    console.log("Obteniendo partidos...");
    const matchesResp = await fetchJSON(`${API_BASE}/competitions/WC/matches`);
    const matches = (matchesResp.matches || []).map(m => mapMatch(m, overrides));

    console.log("Obteniendo sedes (openfootball/worldcup.json)...");
    const venueLookup = await fetchVenueLookup();
    if (venueLookup) sources.push("openfootball/worldcup.json");

    let filled = 0;
    for (const match of matches) {
        const hadVenue = !!match.venue;
        resolveVenue(match, venueLookup, venueOverrides);
        if (!hadVenue && match.venue) filled++;
    }
    console.log(`Sedes completadas: ${filled}/${matches.length}`);

    await enrichWithDetails(matches);

    fs.writeFileSync(
        path.join(DATA_DIR, "matches.json"),
        JSON.stringify({
            _meta: { source: sources.join("+"), updated_at: now },
            matches
        }, null, 2)
    );
    console.log(`matches.json actualizado (${matches.length} partidos)`);

    // bracket.json: generado a partir de los partidos de eliminacion directa en matches.json
    const bracketStages = buildBracket(matches);
    fs.writeFileSync(
        path.join(DATA_DIR, "bracket.json"),
        JSON.stringify({
            _meta: { source: "matches.json (derivado)", updated_at: now },
            stages: bracketStages
        }, null, 2)
    );
    console.log("bracket.json actualizado");

    console.log("Obteniendo standings...");
    let standingsGroups = [];
    try {
        const standingsResp = await fetchJSON(`${API_BASE}/competitions/WC/standings`);
        standingsGroups = mapStandings(standingsResp);

        fs.writeFileSync(
            path.join(DATA_DIR, "standings.json"),
            JSON.stringify({
                _meta: { source: sources.join("+"), updated_at: now },
                groups: standingsGroups
            }, null, 2)
        );
        console.log(`standings.json actualizado (${standingsGroups.length} grupos)`);
    } catch (err) {
        console.warn("No se pudo obtener standings (puede no estar disponible aun):", err.message);
    }

    // Actualizar estatus de equipos en quiniela.json (activo/eliminado)
    if (standingsGroups.length > 0) {
        const teamStatus = computeTeamStatus(standingsGroups, matches, quinielaOverrides);
        updateQuinielaStatuses(teamStatus);
    } else {
        console.log("Sin standings disponibles, se omite actualizacion de quiniela.json");
    }

    console.log("Listo.");
}

main().catch(err => {
    console.error("Error fatal:", err);
    process.exit(1);
});
