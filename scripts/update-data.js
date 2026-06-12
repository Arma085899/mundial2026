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
 * broadcast_mx se mantiene via scripts/broadcast-overrides.json
 * (mapeo manual match_id -> ["VIX","TUDN","AZTECA7"])
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

if (!TOKEN) {
    console.error("ERROR: falta variable de entorno FOOTBALL_DATA_TOKEN");
    process.exit(1);
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
        return JSON.parse(raw);
    } catch {
        return {}; // sin overrides aun
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

function mapMatch(m, overrides) {
    const score = m.score || {};
    const fullTime = score.fullTime || {};
    const halfTime = score.halfTime || {};

    return {
        id: m.id,
        matchday: m.matchday ?? null,
        stage: m.stage || "GROUP_STAGE",
        group: m.group || null,
        status: m.status,
        utc_date: m.utcDate,
        local_date: null, // el frontend calcula hora local
        minute: m.minute ?? null,
        venue: m.venue || null,
        city: null, // football-data.org no siempre trae ciudad separada
        home_team: mapTeam(m.homeTeam),
        away_team: mapTeam(m.awayTeam),
        score: {
            home: fullTime.home ?? null,
            away: fullTime.away ?? null,
            halftime_home: halfTime.home ?? null,
            halftime_away: halfTime.away ?? null
        },
        scorers: [], // requiere endpoint de match individual; se deja vacio por ahora
        broadcast_mx: overrides[m.id] || [],
        is_inaugural: false // se puede marcar manualmente en overrides si se desea
    };
}

function mapStandings(standingsResponse) {
    const groups = [];
    for (const comp of standingsResponse.standings || []) {
        if (comp.type !== "TOTAL") continue; // ignorar HOME/AWAY breakdowns
        const groupName = comp.group || comp.stage || "Group";
        groups.push({
            group: groupName,
            matchday: null,
            standings: comp.table.map(row => ({
                position: row.position,
                team: mapTeam(row.team),
                played: row.playedGames,
                won: row.won,
                draw: row.draw,
                lost: row.lost,
                goals_for: row.goalsFor,
                goals_against: row.goalsAgainst,
                goal_difference: row.goalDifference,
                points: row.points,
                qualified: row.position <= 2 // top 2 de cada grupo, ajustar si formato 48 equipos cambia esto
            }))
        });
    }
    return groups;
}

async function main() {
    const overrides = loadOverrides();
    const now = new Date().toISOString();
    const sources = ["football-data.org"];

    console.log("Obteniendo partidos...");
    const matchesResp = await fetchJSON(`${API_BASE}/competitions/WC/matches`);
    const matches = (matchesResp.matches || []).map(m => mapMatch(m, overrides));

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
