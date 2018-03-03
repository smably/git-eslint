// flow-typed signature: c38a25040cd70636d05f2b8fa6b564da
// flow-typed version: <<STUB>>/eslint_v^4.18.1/flow_v0.66.0

type LintResults = {
  filePath: string,
  messages: {
    ruleId: string,
    severity: number,
    message: string,
    line: number,
    column: number,
    nodeType: string,
    source: string,
    fix: { range: [number, number], text: string }
  }[],
  errorCount: number,
  warningCount: number,
  fixableErrorCount: number,
  fixableWarningCount: number,
  source: string
}[];

type Report = {
  results: LintResults,
  errorCount: number,
  warningCount: number,
  fixableErrorCount: number,
  fixableWarningCount: number,
};

declare module 'eslint' {
  declare class CLIEngine {
    executeOnText(text: string, filename: string): Report,
    executeOnFiles(files: string[]): Report,
    getFormatter(): LintResults => string,
  }
}
