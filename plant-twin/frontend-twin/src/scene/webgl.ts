/**
 * Проверка поддержки WebGL до создания сцены.
 * Выполняется ОДИН раз за сеанс: каждая проверка создаёт временный 3D-контекст, а браузер держит
 * ограниченное число контекстов (~16) и при превышении отключает самый старый — то есть саму сцену
 * (раньше это давало «белый экран» при переключении оборудования). Временный контекст сразу освобождается.
 */
let cached: boolean | null = null;
let software = false;

/**
 * Программная отрисовка (нет видеокарты: SwiftShader, llvmpipe и т. п.) — сцена облегчается:
 * без теней и с разрешением 1×, иначе на таком компьютере кадр рисуется до секунды.
 */
export function isSoftwareRenderer(): boolean {
  isWebGLAvailable();
  return software;
}

export function isWebGLAvailable(): boolean {
  if (cached !== null) return cached;
  try {
    if (new URLSearchParams(location.search).has('nowebgl')) return (cached = false); // для проверки запасного режима
    if (!window.WebGLRenderingContext) return (cached = false);
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    cached = !!gl;
    if (gl) {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      software = /swiftshader|llvmpipe|software|softpipe|basic render/i.test(name);
    }
    gl?.getExtension('WEBGL_lose_context')?.loseContext(); // освободить временный контекст
  } catch {
    cached = false;
  }
  return cached;
}
