// ─── SUPABASE CONFIG ───
const SUPABASE_URL = 'https://yudkvusmetwkfrmovisa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1ZGt2dXNtZXR3a2ZybW92aXNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMjQzMzUsImV4cCI6MjA5MTcwMDMzNX0.j6QyRSBng5z6tUBzAqodfYCbuz-u-lLbHheYi0FHJ9k';

async function supabaseFetch(endpoint, options = {}) {
    const res = await fetch(SUPABASE_URL + endpoint, {
        ...options,
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });
    return res.json();
}

document.addEventListener('DOMContentLoaded', () => {

    // ─── MENÚ HAMBURGUESA ───
    const btn = document.getElementById('btnMenu');
    const menu = document.getElementById('menuMovil');

    btn.addEventListener('click', () => {
        const abierto = menu.classList.toggle('abierto');
        btn.classList.toggle('activo', abierto);
    });

    function cerrarMenu() {
        menu.classList.remove('abierto');
        btn.classList.remove('activo');
    }
    window.cerrarMenu = cerrarMenu;

    // ─── MODAL CATÁLOGO ───
    const modalCatalogo = document.getElementById('modalCatalogo');
    const btnVerColeccion = document.getElementById('btnVerColeccion');
    const btnCerrarModal = document.getElementById('btnCerrarModal');

    function abrirModal() {
        modalCatalogo.classList.add('abierto');
        document.body.style.overflow = 'hidden';
        cargarProductos();
    }

    function cerrarModal() {
        modalCatalogo.classList.remove('abierto');
        document.body.style.overflow = '';
    }

    btnVerColeccion.addEventListener('click', abrirModal);
    btnCerrarModal.addEventListener('click', cerrarModal);
    modalCatalogo.addEventListener('click', (e) => { if (e.target === modalCatalogo) cerrarModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarModal(); });

    document.querySelectorAll('a[href="#catalogo"]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            abrirModal();
            cerrarMenu();
        });
    });

    // ─── CARGAR PRODUCTOS DESDE SUPABASE ───
    let todosLosProductos = [];
    let filtroActivo = 'Todos';

    async function cargarProductos() {
        const grid = document.getElementById('modalProductos');
        grid.innerHTML = '<p class="cargando-productos">Cargando productos...</p>';

        const data = await supabaseFetch('/rest/v1/productos?select=*&order=created_at.desc');

        if (!data || data.length === 0) {
            grid.innerHTML = '<p class="cargando-productos">No hay productos todavía.</p>';
            document.getElementById('modalSubtitulo').textContent = 'Sin productos';
            return;
        }

        todosLosProductos = data;
        aplicarFiltro(filtroActivo);
    }

    function aplicarFiltro(filtro) {
        filtroActivo = filtro;
        const grid = document.getElementById('modalProductos');
        const filtrados = filtro === 'Todos'
            ? todosLosProductos
            : todosLosProductos.filter(p => p.categoria === filtro);

        document.getElementById('modalSubtitulo').textContent =
            'Mostrando ' + filtrados.length + ' producto' + (filtrados.length !== 1 ? 's' : '');

        grid.innerHTML = filtrados.map(p => {
            const talles = p.talles ? p.talles.split(',').filter(t => t) : [];
            const agotado = p.disponible === false;
            return `
            <div class="tarjeta-producto ${agotado ? 'tarjeta-agotada' : ''}" data-categoria="${p.categoria}" data-nombre="${p.nombre}" data-precio="${p.precio}">
                <div class="tarjeta-imagen" style="${p.imagen_url ? 'padding:0;' : 'background:#fce8f0;'}">
                    ${p.imagen_url
                        ? `<img src="${p.imagen_url}" alt="${p.nombre}" style="width:100%;height:100%;object-fit:cover;">`
                        : '<span style="font-size:48px">👗</span>'}
                    ${agotado ? '<div class="tarjeta-agotado-badge">Agotado</div>' : ''}
                </div>
                <div class="tarjeta-info">
                    <p class="tarjeta-nombre">${p.nombre}</p>
                    <p class="tarjeta-categoria">${p.categoria}</p>
                    ${talles.length > 0 ? `<div class="tarjeta-talles">${talles.map(t => `<span class="talle-badge">${t}</span>`).join('')}</div>` : ''}
                    <p class="tarjeta-precio">$${Number(p.precio).toLocaleString('es-AR')}</p>
                    <button class="btn-rosa btn-agregar-carrito" ${agotado ? 'disabled' : ''}>${agotado ? 'Agotado' : 'Agregar al carrito'}</button>
                </div>
            </div>`;
        }).join('');

        // Reasignar eventos de carrito a los nuevos botones
        document.querySelectorAll('.btn-agregar-carrito').forEach(boton => {
            boton.addEventListener('click', () => {
                const tarjeta = boton.closest('.tarjeta-producto');
                const imagenEl = tarjeta.querySelector('.tarjeta-imagen img');
                carrito.push({
                    nombre: tarjeta.dataset.nombre,
                    precio: tarjeta.dataset.precio,
                    imagen: imagenEl ? imagenEl.src : ''
                });
                actualizarCarrito();
            });
        });
    }

    // ─── FILTROS ───
    const botonesFiltro = document.querySelectorAll('#modalFiltros button');
    botonesFiltro.forEach(boton => {
        boton.addEventListener('click', () => {
            botonesFiltro.forEach(b => { b.className = 'btn-outline'; });
            boton.className = 'btn-outline-activo';
            aplicarFiltro(boton.textContent.trim());
        });
    });

    // ─── SLIDER ───
    const sliderTrack = document.getElementById('sliderTrack');
    const dots = document.querySelectorAll('.slider-dot');
    let current = 0;
    let autoTimer = null;

    async function cargarSlider() {
        const data = await supabaseFetch('/rest/v1/slider?select=*&order=orden.asc');
        if (!data || data.length === 0) return;

        sliderTrack.innerHTML = data.map(s => `
            <div class="slide">
                <img src="${s.imagen_url}" alt="${s.caption || 'Luzbell'}">
                ${s.caption ? `<div class="slide-caption">${s.caption}</div>` : ''}
            </div>
        `).join('');

        // Actualizar dots
        const dotsContainer = document.getElementById('sliderDots');
        dotsContainer.innerHTML = data.map((_, i) =>
            `<span class="slider-dot ${i === 0 ? 'activo' : ''}" data-index="${i}"></span>`
        ).join('');

        dotsContainer.querySelectorAll('.slider-dot').forEach(dot => {
            dot.addEventListener('click', () => { irASlide(parseInt(dot.dataset.index)); reiniciarAuto(); });
        });
    }

    function irASlide(index) {
        const slides = sliderTrack.querySelectorAll('.slide');
        const allDots = document.querySelectorAll('.slider-dot');
        current = (index + slides.length) % slides.length;
        sliderTrack.style.transform = 'translateX(-' + (current * 100) + '%)';
        allDots.forEach((d, i) => d.classList.toggle('activo', i === current));
    }

    function siguiente() { irASlide(current + 1); }
    function anterior()  { irASlide(current - 1); }
    function iniciarAuto() { autoTimer = setInterval(siguiente, 3500); }
    function reiniciarAuto() { clearInterval(autoTimer); iniciarAuto(); }

    document.getElementById('sliderNext').addEventListener('click', () => { siguiente(); reiniciarAuto(); });
    document.getElementById('sliderPrev').addEventListener('click', () => { anterior(); reiniciarAuto(); });
    dots.forEach(dot => {
        dot.addEventListener('click', () => { irASlide(parseInt(dot.dataset.index)); reiniciarAuto(); });
    });

    iniciarAuto();
    cargarSlider();

    // ─── CARRITO ───
    const carritoGuardado = localStorage.getItem('carrito');
    let carrito = carritoGuardado ? JSON.parse(carritoGuardado) : [];

    const carritoPanel = document.getElementById('carritoPanel');

    document.getElementById('contadorCarrito').addEventListener('click', () => { carritoPanel.classList.toggle('abierto'); });
    document.getElementById('contadorCarritoMovil').addEventListener('click', () => { carritoPanel.classList.toggle('abierto'); });
    document.getElementById('btnCerrarCarrito').addEventListener('click', () => { carritoPanel.classList.remove('abierto'); });

    function actualizarCarrito() {
        const lista = document.getElementById('carritoItems');
        lista.innerHTML = '';
        carrito.forEach((producto, index) => {
            lista.innerHTML += `
                <div class="carrito-item">
                    ${producto.imagen ? `<img src="${producto.imagen}" alt="${producto.nombre}" class="carrito-item-img">` : '<div class="carrito-item-placeholder">🛍️</div>'}
                    <div class="carrito-item-detalle">
                        <p>${producto.nombre}</p>
                        <p>$${parseFloat(producto.precio).toLocaleString('es-AR')}</p>
                    </div>
                    <button onclick="eliminarProducto(${index})">✕</button>
                </div>`;
        });
        localStorage.setItem('carrito', JSON.stringify(carrito));
        let total = 0;
        carrito.forEach(p => { total += parseFloat(p.precio); });
        document.getElementById('carritoTotal').textContent = '$' + total.toLocaleString('es-AR');
        document.getElementById('contadorCarrito').textContent = 'Carrito (' + carrito.length + ')';
        document.getElementById('contadorCarritoMovil').textContent = '🛒 Carrito (' + carrito.length + ')';
    }

    function eliminarProducto(index) {
        carrito.splice(index, 1);
        actualizarCarrito();
    }
    window.eliminarProducto = eliminarProducto;

    document.getElementById('btnFinalizarCompra').addEventListener('click', () => {
        let mensaje = 'Hola! Quiero hacer el siguiente pedido:%0A%0A';
        carrito.forEach(p => { mensaje += '- ' + p.nombre + ': $' + p.precio + '%0A'; });
        mensaje += '%0ATotal: ' + document.getElementById('carritoTotal').textContent;
        window.open('https://wa.me/5493482233582?text=' + mensaje);
    });

    actualizarCarrito();
});
