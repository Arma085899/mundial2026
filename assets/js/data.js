/* =========================================================
   UNITY ARENA — Shared config & data layer
   ========================================================= */

window.WC26_TAILWIND_CONFIG = {
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                "inverse-on-surface": "#f3f0ef",
                "on-tertiary-fixed": "#400013",
                "tertiary-container": "#ff7a93",
                "on-secondary-fixed-variant": "#005225",
                "surface-container-low": "#f6f3f2",
                "primary-container": "#00b2e3",
                "inverse-primary": "#68d3ff",
                "surface-container": "#f0edec",
                "on-surface": "#1c1b1b",
                "on-secondary-fixed": "#00210b",
                "primary-fixed": "#bde9ff",
                "surface-container-high": "#ebe7e7",
                "error-container": "#ffdad6",
                "tertiary-fixed": "#ffd9dd",
                "on-primary": "#ffffff",
                "error": "#ba1a1a",
                "outline": "#6d797f",
                "tertiary-fixed-dim": "#ffb2bd",
                "on-primary-container": "#004054",
                "surface-dim": "#dcd9d9",
                "surface-bright": "#fcf9f8",
                "on-secondary": "#ffffff",
                "on-primary-fixed": "#001f2a",
                "secondary-fixed": "#78fc9c",
                "on-secondary-container": "#007236",
                "surface-container-lowest": "#ffffff",
                "on-tertiary": "#ffffff",
                "secondary-fixed-dim": "#5adf82",
                "on-tertiary-container": "#79002c",
                "surface-variant": "#e5e2e1",
                "background": "#fcf9f8",
                "on-tertiary-fixed-variant": "#900036",
                "primary-fixed-dim": "#68d3ff",
                "inverse-surface": "#313030",
                "on-error-container": "#93000a",
                "outline-variant": "#bcc8cf",
                "surface-tint": "#006684",
                "surface": "#fcf9f8",
                "surface-container-highest": "#e5e2e1",
                "on-error": "#ffffff",
                "secondary": "#006d33",
                "secondary-container": "#75f999",
                "on-background": "#1c1b1b",
                "on-surface-variant": "#3d484e",
                "tertiary": "#bd0049",
                "primary": "#006684",
                "on-primary-fixed-variant": "#004d64"
            },
            borderRadius: {
                "DEFAULT": "0.125rem",
                "lg": "0.25rem",
                "xl": "0.5rem",
                "full": "0.75rem"
            },
            spacing: {
                "xl": "48px",
                "base": "4px",
                "margin-desktop": "64px",
                "xs": "4px",
                "sm": "8px",
                "margin-mobile": "16px",
                "md": "16px",
                "gutter": "16px",
                "lg": "24px"
            },
            fontFamily: {
                "body-md": ["Hanken Grotesk"],
                "headline-md": ["Bebas Neue"],
                "display-lg": ["Bebas Neue"],
                "headline-lg-mobile": ["Bebas Neue"],
                "label-lg": ["Hanken Grotesk"],
                "headline-lg": ["Bebas Neue"],
                "display-md": ["Bebas Neue"],
                "label-md": ["Hanken Grotesk"],
                "body-lg": ["Hanken Grotesk"],
                "title-lg": ["Hanken Grotesk"]
            },
            fontSize: {
                "body-md": ["14px", { lineHeight: "20px", fontWeight: "400" }],
                "headline-md": ["24px", { lineHeight: "24px", fontWeight: "400" }],
                "display-lg": ["64px", { lineHeight: "64px", letterSpacing: "0.02em", fontWeight: "400" }],
                "headline-lg-mobile": ["28px", { lineHeight: "28px", fontWeight: "400" }],
                "label-lg": ["12px", { lineHeight: "16px", fontWeight: "700" }],
                "headline-lg": ["32px", { lineHeight: "32px", letterSpacing: "0.03em", fontWeight: "400" }],
                "display-md": ["48px", { lineHeight: "48px", letterSpacing: "0.02em", fontWeight: "400" }],
                "label-md": ["10px", { lineHeight: "12px", fontWeight: "600" }],
                "body-lg": ["16px", { lineHeight: "24px", fontWeight: "400" }],
                "title-lg": ["20px", { lineHeight: "28px", fontWeight: "700" }]
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
    getQuiniela() { return this.fetchJSON("quiniela"); },

    /* =====================================================
       Formatting helpers
       ===================================================== */

    statusInfo(match) {
        switch (match.status) {
            case "IN_PLAY":
            case "PAUSED":
                return { label: `EN VIVO ${match.minute != null ? "- " + match.minute + "'" : ""}`.trim(), badge: "badge-live" };
            case "FINISHED":
                return { label: "FINALIZADO", badge: "badge-finished" };
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

    groupByDate(matches) {
        const groups = {};
        for (const m of matches) {
            const d = new Date(m.utc_date);
            const key = d.toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
            (groups[key] = groups[key] || []).push(m);
        }
        return groups;
    },

    formatDateHeading(dateKey) {
        const d = new Date(dateKey + "T12:00:00");
        const str = d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Mexico_City" });
        return str.charAt(0).toUpperCase() + str.slice(1);
    },

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

    crestImg(team, sizeClasses = "w-8 h-8") {
        if (team && team.crest) {
            return `<img alt="${team.name}" class="${sizeClasses} rounded-full object-cover bg-surface-container-high border border-outline-variant" src="${team.crest}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"/>
                    <div class="${sizeClasses} rounded-full bg-surface-container-high border border-outline-variant items-center justify-center font-label-md text-label-md" style="display:none;">${team.tla || team.short_name || "?"}</div>`;
        }
        const label = (team && (team.tla || team.short_name)) || "?";
        return `<div class="${sizeClasses} rounded-full bg-surface-container-high border border-outline-variant flex items-center justify-center font-label-md text-label-md">${label}</div>`;
    },

    teamLabel(team) {
        if (!team) return "Por definir";
        return team.name || team.tla || team.short_name || "Por definir";
    },

    groupLabel(group) {
        if (!group) return "";
        // Maneja formatos: "Group B", "GROUP_B", "group_b", etc.
        const match = String(group).match(/([A-Za-z]+)[_\s]*([A-Za-z0-9]+)$/);
        if (match) {
            const letter = match[2].toUpperCase();
            return `Grupo ${letter}`;
        }
        return group;
    },

    teamShort(team) {
        if (!team) return "—";
        return team.tla || team.short_name || "???";
    }
};
