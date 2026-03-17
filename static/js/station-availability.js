// --- ESTADO GLOBAL ---
let map;
let stationMarkers = [];
let userMarker = null;
let estacionesData = [];

const csvUrl = '../data/estaciones.csv';

// --- DICCIONARIO NORMATIVO ---
const normativas = {
    'DTM': {
        titulo: 'Modelamiento de Dispersión (DTM)',
        desc: 'Evaluación según directivas del <strong>SENAMHI</strong>. Se filtran estaciones con un mínimo de <strong>3 años</strong> de datos y que cuenten obligatoriamente con: Viento, Temperatura, Humedad y Precipitación.',
        minYears: 3,
        reqVars: ['WS', 'WD', 'T', 'PP', 'HR'],
        ctaError: 'Cotizar Modelamiento WRF (6 años)'
    },
    'EOLICA': {
        titulo: 'Prospección Eólica (DL N° 1002)',
        desc: 'Para la Concesión Definitiva del <strong>MINEM</strong> se evalúan estaciones in situ con <strong>1 año</strong> mínimo de registro para correlacionar. Variables críticas: Velocidad y Dirección del viento.',
        minYears: 1,
        reqVars: ['WS', 'WD'],
        ctaError: 'Cotizar Campaña de Medición / WRF'
    },
    'SOLAR': {
        titulo: 'Prospección Solar (DL N° 1002)',
        desc: 'Para la Concesión Definitiva del <strong>MINEM</strong> se evalúan estaciones con <strong>1 año</strong> mínimo de registro radiométrico. Variables críticas: Radiación Global y Temperatura.',
        minYears: 1,
        reqVars: ['RAD', 'T'],
        ctaError: 'Cotizar Campaña Radiométrica'
    },
    'LINEABASE': {
        titulo: 'Línea Base Climática (EIA/IGA)',
        desc: 'Evaluación para <strong>SENACE / MINAM</strong>. Se filtran estaciones con <strong>10 años o más</strong> para capturar variabilidad histórica y eventos El Niño. Variables: Temperatura y Precipitación.',
        minYears: 10,
        reqVars: ['T', 'PP'],
        ctaError: 'Cotizar Línea Base Climática'
    }
};

document.addEventListener("DOMContentLoaded", () => {
    map = L.map('map').setView([-9.19, -75.01], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    cargarDatosCSV();

    // Eventos
    document.getElementById('btnAnalizar').addEventListener('click', analizarRepresentatividad);
    document.getElementById('studyType').addEventListener('change', actualizarInfoLegal);

    // Disparar la información legal inicial
    actualizarInfoLegal();
});

function actualizarInfoLegal() {
    const tipo = document.getElementById('studyType').value;
    const norma = normativas[tipo];
    document.getElementById('legal-info-box').innerHTML = `
        <h3 style="margin-bottom:8px; font-size:0.95rem; color:var(--brand-dark);">${norma.titulo}</h3>
        <p style="margin:0; font-size:0.85rem; color:#334155; line-height:1.4;">${norma.desc}</p>
    `;
}

async function cargarDatosCSV() {
    try {
        const response = await fetch(csvUrl);
        if (!response.ok) throw new Error("No se pudo cargar el CSV");
        const csvText = await response.text();
        parseCSV(csvText);
        dibujarEstacionesBase();
        document.getElementById('map-loader').style.display = 'none';
    } catch (error) {
        console.error("Error leyendo estaciones:", error);
        document.getElementById('map-loader').innerHTML = `<p style="color:red;">Error cargando la base de datos.</p>`;
    }
}

function parseCSV(text) {
    const lines = text.trim().split('\n');
    for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(',');
        if (row.length >= 5) { // Ahora leemos 5 columnas
            estacionesData.push({
                lat: parseFloat(row[0]),
                lon: parseFloat(row[1]),
                alt: parseFloat(row[2]),
                years: parseFloat(row[3]),
                vars: row[4].split('-') // Separamos las variables en un Array
            });
        }
    }
}

function dibujarEstacionesBase() {
    estacionesData.forEach(st => {
        st.marker = L.circleMarker([st.lat, st.lon], {
            radius: 4.5,
            fillColor: "#00BFFF",
            color: "#0055ff",
            weight: 1.5,
            opacity: 1.0,
            fillOpacity: 0.9
        }).addTo(map);
    });
}

function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function analizarRepresentatividad() {
    const latInput = document.getElementById('inputLat').value;
    const lonInput = document.getElementById('inputLon').value;
    const studyType = document.getElementById('studyType').value;
    const norma = normativas[studyType];

    if (!latInput || !lonInput) {
        alert("Por favor, ingrese Latitud y Longitud.");
        return;
    }

    const uLat = parseFloat(latInput);
    const uLon = parseFloat(lonInput);

    // Limpiar interacciones anteriores del mapa
    if (userMarker) map.removeLayer(userMarker);
    stationMarkers.forEach(layer => map.removeLayer(layer));
    stationMarkers = [];

    // RESETEAR ESTACIONES: Quitamos hovers y devolvemos el color azul claro original a todas
    estacionesData.forEach(st => {
        if (st.marker.getTooltip()) st.marker.unbindTooltip();
        st.marker.setStyle({
            radius: 4.5,
            fillColor: "#00BFFF", // Azul chillón original
            color: "#0055ff",
            weight: 1.5,
            fillOpacity: 0.9
        });
    });

    const redPin = L.divIcon({
        className: 'custom-user-pin',
        html: "<div style='background-color:#ef4444; width:18px; height:18px; border-radius:50%; border:3px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.6); margin-top:-9px; margin-left:-9px;'></div>",
        iconSize: [0, 0]
    });

    userMarker = L.marker([uLat, uLon], {icon: redPin}).addTo(map);
    userMarker.bindPopup("<b>Punto de interés</b>").openPopup();

    let estacionesValidas = [];
    let maxYears = 0;
    let minYears = Infinity;

    estacionesData.forEach(st => {
        const distancia = calcularDistancia(uLat, uLon, st.lat, st.lon);
        const radioPermitido = st.alt > 2000 ? 25 : 50;

        // --- EL MOTOR DE CUMPLIMIENTO LEGAL ---
        const cumpleRadio = distancia <= radioPermitido;
        const cumpleAnios = st.years >= norma.minYears;
        const cumpleVars = norma.reqVars.every(v => st.vars.includes(v));

        if (cumpleRadio && cumpleAnios && cumpleVars) {
            estacionesValidas.push(st);
            if (st.years > maxYears) maxYears = st.years;
            if (st.years < minYears) minYears = st.years;

            const varsFormat = st.vars.join(', ');

            st.marker.bindTooltip(`<b>Historial:</b> ${st.years} años<br><b>Sensores:</b> ${varsFormat}`, {
                direction: 'top', offset: [0, -5]
            });

            // RESALTAR ESTACIÓN VÁLIDA: Cambiamos a azul oscuro y la hacemos más grande
            st.marker.setStyle({
                radius: 6.5,          // Más grande para que destaque
                fillColor: "#1e3a8a", // Azul oscuro/marino profundo
                color: "#172554",     // Borde aún más oscuro
                weight: 2,
                fillOpacity: 1.0
            });

            const coverageCircle = L.circle([st.lat, st.lon], {
                color: '#10b981', fillColor: '#34d399', fillOpacity: 0.2,
                radius: radioPermitido * 1000, interactive: false
            }).addTo(map);

            stationMarkers.push(coverageCircle);
        }
    });

    map.flyTo([uLat, uLon], 9, { duration: 1.5 });
    mostrarResultados(estacionesValidas.length, maxYears, minYears, uLat, uLon, norma, studyType);
}

function mostrarResultados(conteo, maxAnios, minAnios, lat, lon, norma, studyType) {
    const container = document.getElementById('result-container');
    container.className = 'result-container';
    const coordStr = `${lat}, ${lon}`;

    if (conteo > 0) {
            container.classList.add('result-success');
            const msgWa = encodeURIComponent(`Hola Consultora Barlovento. Mi proyecto en (${coordStr}) cuenta con ${conteo} estaciones que cumplen la normativa para ${norma.titulo}. Deseo cotizar el estudio.`);
            const urlWa = `https://wa.me/51944014115?text=${msgWa}`;

            let textoHistorial = "";
            if (conteo > 1 && maxAnios !== minAnios) {
                textoHistorial = `Historial disponible: <strong>Entre ${minAnios} a ${maxAnios} años</strong>.`;
            } else {
                textoHistorial = `Historial disponible: <strong>${maxAnios} años</strong>.`;
            }

            container.innerHTML = `
                <div class="result-title"><i class="fas fa-check-circle"></i> Cumplimiento Normativo Alcanzado</div>
                <div class="result-text" style="text-align: justify;">
                    El proyecto se encuentra bajo el radio de <strong>${conteo} estación(es)</strong> que poseen las variables y los años mínimos requeridos por ley. Las demás estaciones que se visualizan en el mapa no cumplen con esos requisitos por más que se encuentren cerca a tu punto de interés.<br><br>
                    ${textoHistorial}
                </div>
                <a href="${urlWa}" target="_blank" class="btn-whatsapp-result">
                    <i class="fab fa-whatsapp"></i> Saber cuáles son por WhatsApp
                </a>
            `;
    } else {
            // ... (el else de result-warning se mantiene igual)
        container.classList.add('result-warning');
        const msgWa = encodeURIComponent(`Hola Consultora Barlovento. Mi proyecto en (${coordStr}) NO cuenta con estaciones aptas para ${norma.titulo}. Deseo cotizar la solución alternativa.`);
        const urlWa = `https://wa.me/51944014115?text=${msgWa}`;

        container.innerHTML = `
            <div class="result-title"><i class="fas fa-exclamation-triangle"></i> Sin Cobertura Normativa</div>
            <div class="result-text">
                Ninguna estación cercana cumple con los requisitos mínimos legales (años o sensores) para este estudio.<br>
                Requiere alternativa de ingeniería.
            </div>
            <a href="${urlWa}" target="_blank" class="btn-whatsapp-result" style="background-color: var(--brand-dark);">
                <i class="fab fa-whatsapp"></i> ${norma.ctaError}
            </a>
        `;
    }
}
