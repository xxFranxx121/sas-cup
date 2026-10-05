/* =========================================================
   SAS CUP 2026 · Formulario de inscripción
   ========================================================= */

/**
 * URL del Web App de Google Apps Script (ver apps-script/GUIA.md).
 * Mientras esté vacía, el formulario funciona en "modo prueba":
 * simula el envío sin guardar nada.
 */
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwIodwtH7w1GiVONbhghp9JVp7RqxBY2rUjpMvfnm39cz2JdA8bsf9fT0U5hb5UuT1t/exec";

const ORG_WHATSAPP = "5493854999100";

const LIMITS = {
    imageRawMB: 20,   // tamaño máximo de una imagen antes de comprimirla
    pdfMB: 8,         // tamaño máximo de un PDF (no se comprime)
    maxDim: { logo: 1000, photo: 1800, receipt: 1800 },
};

/* ---------- Helpers ---------- */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const form = $("#registration-form");
const submitBtn = $("#btn-submit");
const alertBox = $("#form-alert");
const toastEl = $("#toast");

/** Archivos ya procesados, listos para enviar: { logo, photo, receipt } */
const processed = {};

let toastTimer;
function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2200);
}

function showAlert(msg, type = "error") {
    alertBox.textContent = msg;
    alertBox.classList.toggle("is-info", type === "info");
    alertBox.hidden = false;
}

function hideAlert() {
    alertBox.hidden = true;
}

function setError(inputId, msg) {
    const input = document.getElementById(inputId);
    const field = input.closest(".field");
    const slot = $(`[data-error-for="${inputId}"]`);
    field.classList.toggle("is-invalid", Boolean(msg));
    if (slot) slot.textContent = msg || "";
}

const fmtMB = (bytes) => (bytes / 1024 / 1024).toFixed(1) + " MB";

/* ---------- Normalización / validación ---------- */
function normalizeInstagram(value) {
    let v = value.trim();
    if (!v) return "";
    v = v.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "");
    v = v.split(/[/?#]/)[0];
    return v.replace(/^@+/, "");
}

/** Devuelve el número en formato +549XXXXXXXXXX o null si no es válido. */
function normalizeWhatsapp(value) {
    let d = value.replace(/\D/g, "");
    if (d.startsWith("54")) d = d.slice(2);
    if (d.startsWith("0")) d = d.slice(1);
    if (d.length === 10) d = "9" + d;
    if (d.length !== 11 || !d.startsWith("9")) return null;
    return "+54" + d;
}

function validate() {
    let firstInvalid = null;
    const flag = (id, msg) => {
        setError(id, msg);
        if (msg && !firstInvalid) firstInvalid = document.getElementById(id);
    };

    const team = $("#field-team").value.trim();
    flag("field-team", team.length < 2 ? "Ingresá el nombre del equipo." : "");

    const ig = normalizeInstagram($("#field-instagram").value);
    flag("field-instagram",
        ig && !/^[A-Za-z0-9._]{1,30}$/.test(ig) ? "Usuario de Instagram no válido." : "");

    flag("field-logo", processed.logo ? "" : "Subí el logo o escudo del equipo.");

    const delegate = $("#field-delegate").value.trim();
    flag("field-delegate",
        delegate.split(/\s+/).length < 2 ? "Ingresá nombre y apellido." : "");

    flag("field-whatsapp",
        normalizeWhatsapp($("#field-whatsapp").value) ? "" : "Ingresá un WhatsApp válido con código de área (ej: 385 412-3456).");

    flag("field-receipt", processed.receipt ? "" : "Subí el comprobante de la seña.");

    if (firstInvalid) {
        firstInvalid.closest(".field").scrollIntoView({ behavior: "smooth", block: "center" });
        if (firstInvalid.type !== "file") setTimeout(() => firstInvalid.focus({ preventScroll: true }), 350);
    }
    return !firstInvalid;
}

// Limpia el error de un campo apenas el usuario lo corrige
$$("#registration-form input[type=text], #registration-form input[type=tel]").forEach((input) => {
    input.addEventListener("input", () => {
        if (input.closest(".field").classList.contains("is-invalid")) setError(input.id, "");
    });
});

/* ---------- Procesamiento de archivos ---------- */
function readAsDataURL(blob) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
    });
}

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
        img.src = url;
    });
}

/**
 * Achica la imagen para que el envío sea rápido.
 * PNG/WebP se mantienen en PNG (conserva transparencia de escudos); el resto pasa a JPEG.
 */
async function compressImage(file, maxDim) {
    const img = await loadImage(file);
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const keepAlpha = /png|webp|gif/i.test(file.type);
    if (!keepAlpha) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);

    const type = keepAlpha ? "image/png" : "image/jpeg";
    const blob = await new Promise((res) => canvas.toBlob(res, type, 0.85));
    if (!blob || (blob.size >= file.size && scale === 1)) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "archivo";
    return new File([blob], `${base}.${keepAlpha ? "png" : "jpg"}`, { type });
}

async function processFile(kind, file) {
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const isImage = file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name);

    if (kind === "receipt" ? !(isPdf || isImage) : !isImage) {
        throw new Error(kind === "receipt" ? "Subí una imagen o un PDF." : "El archivo tiene que ser una imagen.");
    }

    if (isPdf) {
        if (file.size > LIMITS.pdfMB * 1024 * 1024) {
            throw new Error(`El PDF pesa ${fmtMB(file.size)}. Máximo ${LIMITS.pdfMB} MB.`);
        }
        return { file, isPdf: true };
    }

    if (file.size > LIMITS.imageRawMB * 1024 * 1024) {
        throw new Error(`La imagen pesa ${fmtMB(file.size)}. Máximo ${LIMITS.imageRawMB} MB.`);
    }

    try {
        const out = await compressImage(file, LIMITS.maxDim[kind]);
        return { file: out, isPdf: false };
    } catch {
        // El navegador no pudo leerla (ej: HEIC en compu). Se envía tal cual si no es enorme.
        if (file.size > 8 * 1024 * 1024) {
            throw new Error("No pudimos leer esa imagen. Probá con una captura en JPG o PNG.");
        }
        return { file, isPdf: false, noPreview: true };
    }
}

const ICON_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICON_DOC = '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/></svg>';

function renderPreview(drop, kind, result) {
    const empty = $(".drop__empty", drop);
    const preview = $(".drop__preview", drop);
    preview.innerHTML = "";

    if (result.isPdf || result.noPreview) {
        preview.innerHTML = `<div class="drop__file">${ICON_DOC}<span></span></div>`;
        $(".drop__file span", preview).textContent = result.file.name;
    } else {
        const img = document.createElement("img");
        img.alt = "Vista previa";
        img.src = URL.createObjectURL(result.file);
        img.onload = () => URL.revokeObjectURL(img.src);
        preview.appendChild(img);
    }

    const ok = document.createElement("span");
    ok.className = "drop__ok";
    ok.textContent = "✓ Listo";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "drop__remove";
    remove.setAttribute("aria-label", "Quitar archivo");
    remove.innerHTML = ICON_X;
    remove.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearDrop(drop, kind);
    });

    preview.append(ok, remove);
    empty.hidden = true;
    preview.hidden = false;
}

function clearDrop(drop, kind) {
    delete processed[kind];
    $("input[type=file]", drop).value = "";
    $(".drop__preview", drop).hidden = true;
    $(".drop__preview", drop).innerHTML = "";
    $(".drop__empty", drop).hidden = false;
}

async function handleFile(drop, kind, file) {
    const input = $("input[type=file]", drop);
    if (!file) return;
    setError(input.id, "");
    try {
        const result = await processFile(kind, file);
        processed[kind] = result.file;
        renderPreview(drop, kind, result);
    } catch (err) {
        clearDrop(drop, kind);
        setError(input.id, err.message);
    }
}

$$(".drop").forEach((drop) => {
    const kind = drop.dataset.drop;
    const input = $("input[type=file]", drop);

    input.addEventListener("change", () => handleFile(drop, kind, input.files[0]));

    ["dragenter", "dragover"].forEach((ev) =>
        drop.addEventListener(ev, (e) => {
            e.preventDefault();
            drop.classList.add("is-dragover");
        })
    );
    ["dragleave", "drop"].forEach((ev) =>
        drop.addEventListener(ev, (e) => {
            e.preventDefault();
            drop.classList.remove("is-dragover");
        })
    );
    drop.addEventListener("drop", (e) => handleFile(drop, kind, e.dataTransfer.files[0]));
});

/* ---------- Copiar datos bancarios ---------- */
async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
    }
}

$$(".copy").forEach((btn) => {
    btn.addEventListener("click", async () => {
        if (!(await copyText(btn.dataset.copy))) return;
        btn.textContent = "¡Copiado!";
        btn.classList.add("is-copied");
        toast("Copiado al portapapeles");
        setTimeout(() => {
            btn.textContent = "Copiar";
            btn.classList.remove("is-copied");
        }, 1800);
    });
});

/* ---------- Envío ---------- */
async function fileToPayload(file) {
    if (!file) return null;
    const dataUrl = await readAsDataURL(file);
    return {
        name: file.name,
        type: file.type || "application/octet-stream",
        data: dataUrl.split(",")[1],
    };
}

function setLoading(on) {
    submitBtn.disabled = on;
    submitBtn.classList.toggle("is-loading", on);
}

function showSuccess(teamName, delegateName) {
    $("#form-view").hidden = true;
    const view = $("#success-view");
    $("#success-team").textContent = teamName;

    const msg = `¡Hola! Acabo de inscribir a *${teamName}* en la SAS CUP 2026 y ya envié el comprobante de la seña. Delegado: ${delegateName}.`;
    $("#btn-whatsapp").href = `https://wa.me/${ORG_WHATSAPP}?text=${encodeURIComponent(msg)}`;

    view.hidden = false;
    view.scrollIntoView({ behavior: "smooth", block: "center" });
    view.focus({ preventScroll: true });
}

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAlert();
    if (!validate()) return;

    const teamName = $("#field-team").value.trim();
    const delegateName = $("#field-delegate").value.trim();

    setLoading(true);
    try {
        const payload = {
            teamName,
            instagram: normalizeInstagram($("#field-instagram").value),
            delegateName,
            whatsapp: normalizeWhatsapp($("#field-whatsapp").value),
            website: $("#field-website").value, // honeypot
            files: {
                logo: await fileToPayload(processed.logo),
                photo: await fileToPayload(processed.photo),
                receipt: await fileToPayload(processed.receipt),
            },
        };

        if (!SCRIPT_URL) {
            console.info("[SAS CUP] Modo prueba: no hay SCRIPT_URL configurada. Datos:", {
                ...payload,
                files: Object.fromEntries(
                    Object.entries(payload.files).map(([k, v]) => [k, v && `${v.name} (${v.type})`])
                ),
            });
            await new Promise((r) => setTimeout(r, 1200));
            showSuccess(teamName, delegateName);
            return;
        }

        // text/plain evita el preflight CORS que Apps Script no soporta
        const res = await fetch(SCRIPT_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || "server");

        showSuccess(teamName, delegateName);
    } catch (err) {
        console.error(err);
        showAlert(
            "No pudimos enviar la inscripción. Revisá tu conexión y probá de nuevo. Si sigue fallando, escribinos por WhatsApp al +54 9 3854 99-9100."
        );
    } finally {
        setLoading(false);
    }
});

/* ---------- Inscribir otro equipo ---------- */
$("#btn-new").addEventListener("click", () => {
    form.reset();
    $$(".drop").forEach((drop) => clearDrop(drop, drop.dataset.drop));
    $$(".field.is-invalid").forEach((f) => f.classList.remove("is-invalid"));
    $$(".field__error").forEach((s) => (s.textContent = ""));
    hideAlert();
    $("#success-view").hidden = true;
    $("#form-view").hidden = false;
    $("#form-title").scrollIntoView({ behavior: "smooth", block: "start" });
});
