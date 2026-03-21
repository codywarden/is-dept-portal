export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Disable pdfjs-dist worker — in serverless environments there is no worker
    // thread support, so we must run PDF.js inline on the main thread.
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = "";
    } catch {
      // ignore if pdfjs-dist is not available
    }

    if (typeof globalThis.DOMMatrix === "undefined") {
      // pdfjs-dist (used by pdf-parse) references DOMMatrix, which is a browser-only
      // API not available in Node.js. This stub satisfies the reference so the module
      // can load; text extraction still works correctly with identity matrices.
      class DOMMatrix {
        a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
        m11 = 1; m12 = 0; m13 = 0; m14 = 0;
        m21 = 0; m22 = 1; m23 = 0; m24 = 0;
        m31 = 0; m32 = 0; m33 = 1; m34 = 0;
        m41 = 0; m42 = 0; m43 = 0; m44 = 1;
        is2D = true;
        isIdentity = true;

        constructor(_init?: string | number[]) {}
        translate(_tx = 0, _ty = 0, _tz = 0): DOMMatrix { return new DOMMatrix(); }
        scale(_sx = 1, _sy?: number, _sz?: number, _ox = 0, _oy = 0, _oz = 0): DOMMatrix { return new DOMMatrix(); }
        rotate(_rx = 0, _ry?: number, _rz?: number): DOMMatrix { return new DOMMatrix(); }
        rotateAxisAngle(_x = 0, _y = 0, _z = 0, _angle = 0): DOMMatrix { return new DOMMatrix(); }
        skewX(_sx = 0): DOMMatrix { return new DOMMatrix(); }
        skewY(_sy = 0): DOMMatrix { return new DOMMatrix(); }
        multiply(_other?: DOMMatrix): DOMMatrix { return new DOMMatrix(); }
        inverse(): DOMMatrix { return new DOMMatrix(); }
        flipX(): DOMMatrix { return new DOMMatrix(); }
        flipY(): DOMMatrix { return new DOMMatrix(); }
        transformPoint(p?: DOMPointInit): DOMPoint { return new DOMPoint(p?.x, p?.y, p?.z, p?.w); }
        toFloat32Array(): Float32Array { return new Float32Array(16); }
        toFloat64Array(): Float64Array { return new Float64Array(16); }
        toString(): string { return "matrix(1, 0, 0, 1, 0, 0)"; }

        static fromArray(array: number[]): DOMMatrix {
          const m = new DOMMatrix();
          if (array.length >= 6) {
            [m.a, m.b, m.c, m.d, m.e, m.f] = array;
          }
          return m;
        }
        static fromMatrix(_other?: DOMMatrixInit): DOMMatrix { return new DOMMatrix(); }
        static fromFloat32Array(array: Float32Array): DOMMatrix { return new DOMMatrix(Array.from(array)); }
        static fromFloat64Array(array: Float64Array): DOMMatrix { return new DOMMatrix(Array.from(array)); }
      }

      (globalThis as unknown as Record<string, unknown>).DOMMatrix = DOMMatrix;
    }
  }
}
