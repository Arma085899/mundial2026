/* =========================================================
   MEXICO 2026 — Shared navigation
   Usage: <script src="./assets/js/nav.js" data-active="inicio"></script>
   Then call WC26_NAV.render() or it auto-renders on DOMContentLoaded
   into elements with id="wc26-topnav" and id="wc26-bottomnav".
   ========================================================= */

(function () {
    const NAV_ITEMS = [
        { key: "inicio", label: "Inicio", href: "index.html", icon: "dashboard" },
        { key: "grupos", label: "Grupos", href: "grupos.html", icon: "leaderboard" },
        { key: "calendario", label: "Calendario", href: "calendario.html", icon: "calendar_month" },
        { key: "bracket", label: "Eliminatorias", href: "bracket.html", icon: "account_tree" }
    ];

    function currentScript() {
        const scripts = document.getElementsByTagName("script");
        return scripts[scripts.length - 1];
    }

    function renderTop(active) {
        const el = document.getElementById("wc26-topnav");
        if (!el) return;
        const links = NAV_ITEMS.map(item => {
            const isActive = item.key === active;
            const cls = isActive
                ? "text-secondary border-b-2 border-secondary font-label-bold text-label-bold opacity-80 scale-95 transition-all py-xs"
                : "text-on-surface-variant font-label-bold text-label-bold hover:text-secondary-fixed transition-colors duration-200";
            return `<a class="${cls}" href="${item.href}">${item.label}</a>`;
        }).join("\n");

        el.innerHTML = `
        <div class="flex justify-between items-center px-margin-desktop w-full py-md max-w-screen-2xl mx-auto">
            <div class="flex items-center gap-xl">
                <span class="font-display-lg text-display-lg text-secondary tracking-tight">MEXICO 2026</span>
                <nav class="flex items-center gap-lg">${links}</nav>
            </div>
            <div class="flex items-center gap-md text-primary dark:text-primary">
                <span id="wc26-live-indicator" class="hidden items-center gap-xs font-label-sm text-label-sm text-secondary uppercase tracking-widest">
                    <span class="w-2 h-2 rounded-full bg-secondary animate-pulse"></span> En vivo
                </span>
            </div>
        </div>`;
    }

    function renderBottom(active) {
        const el = document.getElementById("wc26-bottomnav");
        if (!el) return;
        const links = NAV_ITEMS.map(item => {
            const isActive = item.key === active;
            const cls = isActive
                ? "nav-active flex flex-col items-center justify-center rounded-full px-4 py-1 font-label-sm text-label-sm font-label-bold text-label-bold scale-95 transition-transform duration-150"
                : "flex flex-col items-center justify-center text-on-surface-variant font-label-sm text-label-sm font-label-bold text-label-bold hover:bg-surface-variant p-2 rounded-lg transition-colors";
            return `<a class="${cls}" href="${item.href}">
                        <span class="material-symbols-outlined mb-1">${item.icon}</span>
                        <span>${item.label}</span>
                    </a>`;
        }).join("\n");

        el.className = "md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 py-2 bg-surface-container-lowest border-t border-outline-variant shadow-sm";
        el.innerHTML = links;
    }

    document.addEventListener("DOMContentLoaded", function () {
        const script = currentScript() || document.querySelector('script[data-active]');
        const active = (script && script.dataset.active) || "inicio";
        renderTop(active);
        renderBottom(active);
    });

    window.WC26_NAV = { renderTop, renderBottom };
})();
