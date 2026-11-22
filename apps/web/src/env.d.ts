declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent;
  export default component;
}

/** This build's version, written in by the build (version-build.ts). */
declare const WORNWAYS_VERSION: string;
