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
const botonesFiltro = document.querySelectorAll('.filtros button');
const tarjetas = document.querySelectorAll('.tarjeta-producto');

botonesFiltro.forEach(boton=>{
boton.addEventListener('click', ()=>{
    const filtro = boton.textContent;
    botonesFiltro.forEach(b => {
        b.className = 'btn-outline';
    });
    boton.className = 'btn-outline-activo';
    tarjetas.forEach(tarjeta=>{
        const categoria = tarjeta.dataset.categoria;
        if (filtro === 'Todos' || filtro === categoria) {
            tarjeta.style.display = 'block';
        } else {
            tarjeta.style.display = 'none';
        }
    });
    });
});
