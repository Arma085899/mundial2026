/* =========================================================
   UNITY ARENA — Shared navigation
   Usage: <script src="./assets/js/nav.js" data-active="inicio"></script>
   ========================================================= */

(function () {
    const NAV_ITEMS = [
        { key: "inicio", label: "Inicio", href: "index.html" },
        { key: "grupos", label: "Grupos", href: "grupos.html" },
        { key: "calendario", label: "Calendario", href: "calendario.html" },
        { key: "bracket", label: "Cuadro", href: "bracket.html" },
        { key: "quiniela", label: "Quiniela Social", href: "quiniela.html" }
    ];

    function renderTop(active) {
        const el = document.getElementById("wc26-topnav");
        if (!el) return;

        const links = NAV_ITEMS.map(item => {
            const isActive = item.key === active;
            const cls = isActive
                ? "text-primary border-b-2 border-primary font-bold pb-1 font-label-lg text-label-lg px-2 py-1"
                : "text-on-surface-variant hover:text-primary transition-colors duration-200 font-label-lg text-label-lg px-2 py-1";
            return `<a class="${cls}" href="${item.href}">${item.label}</a>`;
        }).join("\n");

        el.className = "bg-surface border-b border-outline-variant bg-surface/80 backdrop-blur-md docked full-width top-0 sticky z-50";
        el.innerHTML = `
        <div class="flex justify-between items-center w-full px-margin-mobile md:px-margin-desktop max-w-[1280px] mx-auto h-[72px]">
            <a class="font-display-md text-display-md text-primary tracking-tight" href="index.html">FIFA World Cup 2026</a>
            <nav class="hidden md:flex gap-lg items-center">${links}</nav>
            <button class="md:hidden p-2 text-on-surface" id="wc26-mobile-menu-btn">
                <span class="material-symbols-outlined">menu</span>
            </button>
        </div>
        <div class="hidden flex-col gap-xs px-margin-mobile pb-md md:hidden" id="wc26-mobile-menu">
            ${NAV_ITEMS.map(item => {
                const isActive = item.key === active;
                const cls = isActive
                    ? "block px-3 py-2 rounded-DEFAULT bg-primary-container/10 text-primary font-bold font-label-lg text-label-lg"
                    : "block px-3 py-2 rounded-DEFAULT text-on-surface-variant hover:bg-surface-container-high font-label-lg text-label-lg";
                return `<a class="${cls}" href="${item.href}">${item.label}</a>`;
            }).join("\n")}
        </div>`;

        const btn = document.getElementById("wc26-mobile-menu-btn");
        const menu = document.getElementById("wc26-mobile-menu");
        if (btn && menu) {
            btn.addEventListener("click", () => {
                menu.classList.toggle("hidden");
                menu.classList.toggle("flex");
            });
        }
    }

    function renderFooter() {
        const el = document.getElementById("wc26-footer");
        if (!el) return;
        el.className = "bg-surface-container-highest w-full py-xl mt-xl border-t border-outline-variant";
        el.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-gutter px-margin-mobile md:px-margin-desktop max-w-[1280px] mx-auto items-center">
            <div class="font-headline-md text-headline-md text-on-surface text-center md:text-left">
                © 2026 FIFA World Cup 2026 (México, Canadá &amp; USA)
            </div>
            <nav class="flex flex-wrap gap-md justify-center md:justify-end">
                <a class="text-on-surface-variant hover:text-on-surface transition-colors font-label-md text-label-md" href="#">Privacidad</a>
                <a class="text-on-surface-variant hover:text-on-surface transition-colors font-label-md text-label-md" href="#">Términos</a>
                <a class="text-on-surface-variant hover:text-on-surface transition-colors font-label-md text-label-md" href="#">Contacto</a>
                <a class="text-on-surface-variant hover:text-on-surface transition-colors font-label-md text-label-md" href="#">Redes Sociales</a>
            </nav>
        </div>`;
    }

    document.addEventListener("DOMContentLoaded", function () {
        const script = document.querySelector('script[data-active]');
        const active = (script && script.dataset.active) || "inicio";
        renderTop(active);
        renderFooter();
    });

    window.WC26_NAV = { renderTop, renderFooter };
})();
