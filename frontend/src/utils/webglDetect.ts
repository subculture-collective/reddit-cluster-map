/**
 * Detects WebGL support in the browser
 * @returns true if WebGL or WebGL2 is supported, false otherwise
 */
export function detectWebGLSupport(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return !!gl;
  } catch {
    return false;
  }
}

/**
 * Gets a descriptive message for WebGL support status
 * @returns object with support status and message
 */
export function getWebGLStatus(): { supported: boolean; message: string } {
  const supported = detectWebGLSupport();
  
  if (supported) {
    return {
      supported: true,
      message: 'WebGL is supported',
    };
  }
  
  return {
    supported: false,
    message: 'WebGL is not supported in your browser. Please try using a modern browser like Chrome, Firefox, or Edge.',
  };
}
