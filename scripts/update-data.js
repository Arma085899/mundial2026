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
const DATA_DIR = path.join(__dirname, "..", "data");
const OVERRIDES_PATH = path.join(__dirname, "broadcast-overrides.json");

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

async function main() {
    const overrides = loadOverrides();
    const now = new Date().toISOString();
    const sources = ["football-data.org"];

    console.log("Obteniendo partidos...");
    const matchesResp = await fetchJSON(`${API_BASE}/competitions/WC/matches`);
    const matches = (matchesResp.matches || []).map(m => mapMatch(m, overrides));

    await enrichWithDetails(matches);

    fs.writeFileSync(
        path.join(DATA_DIR, "matches.json"),
        JSON.stringify({
            _meta: { source: sources.join("+"), updated_at: now },
            matches
        }, null, 2)
    );
    console.log(`matches.json actualizado (${matches.length} partidos)`);

    console.log("Obteniendo standings...");
    try {
        const standingsResp = await fetchJSON(`${API_BASE}/competitions/WC/standings`);
        const groups = mapStandings(standingsResp);

        fs.writeFileSync(
            path.join(DATA_DIR, "standings.json"),
            JSON.stringify({
                _meta: { source: sources.join("+"), updated_at: now },
                groups
            }, null, 2)
        );
        console.log(`standings.json actualizado (${groups.length} grupos)`);
    } catch (err) {
        console.warn("No se pudo obtener standings (puede no estar disponible aun):", err.message);
    }

    console.log("Listo.");
}

main().catch(err => {
    console.error("Error fatal:", err);
    process.exit(1);
});
