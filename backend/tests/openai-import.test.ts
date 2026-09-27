import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

it("typechecks the AI service when the SDK resolves to CommonJS declarations", () => {
  const require = createRequire(import.meta.url);
  const configPath = fileURLToPath(new URL("../tsconfig.build.json", import.meta.url));
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, fileURLToPath(new URL("../", import.meta.url)));
  const program = ts.createProgram(parsed.fileNames, {
    ...parsed.options,
    noEmit: true,
    // Some build environments resolve the package's CommonJS type entry.
    // Verify the real application, not just a standalone import example.
    paths: { openai: [require.resolve("openai").replace(/\.js$/, ".d.ts")] },
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  expect(diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))).toEqual([]);
}, 30_000);
