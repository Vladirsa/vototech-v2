import { useState, useEffect, useRef } from 'react';
import imageCompression from 'browser-image-compression';
import api from '../lib/api';

/**
 * Subida + galería de fotos para cualquier registro del sistema.
 * En el celular, el botón abre directamente la cámara o la galería.
 *
 * Props:
 * - contexto: 'incidencia' | 'acta' | 'casa'
 * - referenciaId: id del registro al que pertenecen las fotos
 * - maximo: número máximo de fotos (para mostrar el contador)
 */
export default function SubidaFotos({ contexto, referenciaId, maximo = 5 }) {
  const [fotos, setFotos] = useState([]);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const [fotoAmpliada, setFotoAmpliada] = useState(null);
  const [comprimiendo, setComprimiendo] = useState(false);
  const inputRef = useRef(null);

  const cargar = () => {
    api.get(`/fotos/${contexto}/${referenciaId}`).then((r) => setFotos(r.data.data)).catch(() => {});
  };
  useEffect(cargar, [contexto, referenciaId]);

  const subir = async (archivo) => {
    if (!archivo) return;
    setError('');
    setSubiendo(true);

    // Una foto de acta desde un celular moderno puede pesar 5-12MB —
    // multiplicado por cientos de casillas el día D, satura datos
    // móviles en zonas rurales. Se comprime ANTES de mandarla, sin
    // perder legibilidad (no se toca la resolución agresivamente,
    // porque luego hace falta poder leer los números del acta).
    let archivoParaSubir = archivo;
    if (archivo.size > 1.5 * 1024 * 1024) {
      setComprimiendo(true);
      try {
        archivoParaSubir = await imageCompression(archivo, {
          maxSizeMB: 1.5,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
        });
      } catch (e) {
        console.error('No se pudo comprimir, se sube el original:', e);
      }
      setComprimiendo(false);
    }

    const formData = new FormData();
    formData.append('foto', archivoParaSubir);
    formData.append('contexto', contexto);
    formData.append('referencia_id', referenciaId);
    try {
      await api.post('/fotos/subir', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      cargar();
    } catch (e) {
      setError(e.response?.data?.error || 'Error al subir la foto');
    }
    setSubiendo(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const eliminar = async (id) => {
    await api.delete(`/fotos/${id}`);
    cargar();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-400">📸 Evidencia ({fotos.length}/{maximo})</span>
        {fotos.length < maximo && (
          <button onClick={() => inputRef.current?.click()} disabled={subiendo}
            className="text-[10px] font-bold text-indigo-400 disabled:opacity-50">
            {comprimiendo ? '📦 Comprimiendo...' : subiendo ? '⏳ Subiendo...' : '+ Tomar/elegir foto'}
          </button>
        )}
      </div>
      {/* capture="environment" hace que en el celular abra directo la cámara trasera */}
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => subir(e.target.files[0])} />

      {error && <div className="text-[10px] text-red-400">{error}</div>}

      {fotos.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {fotos.map((f) => (
            <div key={f.id} className="relative group">
              <img src={f.url} alt="Evidencia" onClick={() => setFotoAmpliada(f.url)}
                className="w-16 h-16 object-cover rounded-lg border border-slate-700 cursor-pointer" />
              <button onClick={() => eliminar(f.id)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-600 text-white rounded-full text-[8px] opacity-0 group-hover:opacity-100 transition">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Visor de foto ampliada */}
      {fotoAmpliada && (
        <div className="fixed inset-0 bg-black/90 z-[3000] flex items-center justify-center p-4" onClick={() => setFotoAmpliada(null)}>
          <img src={fotoAmpliada} alt="Evidencia ampliada" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
