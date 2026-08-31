const statusEl = document.getElementById('status')!;
statusEl.textContent = 'Checking WebGL2 support...';

try {
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const gl = canvas.getContext('webgl2');

  if (!gl) {
    statusEl.textContent = 'WebGL2 is not available in this browser.';
    throw new Error('WebGL2 unavailable');
  }

  const version = gl.getParameter(gl.VERSION) as string;
  const renderer = gl.getParameter(gl.RENDERER) as string;

  gl.clearColor(0.12, 0.09, 0.16, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  statusEl.textContent = `WebGL2 ready: ${version} — ${renderer}`;
} catch (error) {
  console.error(error);
}
