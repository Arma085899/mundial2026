/* =========================================================
   MEXICO 2026 — Shared config & data layer
   ========================================================= */

// Tailwind config shared across all pages (matches DESIGN.md tokens)
window.WC26_TAILWIND_CONFIG = {
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                "on-surface-variant": "#c3c5d9",
                "secondary": "#43fc76",
                "surface-bright": "#353946",
                "tertiary": "#ffb3b3",
                "surface-tint": "#b6c4ff",
                "on-secondary": "#003912",
                "on-background": "#dfe2f3",
                "secondary-fixed": "#69ff87",
                "primary-fixed-dim": "#b6c4ff",
                "inverse-surface": "#dfe2f3",
                "surface-variant": "#313442",
                "on-error": "#690005",
                "on-primary-container": "#e3e6ff",
                "on-tertiary-fixed": "#400009",
                "outline-variant": "#434656",
                "on-tertiary": "#680014",
                "tertiary-fixed": "#ffdad9",
                "on-tertiary-container": "#ffe0df",
                "tertiary-container": "#d00033",
                "surface-container-high": "#262a37",
                "on-primary-fixed-variant": "#0039b3",
                "primary-fixed": "#dce1ff",
                "outline": "#8d90a2",
                "inverse-on-surface": "#2c303d",
                "on-primary-fixed": "#001551",
                "surface-container-highest": "#313442",
                "primary": "#b6c4ff",
                "on-surface": "#dfe2f3",
                "secondary-container": "#00de5e",
                "on-primary": "#002780",
                "error-container": "#93000a",
                "on-secondary-container": "#005c22",
                "primary-container": "#0055ff",
                "surface-dim": "#0f131f",
                "surface-container-lowest": "#0a0e1a",
                "on-secondary-fixed-variant": "#00531e",
                "tertiary-fixed-dim": "#ffb3b3",
                "inverse-primary": "#004dea",
                "background": "#0f131f",
                "surface-container": "#1b1f2c",
                "error": "#ffb4ab",
                "on-tertiary-fixed-variant": "#920021",
                "surface-container-low": "#171b28",
                "on-error-container": "#ffdad6",
                "on-secondary-fixed": "#002108",
                "secondary-fixed-dim": "#17e462",
                "surface": "#0f131f"
            },
            borderRadius: {
                "DEFAULT": "0.125rem",
                "lg": "0.25rem",
                "xl": "0.5rem",
                "full": "0.75rem"
            },
            spacing: {
                "unit": "4px",
                "xl": "40px",
                "gutter": "16px",
                "margin-desktop": "64px",
                "sm": "8px",
                "margin-mobile": "16px",
                "lg": "24px",
                "md": "16px",
                "xs": "4px"
            },
            fontFamily: {
                "display-lg": ["Anybody"],
                "body-md": ["Hanken Grotesk"],
                "headline-lg": ["Anybody"],
                "label-bold": ["Hanken Grotesk"],
                "headline-xl": ["Anybody"],
                "score-display": ["Anybody"],
                "body-lg": ["Hanken Grotesk"],
                "headline-lg-mobile": ["Anybody"],
                "label-sm": ["Hanken Grotesk"]
            },
            fontSize: {
                "display-lg": ["64px", { lineHeight: "1.1", letterSpacing: "-0.04em", fontWeight: "800" }],
                "body-md": ["16px", { lineHeight: "1.5", fontWeight: "400" }],
                "headline-lg": ["32px", { lineHeight: "1.2", fontWeight: "700" }],
                "label-bold": ["14px", { lineHeight: "1.2", fontWeight: "700" }],
                "headline-xl": ["48px", { lineHeight: "1.2", fontWeight: "700" }],
                "score-display": ["40px", { lineHeight: "1", letterSpacing: "0.05em", fontWeight: "800" }],
                "body-lg": ["18px", { lineHeight: "1.6", fontWeight: "400" }],
                "headline-lg-mobile": ["24px", { lineHeight: "1.2", fontWeight: "700" }],
                "label-sm": ["12px", { lineHeight: "1.2", fontWeight: "500" }]
            }
        }
    }
};

/* =========================================================
   Data fetching
   ========================================================= */

const WC26 = {
    DATA_BASE: "./data",

    async fetchJSON(name) {
        try {
            const res = await fetch(`${this.DATA_BASE}/${name}.json?_=${Date.now()}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (err) {
            console.error(`No se pudo cargar ${name}.json`, err);
            return null;
        }
    },

    getMatches() { return this.fetchJSON("matches"); },
    getStandings() { return this.fetchJSON("standings"); },
    getBracket() { return this.fetchJSON("bracket"); },
    getConfig() { return this.fetchJSON("config"); },

    /* =====================================================
       Formatting helpers
       ===================================================== */

    // Status -> { label, badgeClass }
    statusInfo(match) {
        switch (match.status) {
            case "IN_PLAY":
            case "PAUSED":
                return { label: `EN VIVO ${match.minute != null ? match.minute + "'" : ""}`.trim(), badge: "badge-live pulse-live" };
            case "FINISHED":
                return { label: "FT", badge: "badge-finished" };
            case "POSTPONED":
                return { label: "POSPUESTO", badge: "badge-finished" };
            case "SUSPENDED":
                return { label: "SUSPENDIDO", badge: "badge-finished" };
            case "CANCELLED":
                return { label: "CANCELADO", badge: "badge-finished" };
            default: { // SCHEDULED / TIMED
                const d = new Date(match.utc_date);
                const time = d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Mexico_City" });
                return { label: time, badge: "badge-scheduled" };
            }
        }
    },

    isLive(match) {
        return match.status === "IN_PLAY" || match.status === "PAUSED";
    },

    formatScore(match) {
        if (match.score.home == null || match.score.away == null) return "VS";
        return `${match.score.home} - ${match.score.away}`;
    },

    // Group matches by their local calendar date (YYYY-MM-DD) using Mexico City TZ
    groupByDate(matches) {
        const groups = {};
        for (const m of matches) {
            const d = new Date(m.utc_date);
            const key = d.toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }); // YYYY-MM-DD
            (groups[key] = groups[key] || []).push(m);
        }
        return groups;
    },

    formatDateHeading(dateKey) {
        const d = new Date(dateKey + "T12:00:00");
        const str = d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Mexico_City" });
        return str.charAt(0).toUpperCase() + str.slice(1);
    },

    // Render broadcast chips HTML
    broadcastChips(codes) {
        if (!codes || !codes.length) return "";
        const map = {
            VIX: { cls: "chip-vix", label: "VIX" },
            TUDN: { cls: "chip-tudn", label: "TUDN" },
            AZTECA7: { cls: "chip-azteca7", label: "AZTECA 7" }
        };
        return codes.map(c => {
            const info = map[c] || { cls: "", label: c };
            return `<span class="chip-broadcast ${info.cls}">${info.label}</span>`;
        }).join("");
    },

    // Team crest with graceful fallback to TLA initials
    crestImg(team, sizeClasses = "w-8 h-8") {
        if (team && team.crest) {
            return `<img alt="${team.name}" class="${sizeClasses} rounded-full object-cover bg-surface-bright" src="${team.crest}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"/>
                    <div class="${sizeClasses} rounded-full bg-surface-bright items-center justify-center font-label-sm text-label-sm" style="display:none;">${team.tla || team.short_name || "?"}</div>`;
        }
        const label = (team && (team.tla || team.short_name)) || "?";
        return `<div class="${sizeClasses} rounded-full bg-surface-bright flex items-center justify-center font-label-sm text-label-sm">${label}</div>`;
    },

    teamLabel(team) {
        if (!team) return "Por definir";
        return team.name || team.tla || team.short_name || "Por definir";
    },

    teamShort(team) {
        if (!team) return "—";
        return team.tla || team.short_name || "???";
    }
};
