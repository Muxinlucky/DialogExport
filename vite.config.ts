import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const rootDir = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(rootDir, 'dist');
const iconSizes = [16, 32, 48, 128];

function copyManifestPlugin(): Plugin {
  return {
    name: 'dialog-export-copy-manifest',
    closeBundle() {
      mkdirSync(outDir, { recursive: true });
      copyFileSync(resolve(rootDir, 'manifest.json'), resolve(outDir, 'manifest.json'));

      const outIconsDir = resolve(outDir, 'icons');
      mkdirSync(outIconsDir, { recursive: true });

      for (const size of iconSizes) {
        copyFileSync(
          resolve(rootDir, 'public', 'icons', `icon${size}.png`),
          resolve(outIconsDir, `icon${size}.png`)
        );
      }
    }
  };
}

export default defineConfig(({ mode }) => {
  const isPopup = mode === 'popup';

  const baseConfig = {
    plugins: [copyManifestPlugin()],
    publicDir: false as false,
    build: {
      outDir,
      emptyOutDir: isPopup,
      sourcemap: false,
      target: 'chrome114'
    }
  };

  if (mode === 'background') {
    return {
      ...baseConfig,
      build: {
        ...baseConfig.build,
        emptyOutDir: false,
        lib: {
          entry: resolve(rootDir, 'src/background/service-worker.ts'),
          formats: ['es'],
          fileName: () => 'src/background/service-worker.js'
        },
        rollupOptions: {
          output: {
            inlineDynamicImports: true
          }
        }
      }
    };
  }

  if (mode === 'content') {
    return {
      ...baseConfig,
      build: {
        ...baseConfig.build,
        emptyOutDir: false,
        lib: {
          entry: resolve(rootDir, 'src/content/index.ts'),
          formats: ['iife'],
          name: 'GptDialogContent',
          fileName: () => 'src/content/index.js'
        },
        rollupOptions: {
          output: {
            inlineDynamicImports: true
          }
        }
      }
    };
  }

  return {
    ...baseConfig,
    build: {
      ...baseConfig.build,
      rollupOptions: {
        input: {
          popup: resolve(rootDir, 'src/popup/popup.html')
        }
      }
    }
  };
});
