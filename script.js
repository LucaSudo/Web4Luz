// ─── SUPABASE CONFIG ───
const SUPABASE_URL = 'https://yudkvusmetwkfrmovisa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1ZGt2dXNtZXR3a2ZybW92aXNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMjQzMzUsImV4cCI6MjA5MTcwMDMzNX0.j6QyRSBng5z6tUBzAqodfYCbuz-u-lLbHheYi0FHJ9k';

// ─── ESTADO GLOBAL ───
let usuarioActual = null;
let favoritosIds = new Set();
let carrito = [];
let todosLosProductos = []; // Cache global de productos

// Cargar estado desde localStorage con manejo de errores
try {
    // 1. Sesión
    const s = localStorage.getItem('sb_session');
    if (s) usuarioActual = JSON.parse(s);

    // 2. Favoritos
    const favsGuardados = localStorage.getItem('favoritos');
    if (favsGuardados) {
        const parsed = JSON.parse(favsGuardados);
        if (Array.isArray(parsed)) favoritosIds = new Set(parsed.map(String));
    }

    // 3. Carrito
    const carritoGuardado = localStorage.getItem('carrito');
    if (carritoGuardado) {
        const parsed = JSON.parse(carritoGuardado);
        if (Array.isArray(parsed)) carrito = parsed;
    }
} catch (e) {
    console.error('Error al cargar estado de localStorage:', e);
}

// ─── FETCH HELPERS ───
async function supabaseFetch(endpoint, options = {}) {
    const res = await fetch(SUPABASE_URL + endpoint, {
        ...options,
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    if (!res.ok) { const t = await res.text(); console.error('supabaseFetch error', endpoint, res.status, t); throw new Error('Supabase error: ' + res.status); }
    return res.json();
}

async function authFetch(endpoint, options = {}) {
    const token = usuarioActual?.access_token || SUPABASE_KEY;
    const res = await fetch(SUPABASE_URL + endpoint, {
        ...options,
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    if (res.status === 204 || res.status === 201) return null;
    const text = await res.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch { return null; }
}
window.authFetch = authFetch;

// ─── FAVORITOS EN MEMORIA ───
async function cargarFavoritosEnMemoria() {
    if (!usuarioActual) return;
    try {
        const data = await authFetch('/rest/v1/favoritos?user_id=eq.' + usuarioActual.user.id + '&select=producto_id');
        const dbFavs = (data || []).map(f => String(f.producto_id));
        
        // Unir favoritos de DB con los de localStorage
        dbFavs.forEach(id => favoritosIds.add(id));
        
        // Guardar la unión en localStorage
        localStorage.setItem('favoritos', JSON.stringify([...favoritosIds]));
    } catch(e) { 
        console.error('Error al sincronizar favoritos con Supabase:', e);
    }
}

// ─── HANDLER CORAZÓN ───
async function handleFav(btn, productoId) {
    const id = String(productoId);
    const yaEsFav = favoritosIds.has(id);
    
    // Actualizar estado en memoria
    if (yaEsFav) {
        favoritosIds.delete(id);
    } else {
        favoritosIds.add(id);
    }

    // Guardar en localStorage con manejo de errores
    try {
        localStorage.setItem('favoritos', JSON.stringify([...favoritosIds]));
    } catch (e) {
        console.error('Error al guardar favoritos en localStorage:', e);
    }

    // Actualizar UI global
    actualizarFavoritosUI(id, !yaEsFav);
    
    // Si hay sesión, sincronizar con Supabase
    if (usuarioActual) {
        btn.disabled = true;
        try {
            if (yaEsFav) {
                const existente = await authFetch('/rest/v1/favoritos?user_id=eq.' + usuarioActual.user.id + '&producto_id=eq.' + productoId);
                if (existente && existente.length > 0) await authFetch('/rest/v1/favoritos?id=eq.' + existente[0].id, { method: 'DELETE' });
            } else {
                await authFetch('/rest/v1/favoritos', { method: 'POST', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify({ user_id: usuarioActual.user.id, producto_id: productoId }) });
            }
        } catch(e) {
            console.error('Error sincronizando favorito con servidor:', e);
        }
        btn.disabled = false;
    }
}
window.handleFav = handleFav;

function actualizarFavoritosUI(productoId, esFav) {
    // 1. Actualizar corazones en las tarjetas
    const botones = document.querySelectorAll(`.tarjeta-fav-btn[onclick*="handleFav(this, ${productoId})"]`);
    botones.forEach(btn => {
        if (esFav) {
            btn.textContent = '❤️';
            btn.classList.add('fav-activo');
        } else {
            btn.textContent = '🤍';
            btn.classList.remove('fav-activo');
        }
    });

    // 2. Si el modal de cuenta está abierto y en la pestaña de favoritos, actualizarla
    if (document.getElementById('modalCuenta')?.classList.contains('abierto')) {
        cargarFavoritos();
    }
}

// ─── GENERAR HTML DE TARJETA PRODUCTO ───
function tarjetaHTML(p) {
    const talles = p.talles ? p.talles.split(',').filter(t => t) : [];
    const agotado = p.disponible === false;
    const esFav = favoritosIds.has(String(p.id));
    const descuento = Number(p.descuento) || 0;
    const precioOriginal = Number(p.precio);
    const precioFinal = descuento > 0 ? Math.round(precioOriginal * (1 - descuento / 100)) : precioOriginal;

    return `
    <div class="tarjeta-producto ${agotado ? 'tarjeta-agotada' : ''}" data-categoria="${p.categoria}" data-nombre="${p.nombre}" data-precio="${precioFinal}">
        <div class="tarjeta-imagen" style="${p.imagen_url ? 'padding:0;position:relative;' : 'background:#fce8f0;position:relative;'}">
            ${p.imagen_url ? `<img src="${p.imagen_url}" alt="${p.nombre}" style="width:100%;height:100%;object-fit:cover;">` : '<span style="font-size:48px">👗</span>'}
            ${descuento > 0 ? `<div class="tarjeta-descuento-badge">-${descuento}%</div>` : ''}
            ${agotado ? '<div class="tarjeta-agotado-badge">Agotado</div>' : ''}
            <button class="tarjeta-fav-btn${esFav ? ' fav-activo' : ''}" onclick="handleFav(this, ${p.id})" title="Agregar a favoritos">${esFav ? '❤️' : '🤍'}</button>
        </div>
        <div class="tarjeta-info">
            <p class="tarjeta-nombre">${p.nombre}</p>
            <p class="tarjeta-categoria">${p.categoria}</p>
            ${talles.length > 0 ? `<div class="tarjeta-talles">${talles.map(t => `<span class="talle-badge">${t}</span>`).join('')}</div>` : ''}
            ${descuento > 0
                ? `<p class="tarjeta-precio-original">$${precioOriginal.toLocaleString('es-AR')}</p><p class="tarjeta-precio-oferta">$${precioFinal.toLocaleString('es-AR')}</p>`
                : `<p class="tarjeta-precio">$${precioOriginal.toLocaleString('es-AR')}</p>`
            }
            <button class="btn-rosa btn-agregar-carrito" ${agotado ? 'disabled' : ''}>${agotado ? 'Agotado' : 'Agregar al carrito'}</button>
        </div>
    </div>`;
}

function agregarAlCarrito(boton) {
    const t = boton.closest('.tarjeta-producto');
    const img = t.querySelector('.tarjeta-imagen img');
    carrito.push({ nombre: t.dataset.nombre, precio: t.dataset.precio, imagen: img ? img.src : '' });
    actualizarCarrito();
}

document.addEventListener('DOMContentLoaded', () => {

    // Cargar favoritos en memoria si hay sesión
    if (usuarioActual) cargarFavoritosEnMemoria();
    
    // Cargar productos para el panel de favoritos
    fetchTodosLosProductos();

    // ─── MENÚ HAMBURGUESA ───
    const btnMenu = document.getElementById('btnMenu');
    const menuMovil = document.getElementById('menuMovil');

    btnMenu.addEventListener('click', () => {
        const abierto = menuMovil.classList.toggle('abierto');
        btnMenu.classList.toggle('activo', abierto);
    });

    function cerrarMenu() { menuMovil.classList.remove('abierto'); btnMenu.classList.remove('activo'); }
    window.cerrarMenu = cerrarMenu;

    // ─── MODAL CATÁLOGO ───
    const modalCatalogo = document.getElementById('modalCatalogo');
    let filtroActivo = 'Todos';

    function abrirModal() { modalCatalogo.classList.add('abierto'); document.body.style.overflow = 'hidden'; cargarProductos(); }
    function cerrarModal() { modalCatalogo.classList.remove('abierto'); document.body.style.overflow = ''; }

    document.getElementById('btnVerColeccion').addEventListener('click', abrirModal);
    document.getElementById('btnCerrarModal').addEventListener('click', cerrarModal);
    modalCatalogo.addEventListener('click', (e) => { if (e.target === modalCatalogo) cerrarModal(); });
    document.querySelectorAll('a[href="#catalogo"]').forEach(link => {
        link.addEventListener('click', (e) => { e.preventDefault(); abrirModal(); cerrarMenu(); });
    });

    async function cargarProductos() {
        const grid = document.getElementById('modalProductos');
        grid.innerHTML = '<p class="cargando-productos">Cargando productos...</p>';
        try {
            const data = await supabaseFetch('/rest/v1/productos?select=*&order=created_at.desc');
            if (!data || data.length === 0) {
                grid.innerHTML = '<p class="cargando-productos">No hay productos todavía.</p>';
                document.getElementById('modalSubtitulo').textContent = 'Sin productos';
                return;
            }
            todosLosProductos = data;
            aplicarFiltro(filtroActivo);
        } catch(e) { grid.innerHTML = '<p class="cargando-productos">Error al cargar productos.</p>'; }
    }

    function aplicarFiltro(filtro) {
        filtroActivo = filtro;
        const grid = document.getElementById('modalProductos');
        const filtrados = filtro === 'Todos' ? todosLosProductos : todosLosProductos.filter(p => p.categoria === filtro);
        document.getElementById('modalSubtitulo').textContent = 'Mostrando ' + filtrados.length + ' producto' + (filtrados.length !== 1 ? 's' : '');
        grid.innerHTML = filtrados.map(p => tarjetaHTML(p)).join('');
        grid.querySelectorAll('.btn-agregar-carrito').forEach(boton => {
            boton.addEventListener('click', () => agregarAlCarrito(boton));
        });
    }

    // Filtros
    const botonesFiltro = document.querySelectorAll('#modalFiltros button');
    botonesFiltro.forEach(boton => {
        boton.addEventListener('click', () => {
            botonesFiltro.forEach(b => b.className = 'btn-outline');
            boton.className = 'btn-outline-activo';
            aplicarFiltro(boton.textContent.trim());
        });
    });

    // ─── MODAL OFERTAS ───
    const modalOfertas = document.getElementById('modalOfertas');

    function abrirModalOfertas() { modalOfertas.classList.add('abierto'); document.body.style.overflow = 'hidden'; cargarOfertas(); }
    function cerrarModalOfertas() { modalOfertas.classList.remove('abierto'); document.body.style.overflow = ''; }

    document.getElementById('btnCerrarOfertas').addEventListener('click', cerrarModalOfertas);
    modalOfertas.addEventListener('click', (e) => { if (e.target === modalOfertas) cerrarModalOfertas(); });
    document.querySelectorAll('a[href="#ofertas"]').forEach(link => {
        link.addEventListener('click', (e) => { e.preventDefault(); abrirModalOfertas(); cerrarMenu(); });
    });

    async function cargarOfertas() {
        const grid = document.getElementById('ofertasProductos');
        const subtitulo = document.getElementById('ofertasSubtitulo');
        grid.innerHTML = '<p class="cargando-productos">Cargando ofertas...</p>';
        try {
            // Filtro correcto PostgREST: descuento=gt.0
            const data = await supabaseFetch('/rest/v1/productos?select=*&descuento=gt.0&order=descuento.desc');
            if (!data || data.length === 0) {
                grid.innerHTML = '<p class="cargando-productos">No hay ofertas disponibles en este momento. ¡Volvé pronto!</p>';
                subtitulo.textContent = 'Sin ofertas activas';
                return;
            }
            subtitulo.textContent = 'Mostrando ' + data.length + ' oferta' + (data.length !== 1 ? 's' : '');
            grid.innerHTML = data.map(p => tarjetaHTML(p)).join('');
            grid.querySelectorAll('.btn-agregar-carrito').forEach(boton => {
                boton.addEventListener('click', () => agregarAlCarrito(boton));
            });
        } catch (err) {
            console.error('Error cargando ofertas:', err);
            grid.innerHTML = '<p class="cargando-productos">No se pudieron cargar las ofertas.</p>';
            subtitulo.textContent = 'Error al cargar';
        }
    }

    // ─── SLIDER ───
    const sliderTrack = document.getElementById('sliderTrack');
    let current = 0;
    let autoTimer = null;

    async function cargarSlider() {
        try {
            const data = await supabaseFetch('/rest/v1/slider?select=*&order=orden.asc');
            if (!data || !Array.isArray(data) || data.length === 0) return;
            sliderTrack.innerHTML = data.map(s => `<div class="slide"><img src="${s.imagen_url}" alt="${s.caption || 'Luzbell'}">${s.caption ? `<div class="slide-caption">${s.caption}</div>` : ''}</div>`).join('');
            const dotsContainer = document.getElementById('sliderDots');
            dotsContainer.innerHTML = data.map((_, i) => `<span class="slider-dot ${i === 0 ? 'activo' : ''}" data-index="${i}"></span>`).join('');
            dotsContainer.querySelectorAll('.slider-dot').forEach(dot => { dot.addEventListener('click', () => { irASlide(parseInt(dot.dataset.index)); reiniciarAuto(); }); });
            current = 0;
            irASlide(0);
        } catch (e) {
            console.warn('cargarSlider: error al cargar desde Supabase, usando slides estáticos', e);
        }
    }

    function irASlide(index) {
        const slides = sliderTrack.querySelectorAll('.slide');
        current = (index + slides.length) % slides.length;
        sliderTrack.style.transform = 'translateX(-' + (current * 100) + '%)';
        document.querySelectorAll('.slider-dot').forEach((d, i) => d.classList.toggle('activo', i === current));
    }

    function siguiente() { irASlide(current + 1); }
    function anterior()  { irASlide(current - 1); }
    function iniciarAuto() { autoTimer = setInterval(siguiente, 3500); }
    function reiniciarAuto() { clearInterval(autoTimer); iniciarAuto(); }

    document.getElementById('sliderNext').addEventListener('click', () => { siguiente(); reiniciarAuto(); });
    document.getElementById('sliderPrev').addEventListener('click', () => { anterior(); reiniciarAuto(); });
    document.querySelectorAll('.slider-dot').forEach(dot => { dot.addEventListener('click', () => { irASlide(parseInt(dot.dataset.index)); reiniciarAuto(); }); });
    iniciarAuto();
    cargarSlider();

    // ─── CARRITO ───
    const carritoPanel = document.getElementById('carritoPanel');

    document.getElementById('contadorCarrito').addEventListener('click', () => carritoPanel.classList.toggle('abierto'));
    document.getElementById('contadorCarritoMovil').addEventListener('click', () => carritoPanel.classList.toggle('abierto'));
    document.getElementById('btnCerrarCarrito').addEventListener('click', () => carritoPanel.classList.remove('abierto'));

    window.actualizarCarrito = function() {
        const lista = document.getElementById('carritoItems');
        if (!lista) return;
        
        lista.innerHTML = carrito.map((producto, index) => {
            const imgHTML = producto.imagen
                ? `<img src="${producto.imagen}" alt="${producto.nombre}" class="carrito-item-img">`
                : `<div class="carrito-item-img carrito-item-emoji">👗</div>`;
            return `<div class="carrito-item">${imgHTML}<div class="carrito-item-info"><p class="carrito-item-nombre">${producto.nombre}</p><p class="carrito-item-precio">$${Number(producto.precio).toLocaleString('es-AR')}</p></div><button class="carrito-item-eliminar" onclick="eliminarProducto(${index})">✕</button></div>`;
        }).join('');
        
        localStorage.setItem('carrito', JSON.stringify(carrito));
        
        const total = carrito.reduce((s, p) => s + parseFloat(p.precio || 0), 0);
        const totalEl = document.getElementById('carritoTotal');
        if (totalEl) totalEl.textContent = '$' + total.toLocaleString('es-AR');
        
        const c1 = document.getElementById('contadorCarrito');
        const c2 = document.getElementById('contadorCarritoMovil');
        if (c1) c1.textContent = 'Carrito (' + carrito.length + ')';
        if (c2) c2.textContent = '🛒 Carrito (' + carrito.length + ')';
    }

    function eliminarProducto(index) { 
        carrito.splice(index, 1); 
        actualizarCarrito(); 
    }
    window.eliminarProducto = eliminarProducto;

    document.getElementById('btnFinalizarCompra').addEventListener('click', () => {
        let msg = 'Hola! Quiero hacer el siguiente pedido:%0A%0A';
        carrito.forEach(p => { msg += '- ' + p.nombre + ': $' + p.precio + '%0A'; });
        const totalTexto = document.getElementById('carritoTotal').textContent;
        msg += '%0ATotal: ' + totalTexto;
        guardarPedido(carrito, parseFloat(totalTexto.replace(/[^0-9.]/g, '')));
        window.open('https://wa.me/5493482233582?text=' + msg);
    });

    // ─── MI CUENTA ───
    document.getElementById('btnMiCuenta').addEventListener('click', abrirModalCuenta);
    document.getElementById('btnCerrarCuenta').addEventListener('click', () => {
        document.getElementById('modalCuenta').classList.remove('abierto');
        document.body.style.overflow = '';
    });
    document.getElementById('modalCuenta').addEventListener('click', (e) => {
        if (e.target === document.getElementById('modalCuenta')) {
            document.getElementById('modalCuenta').classList.remove('abierto');
            document.body.style.overflow = '';
        }
    });
    actualizarBtnCuenta();

    actualizarCarrito();
});

// ─── MI CUENTA ───

function abrirModalCuenta() {
    document.getElementById('modalCuenta').classList.add('abierto');
    document.body.style.overflow = 'hidden';
    renderCuenta();
}
window.abrirModalCuenta = abrirModalCuenta;

function actualizarBtnCuenta() {
    const btn = document.getElementById('btnMiCuenta');
    if (!btn) return;
    if (usuarioActual) {
        // Usar nombre guardado localmente para que aparezca incluso al recargar
        const perfilLocal = JSON.parse(localStorage.getItem('sb_perfil') || '{}');
        const nombre = perfilLocal.nombre || usuarioActual.user?.email?.split('@')[0] || 'Mi cuenta';
        btn.textContent = '👤 ' + nombre;
    } else {
        btn.textContent = '👤 Mi cuenta';
    }
}

function renderCuenta() {
    const contenido = document.getElementById('cuentaContenido');
    const titulo = document.getElementById('cuentaTitulo');

    if (!usuarioActual) {
        titulo.textContent = 'Mi cuenta';
        contenido.innerHTML = `
            <div id="vistaAuth">
                <div id="formLogin" class="auth-form">
                    <h3>Iniciar sesión</h3>
                    <div class="auth-error" id="loginErr" style="display:none"></div>
                    <div class="auth-ok" id="loginOk" style="display:none"></div>
                    <input class="auth-input" type="email" id="loginEmail" placeholder="Email">
                    <input class="auth-input" type="password" id="loginPass" placeholder="Contraseña">
                    <button class="auth-btn" onclick="iniciarSesion()">Entrar</button>
                    <div class="auth-link">¿No tenés cuenta? <a onclick="mostrarRegistro()">Registrate</a></div>
                </div>
                <div id="formRegistro" class="auth-form" style="display:none">
                    <h3>Crear cuenta</h3>
                    <div class="auth-error" id="regErr" style="display:none"></div>
                    <div class="auth-ok" id="regOk" style="display:none"></div>
                    <input class="auth-input" type="text" id="regNombre" placeholder="Tu nombre">
                    <input class="auth-input" type="email" id="regEmail" placeholder="Email">
                    <input class="auth-input" type="password" id="regPass" placeholder="Contraseña (mín. 6 caracteres)">
                    <button class="auth-btn" onclick="registrarse()">Crear cuenta</button>
                    <div class="auth-link">¿Ya tenés cuenta? <a onclick="mostrarLogin()">Iniciá sesión</a></div>
                </div>
            </div>`;
    } else {
        titulo.textContent = 'Mi cuenta';
        const email = usuarioActual.user?.email || '';
        const perfilLocal = JSON.parse(localStorage.getItem('sb_perfil') || '{}');
        const nombreMostrar = perfilLocal.nombre || email.split('@')[0];
        const direccionGuardada = perfilLocal.direccion || '';

        contenido.innerHTML = `
            <div class="perfil-header">
                <div class="perfil-avatar">👤</div>
                <div>
                    <strong id="perfilNombreHeader">${nombreMostrar}</strong>
                    <div class="perfil-email">${email}</div>
                </div>
                <button class="btn-cerrar-sesion" onclick="cerrarSesion()">Salir</button>
            </div>
            <div class="cuenta-tabs">
                <button class="cuenta-tab activo" onclick="cambiarCuentaTab('perfil', this)">Perfil</button>
                <button class="cuenta-tab" onclick="cambiarCuentaTab('pedidos', this)">Pedidos</button>
                <button class="cuenta-tab" onclick="cambiarCuentaTab('favoritos', this)">Favoritos</button>
            </div>
            <div class="cuenta-seccion activa" id="tabPerfil">
                <div class="auth-ok" id="perfilOk" style="display:none"></div>
                <div class="perfil-campo"><label>Nombre</label><input type="text" id="perfilNombre" placeholder="Tu nombre" value="${nombreMostrar}"></div>
                <div class="perfil-campo"><label>Dirección</label><input type="text" id="perfilDireccion" placeholder="Tu dirección de entrega" value="${direccionGuardada}"></div>
                <button class="auth-btn" onclick="guardarPerfil()">Guardar cambios</button>
            </div>
            <div class="cuenta-seccion" id="tabPedidos">
                <div id="listaPedidos"><div class="vacio-cuenta">Cargando...</div></div>
            </div>
            <div class="cuenta-seccion" id="tabFavoritos">
                <div id="listaFavoritos"><div class="vacio-cuenta">Cargando...</div></div>
            </div>`;

        // Sincronizar desde Supabase en segundo plano
        cargarPerfil();
        cargarPedidos();
        cargarFavoritos();
    }
}

async function fetchTodosLosProductos() {
    try {
        const data = await supabaseFetch('/rest/v1/productos?select=*');
        todosLosProductos = data || [];
        if (document.getElementById('modalCuenta')?.classList.contains('abierto')) {
            cargarFavoritos();
        }
    } catch(e) { console.error('Error fetching all products:', e); }
}

function mostrarRegistro() { document.getElementById('formLogin').style.display = 'none'; document.getElementById('formRegistro').style.display = 'block'; }
function mostrarLogin() { document.getElementById('formRegistro').style.display = 'none'; document.getElementById('formLogin').style.display = 'block'; }
window.mostrarRegistro = mostrarRegistro;
window.mostrarLogin = mostrarLogin;

async function iniciarSesion() {
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPass').value;
    const errEl = document.getElementById('loginErr');
    errEl.style.display = 'none';

    const data = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass })
    }).then(r => r.json());

    if (data.error || !data.access_token) {
        errEl.textContent = 'Email o contraseña incorrectos.';
        errEl.style.display = 'block';
        return;
    }

    usuarioActual = data;
    localStorage.setItem('sb_session', JSON.stringify(data));
    await cargarFavoritosEnMemoria();
    actualizarBtnCuenta();
    renderCuenta();
}
window.iniciarSesion = iniciarSesion;

async function registrarse() {
    const nombre = document.getElementById('regNombre').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPass').value;
    const errEl = document.getElementById('regErr');
    const okEl = document.getElementById('regOk');
    errEl.style.display = 'none'; okEl.style.display = 'none';

    if (!nombre || !email || !pass) { errEl.textContent = 'Completá todos los campos.'; errEl.style.display = 'block'; return; }

    const data = await fetch(SUPABASE_URL + '/auth/v1/signup', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass })
    }).then(r => r.json());

    if (data.error) { errEl.textContent = data.error.message || 'Error al registrarse.'; errEl.style.display = 'block'; return; }

    if (data.user?.id) {
        await authFetch('/rest/v1/perfiles', { method: 'POST', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify({ id: data.user.id, nombre }) });
        localStorage.setItem('sb_perfil', JSON.stringify({ nombre, direccion: '' }));
    }
    okEl.textContent = '✅ Cuenta creada! Revisá tu email para confirmar.';
    okEl.style.display = 'block';
}
window.registrarse = registrarse;

async function cerrarSesion() {
    usuarioActual = null;
    favoritosIds = new Set();
    localStorage.removeItem('sb_session');
    localStorage.removeItem('sb_perfil');
    actualizarBtnCuenta();
    renderCuenta();
}
window.cerrarSesion = cerrarSesion;

function cambiarCuentaTab(tab, btn) {
    document.querySelectorAll('.cuenta-tab').forEach(t => t.classList.remove('activo'));
    document.querySelectorAll('.cuenta-seccion').forEach(s => s.classList.remove('activa'));
    btn.classList.add('activo');
    document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('activa');
}
window.cambiarCuentaTab = cambiarCuentaTab;

async function cargarPerfil() {
    if (!usuarioActual) return;
    try {
        const data = await authFetch('/rest/v1/perfiles?id=eq.' + usuarioActual.user.id + '&select=*');
        if (data && data.length > 0) {
            const { nombre = '', direccion = '' } = data[0];
            // Guardar localmente para persistencia entre recargas
            localStorage.setItem('sb_perfil', JSON.stringify({ nombre, direccion }));
            const inp = document.getElementById('perfilNombre');
            const inpDir = document.getElementById('perfilDireccion');
            const hdr = document.getElementById('perfilNombreHeader');
            if (inp) inp.value = nombre;
            if (inpDir) inpDir.value = direccion;
            if (hdr && nombre) hdr.textContent = nombre;
            actualizarBtnCuenta();
        }
    } catch(e) { console.warn('Perfil no disponible en Supabase, usando datos locales.'); }
}

async function guardarPerfil() {
    const nombre = document.getElementById('perfilNombre').value.trim();
    const direccion = document.getElementById('perfilDireccion').value.trim();
    const okEl = document.getElementById('perfilOk');

    // Guardar localmente SIEMPRE (funciona offline y persiste entre recargas)
    localStorage.setItem('sb_perfil', JSON.stringify({ nombre, direccion }));
    const hdr = document.getElementById('perfilNombreHeader');
    if (hdr && nombre) hdr.textContent = nombre;
    actualizarBtnCuenta();
    okEl.textContent = '✅ Cambios guardados!';
    okEl.style.display = 'block';

    // Intentar sincronizar con Supabase también
    try {
        await authFetch('/rest/v1/perfiles', {
            method: 'POST',
            headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify({ id: usuarioActual.user.id, nombre, direccion })
        });
    } catch(e) { console.warn('No se pudo sincronizar con Supabase.'); }

    setTimeout(() => { okEl.style.display = 'none'; }, 3000);
}
window.guardarPerfil = guardarPerfil;

async function cargarPedidos() {
    if (!usuarioActual) return;
    const lista = document.getElementById('listaPedidos');
    try {
        const data = await authFetch('/rest/v1/pedidos?user_id=eq.' + usuarioActual.user.id + '&order=created_at.desc&select=*');
        if (!data || data.length === 0) { lista.innerHTML = '<div class="vacio-cuenta">Todavía no hiciste pedidos.</div>'; return; }
        lista.innerHTML = data.map(p => `
            <div class="pedido-item">
                <div class="pedido-fecha">${new Date(p.created_at).toLocaleDateString('es-AR', { day:'2-digit', month:'long', year:'numeric' })}</div>
                <div class="pedido-productos">${p.productos}</div>
                <div class="pedido-total">Total: $${Number(p.total).toLocaleString('es-AR')}</div>
            </div>`).join('');
    } catch(e) { lista.innerHTML = '<div class="vacio-cuenta">No se pudieron cargar los pedidos.</div>'; }
}

async function cargarFavoritos() {
    const lista = document.getElementById('listaFavoritos');
    if (!lista) return;

    if (favoritosIds.size === 0) {
        lista.innerHTML = '<div class="vacio-cuenta">No tenés favoritos todavía. ❤️</div>';
        return;
    }

    // Usar cache local de productos si está disponible para respuesta inmediata
    const favs = todosLosProductos.filter(p => favoritosIds.has(String(p.id)));
    
    if (favs.length > 0) {
        renderizarListaFavoritos(favs);
    } else {
        lista.innerHTML = '<div class="vacio-cuenta">Cargando favoritos...</div>';
        // Si no hay cache, intentamos cargar desde Supabase si hay sesión
        if (usuarioActual) {
            try {
                const data = await authFetch('/rest/v1/favoritos?user_id=eq.' + usuarioActual.user.id + '&select=*,productos(*)');
                if (data && data.length > 0) {
                    const favsFromDB = data.map(f => f.productos).filter(p => p);
                    renderizarListaFavoritos(favsFromDB);
                }
            } catch(e) { 
                lista.innerHTML = '<div class="vacio-cuenta">No se pudieron cargar los favoritos.</div>';
            }
        } else {
            // Si no hay sesión y no hay cache, simplemente mostramos el aviso
            lista.innerHTML = '<div class="vacio-cuenta">Iniciá sesión para sincronizar tus favoritos.</div>';
        }
    }
}

function renderizarListaFavoritos(productos) {
    const lista = document.getElementById('listaFavoritos');
    if (!lista) return;
    
    lista.innerHTML = productos.map(p => `
        <div class="favorito-item">
            ${p.imagen_url ? `<img src="${p.imagen_url}" alt="${p.nombre}">` : `<div class="favorito-emoji">👗</div>`}
            <div class="favorito-info"><p>${p.nombre}</p><span>${p.categoria}</span></div>
            <span class="favorito-precio">$${Number(p.precio).toLocaleString('es-AR')}</span>
            <button class="btn-fav" onclick="handleFav(this, ${p.id})">🗑️</button>
        </div>`).join('');
}

async function guardarPedido(productos, total) {
    if (!usuarioActual) return;
    try {
        const productosTexto = productos.map(p => '- ' + p.nombre + ': $' + p.precio).join('\n');
        await authFetch('/rest/v1/pedidos', { method: 'POST', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify({ user_id: usuarioActual.user.id, productos: productosTexto, total }) });
    } catch(e) { console.warn('No se pudo guardar el pedido.'); }
}
