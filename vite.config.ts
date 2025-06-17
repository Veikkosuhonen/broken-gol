import { defineConfig } from "vite";

const slangFileRegex = /(\.slang)$/;

export default defineConfig({
  plugins: [
    // {
    //   name: "custom-plugin",
    //   configResolved(config) {
    //     console.log("Custom plugin loaded");
    //   },
    //   buildStart() {
    //     console.log("Build started");
    //   },
    //   transform(code, id) {
    //     if (slangFileRegex.test(id)) {
    //       const transformedCode = `export default \`${code}\``;
    //       console.log("Transforming slang file:", id, transformedCode);
    //       return {
    //         code: transformedCode,
    //         map: null,
    //       };
    //     }
    //   },
    // },
  ],
});
